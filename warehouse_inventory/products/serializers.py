"""
products/serializers.py
"""
from rest_framework import serializers
from .models import Product
from vendors.models import Vendor


class VendorMiniSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Vendor
        fields = [
            "vendor_id", "vendor_name", "contact_person",
            "email", "phone", "gstin",
            "lead_time", "address", "city", "state", "country",
            "is_active",
        ]


class ProductSerializer(serializers.ModelSerializer):
    vendor_id      = serializers.PrimaryKeyRelatedField(
        source="vendor", queryset=Vendor.objects.all(),
        required=False, allow_null=True, write_only=True
    )
    vendor_details = VendorMiniSerializer(source="vendor", read_only=True)
    volume_cm3     = serializers.ReadOnlyField()
    zone_id        = serializers.CharField(source="zone.zone_id",   read_only=True,
                                           allow_null=True)
    zone_type      = serializers.CharField(source="zone.zone_type", read_only=True,
                                           allow_null=True)
    effective_reorder_point = serializers.ReadOnlyField()
    allocated_stock = serializers.ReadOnlyField()
    available_stock = serializers.ReadOnlyField()
    total_stock     = serializers.ReadOnlyField()

    class Meta:
        model  = Product
        fields = [
            "product_id", "product_name", "brand_name", "barcode",
            "sku_code", "description", "category", "size",
            # Inventory classification
            "ABC", "XYZ", "VED",
            "re_order", "reorder_point", "avg_lead_time", "avg_daily_sales",
            "effective_reorder_point", "total_stock", "allocated_stock", "available_stock",
            # Packaging & units
            "package_type", "base_unit", "purchase_unit",
            "conversion_factor", "carton_price", "gst_percent", "unit_price",
            # Physical dims
            "weight_kg", "length_cm", "width_cm", "height_cm", "volume_cm3",
            # Zone
            "zone", "zone_id", "zone_type",
            # Vendor
            "vendor_id", "vendor_details",
            "is_first_vendor", "is_multi_vendor",
            # Status
            "is_active", "is_deprecated",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "product_id", "sku_code", "unit_price", "volume_cm3",
            "reorder_point", "avg_lead_time", "avg_daily_sales",
            "effective_reorder_point", "total_stock", "allocated_stock", "available_stock",
            "is_first_vendor", "is_multi_vendor",
            "created_at", "updated_at",
        ]

    def validate_conversion_factor(self, value):
        if value <= 0:
            raise serializers.ValidationError("Conversion factor must be > 0.")
        return value

    def validate_carton_price(self, value):
        if value < 0:
            raise serializers.ValidationError("Carton price cannot be negative.")
        return value

    def validate_re_order(self, value):
        if value < 0:
            raise serializers.ValidationError("Reorder point cannot be negative.")
        return value

    def validate_category(self, value):
        # Normalize to lowercase
        return value.strip().lower() if value else value


class ProductZoneAssignSerializer(serializers.ModelSerializer):
    """
    Used when admin assigns zone + package_type + classifications
    to a newly created product.
    """
    class Meta:
        model  = Product
        fields = ["package_type", "ABC", "XYZ", "VED", "re_order"]