"""Run: pip install -r requirements-dev.txt && pytest -q   (needs LibreOffice for the docx->pdf test)"""
import io, shutil, sys, time, zipfile
from pathlib import Path

import fitz
import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

DEV = {"X-Device-Id": "test-device-0001"}


@pytest.fixture()
def env(tmp_path):
    s = main.Settings(data_dir=tmp_path, free_daily=3, free_max_mb=1, secret_key="k" * 32, admin_key="adm")
    with TestClient(main.create_app(s)) as c:
        yield c, s


def make_pdf(pages=3, text=True):
    d = fitz.open()
    for i in range(pages):
        p = d.new_page()
        if text:
            p.insert_text((72, 100), f"Hello page {i + 1}", fontsize=18)
    b = d.tobytes()
    d.close()
    return b


def post(c, tool, files, headers=DEV, **data):
    return c.post(f"/api/tools/{tool}", files=files, data=data, headers=headers)


def test_health_and_me(env):
    c, _ = env
    assert c.get("/api/health").json() == {"status": "ok"}
    me = c.get("/api/me", headers=DEV).json()
    assert me["limit"] == 3 and me["remaining"] == 3 and me["premium"] is False
    assert c.get("/api/me").status_code == 400  # device id required


def test_pdf_to_docx_real_output(env):
    c, _ = env
    r = post(c, "pdf-to-docx", [("files", ("My Report.pdf", make_pdf(), "application/pdf"))])
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["filename"] == "My Report.docx"
    data = c.get(j["download_url"]).content
    z = zipfile.ZipFile(io.BytesIO(data))
    assert b"Hello page 1" in z.read("word/document.xml")


def test_rejects_fake_pdf_and_bad_names(env):
    c, _ = env
    r = post(c, "pdf-to-docx", [("files", ("evil.pdf", b"MZ not a pdf at all", "application/pdf"))])
    assert r.status_code == 400 and r.json()["error"]["code"] == "invalid_file"


def test_size_limit(env):
    c, _ = env
    big = make_pdf() + b"\0" * (2 * 1024 * 1024)
    r = post(c, "compress", [("files", ("big.pdf", big, "application/pdf"))])
    assert r.status_code == 413 and r.json()["error"]["code"] == "file_too_large"


def test_merge_split(env):
    c, _ = env
    a, b = make_pdf(2), make_pdf(3)
    r = post(c, "merge", [("files", ("a.pdf", a, "application/pdf")), ("files", ("b.pdf", b, "application/pdf"))])
    assert r.status_code == 200 and r.json()["meta"]["pages"] == 5
    r = post(c, "split", [("files", ("b.pdf", b, "application/pdf"))], pages="2-3")
    assert r.json()["meta"]["pages"] == 2
    r = post(c, "split", [("files", ("b.pdf", b, "application/pdf"))], pages="9")
    assert r.status_code == 400 and r.json()["error"]["code"] == "bad_pages"


def test_images_to_pdf_and_to_images(env):
    c, _ = env
    buf = io.BytesIO()
    Image.new("RGB", (200, 300), "navy").save(buf, "PNG")
    r = post(c, "images-to-pdf", [("files", ("a.png", buf.getvalue(), "image/png")), ("files", ("b.png", buf.getvalue(), "image/png"))])
    assert r.status_code == 200 and r.json()["meta"]["pages"] == 2
    pdf = c.get(r.json()["download_url"]).content
    r = post(c, "pdf-to-images", [("files", ("x.pdf", pdf, "application/pdf"))], fmt="jpg")
    assert r.json()["filename"].endswith(".zip")


def test_compress_keeps_valid_pdf(env):
    c, _ = env
    r = post(c, "compress", [("files", ("a.pdf", make_pdf(), "application/pdf"))], level="high")
    assert r.status_code == 200
    assert fitz.open("pdf", c.get(r.json()["download_url"]).content).page_count == 3


def test_pdf_to_xlsx_no_tables_gives_clear_error(env):
    c, _ = env
    r = post(c, "pdf-to-xlsx", [("files", ("a.pdf", make_pdf(1), "application/pdf"))])
    assert r.status_code in (200, 422)
    if r.status_code == 422:
        assert r.json()["error"]["code"] == "no_tables"


def test_daily_limit_and_reward(env):
    c, _ = env
    for _ in range(3):
        assert post(c, "compress", [("files", ("a.pdf", make_pdf(1), "application/pdf"))]).status_code == 200
    r = post(c, "compress", [("files", ("a.pdf", make_pdf(1), "application/pdf"))])
    assert r.status_code == 429 and r.json()["error"]["code"] == "daily_limit"
    assert c.post("/api/usage/reward", headers=DEV).json()["remaining"] == 3


def test_premium_token_batch_and_edit_gating(env):
    c, _ = env
    pdf = ("files", ("a.pdf", make_pdf(1), "application/pdf"))
    assert post(c, "compress", [pdf, ("files", ("b.pdf", make_pdf(1), "application/pdf"))]).status_code == 402
    code = c.post("/api/premium/issue", json={"days": 5}, headers={"X-Admin-Key": "adm"}).json()["code"]
    assert c.post("/api/premium/issue", json={}, headers={"X-Admin-Key": "no"}).status_code == 403
    H = {**DEV, "X-Premium-Token": code}
    assert c.get("/api/me", headers=H).json()["premium"] is True
    r = post(c, "compress", [pdf, ("files", ("b.pdf", make_pdf(1), "application/pdf"))], headers=H)
    assert r.status_code == 200 and r.json()["filename"].endswith(".zip")
    # editor
    o = c.post("/api/edit/open", files={"file": ("a.pdf", make_pdf(1), "application/pdf")}, headers=DEV).json()
    png = c.get(f"/api/edit/{o['doc_id']}/page/1", params={"t": o["token"]})
    assert png.status_code == 200 and png.content[:4] == b"\x89PNG"
    sig = {"ops": [{"type": "signature", "page": 1, "x": 0.1, "y": 0.5, "text": "Jo"}]}
    assert c.post(f"/api/edit/{o['doc_id']}/apply", params={"t": o["token"]}, json=sig, headers=DEV).status_code == 402
    ops = {"ops": [{"type": "text", "page": 1, "x": 0.1, "y": 0.2, "text": "Added"},
                   {"type": "highlight", "page": 1, "rect": [0.05, 0.05, 0.9, 0.2]}]}
    r = c.post(f"/api/edit/{o['doc_id']}/apply", params={"t": o["token"]}, json=ops, headers=DEV)
    assert r.status_code == 200
    assert "Added" in fitz.open("pdf", c.get(r.json()["download_url"]).content)[0].get_text()


def test_download_requires_token_and_files_expire(env):
    c, s = env
    r = post(c, "compress", [("files", ("a.pdf", make_pdf(1), "application/pdf"))]).json()
    assert c.get(f"/api/download/{r['job_id']}?t=wrong").status_code == 403
    assert c.get("/api/download/" + "0" * 32 + "?t=x").status_code == 404
    assert not list((s.data_dir / "tmp").iterdir())  # uploaded originals already wiped


@pytest.mark.skipif(not shutil.which("soffice"), reason="LibreOffice not installed")
def test_docx_to_pdf(env, tmp_path):
    import docx
    d = docx.Document(); d.add_paragraph("Word to PDF works"); p = tmp_path / "t.docx"; d.save(p)
    c, _ = env
    r = post(c, "docx-to-pdf", [("files", ("t.docx", p.read_bytes(), "application/octet-stream"))])
    assert r.status_code == 200, r.text
    assert "Word to PDF works" in fitz.open("pdf", c.get(r.json()["download_url"]).content)[0].get_text()
