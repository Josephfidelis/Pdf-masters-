"""Document processing engines for PDF MASTER (no web code in here)."""
import re
import shutil
import subprocess
import uuid
import zipfile
from pathlib import Path

import fitz  # PyMuPDF
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 100_000_000


class ProcessingError(Exception):
    def __init__(self, message, code="processing_failed", status=422):
        super().__init__(message)
        self.message, self.code, self.status = message, code, status


def parse_pages(spec, total):
    """'1-3,5,8-' -> [0,1,2,4,7,...] (0-based, de-duplicated, order kept)."""
    if not spec or not spec.strip():
        return list(range(total))
    out = []
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        m = re.fullmatch(r"(\d*)-(\d*)|(\d+)", part)
        if not m:
            raise ProcessingError(f"Invalid page range '{part}'. Use something like 1-3,5,8-", "bad_pages", 400)
        if m.group(3):
            a = b = int(m.group(3))
        else:
            a, b = int(m.group(1) or 1), int(m.group(2) or total)
        if a < 1 or b < a or b > total:
            raise ProcessingError(f"Pages must be between 1 and {total}.", "bad_pages", 400)
        out.extend(range(a - 1, b))
    return list(dict.fromkeys(out))


def open_pdf(path, max_pages=None):
    try:
        doc = fitz.open(str(path))
    except Exception:
        raise ProcessingError("This file is not a valid PDF or it is damaged.", "invalid_pdf", 400)
    if doc.needs_pass:
        doc.close()
        raise ProcessingError("This PDF is password-protected. Remove the password and try again.", "encrypted_pdf", 400)
    if doc.page_count == 0:
        doc.close()
        raise ProcessingError("This PDF has no pages.", "invalid_pdf", 400)
    if max_pages and doc.page_count > max_pages:
        n = doc.page_count
        doc.close()
        raise ProcessingError(f"This PDF has {n} pages; your plan allows up to {max_pages}.", "too_many_pages", 413)
    return doc


def _has_text(doc):
    return any(doc[i].get_text("text").strip() for i in range(min(3, doc.page_count)))


# ---------------------------------------------------------------- conversions
def pdf_to_docx(src, dst, max_pages=None):
    doc = open_pdf(src, max_pages)
    pages, scanned = doc.page_count, not _has_text(doc)
    doc.close()
    from pdf2docx import Converter
    cv = Converter(str(src))
    try:
        cv.convert(str(dst))
    except Exception as e:
        raise ProcessingError("The PDF could not be converted. It may use an unsupported structure.", "convert_failed") from e
    finally:
        cv.close()
    if not Path(dst).exists() or Path(dst).stat().st_size == 0:
        raise ProcessingError("Conversion produced no output.", "convert_failed")
    meta = {"pages": pages}
    if scanned:
        meta["warning"] = ("This PDF looks scanned (no selectable text), so the Word file will mostly contain images. "
                           "Run it through Scan > Searchable PDF (OCR) first for editable text.")
    return dst, meta


def docx_to_pdf(src, dst):
    work = Path(dst).parent
    profile = work / f"lo_{uuid.uuid4().hex}"
    tmp_in = work / "input.docx"
    shutil.copyfile(src, tmp_in)
    cmd = ["soffice", f"-env:UserInstallation=file://{profile}", "--headless", "--norestore",
           "--convert-to", "pdf", "--outdir", str(work), str(tmp_in)]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise ProcessingError("Conversion timed out. Try a smaller document.", "timeout", 504)
    except (subprocess.CalledProcessError, FileNotFoundError):
        raise ProcessingError("The Word document could not be converted.", "convert_failed")
    finally:
        shutil.rmtree(profile, ignore_errors=True)
    out = work / "input.pdf"
    if not out.exists():
        raise ProcessingError("The Word document could not be converted.", "convert_failed")
    shutil.move(out, dst)
    tmp_in.unlink(missing_ok=True)
    doc = fitz.open(str(dst))
    meta = {"pages": doc.page_count}
    doc.close()
    return dst, meta


def _safe_cell(v):
    if isinstance(v, str):
        v = v.replace("\x00", "").strip()
        if v[:1] in ("=", "+", "-", "@"):  # spreadsheet formula injection guard
            v = "'" + v
    return v


def pdf_to_xlsx(src, dst, max_pages=None):
    import pdfplumber
    from openpyxl import Workbook
    doc = open_pdf(src, max_pages)
    doc.close()
    wb = Workbook()
    wb.remove(wb.active)
    tables = 0
    try:
        with pdfplumber.open(str(src)) as pdf:
            for pno, page in enumerate(pdf.pages, 1):
                found = page.extract_tables() or []
                if not found:  # fall back to text alignment for borderless tables
                    found = page.extract_tables({"vertical_strategy": "text", "horizontal_strategy": "text"}) or []
                    found = [t for t in found if len(t) >= 2 and max(len(r) for r in t) >= 2]
                for tno, table in enumerate(found, 1):
                    ws = wb.create_sheet(f"P{pno}_T{tno}"[:31])
                    for row in table[:20000]:
                        ws.append([_safe_cell(c) for c in row])
                    tables += 1
    except ProcessingError:
        raise
    except Exception as e:
        raise ProcessingError("Tables could not be read from this PDF.", "convert_failed") from e
    if tables == 0:
        raise ProcessingError("No tables were found in this PDF. PDF to Excel works on PDFs that contain tables with selectable text.", "no_tables")
    wb.save(str(dst))
    return dst, {"tables": tables}


def pdf_to_images(src, outdir, fmt="png", dpi=150, pages="", max_pages=None):
    fmt = fmt.lower().replace("jpeg", "jpg")
    if fmt not in ("png", "jpg"):
        raise ProcessingError("Format must be png or jpg.", "bad_option", 400)
    dpi = max(72, min(int(dpi), 300))
    doc = open_pdf(src, max_pages)
    idx = parse_pages(pages, doc.page_count)
    files = []
    for i in idx:
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(dpi / 72, dpi / 72), alpha=False)
        f = Path(outdir) / f"page_{i + 1:03d}.{fmt}"
        pix.save(str(f), jpg_quality=88) if fmt == "jpg" else pix.save(str(f))
        files.append(f)
    doc.close()
    if len(files) == 1:
        return files[0], {"pages": 1}
    z = Path(outdir) / "pages.zip"
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, f.name)
    return z, {"pages": len(files)}


def images_to_pdf(paths, dst):
    imgs = []
    try:
        for p in paths:
            im = ImageOps.exif_transpose(Image.open(p))
            if im.mode in ("RGBA", "LA", "P"):
                im = im.convert("RGBA")
                bg = Image.new("RGB", im.size, "white")
                bg.paste(im, mask=im.split()[-1])
                im = bg
            else:
                im = im.convert("RGB")
            imgs.append(im)
        imgs[0].save(str(dst), "PDF", resolution=150.0, save_all=True, append_images=imgs[1:])
    except Exception as e:
        raise ProcessingError("One of the images could not be read.", "invalid_image", 400) from e
    return dst, {"pages": len(imgs)}


def merge_pdfs(paths, dst, max_pages=None):
    out = fitz.open()
    for p in paths:
        d = open_pdf(p)
        out.insert_pdf(d)
        d.close()
        if max_pages and out.page_count > max_pages:
            raise ProcessingError(f"Merged file would exceed {max_pages} pages for your plan.", "too_many_pages", 413)
    out.save(str(dst), garbage=3, deflate=True)
    n = out.page_count
    out.close()
    return dst, {"pages": n}


def split_pdf(src, dst, pages, max_pages=None):
    doc = open_pdf(src, max_pages)
    if not pages or not pages.strip():
        raise ProcessingError("Enter the pages to extract, e.g. 1-3,5.", "bad_pages", 400)
    idx = parse_pages(pages, doc.page_count)
    doc.select(idx)
    doc.save(str(dst), garbage=3, deflate=True)
    doc.close()
    return dst, {"pages": len(idx)}


_LEVELS = {"low": (150, 85), "medium": (110, 65), "high": (72, 45)}


def compress_pdf(src, dst, level="medium", max_pages=None):
    if level not in _LEVELS:
        raise ProcessingError("Level must be low, medium or high.", "bad_option", 400)
    dpi, q = _LEVELS[level]
    doc = open_pdf(src, max_pages)
    try:
        doc.rewrite_images(dpi_threshold=dpi + 30, dpi_target=dpi, quality=q)
    except Exception:
        pass  # older engine / no images: structural compression only
    doc.save(str(dst), garbage=4, deflate=True, clean=True)
    doc.close()
    before, after = Path(src).stat().st_size, Path(dst).stat().st_size
    meta = {"before": before, "after": after}
    if after >= before:
        shutil.copyfile(src, dst)
        meta.update(after=before, warning="This PDF is already well optimised; the original was kept.")
    return dst, meta


def _rgb(hexstr):
    h = (hexstr or "#000000").lstrip("#")
    if not re.fullmatch(r"[0-9a-fA-F]{6}", h):
        h = "000000"
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


ADVANCED_OPS = {"signature", "note"}


def apply_edits(src, dst, ops, premium=False):
    doc = open_pdf(src)
    if len(ops) > 500:
        raise ProcessingError("Too many edits in one go (max 500).", "bad_ops", 400)
    for op in ops:
        try:
            t = op["type"]
            if t in ADVANCED_OPS and not premium:
                raise ProcessingError("Signatures and notes are Premium features.", "premium_required", 402)
            page = doc[int(op["page"]) - 1]
            W, H = page.rect.width, page.rect.height
            if t == "text":
                size = max(6, min(float(op.get("size", 14)), 96))
                page.insert_text((float(op["x"]) * W, float(op["y"]) * H + size), str(op["text"])[:500],
                                 fontsize=size, fontname="helv", color=_rgb(op.get("color")))
            elif t == "signature":
                page.insert_text((float(op["x"]) * W, float(op["y"]) * H + 28), str(op["text"])[:80],
                                 fontsize=28, fontname="tiit", color=(0.05, 0.15, 0.45))
            elif t == "highlight":
                x0, y0, x1, y1 = (float(v) for v in op["rect"])
                r = fitz.Rect(min(x0, x1) * W, min(y0, y1) * H, max(x0, x1) * W, max(y0, y1) * H)
                words = page.get_text("words", clip=r)
                if words:
                    page.add_highlight_annot(quads=[fitz.Rect(w[:4]).quad for w in words]).update()
                else:
                    page.draw_rect(r, color=None, fill=(1, 0.92, 0.2), fill_opacity=0.4)
            elif t == "note":
                a = page.add_text_annot((float(op["x"]) * W, float(op["y"]) * H), str(op["text"])[:1000])
                a.update()
            else:
                raise ProcessingError(f"Unknown edit type '{t}'.", "bad_ops", 400)
        except ProcessingError:
            raise
        except (KeyError, ValueError, TypeError, IndexError):
            raise ProcessingError("An edit was malformed or points to a page that does not exist.", "bad_ops", 400)
    doc.save(str(dst), garbage=3, deflate=True)
    doc.close()
    return dst, {"edits": len(ops)}


def ocr_images_to_pdf(paths, dst, lang="eng"):
    """Image(s) -> searchable PDF using Tesseract."""
    if not re.fullmatch(r"[a-z]{3}(\+[a-z]{3})*", lang or ""):
        raise ProcessingError("Invalid OCR language.", "bad_option", 400)
    try:
        import pytesseract
        pytesseract.get_tesseract_version()
    except Exception:
        raise ProcessingError("OCR is not available on this server.", "ocr_unavailable", 503)
    out = fitz.open()
    try:
        for p in paths:
            im = ImageOps.exif_transpose(Image.open(p)).convert("RGB")
            pdf_bytes = pytesseract.image_to_pdf_or_hocr(im, extension="pdf", lang=lang, timeout=90)
            part = fitz.open("pdf", pdf_bytes)
            out.insert_pdf(part)
            part.close()
    except ProcessingError:
        raise
    except Exception as e:
        raise ProcessingError("Text recognition failed for one of the pages.", "ocr_failed") from e
    out.save(str(dst), garbage=3, deflate=True)
    n = out.page_count
    out.close()
    return dst, {"pages": n}


def render_page_png(path, page_no, width=900):
    doc = open_pdf(path)
    if not 1 <= page_no <= doc.page_count:
        doc.close()
        raise ProcessingError("Page not found.", "not_found", 404)
    page = doc[page_no - 1]
    scale = max(0.3, min(width / page.rect.width, 3))
    data = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes("png")
    doc.close()
    return data


def page_sizes(path):
    doc = open_pdf(path)
    sizes = [[round(p.rect.width, 1), round(p.rect.height, 1)] for p in doc]
    doc.close()
    return sizes
