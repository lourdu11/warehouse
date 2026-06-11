"""
Vendor Agreement PDF Generator
================================
One function. One format. Any number of products.
100% compatible with pdfplumber + Django backend parser.

Table columns (9 total):
  Product Name | Barcode | Price (INR) | Lead Time (days) | Purchase Unit
  | Weight (kg) | Length (cm) | Width (cm) | Height (cm)

The parser in vendors/utils.py detects weight/length/width/height by keyword,
so no parser changes are required — it will pick them up automatically.
"""

import re
import pdfplumber
from datetime import date

from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer


# ── Fixed constants ────────────────────────────────────────────────────────────
# 9 columns — keep total ≤ 7.5 inch (letter minus 0.75 in margins each side)

TABLE_HEADERS = [
    "Product Name", "Barcode", "Price (INR)", "Lead Time (days)", "Purchase Unit",
    "Weight (kg)", "Length (cm)", "Width (cm)", "Height (cm)",
]

COL_WIDTHS = [
    1.55 * inch,   # Product Name
    1.40 * inch,   # Barcode
    0.80 * inch,   # Price (INR)
    0.85 * inch,   # Lead Time (days)
    0.75 * inch,   # Purchase Unit
    0.65 * inch,   # Weight (kg)
    0.65 * inch,   # Length (cm)
    0.65 * inch,   # Width (cm)
    0.65 * inch,   # Height (cm)
]
# Total: 8.55 in  →  fits on letter (8.5 in wide, 0.75 in margins = 7.0 usable)
# Adjust if you change margins.

HEADER_LABELS = [
    "Vendor Name", "Email", "GSTIN",
    "Valid From", "Valid Until",
    "Payment Terms", "Delivery Location", "Notes",
]

TERMS = [
    "1. This agreement is valid for one year from the date of signing.",
    "2. Prices are exclusive of GST and other applicable taxes.",
    "3. Minimum Order Quantity (MOQ) applies as per product specifications.",
    "4. Lead time starts from the date of Purchase Order confirmation.",
]


# ── Styles ────────────────────────────────────────────────────────────────────

def _styles():
    base = getSampleStyleSheet()
    title = ParagraphStyle("VA_Title", parent=base["Normal"],
        fontSize=14, fontName="Helvetica-Bold",
        textColor=colors.HexColor("#003366"),
        alignment=TA_CENTER, spaceAfter=8, leading=18)
    field = ParagraphStyle("VA_Field", parent=base["Normal"],
        fontSize=9, fontName="Helvetica",
        alignment=TA_LEFT, spaceAfter=0, spaceBefore=0, leading=13)
    section = ParagraphStyle("VA_Section", parent=base["Normal"],
        fontSize=10, fontName="Helvetica-Bold",
        textColor=colors.HexColor("#003366"),
        alignment=TA_LEFT, spaceAfter=4, spaceBefore=8, leading=14)
    terms = ParagraphStyle("VA_Terms", parent=base["Normal"],
        fontSize=9, fontName="Helvetica",
        alignment=TA_LEFT, spaceAfter=0, spaceBefore=0, leading=13)
    return title, field, section, terms


def _table_style():
    return TableStyle([
        ("BACKGROUND",    (0, 0), (-1,  0), colors.HexColor("#003366")),
        ("TEXTCOLOR",     (0, 0), (-1,  0), colors.whitesmoke),
        ("FONTNAME",      (0, 0), (-1,  0), "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1,  0), 7),
        ("BACKGROUND",    (0, 1), (-1, -1), colors.HexColor("#F5F5DC")),
        ("FONTNAME",      (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING",   (0, 0), (-1, -1), 3),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 3),
        ("GRID",          (0, 0), (-1, -1), 0.5, colors.black),
        ("LINEBELOW",     (0, 0), (-1,  0), 1.0, colors.black),
    ])


# ── Generator ─────────────────────────────────────────────────────────────────

def generate_vendor_agreement_pdf(
    vendor_name: str,
    vendor_email: str,
    vendor_gstin: str,
    products: list,
    # Each product dict: {
    #   "name", "barcode", "price", "lead_time",
    #   "purchase_unit" (opt),
    #   "weight" (kg, opt), "length" (cm, opt),
    #   "width"  (cm, opt), "height" (cm, opt),
    # }
    filename: str = "vendor_agreement.pdf",
    valid_from: str = None,
    valid_until: str = None,
    payment_terms: str = "Net 30 Days",
    delivery_location: str = "",
    notes: str = "",
) -> None:
    today       = date.today().strftime("%B %d, %Y")
    valid_from  = valid_from  or today
    valid_until = valid_until or today

    doc = SimpleDocTemplate(
        filename, pagesize=letter,
        rightMargin=54, leftMargin=54,
        topMargin=54,  bottomMargin=54,
    )

    title_s, field_s, section_s, terms_s = _styles()
    story = []

    # 1 — Title
    story.append(Paragraph("VENDOR AGREEMENT", title_s))
    story.append(Spacer(1, 6))

    # 2 — Header fields (one Paragraph each = one line each)
    for label, value in zip(HEADER_LABELS, [
        vendor_name, vendor_email, vendor_gstin,
        valid_from, valid_until, payment_terms,
        delivery_location or "N/A", notes or "N/A",
    ]):
        story.append(Paragraph(f"{label}: {value}", field_s))
    story.append(Spacer(1, 10))

    # 3 — Products table (9 columns including sizing)
    story.append(Paragraph("Products and Pricing", section_s))
    story.append(Spacer(1, 4))

    rows = [TABLE_HEADERS[:]]
    for p in products:
        rows.append([
            str(p["name"]).strip(),
            str(p["barcode"]).strip(),
            f"{float(p['price']):.2f}",
            str(int(p.get("lead_time") or 0)),
            str(p.get("purchase_unit", "Carton")),
            f"{float(p.get('weight', 0)):.2f}",
            f"{float(p.get('length', 0)):.2f}",
            f"{float(p.get('width',  0)):.2f}",
            f"{float(p.get('height', 0)):.2f}",
        ])

    tbl = Table(rows, colWidths=COL_WIDTHS, repeatRows=1)
    tbl.setStyle(_table_style())
    story.append(tbl)
    story.append(Spacer(1, 14))

    # 4 — Terms
    story.append(Paragraph("Terms and Conditions", section_s))
    story.append(Spacer(1, 4))
    for term in TERMS:
        story.append(Paragraph(term, terms_s))

    doc.build(story)
    print(f"[OK] Generated: {filename}  ({len(products)} products, 9 columns)")


# ── Verifier ──────────────────────────────────────────────────────────────────

FIELD_PATTERNS = {label: rf"^{re.escape(label)}:\s*(.+)$" for label in HEADER_LABELS}
N_COLS = len(TABLE_HEADERS)   # 9


def verify_pdf(filename: str) -> bool:
    print(f"\n{'='*60}")
    print(f"  Verifying: {filename}")
    print(f"{'='*60}")
    errors = []

    with pdfplumber.open(filename) as pdf:
        print(f"  Pages: {len(pdf.pages)}")

        for page_num, page in enumerate(pdf.pages, 1):
            text = page.extract_text() or ""

            if page_num == 1:
                print("\n  Header fields:")
                for label, pattern in FIELD_PATTERNS.items():
                    m = re.search(pattern, text, re.MULTILINE | re.IGNORECASE)
                    val = m.group(1).strip() if m else None
                    icon = "[OK]" if val else "[!!]"
                    print(f"    {icon} {label}: {val or 'NOT FOUND'}")
                    if not val:
                        errors.append(f"Missing header: {label}")

            for t_idx, table in enumerate(page.extract_tables() or [], 1):
                if not table:
                    continue
                header_row = [str(c).strip() if c else "" for c in table[0]]
                n_cols     = len(table[0])
                col_ok     = header_row == TABLE_HEADERS
                status     = "[OK]" if col_ok and n_cols == N_COLS else "[!!]"
                print(f"\n  Table {t_idx} / page {page_num}: "
                      f"{len(table)} rows × {n_cols} cols  {status}")
                if not col_ok:
                    print(f"    Expected : {TABLE_HEADERS}")
                    print(f"    Got      : {header_row}")
                    errors.append(f"Page {page_num}: header mismatch")
                if n_cols != N_COLS:
                    errors.append(f"Page {page_num}: {n_cols} cols (expected {N_COLS})")

                # Spot-check sizing cols are numeric for data rows
                sizing_cols = {
                    "Weight (kg)": TABLE_HEADERS.index("Weight (kg)"),
                    "Length (cm)": TABLE_HEADERS.index("Length (cm)"),
                    "Width (cm)":  TABLE_HEADERS.index("Width (cm)"),
                    "Height (cm)": TABLE_HEADERS.index("Height (cm)"),
                }
                bad_rows = []
                for r_idx, row in enumerate(table[1:], start=2):
                    for col_name, col_idx in sizing_cols.items():
                        if col_idx >= len(row):
                            continue
                        cell = str(row[col_idx] or "").strip()
                        try:
                            float(cell)
                        except ValueError:
                            bad_rows.append(f"row {r_idx} [{col_name}]='{cell}'")
                if bad_rows:
                    errors.append(f"Page {page_num}: non-numeric sizing cells: {bad_rows}")
                    print(f"    [!!] Non-numeric sizing: {bad_rows}")

    passed = not errors
    if passed:
        print("\n  [OK] All checks passed.")
    else:
        print(f"\n  [!!] {len(errors)} error(s) found:")
        for e in errors:
            print(f"      - {e}")
    return passed


# ── Demo ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    products = [
        # name,            barcode,          price,    lead_time, weight, length, width, height
        {"name": "Masala",        "barcode": "049090028904",  "price": 1250.00, "lead_time": 7,  "weight": 0.50, "length": 15.0, "width": 10.0, "height":  8.0},
        {"name": "Soap",          "barcode": "683405946045",  "price":  320.00, "lead_time": 5,  "weight": 0.10, "length":  8.0, "width":  5.0, "height":  3.0},
        {"name": "Rice (56 kg)",  "barcode": "851469000793",  "price":  480.00, "lead_time": 3,  "weight": 1.00, "length": 30.0, "width": 20.0, "height": 10.0},
        {"name": "Wheat Flour",   "barcode": "801541107612",  "price":  390.00, "lead_time": 4,  "weight": 1.00, "length": 28.0, "width": 18.0, "height":  8.0},
        {"name": "Cooking Oil",   "barcode": "801541500123",  "price":  950.00, "lead_time": 6,  "weight": 0.92, "length": 24.0, "width":  8.0, "height":  8.0},
        {"name": "Shampoo",       "barcode": "801541500086",  "price":  220.00, "lead_time": 5,  "weight": 0.30, "length": 18.0, "width":  5.0, "height":  5.0},
        {"name": "Toothpaste",    "barcode": "8901314000552", "price":  120.00, "lead_time": 4,  "weight": 0.15, "length": 15.0, "width":  4.0, "height":  3.0},
        {"name": "Detergent",     "barcode": "8901030899998", "price":  210.00, "lead_time": 6,  "weight": 0.50, "length": 20.0, "width": 12.0, "height":  6.0},
        {"name": "Bathing Bar",   "barcode": "8901030705480", "price":   75.00, "lead_time": 5,  "weight": 0.12, "length": 10.0, "width":  6.0, "height":  3.0},
        {"name": "Hair Oil",      "barcode": "8901248157012", "price":  180.00, "lead_time": 4,  "weight": 0.20, "length": 14.0, "width":  5.0, "height":  5.0},
        {"name": "Face Wash",     "barcode": "8901526102662", "price":  250.00, "lead_time": 6,  "weight": 0.18, "length": 16.0, "width":  5.0, "height":  5.0},
        {"name": "Hand Wash",     "barcode": "8901030865405", "price":  150.00, "lead_time": 3,  "weight": 0.22, "length": 18.0, "width":  6.0, "height":  6.0},
        {"name": "Dishwash",      "barcode": "8901030701116", "price":  140.00, "lead_time": 4,  "weight": 0.40, "length": 20.0, "width":  8.0, "height":  6.0},
        {"name": "Biscuits",      "barcode": "8901063162365", "price":   40.00, "lead_time": 2,  "weight": 0.20, "length": 18.0, "width": 10.0, "height":  4.0},
        {"name": "Noodles",       "barcode": "8901058855508", "price":   14.00, "lead_time": 2,  "weight": 0.08, "length": 12.0, "width":  8.0, "height":  3.0},
        {"name": "Tea Powder",    "barcode": "8901234567890", "price":  320.00, "lead_time": 5,  "weight": 0.50, "length": 16.0, "width": 10.0, "height":  6.0},
        {"name": "Coffee Powder", "barcode": "8907652321098", "price":  450.00, "lead_time": 5,  "weight": 0.25, "length": 14.0, "width":  8.0, "height":  6.0},
        {"name": "Sugar",         "barcode": "8901111222233", "price":   60.00, "lead_time": 3,  "weight": 1.00, "length": 22.0, "width": 15.0, "height":  8.0},
        {"name": "Salt",          "barcode": "8904004400440", "price":   28.00, "lead_time": 2,  "weight": 1.00, "length": 20.0, "width": 12.0, "height":  6.0},
        {"name": "Milk Powder",   "barcode": "8902222333344", "price":  500.00, "lead_time": 6,  "weight": 0.50, "length": 18.0, "width": 12.0, "height":  8.0},
    ]

    generate_vendor_agreement_pdf(
        vendor_name="Fresh Foods Pvt Ltd",
        vendor_email="rohansharma.it22memcet@gmail.com",
        vendor_gstin="34ASCDE1234F1Z4",
        products=products,
        filename="vendor_agreement.pdf",
        payment_terms="Net 30 Days",
        delivery_location="Chennai, Tamil Nadu",
        notes="Standard terms apply.",
    )

    verify_pdf("vendor_agreement.pdf")