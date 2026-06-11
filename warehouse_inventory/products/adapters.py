"""
products/adapters.py — Backward Compatibility Adapter Layer

Provides a unified interface for all modules to access product data.
Reads from Product table (populated exclusively via vendor agreement flow).
"""
import logging

logger = logging.getLogger(__name__)


def _product_to_dict(p) -> dict:
    """Serialize a Product instance to a standardized dict."""
    vendor = p.vendor  # select_related must be applied by callers

    vendor_details = None
    if vendor:
        vendor_details = {
            "vendor_id":      vendor.vendor_id,
            "vendor_name":    vendor.vendor_name,
            "contact_person": vendor.contact_person,
            "email":          vendor.email,
            "phone":          vendor.phone,
            "gstin":          vendor.gstin,
            "lead_time":      vendor.lead_time,
            "address":        vendor.address,
            "city":           vendor.city,
            "state":          vendor.state,
            "country":        vendor.country,
            "is_active":      vendor.is_active,
        }

    # Resolve zone_type from category if zone FK is absent
    zone = p.zone
    zone_type = zone.zone_type if zone else _zone_type_from_category(p.category)

    return {
        "product_id":        p.product_id,
        "product_name":      p.product_name,
        "brand_name":        p.brand_name,
        "barcode":           p.barcode,
        "sku_code":          p.sku_code,
        "description":       p.description,
        "category":          p.category,
        "size":              p.size,
        # Inventory classification
        "ABC":               p.ABC,
        "XYZ":               p.XYZ,
        "VED":               p.VED,
        "re_order":          p.re_order,
        "reorder_point":     p.reorder_point,
        "avg_lead_time":     p.avg_lead_time,
        "avg_daily_sales":   p.avg_daily_sales,
        "total_stock":       p.total_stock,
        "available_stock":   p.available_stock,
        # Packaging
        "package_type":      p.package_type,
        "base_unit":         p.base_unit,
        "purchase_unit":     p.purchase_unit,
        "conversion_factor": float(p.conversion_factor),
        "carton_price":      float(p.carton_price),
        "unit_price":        float(p.unit_price),
        "gst_percent":       float(p.gst_percent),
        # Dimensions
        "weight_kg":         p.weight_kg,
        "length_cm":         p.length_cm,
        "width_cm":          p.width_cm,
        "height_cm":         p.height_cm,
        "volume_cm3":        p.volume_cm3,
        # Zone
        "zone_id":           p.zone_id,
        "zone_type":         zone_type,
        # Vendor
        "vendor_id":         p.vendor_id,
        "vendor_name":       vendor.vendor_name if vendor else None,
        "vendor_details":    vendor_details,
        "is_first_vendor":   p.is_first_vendor,
        "is_multi_vendor":   p.is_multi_vendor,
        # Status
        "is_active":         p.is_active,
        "created_at":        p.created_at.isoformat(),
        "updated_at":        p.updated_at.isoformat(),
    }


def _zone_type_from_category(category_name: str) -> str | None:
    """
    Fallback: look up zone_type from Category table using product.category string.
    Returns None if category is blank or not found.
    """
    if not category_name:
        return None
    try:
        from vendors.models import Category
        cat = Category.objects.filter(name=category_name.strip().lower()).first()
        return cat.zone_type if cat else None
    except Exception:
        return None


def getProducts(vendor_id: str = None, active_only: bool = False,
                category: str = None) -> list:
    """Returns all products, optionally filtered by vendor, active status, or category."""
    try:
        from products.models import Product
        qs = Product.objects.select_related("vendor", "zone").all()
        if vendor_id:
            qs = qs.filter(vendor__vendor_id=vendor_id)
        if active_only:
            qs = qs.filter(is_active=True)
        if category:
            qs = qs.filter(category=category.strip().lower())
        return [_product_to_dict(p) for p in qs]
    except Exception as exc:
        logger.error("[getProducts] error: %s", exc, exc_info=True)
        return []


def getProductByBarcode(barcode: str) -> dict | None:
    """Lookup product by barcode."""
    try:
        from products.models import Product
        p = Product.objects.select_related("vendor", "zone").get(barcode=barcode)
        return _product_to_dict(p)
    except Exception:
        return None


def getProductById(product_id: str) -> dict | None:
    """Lookup product by product_id."""
    try:
        from products.models import Product
        p = Product.objects.select_related("vendor", "zone").get(product_id=product_id)
        return _product_to_dict(p)
    except Exception:
        return None