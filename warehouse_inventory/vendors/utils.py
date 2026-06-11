"""
vendors/utils.py

Utility functions:
  - fetch_product_name_by_barcode  : third-party barcode API lookup
  - extract_vendor_metadata        : pull GSTIN / email / dates from PDF text
  - parse_vendor_agreement         : full PDF → structured dict
  - get_or_create_category         : normalised category lookup / creation
  - find_column_index              : dynamic column header matcher
"""

import re
import json
import logging
import urllib.request

import pdfplumber

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# THIRD-PARTY BARCODE API
# ─────────────────────────────────────────────

def fetch_product_name_by_barcode(barcode: str) -> str | None:
    """
    Calls upcitemdb trial API to retrieve product title from a barcode.
    Returns product title string or None on any failure.
    """
    try:
        url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status == 200:
                data  = json.loads(resp.read().decode("utf-8"))
                items = data.get("items") or []
                if items:
                    return items[0].get("title")
    except Exception as exc:
        logger.warning("Barcode API failed for %s: %s", barcode, exc)
    return None


# ─────────────────────────────────────────────
# CATEGORY HELPER
# ─────────────────────────────────────────────

def get_or_create_category(name: str, zone_type: str = "Dry"):
    """
    Returns a Category instance for the given name (normalised: lowercase + strip).
    Creates one with the given zone_type if it does not exist.
    Always safe to call — never raises.
    """
    if not name:
        return None
    try:
        from .models import Category
        normalized = name.strip().lower()
        cat, _ = Category.objects.get_or_create(
            name=normalized,
            defaults={"zone_type": zone_type},
        )
        return cat
    except Exception as exc:
        logger.warning("get_or_create_category failed for '%s': %s", name, exc)
        return None


# ─────────────────────────────────────────────
# VENDOR METADATA EXTRACTION
# ─────────────────────────────────────────────

def extract_vendor_metadata(text: str) -> dict:
    """
    Extracts vendor / agreement metadata from plain text (first PDF page).

    Returns a dict with keys:
      vendor_name, email, gstin,
      valid_from, valid_until,
      payment_terms, delivery_location, notes,
      category (raw string from PDF, if present)
    """
    metadata = {}

    def _extract(pattern):
        match = re.search(pattern, text, re.IGNORECASE)
        return match.group(1).strip() if match else None

    # ── Identity ──────────────────────────────────────────────────────────────
    metadata["vendor_name"] = (
        _extract(r"Vendor\s*Name\s*[:\-]\s*(.+)") or "Unknown Vendor"
    )

    email_match = re.search(
        r"([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})", text
    )
    metadata["email"] = email_match.group(0).strip().lower() if email_match else None

    gstin_match = re.search(
        r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}Z[A-Z\d]{1}\b",
        text, re.IGNORECASE,
    )
    metadata["gstin"] = gstin_match.group(0).upper() if gstin_match else None

    # ── Agreement dates ───────────────────────────────────────────────────────
    metadata["valid_from"]  = _extract(r"Valid\s*From\s*[:\-]\s*([^\n\r]+)")
    metadata["valid_until"] = _extract(r"Valid\s*Until\s*[:\-]\s*([^\n\r]+)")

    # ── Commercial terms ──────────────────────────────────────────────────────
    metadata["payment_terms"]     = _extract(r"Payment\s*Terms\s*[:\-]\s*([^\n\r]+)")
    metadata["delivery_location"] = _extract(r"Delivery\s*Location\s*[:\-]\s*([^\n\r]+)")
    metadata["notes"]             = _extract(r"Notes\s*[:\-]\s*([^\n\r]+)")

    # ── Category (optional field in agreement header) ─────────────────────────
    metadata["category"] = _extract(r"Category\s*[:\-]\s*([^\n\r]+)")

    return metadata


# ─────────────────────────────────────────────
# HELPER: DYNAMIC COLUMN DETECTION
# ─────────────────────────────────────────────

def find_column_index(headers: list[str], keywords: list[str]) -> int | None:
    """
    Returns index of first header that contains any of the given keywords.
    Case-insensitive comparison on already-lowercased headers.
    """
    for i, h in enumerate(headers):
        for kw in keywords:
            if kw in h:
                return i
    return None


# ─────────────────────────────────────────────
# PDF PARSER
# ─────────────────────────────────────────────

def parse_vendor_agreement(file_obj) -> dict:
    """
    Parses a vendor agreement PDF.

    Returns:
    {
        "metadata": {
            vendor_name, email, gstin,
            valid_from, valid_until,
            payment_terms, delivery_location, notes,
            category
        },
        "items": [
            {
                name, barcode, price,
                lead_time, purchase_unit, conversion_factor, base_unit,
                # base-unit physical dims
                weight, length, width, height,
                # carton-level dims (NEW)
                carton_weight, carton_length, carton_width, carton_height,
                # category (raw, per-row override of header)
                category,
            },
            ...
        ]
    }

    Unit convention
    ---------------
    vendor_price / price   → price per purchase unit  (carton)
    conversion_factor      → base units per purchase unit
    weight/length/…        → dims of ONE BASE UNIT
    carton_weight/…        → dims of ONE CARTON  (purchase unit)

    Raises ValueError if:
      - PDF has no pages
      - No valid product rows are found
    """

    items    = []
    metadata = {}

    try:
        with pdfplumber.open(file_obj) as pdf:

            if not pdf.pages:
                raise ValueError("PDF has no pages.")

            # ── Metadata from first page ──────────────────────────────────────
            first_text = pdf.pages[0].extract_text() or ""
            metadata   = extract_vendor_metadata(first_text)

            for page_num, page in enumerate(pdf.pages):
                table = page.extract_table()
                if not table:
                    logger.warning("No table on page %d — skipping.", page_num + 1)
                    continue

                # Normalise headers
                raw_headers = table[0] or []
                headers = [str(c or "").strip().lower() for c in raw_headers]

                # ── Detect columns dynamically ────────────────────────────────
                name_idx   = find_column_index(headers, ["product", "name", "item"])
                barcode_idx= find_column_index(headers, ["barcode", "sku", "upc", "ean"])
                price_idx  = find_column_index(headers, ["price", "rate", "cost"])
                lead_idx   = find_column_index(headers, ["lead"])
                unit_idx   = find_column_index(headers, ["purchase unit", "unit"])
                conv_idx   = find_column_index(headers, ["conversion", "pieces per carton",
                                                          "qty per carton"])
                base_idx   = find_column_index(headers, ["base unit", "base"])
                cat_idx    = find_column_index(headers, ["category", "cat"])

                # Base-unit dims
                weight_idx = find_column_index(headers, ["weight"])
                length_idx = find_column_index(headers, ["length"])
                width_idx  = find_column_index(headers, ["width"])
                height_idx = find_column_index(headers, ["height"])

                # Carton-level dims (explicit carton columns)
                c_weight_idx = find_column_index(headers, ["carton weight", "gross weight"])
                c_length_idx = find_column_index(headers, ["carton length"])
                c_width_idx  = find_column_index(headers, ["carton width"])
                c_height_idx = find_column_index(headers, ["carton height"])

                # ── Row iteration ─────────────────────────────────────────────
                for row_idx, row in enumerate(table[1:], start=2):
                    if not row or all(str(c).strip() == "" for c in row):
                        continue

                    def safe_get(idx):
                        if idx is None or idx >= len(row):
                            return None
                        val = row[idx]
                        return str(val).strip() if val is not None else None

                    def to_float(val, default=0.0):
                        if val is None:
                            return default
                        try:
                            return float(re.sub(r"[₹$,\s]", "", str(val)))
                        except (ValueError, TypeError):
                            return default

                    # ── Required fields ───────────────────────────────────────
                    barcode = safe_get(barcode_idx)
                    if not barcode:
                        logger.warning("Row %d skipped: no barcode.", row_idx)
                        continue

                    raw_price = safe_get(price_idx)
                    price     = to_float(raw_price)
                    if price <= 0:
                        logger.warning("Row %d skipped: invalid price '%s'.", row_idx, raw_price)
                        continue

                    # ── Optional fields ───────────────────────────────────────
                    name      = safe_get(name_idx) or ""
                    lead_time = None
                    try:
                        raw_lead = safe_get(lead_idx)
                        if raw_lead:
                            lead_time = int(float(raw_lead))
                    except (ValueError, TypeError):
                        pass

                    purchase_unit     = safe_get(unit_idx) or "Carton"
                    conversion_factor = to_float(safe_get(conv_idx), default=1.0) or 1.0
                    base_unit         = safe_get(base_idx) or "Piece"

                    # Per-row category (overrides header-level if present)
                    row_category = safe_get(cat_idx) if cat_idx is not None else None

                    # Base-unit physical dims
                    weight = to_float(safe_get(weight_idx))
                    length = to_float(safe_get(length_idx))
                    width  = to_float(safe_get(width_idx))
                    height = to_float(safe_get(height_idx))

                    # Carton-level dims
                    # If explicit carton columns exist, use them.
                    # Otherwise derive: carton_weight = weight × conversion_factor
                    if c_weight_idx is not None:
                        carton_weight = to_float(safe_get(c_weight_idx))
                    else:
                        carton_weight = weight * conversion_factor if weight else 0

                    carton_length = to_float(safe_get(c_length_idx)) if c_length_idx is not None else 0
                    carton_width  = to_float(safe_get(c_width_idx))  if c_width_idx  is not None else 0
                    carton_height = to_float(safe_get(c_height_idx)) if c_height_idx is not None else 0

                    items.append({
                        "name":              name,
                        "barcode":           barcode,
                        "price":             price,           # per purchase unit
                        "lead_time":         lead_time,
                        "purchase_unit":     purchase_unit,
                        "conversion_factor": conversion_factor,
                        "base_unit":         base_unit,
                        # category
                        "category":          row_category,
                        # base-unit dims
                        "weight":            weight,
                        "length":            length,
                        "width":             width,
                        "height":            height,
                        # carton dims
                        "carton_weight":     carton_weight,
                        "carton_length":     carton_length,
                        "carton_width":      carton_width,
                        "carton_height":     carton_height,
                    })

                    logger.info("Parsed row %d: %s (%s)", row_idx, name, barcode)

    except ValueError:
        raise
    except Exception as exc:
        logger.error("PDF parsing failed: %s", exc, exc_info=True)
        raise ValueError(f"Failed to parse PDF: {exc}")

    if not items:
        raise ValueError("No valid product rows found in PDF.")

    logger.info("Parsed %d items from agreement PDF.", len(items))
    return {"metadata": metadata, "items": items}