"""
PDF text extraction with OCR fallback.

Design rationale
----------------
Insurance policy PDFs come in two varieties:
  1. Born-digital: text is embedded in the PDF — fitz can pull it directly.
  2. Scanned: pages are raster images — fitz returns nothing, so we render
     the page to a PIL image and pass it through Tesseract OCR.

We keep page numbers (1-based, matching the printed page number) because every
downstream step — structured extraction, chunking, citation — needs to refer
back to the exact page.  A chunk or answer that can't cite a page is useless
to a judge or adjudicator.

PageText is a plain dataclass (no framework deps) so it can be passed across
module boundaries or serialised to JSON with dataclasses.asdict().
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field
from pathlib import Path

try:
    import pymupdf as fitz  # PyMuPDF >= 1.24: canonical top-level package
except ImportError:
    import fitz  # type: ignore[no-redef]  # PyMuPDF < 1.24 fallback

from app.config import settings

logger = logging.getLogger(__name__)


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class PageText:
    """
    Extracted text for a single PDF page.

    Attributes:
        page_number: 1-based page index (matches the physical page number).
        text:        Raw extracted text.  May be empty if OCR failed gracefully.
        source:      'native' if fitz found a text layer, 'ocr' if Tesseract
                     was used, 'empty' if both yielded nothing.
    """
    page_number: int
    text: str
    source: str  # 'native' | 'ocr' | 'empty'
    char_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.char_count = len(self.text.strip())


# ── Helpers ───────────────────────────────────────────────────────────────────

def _ocr_page(page: fitz.Page) -> str:
    """
    Render a PDF page to a PIL image and run Tesseract on it.

    We wrap the import inside this function so that a missing pytesseract/
    Pillow installation doesn't crash the whole pipeline — we just skip OCR
    and return an empty string for that page (logged as a warning).

    Resolution: 300 DPI (matrix scale factor 300/72 ≈ 4.17) gives Tesseract
    enough pixels to resolve small policy text reliably.
    """
    try:
        import pytesseract
        from PIL import Image

        # Render page to RGB pixmap at ~300 DPI
        zoom = 300 / 72
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)

        # Convert pixmap bytes → PIL Image (avoids saving a temp file)
        img_bytes = pix.tobytes("png")
        img = Image.open(io.BytesIO(img_bytes))

        return pytesseract.image_to_string(img, lang="eng")

    except ImportError:
        logger.warning(
            "pytesseract or Pillow not installed — OCR unavailable. "
            "Install with: pip install pytesseract Pillow"
        )
        return ""
    except Exception as exc:  # noqa: BLE001
        logger.warning("OCR failed on page: %s", exc)
        return ""


# ── Public API ────────────────────────────────────────────────────────────────

def extract_pages(pdf_path: str | Path) -> list[PageText]:
    """
    Extract text from every page of a PDF, with an OCR fallback for
    image-only pages.

    Args:
        pdf_path: Path to the PDF file.

    Returns:
        Ordered list of PageText objects, one per page (1-indexed).

    Raises:
        FileNotFoundError: If the PDF doesn't exist.
        fitz.FileDataError: If the file isn't a valid PDF.
    """
    pdf_path = Path(pdf_path)
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")

    results: list[PageText] = []

    with fitz.open(str(pdf_path)) as doc:
        logger.info("Opened '%s' — %d pages", pdf_path.name, len(doc))

        for i, page in enumerate(doc):
            page_number = i + 1  # convert 0-based fitz index to 1-based

            # Try native text extraction first (fast, lossless)
            raw_text = page.get_text("text")

            if len(raw_text.strip()) >= settings.ocr_text_threshold:
                source = "native"
                text = raw_text
            else:
                # Page has no (or negligible) text layer → attempt OCR
                logger.debug("Page %d: no text layer, trying OCR", page_number)
                ocr_text = _ocr_page(page)

                if ocr_text.strip():
                    source = "ocr"
                    text = ocr_text
                else:
                    source = "empty"
                    text = ""
                    logger.warning(
                        "Page %d: both native extraction and OCR yielded "
                        "no text — marking as empty",
                        page_number,
                    )

            results.append(PageText(page_number=page_number, text=text, source=source))

    return results


def pretty_print_pages(pages: list[PageText], max_chars: int = 300) -> None:
    """
    Debug helper: print a summary of each page's extraction result.

    Args:
        pages:     Output of extract_pages().
        max_chars: How many characters of text to print per page (truncated).
    """
    print(f"\n{'='*70}")
    print(f"  Extracted {len(pages)} pages")
    print(f"{'='*70}")
    for p in pages:
        preview = p.text.strip().replace("\n", " ")[:max_chars]
        ellipsis = "…" if p.char_count > max_chars else ""
        print(f"\n[Page {p.page_number:>3}]  source={p.source}  chars={p.char_count}")
        print(f"  {preview}{ellipsis}")
    print(f"\n{'='*70}\n")
