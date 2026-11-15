"""PDF MASTER API - secure document processing backend."""
import asyncio, base64, hashlib, hmac, json, mimetypes, os, re, secrets, shutil, sqlite3, threading, time, uuid, zipfile
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from starlette.concurrency import run_in_threadpool

import processors as P


def _env_int(name, default):
    return int(os.getenv(name, default))


@dataclass
class Settings:
    data_dir: Path = field(default_factory=lambda: Path(os.getenv("DATA_DIR", "/tmp/pdfmasters")))
    retention_minutes: int = field(default_factory=lambda: _env_int("RETENTION_MINUTES", 60))
    free_max_mb: int = field(default_factory=lambda: _env_int("FREE_MAX_MB", 20))
    premium_max_mb: int = field(default_factory=lambda: _env_int("PREMIUM_MAX_MB", 100))
    free_daily: int = field(default_factory=lambda: _env_int("FREE_DAILY", 5))
    premium_daily: int = field(default_factory=lambda: _env_int("PREMIUM_DAILY", 300))
    free_max_pages: int = field(default_factory=lambda: _env_int("FREE_MAX_PAGES", 100))
    premium_max_pages: int = field(default_factory=lambda: _env_int("PREMIUM_MAX_PAGES", 1000))
    ip_daily_multiplier: int = 4  # per-IP cap = free_daily * this (blocks device-id rotation abuse)
    concurrency: int = field(default_factory=lambda: _env_int("CONCURRENCY", 4))
    job_timeout: int = 240
    secret_key: str = field(default_factory=lambda: os.getenv("SECRET_KEY") or secrets.token_hex(32))
    admin_key: str = field(default_factory=lambda: os.getenv("ADMIN_KEY", ""))
    cors_origins: list = field(default_factory=lambda: os.getenv("CORS_ORIGINS", "*").split(","))


class ApiError(Exception):
    def __init__(self, status, code, message, extra=None):
        self.status, self.code, self.message, self.extra = status, code, message, extra or {}


# ------------------------------------------------------------------ tokens
def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_token(secret, payload):
    raw = _b64(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64(hmac.new(secret.encode(), raw.encode(), hashlib.sha256).digest())
    return f"{raw}.{sig}"


def verify_token(secret, token):
    try:
        raw, sig = token.split(".")
        good = _b64(hmac.new(secret.encode(), raw.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        payload = json.loads(_unb64(raw))
        return payload if payload.get("exp", 0) > time.time() else None
    except Exception:
        return None


# ------------------------------------------------------------------ usage
class Usage:
    def __init__(self, path):
        self.conn = sqlite3.connect(str(path), check_same_thread=False)
        self.lock = threading.Lock()
        self.conn.execute("CREATE TABLE IF NOT EXISTS u(k TEXT, day TEXT, used INT DEFAULT 0, bonus INT DEFAULT 0, PRIMARY KEY(k,day))")
        self.conn.commit()

    @staticmethod
    def _day():
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def get(self, k):
        with self.lock:
            r = self.conn.execute("SELECT used,bonus FROM u WHERE k=? AND day=?", (k, self._day())).fetchone()
        return r or (0, 0)

    def add(self, k, used=0, bonus=0):
        with self.lock:
            self.conn.execute("INSERT OR IGNORE INTO u(k,day) VALUES(?,?)", (k, self._day()))
            self.conn.execute("UPDATE u SET used=used+?, bonus=bonus+? WHERE k=? AND day=?", (used, bonus, k, self._day()))
            self.conn.commit()


# ------------------------------------------------------------------ validation
IMG_FORMATS = {"JPEG", "PNG", "WEBP", "BMP", "TIFF"}


def sniff(path, kind):
    """Validate content (never trust the extension / client MIME type)."""
    try:
        if kind == "pdf":
            with open(path, "rb") as f:
                return b"%PDF-" in f.read(1024)
        if kind == "docx":
            with open(path, "rb") as f:
                if f.read(4) != b"PK\x03\x04":
                    return False
            with zipfile.ZipFile(path) as z:
                infos = z.infolist()
                if len(infos) > 5000 or sum(i.file_size for i in infos) > 300 * 1024 * 1024:
                    return False  # zip bomb guard
                names = z.namelist()
                return "[Content_Types].xml" in names and any(n.startswith("word/") for n in names)
        if kind == "image":
            with Image.open(path) as im:
                if im.format not in IMG_FORMATS:
                    return False
                im.verify()
            return True
    except Exception:
        return False
    return False


def safe_stem(name):
    stem = Path(name or "document").stem
    stem = re.sub(r"[^A-Za-z0-9._ -]", "_", stem).strip(" ._")[:60]
    return stem or "document"


# ------------------------------------------------------------------ tool table
def _opts_pages(o):
    return o["pages"]


TOOLS = {
    "pdf-to-docx": dict(kind="pdf", min=1, max=1, batch_ext=".docx"),
    "pdf-to-xlsx": dict(kind="pdf", min=1, max=1, batch_ext=".xlsx"),
    "pdf-to-images": dict(kind="pdf", min=1, max=1),
    "docx-to-pdf": dict(kind="docx", min=1, max=1, batch_ext=".pdf"),
    "images-to-pdf": dict(kind="image", min=1, max=50),
    "merge": dict(kind="pdf", min=2, max=20),
    "split": dict(kind="pdf", min=1, max=1),
    "compress": dict(kind="pdf", min=1, max=1, batch_ext=".pdf"),
    "scan-ocr": dict(kind="image", min=1, max=30),
}


def run_one(tool, srcs, out_dir, o, lim):
    mp = lim["max_pages"]
    out = out_dir / "out"
    if tool == "pdf-to-docx":
        return P.pdf_to_docx(srcs[0], out.with_suffix(".docx"), mp)
    if tool == "pdf-to-xlsx":
        return P.pdf_to_xlsx(srcs[0], out.with_suffix(".xlsx"), mp)
    if tool == "pdf-to-images":
        return P.pdf_to_images(srcs[0], out_dir, o["fmt"], o["dpi"], o["pages"], mp)
    if tool == "docx-to-pdf":
        return P.docx_to_pdf(srcs[0], out.with_suffix(".pdf"))
    if tool == "images-to-pdf":
        return P.images_to_pdf(srcs, out.with_suffix(".pdf"))
    if tool == "merge":
        return P.merge_pdfs(srcs, out.with_suffix(".pdf"), mp)
    if tool == "split":
        return P.split_pdf(srcs[0], out.with_suffix(".pdf"), o["pages"], mp)
    if tool == "compress":
        return P.compress_pdf(srcs[0], out.with_suffix(".pdf"), o["level"], mp)
    if tool == "scan-ocr":
        return P.ocr_images_to_pdf(srcs, out.with_suffix(".pdf"), o["lang"])
    raise ApiError(404, "unknown_tool", "Unknown tool.")


SUFFIX_NAMES = {"pdf-to-docx": "", "pdf-to-xlsx": "", "docx-to-pdf": "", "merge": "merged", "split": "split",
                "compress": "compressed", "images-to-pdf": "images", "scan-ocr": "scan", "pdf-to-images": "pages"}


def create_app(settings=None):
    S = settings or Settings()
    for d in ("jobs", "sessions", "tmp"):
        (S.data_dir / d).mkdir(parents=True, exist_ok=True)
    usage = Usage(S.data_dir / "usage.sqlite3")
    sem = asyncio.Semaphore(S.concurrency)

    async def janitor():
        while True:
            cutoff = time.time() - S.retention_minutes * 60
            for sub in ("jobs", "sessions"):
                for d in (S.data_dir / sub).iterdir():
                    try:
                        if d.stat().st_mtime < cutoff:
                            shutil.rmtree(d, ignore_errors=True)
                    except FileNotFoundError:
                        pass
            for d in (S.data_dir / "tmp").iterdir():  # orphaned work dirs (crash safety)
                try:
                    if d.stat().st_mtime < time.time() - 1800:
                        shutil.rmtree(d, ignore_errors=True)
                except FileNotFoundError:
                    pass
            await asyncio.sleep(120)

    @asynccontextmanager
    async def lifespan(app):
        task = asyncio.create_task(janitor())
        yield
        task.cancel()

    app = FastAPI(title="PDF MASTER API", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)
    app.state.settings, app.state.usage = S, usage
    app.add_middleware(CORSMiddleware, allow_origins=S.cors_origins, allow_methods=["GET", "POST"],
                       allow_headers=["*"], expose_headers=["Content-Disposition"])

    @app.middleware("http")
    async def headers(request, call_next):
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.exception_handler(ApiError)
    async def api_err(_, e):
        return JSONResponse({"error": {"code": e.code, "message": e.message, **e.extra}}, status_code=e.status)

    @app.exception_handler(P.ProcessingError)
    async def proc_err(_, e):
        return JSONResponse({"error": {"code": e.code, "message": e.message}}, status_code=e.status)

    # ---------------------------------------------------------- context
    def ctx(request):
        dev = request.headers.get("x-device-id", "")
        if not re.fullmatch(r"[A-Za-z0-9\-]{8,64}", dev):
            raise ApiError(400, "bad_device", "Missing or invalid device id.")
        tok = request.headers.get("x-premium-token")
        premium = bool(tok and verify_token(S.secret_key, tok))
        ip = request.client.host if request.client else "unknown"
        lim = dict(
            premium=premium,
            max_bytes=(S.premium_max_mb if premium else S.free_max_mb) * 1024 * 1024,
            max_mb=S.premium_max_mb if premium else S.free_max_mb,
            max_pages=S.premium_max_pages if premium else S.free_max_pages,
            daily=S.premium_daily if premium else S.free_daily,
        )
        return dev, ip, premium, lim

    def quota(dev, ip, premium, lim):
        used, bonus = usage.get(dev)
        total = lim["daily"] + (0 if premium else bonus)
        out = dict(premium=premium, limit=total, used=used, remaining=max(0, total - used), max_mb=lim["max_mb"],
                   max_pages=lim["max_pages"], retention_minutes=S.retention_minutes)
        return out

    def check_quota(dev, ip, premium, lim):
        q = quota(dev, ip, premium, lim)
        if q["remaining"] <= 0:
            raise ApiError(429, "daily_limit", "You have used all of today's conversions." if not premium
                           else "Daily fair-use limit reached. Please try again tomorrow.", {"usage": q})
        if not premium and usage.get("ip:" + ip)[0] >= S.free_daily * S.ip_daily_multiplier:
            raise ApiError(429, "daily_limit", "Too many conversions from this network today.", {"usage": q})

    async def save_upload(up, dest, max_bytes, mb):
        size = 0
        with dest.open("wb") as f:
            while chunk := await up.read(1 << 20):
                size += len(chunk)
                if size > max_bytes:
                    f.close()
                    dest.unlink(missing_ok=True)
                    raise ApiError(413, "file_too_large", f"This file is larger than the {mb} MB limit for your plan.")
                f.write(chunk)
        if size == 0:
            raise ApiError(400, "empty_file", "The uploaded file is empty.")
        return size

    def new_job_dir():
        jid = uuid.uuid4().hex
        d = S.data_dir / "jobs" / jid
        d.mkdir()
        return jid, d

    def publish(jid, d, path, filename, in_size, meta, q):
        token = secrets.token_urlsafe(24)
        final = d / "result"
        shutil.move(str(path), final)
        (d / "meta.json").write_text(json.dumps({"token": token, "filename": filename}))
        return {"job_id": jid, "download_url": f"/api/download/{jid}?t={token}", "filename": filename,
                "size": final.stat().st_size, "input_size": in_size, "meta": meta, "usage": q}

    # ---------------------------------------------------------- endpoints
    @app.get("/api/health")
    async def health():
        return {"status": "ok"}

    @app.get("/api/me")
    async def me(request: Request):
        dev, ip, premium, lim = ctx(request)
        return quota(dev, ip, premium, lim)

    @app.post("/api/usage/reward")
    async def reward(request: Request):
        """Grant +3 conversions after a rewarded ad (max 3 grants/day). Use AdMob SSV for stricter proof."""
        dev, ip, premium, lim = ctx(request)
        if premium:
            return quota(dev, ip, premium, lim)
        if usage.get(dev)[1] >= 9:
            raise ApiError(429, "reward_limit", "Daily bonus limit reached.")
        usage.add(dev, bonus=3)
        return quota(dev, ip, premium, lim)

    @app.post("/api/premium/redeem")
    async def redeem(request: Request):
        body = await request.json()
        payload = verify_token(S.secret_key, str(body.get("code", "")).strip())
        if not payload:
            raise ApiError(400, "bad_code", "That activation code is invalid or has expired.")
        return {"token": body["code"].strip(), "expires": payload["exp"]}

    @app.post("/api/premium/issue")
    async def issue(request: Request):
        """Called by your payment webhook / admin tooling to mint a premium token."""
        if not S.admin_key or not hmac.compare_digest(request.headers.get("x-admin-key", ""), S.admin_key):
            raise ApiError(403, "forbidden", "Not allowed.")
        days = int((await request.json()).get("days", 31))
        exp = int(time.time()) + days * 86400
        return {"code": sign_token(S.secret_key, {"exp": exp, "id": uuid.uuid4().hex[:8]}), "expires": exp}

    @app.post("/api/tools/{tool}")
    async def run_tool(tool: str, request: Request, files: list[UploadFile] = File(...), pages: str = Form(""),
                       fmt: str = Form("png"), level: str = Form("medium"), dpi: int = Form(150), lang: str = Form("eng")):
        spec = TOOLS.get(tool)
        if not spec:
            raise ApiError(404, "unknown_tool", "Unknown tool.")
        dev, ip, premium, lim = ctx(request)
        check_quota(dev, ip, premium, lim)
        n = len(files)
        batch = n > 1 and spec["max"] == 1
        if batch:
            if not spec.get("batch_ext"):
                raise ApiError(400, "too_many_files", "This tool accepts one file at a time.")
            if not premium:
                raise ApiError(402, "premium_required", "Batch conversion is a Premium feature.")
            if n > 20:
                raise ApiError(400, "too_many_files", "Batch conversion accepts up to 20 files.")
        elif n < spec["min"] or n > spec["max"]:
            raise ApiError(400, "bad_file_count", f"This tool needs {spec['min']}"
                           + (f"-{spec['max']}" if spec["max"] != spec["min"] else "") + " file(s).")
        work = S.data_dir / "tmp" / uuid.uuid4().hex
        work.mkdir()
        jid, jdir = new_job_dir()
        try:
            srcs, in_size = [], 0
            for i, up in enumerate(files):
                dest = work / f"in_{i}.bin"
                in_size += await save_upload(up, dest, lim["max_bytes"], lim["max_mb"])
                if not sniff(dest, spec["kind"]):
                    label = {"pdf": "a PDF", "docx": "a Word (.docx) document", "image": "a JPG, PNG, WEBP, BMP or TIFF image"}[spec["kind"]]
                    raise ApiError(400, "invalid_file", f"'{(up.filename or 'file')[:40]}' is not {label}.")
                srcs.append(dest)
            opts = dict(pages=pages[:200], fmt=fmt, level=level, dpi=dpi, lang=lang)
            first = safe_stem(files[0].filename)
            async with sem:
                try:
                    if batch:
                        outs = []
                        for i, s in enumerate(srcs):
                            od = work / f"o{i}"
                            od.mkdir()
                            p, _ = await asyncio.wait_for(run_in_threadpool(run_one, tool, [s], od, opts, lim), S.job_timeout)
                            outs.append((safe_stem(files[i].filename) + spec["batch_ext"], p))
                        zp = work / "batch.zip"
                        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
                            seen = set()
                            for name, p in outs:
                                while name in seen:
                                    name = "x_" + name
                                seen.add(name)
                                z.write(p, name)
                        out, meta, fname = zp, {"files": len(outs)}, f"{first}_batch.zip"
                    else:
                        od = work / "o"
                        od.mkdir()
                        out, meta = await asyncio.wait_for(run_in_threadpool(run_one, tool, srcs, od, opts, lim), S.job_timeout)
                        ext = Path(out).suffix
                        tag = SUFFIX_NAMES[tool]
                        fname = f"{first}{'_' + tag if tag else ''}{ext}"
                except asyncio.TimeoutError:
                    raise ApiError(504, "timeout", "Processing took too long. Try a smaller file.")
            usage.add(dev, used=1)
            if not premium:
                usage.add("ip:" + ip, used=1)
            return publish(jid, jdir, out, fname, in_size, meta, quota(dev, ip, premium, lim))
        except BaseException:
            shutil.rmtree(jdir, ignore_errors=True)
            raise
        finally:
            shutil.rmtree(work, ignore_errors=True)  # uploaded originals never outlive the request

    @app.get("/api/download/{job_id}")
    async def download(job_id: str, t: str = ""):
        if not re.fullmatch(r"[0-9a-f]{32}", job_id):
            raise ApiError(404, "not_found", "File not found or already deleted.")
        d = S.data_dir / "jobs" / job_id
        try:
            meta = json.loads((d / "meta.json").read_text())
        except Exception:
            raise ApiError(404, "not_found", "File not found. Converted files are deleted after a short retention period.")
        if not hmac.compare_digest(meta["token"], t):
            raise ApiError(403, "forbidden", "Invalid download link.")
        mt = mimetypes.guess_type(meta["filename"])[0] or "application/octet-stream"
        return FileResponse(d / "result", media_type=mt, filename=meta["filename"])

    # ---------------------------------------------------------- PDF editor sessions
    def session(sid, t):
        if not re.fullmatch(r"[0-9a-f]{32}", sid):
            raise ApiError(404, "not_found", "Editing session expired.")
        d = S.data_dir / "sessions" / sid
        try:
            meta = json.loads((d / "meta.json").read_text())
        except Exception:
            raise ApiError(404, "not_found", "Editing session expired. Please open the file again.")
        if not hmac.compare_digest(meta["token"], t):
            raise ApiError(403, "forbidden", "Invalid session.")
        return d, meta

    @app.post("/api/edit/open")
    async def edit_open(request: Request, file: UploadFile = File(...)):
        dev, ip, premium, lim = ctx(request)
        sid = uuid.uuid4().hex
        d = S.data_dir / "sessions" / sid
        d.mkdir()
        try:
            size = await save_upload(file, d / "doc.pdf", lim["max_bytes"], lim["max_mb"])
            if not sniff(d / "doc.pdf", "pdf"):
                raise ApiError(400, "invalid_file", "That file is not a PDF.")
            doc = P.open_pdf(d / "doc.pdf", lim["max_pages"])
            doc.close()
            sizes = P.page_sizes(d / "doc.pdf")
            token = secrets.token_urlsafe(24)
            (d / "meta.json").write_text(json.dumps({"token": token, "name": safe_stem(file.filename)}))
        except BaseException:
            shutil.rmtree(d, ignore_errors=True)
            raise
        return {"doc_id": sid, "token": token, "pages": len(sizes), "sizes": sizes, "size": size}

    @app.get("/api/edit/{sid}/page/{n}")
    async def edit_page(sid: str, n: int, t: str = "", w: int = 900):
        d, _ = session(sid, t)
        png = await run_in_threadpool(P.render_page_png, d / "doc.pdf", n, max(200, min(w, 1600)))
        return Response(png, media_type="image/png")

    @app.post("/api/edit/{sid}/apply")
    async def edit_apply(sid: str, request: Request, t: str = ""):
        dev, ip, premium, lim = ctx(request)
        check_quota(dev, ip, premium, lim)
        d, meta = session(sid, t)
        body = await request.json()
        ops = body.get("ops")
        if not isinstance(ops, list) or not ops:
            raise ApiError(400, "bad_ops", "Add at least one edit first.")
        jid, jdir = new_job_dir()
        try:
            out = jdir / "edited.pdf"
            _, m = await run_in_threadpool(P.apply_edits, d / "doc.pdf", out, ops, premium)
            usage.add(dev, used=1)
            if not premium:
                usage.add("ip:" + ip, used=1)
            return publish(jid, jdir, out, f"{meta['name']}_edited.pdf", (d / "doc.pdf").stat().st_size, m,
                           quota(dev, ip, premium, lim))
        except BaseException:
            shutil.rmtree(jdir, ignore_errors=True)
            raise

    web = Path(__file__).parent / "static"
    if web.exists():
        app.mount("/", StaticFiles(directory=str(web), html=True), name="web")
    return app


app = create_app()
