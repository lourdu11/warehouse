"""
products/views.py

Direct product creation is BLOCKED.
Products are created only via vendor agreement parsing flow.
Admin can update zone, package_type, ABC/XYZ/VED after creation.
"""
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from .models import Product
from .serializers import ProductSerializer, ProductZoneAssignSerializer
from .adapters import getProducts, getProductByBarcode, getProductById

logger = logging.getLogger(__name__)


class CreateProductView(APIView):
    """DISABLED — direct product creation not allowed."""
    def post(self, request):
        return Response(
            {
                "error": "Direct product creation is not allowed.",
                "instructions": (
                    "Products are created automatically when a vendor "
                    "agreement PDF is parsed."
                ),
                "steps": [
                    "1. Create Vendor : POST /api/vendors/vendor/create/",
                    "2. Upload PDF    : POST /api/vendors/vendor/<id>/upload-agreement/",
                ],
            },
            status=status.HTTP_403_FORBIDDEN,
        )


class ListProductsView(APIView):
    """
    GET /api/products/listall/
    Supports ?vendor_id=, ?active_only=true, ?category= filters.
    """
    def get(self, request):
        vendor_id   = request.query_params.get("vendor_id")
        active_only = request.query_params.get("active_only", "").lower() == "true"
        category    = request.query_params.get("category")
        products    = getProducts(
            vendor_id=vendor_id, active_only=active_only, category=category
        )
        return Response({"count": len(products), "products": products})


class ProductDetailView(APIView):
    """GET /api/products/list/<product_id>/"""
    def get(self, request, product_id):
        p = get_object_or_404(
            Product.objects.select_related("vendor", "zone"),
            product_id=product_id,
        )
        return Response(ProductSerializer(p).data)


class UpdateProductView(APIView):
    """
    PATCH /api/products/update/<product_id>/
    Admin can update classification, dimensions, pricing.
    Barcode and product_id are immutable.
    """
    def patch(self, request, product_id):
        p = get_object_or_404(Product, product_id=product_id)
        # Prevent barcode and product_id updates
        data = request.data.copy()
        data.pop("barcode", None)
        data.pop("product_id", None)
        s = ProductSerializer(p, data=data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Product updated.", "data": s.data})
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class AssignProductZoneView(APIView):
    """
    PATCH /api/products/<product_id>/assign-zone/

    Admin assigns zone, package_type, and ABC/XYZ/VED classifications
    to a newly created product. Also accepts re_order (admin manual threshold).

    After assignment, triggers reorder point recalculation.
    """
    def patch(self, request, product_id):
        p = get_object_or_404(Product, product_id=product_id)
        s = ProductZoneAssignSerializer(p, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            # Recalculate reorder point with new classification/zone data
            try:
                from Inventory.utils import update_product_reorder_level
                update_product_reorder_level(p)
                p.refresh_from_db(fields=["reorder_point", "avg_lead_time"])
            except Exception as exc:
                logger.warning("Reorder recalc failed for %s: %s", product_id, exc)

            return Response({
                "message":        "Zone and classification assigned.",
                "product_id":     product_id,
                "zone_id":        p.zone_id,
                "package_type":   p.package_type,
                "ABC":            p.ABC,
                "XYZ":            p.XYZ,
                "VED":            p.VED,
                "re_order":       p.re_order,
                "reorder_point":  p.reorder_point,
            })
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class DeleteProductView(APIView):
    """Soft delete — marks is_active=False."""
    def delete(self, request, product_id):
        p = get_object_or_404(Product, product_id=product_id)
        p.is_active = False
        p.save(update_fields=["is_active"])
        return Response({"message": "Product deactivated."})


class BarcodeLookupView(APIView):
    """GET /api/products/barcode/<barcode>/"""
    def get(self, request, barcode):
        product = getProductByBarcode(barcode)
        if product:
            return Response(product)
        return Response(
            {"error": f"No product found for barcode: {barcode}"},
            status=status.HTTP_404_NOT_FOUND,
        )


class ProductsNeedingZoneView(APIView):
    """
    GET /api/products/needs-zone/
    Returns products created via agreement parsing but without zone/package_type.
    Frontend shows this list so admin can assign zones.
    """
    def get(self, request):
        products = Product.objects.filter(
            zone__isnull=True, is_active=True
        ).select_related("vendor").order_by("-created_at")
        return Response({
            "count":    products.count(),
            "products": ProductSerializer(products, many=True).data,
        })