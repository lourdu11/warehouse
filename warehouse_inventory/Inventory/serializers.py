"""
inventory/serializers.py
"""
from rest_framework import serializers
from .models import (
    Zone, Rack, Shelf, Bin,
    Batch, Inventory, StockMovement,
    PurchaseRequest, PurchaseOrder,
    ASN, ASNItem, GRN, GRNItem,
)


# ─────────────────────────────────────────────
# ZONE / RACK / SHELF / BIN
# ─────────────────────────────────────────────

class ZoneSerializer(serializers.ModelSerializer):
    rack_count = serializers.SerializerMethodField()

    class Meta:
        model  = Zone
        fields = ["zone_id", "zone_type", "total_volume_cm3",
                  "total_weight_kg", "rack_count", "created_at"]

    def get_rack_count(self, obj):
        return obj.racks.count()


class RackSerializer(serializers.ModelSerializer):
    zone_type = serializers.CharField(source="zone.zone_type", read_only=True)

    class Meta:
        model  = Rack
        fields = ["rack_id", "zone", "zone_type", "max_weight_kg", "created_at"]


class ShelfSerializer(serializers.ModelSerializer):
    rack_id        = serializers.CharField(source="rack.rack_id",        read_only=True)
    zone_id        = serializers.CharField(source="rack.zone.zone_id",   read_only=True)
    zone_type      = serializers.CharField(source="rack.zone.zone_type", read_only=True)
    position_label = serializers.CharField(source="get_position_display", read_only=True)

    class Meta:
        model  = Shelf
        fields = [
            "shelf_id", "rack", "rack_id", "zone_id", "zone_type",
            "position", "position_label",
            "max_weight_kg", "volume_cm3", "created_at",
        ]


class BinSerializer(serializers.ModelSerializer):
    shelf_id       = serializers.CharField(source="shelf.shelf_id",            read_only=True)
    rack_id        = serializers.CharField(source="shelf.rack.rack_id",        read_only=True)
    zone_id        = serializers.CharField(source="shelf.rack.zone.zone_id",   read_only=True)
    zone_type      = serializers.CharField(source="shelf.rack.zone.zone_type", read_only=True)
    shelf_position = serializers.IntegerField(source="shelf.position",         read_only=True)

    available_units      = serializers.ReadOnlyField()
    available_weight_kg  = serializers.ReadOnlyField()
    available_volume_cm3 = serializers.ReadOnlyField()

    class Meta:
        model  = Bin
        fields = [
            "bin_id", "shelf", "shelf_id", "rack_id", "zone_id", "zone_type",
            "shelf_position",
            "capacity", "current_load", "available_units",
            "max_weight_kg", "current_weight_kg", "available_weight_kg",
            "volume_cm3", "used_volume_cm3", "available_volume_cm3",
            "distance_from_dispatch", "pick_count", "last_picked_at", "created_at",
        ]
        read_only_fields = [
            "current_load", "current_weight_kg", "used_volume_cm3",
            "pick_count", "last_picked_at",
        ]

    def validate_capacity(self, value):
        if value <= 0:
            raise serializers.ValidationError("Capacity must be > 0.")
        return value

    def validate_distance_from_dispatch(self, value):
        if value < 0:
            raise serializers.ValidationError("Distance cannot be negative.")
        return value

    def validate(self, data):
        if self.instance and "capacity" in data:
            if data["capacity"] < self.instance.current_load:
                raise serializers.ValidationError({
                    "capacity": (
                        f"Cannot reduce capacity to {data['capacity']} — "
                        f"bin currently holds {self.instance.current_load} units."
                    )
                })
        return data


# ─────────────────────────────────────────────
# BATCH
# ─────────────────────────────────────────────

class BatchSerializer(serializers.ModelSerializer):
    vendor_name  = serializers.CharField(source="vendor.vendor_name",  read_only=True)
    product_name = serializers.CharField(source="product.product_name", read_only=True)

    class Meta:
        model  = Batch
        fields = [
            "batch_id", "vendor", "vendor_name", "product", "product_name",
            "batch_number", "manufactured_date", "expiry_date", "created_at",
        ]
        read_only_fields = ["batch_id", "created_at"]


# ─────────────────────────────────────────────
# INVENTORY
# ─────────────────────────────────────────────

class InventorySerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name",         read_only=True)
    vendor_name  = serializers.CharField(source="vendor.vendor_name",           read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number",           read_only=True)
    bin_id       = serializers.CharField(source="bin.bin_id",                   read_only=True)
    shelf_id     = serializers.CharField(source="bin.shelf.shelf_id",           read_only=True)
    rack_id      = serializers.CharField(source="bin.shelf.rack.rack_id",       read_only=True)
    zone_id      = serializers.CharField(source="bin.shelf.rack.zone.zone_id",  read_only=True)
    # ABC/XYZ/VED from product
    abc          = serializers.CharField(source="product.ABC", read_only=True)
    xyz          = serializers.CharField(source="product.XYZ", read_only=True)
    ved          = serializers.CharField(source="product.VED", read_only=True)

    class Meta:
        model  = Inventory
        fields = [
            "inventory_id", "product", "product_name",
            "vendor", "vendor_name",
            "batch", "batch_number",
            "bin", "bin_id", "shelf_id", "rack_id", "zone_id",
            "abc", "xyz", "ved",
            "quantity", "last_update",
        ]
        read_only_fields = ["inventory_id", "last_update"]


# ─────────────────────────────────────────────
# STOCK MOVEMENT
# ─────────────────────────────────────────────

class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name", read_only=True)
    vendor_name  = serializers.CharField(source="vendor.vendor_name",   read_only=True,
                                         allow_null=True)
    batch_number = serializers.CharField(source="batch.batch_number",   read_only=True,
                                         allow_null=True)
    bin_id       = serializers.CharField(source="bin.bin_id",           read_only=True)

    class Meta:
        model  = StockMovement
        fields = [
            "id", "product", "product_name",
            "vendor", "vendor_name",
            "batch", "batch_number",
            "bin", "bin_id",
            "movement_type", "quantity",
            "previous_stock", "new_stock", "created_at",
        ]


# ─────────────────────────────────────────────
# PURCHASE REQUEST
# ─────────────────────────────────────────────

class PurchaseRequestSerializer(serializers.ModelSerializer):
    product_name            = serializers.CharField(
        source="product.product_name", read_only=True
    )
    vendor_name             = serializers.CharField(
        source="vendor.vendor_name", read_only=True
    )
    recommended_vendor_name = serializers.CharField(
        source="recommended_vendor.vendor_name", read_only=True, allow_null=True
    )
    created_by_username     = serializers.CharField(
        source="created_by.username", read_only=True, allow_null=True
    )
    # Unit labels from product
    purchase_unit           = serializers.CharField(
        source="product.purchase_unit", read_only=True
    )
    base_unit               = serializers.CharField(
        source="product.base_unit", read_only=True
    )
    abc = serializers.CharField(source="product.ABC", read_only=True)
    xyz = serializers.CharField(source="product.XYZ", read_only=True)
    ved = serializers.CharField(source="product.VED", read_only=True)

    class Meta:
        model  = PurchaseRequest
        fields = [
            "pr_id", "product", "product_name",
            "vendor", "vendor_name",
            "requested_cartons", "requested_quantity",
            "purchase_unit", "base_unit",
            "total_amount",
            "recommended_vendor", "recommended_vendor_name",
            "recommended_score", "chosen_score", "vendor_warning",
            "abc", "xyz", "ved",
            "status", "is_auto_generated",
            "created_by", "created_by_username",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "pr_id", "requested_quantity", "total_amount",
            "recommended_vendor", "recommended_score",
            "chosen_score", "vendor_warning",
            "purchase_unit", "base_unit",
            "is_auto_generated", "created_by",
            "abc", "xyz", "ved",
            "created_at", "updated_at",
        ]


class PRManagerEditSerializer(serializers.ModelSerializer):
    """Manager can only edit vendor and requested_cartons."""
    class Meta:
        model  = PurchaseRequest
        fields = ["vendor", "requested_cartons"]

    def validate_requested_cartons(self, value):
        if value <= 0:
            raise serializers.ValidationError("Cartons must be > 0.")
        return value


# ─────────────────────────────────────────────
# PURCHASE ORDER
# ─────────────────────────────────────────────

class PurchaseOrderSerializer(serializers.ModelSerializer):
    vendor_name   = serializers.CharField(source="vendor.vendor_name",        read_only=True)
    pr_id         = serializers.CharField(source="pr.pr_id",                  read_only=True)
    product_name  = serializers.CharField(source="pr.product.product_name",   read_only=True)
    purchase_unit = serializers.CharField(source="pr.product.purchase_unit",  read_only=True)
    base_unit     = serializers.CharField(source="pr.product.base_unit",      read_only=True)

    class Meta:
        model  = PurchaseOrder
        fields = [
            "po_id", "pr", "pr_id", "product_name",
            "vendor", "vendor_name",
            "order_cartons", "order_quantity",
            "purchase_unit", "base_unit",
            "total_amount", "created_at",
        ]
        read_only_fields = ["po_id", "created_at"]


# ─────────────────────────────────────────────
# ASN
# ─────────────────────────────────────────────

class ASNItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.product_name", read_only=True)

    class Meta:
        model  = ASNItem
        fields = [
            "asn_item_id", "asn", "product", "product_name",
            "expected_quantity", "shipped_quantity", "created_at",
        ]
        read_only_fields = ["asn_item_id", "created_at"]


class ASNSerializer(serializers.ModelSerializer):
    items       = ASNItemSerializer(many=True, read_only=True)
    vendor_name = serializers.CharField(source="vendor.vendor_name", read_only=True)
    po_id       = serializers.CharField(source="po.po_id",           read_only=True)
    status      = serializers.SerializerMethodField()

    class Meta:
        model  = ASN
        fields = [
            "asn_id", "po", "po_id", "asn_number",
            "vendor", "vendor_name",
            "shipment_date", "expected_arrival_date",
            "vehicle_num", "driver_name", "driver_phone",
            "status", "created_at", "items",
        ]
        read_only_fields = ["asn_id", "created_at"]

    def get_status(self, obj):
        """
        ASN model has no status column — derive from linked GRNs.
          - No GRNs at all        → "Pending"   (shipment not yet received)
          - GRN(s) but none done  → "In Transit" (arrived, being processed)
          - Any GRN = COMPLETED   → "Received"   (fully processed)
        """
        grns = obj.grns.all()
        if not grns.exists():
            return "Pending"
        if grns.filter(status="COMPLETED").exists():
            return "Received"
        return "In Transit"


# ─────────────────────────────────────────────
# GRN
# ─────────────────────────────────────────────

class GRNCreateSerializer(serializers.ModelSerializer):
    """
    Supervisor creates GRN header.
    pr, vendor_name, vendor_gstin are set by the view — not writable from client.
    """
    class Meta:
        model  = GRN
        fields = [
            "grn_id", "grn_number", "po", "pr", "asn",
            "vendor", "vendor_name", "vendor_gstin",
            "receipt_date", "received_by", "qc_verified_by",
            "status", "created_at",
        ]
        read_only_fields = [
            "grn_id", "pr", "vendor_name", "vendor_gstin",
            "received_by", "qc_verified_by", "status", "created_at",
        ]

    def validate(self, data):
        po  = data.get("po")
        asn = data.get("asn")
        if asn and asn.po != po:
            raise serializers.ValidationError("ASN does not belong to the selected PO.")
        return data


class GRNItemCreateSerializer(serializers.ModelSerializer):
    """
    Used by SupervisorAddGRNItem (post barcode scan).
    received_cartons is the only quantity field the supervisor provides.
    Everything else is derived or snapshotted by the view.
    """
    class Meta:
        model  = GRNItem
        fields = [
            "grn_item_id", "grn", "product", "batch",
            "received_cartons", "received_quantity",
            "accepted_quantity", "rejected_quantity",
            "snapshot_product_name", "snapshot_barcode",
            "snapshot_package_type", "snapshot_base_unit",
            "snapshot_purchase_unit", "snapshot_conversion_factor",
            "snapshot_carton_price", "snapshot_gst_percent",
            "snapshot_weight_kg",
            "snapshot_length_cm", "snapshot_width_cm", "snapshot_height_cm",
            "snapshot_abc", "snapshot_xyz", "snapshot_ved",
            "unit_price", "total_price",
            "qc_status",
        ]
        read_only_fields = [
            "grn_item_id", "received_quantity",
            "accepted_quantity", "rejected_quantity",
            "snapshot_product_name", "snapshot_barcode",
            "snapshot_package_type", "snapshot_base_unit",
            "snapshot_purchase_unit", "snapshot_conversion_factor",
            "snapshot_carton_price", "snapshot_gst_percent",
            "snapshot_weight_kg",
            "snapshot_length_cm", "snapshot_width_cm", "snapshot_height_cm",
            "snapshot_abc", "snapshot_xyz", "snapshot_ved",
            "qc_status",
        ]

    def validate_received_cartons(self, value):
        if value <= 0:
            raise serializers.ValidationError("Received cartons must be > 0.")
        return value


class GRNItemQCSerializer(serializers.ModelSerializer):
    """QC fills accepted/rejected + optional rejection details. Everything else read-only."""
    class Meta:
        model  = GRNItem
        fields = [
            "grn_item_id", "grn", "product",
            "received_cartons", "received_quantity",
            "accepted_quantity", "rejected_quantity", "qc_status",
            "rejection_reason", "rejection_notes", "rejection_images",
        ]
        read_only_fields = [
            "grn_item_id", "grn", "product",
            "received_cartons", "received_quantity", "qc_status",
        ]

    def validate(self, data):
        accepted = data.get("accepted_quantity", self.instance.accepted_quantity)
        rejected = data.get("rejected_quantity", self.instance.rejected_quantity)
        received = self.instance.received_quantity
        if accepted < 0 or rejected < 0:
            raise serializers.ValidationError("Quantities cannot be negative.")
        if accepted + rejected > received:
            raise serializers.ValidationError(
                f"accepted ({accepted}) + rejected ({rejected}) > received ({received})."
            )
        # Validate rejection_images: must be a list, max 5 items
        images = data.get("rejection_images", [])
        if not isinstance(images, list):
            raise serializers.ValidationError({"rejection_images": "Must be a list of base64 strings."})
        if len(images) > 5:
            raise serializers.ValidationError({"rejection_images": "Maximum 5 images allowed."})
        return data


class GRNItemReadSerializer(serializers.ModelSerializer):
    product_name        = serializers.CharField(source="product.product_name", read_only=True)
    batch_number        = serializers.CharField(source="batch.batch_number",   read_only=True,
                                                allow_null=True)
    vendor_name         = serializers.CharField(source="batch.vendor.vendor_name",
                                                read_only=True, allow_null=True)
    rejection_confirmed_by_username = serializers.CharField(
        source="rejection_confirmed_by.username", read_only=True, allow_null=True
    )
    snapshot_volume_cm3 = serializers.ReadOnlyField()

    class Meta:
        model  = GRNItem
        fields = [
            "grn_item_id", "grn", "product", "product_name",
            "batch", "batch_number", "vendor_name",
            "received_cartons", "received_quantity",
            "accepted_quantity", "rejected_quantity",
            "rejection_reason", "rejection_notes", "rejection_images",
            "snapshot_product_name", "snapshot_barcode",
            "snapshot_package_type", "snapshot_base_unit",
            "snapshot_purchase_unit", "snapshot_conversion_factor",
            "snapshot_carton_price", "snapshot_gst_percent",
            "snapshot_weight_kg",
            "snapshot_length_cm", "snapshot_width_cm", "snapshot_height_cm",
            "snapshot_volume_cm3",
            "snapshot_abc", "snapshot_xyz", "snapshot_ved",
            "unit_price", "total_price",
            "rejection_confirmed", "rejection_confirmed_at", "rejection_confirmed_by",
            "rejection_confirmed_by_username",
            "qc_status", "created_at",
        ]


class GRNReadSerializer(serializers.ModelSerializer):
    items                   = GRNItemReadSerializer(many=True, read_only=True)
    po_id                   = serializers.CharField(source="po.po_id",         read_only=True)
    pr_id                   = serializers.CharField(source="pr.pr_id",         read_only=True)
    asn_id                  = serializers.CharField(source="asn.asn_id",       read_only=True,
                                                    allow_null=True)
    received_by_username    = serializers.CharField(
        source="received_by.username",    read_only=True, allow_null=True
    )
    qc_verified_by_username = serializers.CharField(
        source="qc_verified_by.username", read_only=True, allow_null=True
    )

    class Meta:
        model  = GRN
        fields = [
            "grn_id", "grn_number",
            "po", "po_id", "pr", "pr_id", "asn", "asn_id",
            "vendor", "vendor_name", "vendor_gstin",
            "receipt_date",
            "received_by_username", "qc_verified_by_username",
            "status", "created_at", "items",
        ]
        
from rest_framework import serializers
from .models import PutawayPlan


class PutawayPlanSerializer(serializers.ModelSerializer):
    # ───────────── RELATED DATA ─────────────
    product_name   = serializers.CharField(source="product.product_name", read_only=True)
    product_barcode = serializers.CharField(source="product.barcode", read_only=True)
    size           = serializers.CharField(source="product.size", read_only=True)
    base_unit      = serializers.CharField(source="product.base_unit", read_only=True)

    vendor_name    = serializers.CharField(source="vendor.vendor_name", read_only=True)

    batch_number   = serializers.CharField(source="batch.batch_number", read_only=True)
    expiry_date    = serializers.DateField(source="batch.expiry_date", read_only=True)

    # ───────────── BIN HIERARCHY ─────────────
    bin_id         = serializers.CharField(source="bin.bin_id", read_only=True)
    shelf_id       = serializers.CharField(source="bin.shelf.shelf_id", read_only=True)
    rack_id        = serializers.CharField(source="bin.shelf.rack.rack_id", read_only=True)
    zone_id        = serializers.CharField(source="bin.shelf.rack.zone.zone_id", read_only=True)
    zone_type      = serializers.CharField(source="bin.shelf.rack.zone.zone_type", read_only=True)

    distance_from_dispatch = serializers.FloatField(
        source="bin.distance_from_dispatch", read_only=True
    )

    # ───────────── GRN INFO ─────────────
    grn_id         = serializers.CharField(source="grn_item.grn.grn_id", read_only=True)

    # ───────────── WORKER INFO ─────────────
    completed_by   = serializers.CharField(
        source="completed_by.username", read_only=True
    )

    # ───────────── COMPUTED FIELDS ─────────────
    remaining_quantity = serializers.SerializerMethodField()
    completion_percent = serializers.SerializerMethodField()

    class Meta:
        model = PutawayPlan
        fields = [
            "plan_id",

            # GRN
            "grn_id",

            # Product
            "product",
            "product_name",
            "product_barcode",
            "size",
            "base_unit",

            # Vendor / Batch
            "vendor",
            "vendor_name",
            "batch",
            "batch_number",
            "expiry_date",

            # Location
            "bin",
            "bin_id",
            "shelf_id",
            "rack_id",
            "zone_id",
            "zone_type",
            "distance_from_dispatch",

            # Quantities
            "planned_quantity",
            "quantity_placed",
            "remaining_quantity",
            "completion_percent",

            # Status
            "status",

            # Worker
            "completed_by",
            "completed_at",

            # Notes
            "notes",

            # Meta
            "created_at",
        ]

        read_only_fields = [
            "plan_id",
            "product_name",
            "product_barcode",
            "size",
            "base_unit",
            "vendor_name",
            "batch_number",
            "expiry_date",
            "bin_id",
            "shelf_id",
            "rack_id",
            "zone_id",
            "zone_type",
            "distance_from_dispatch",
            "grn_id",
            "completed_by",
            "completed_at",
            "remaining_quantity",
            "completion_percent",
            "created_at",
        ]

    # ───────────── CUSTOM METHODS ─────────────

    def get_remaining_quantity(self, obj):
        return max(obj.planned_quantity - obj.quantity_placed, 0)

    def get_completion_percent(self, obj):
        if obj.planned_quantity == 0:
            return 0
        return round((obj.quantity_placed / obj.planned_quantity) * 100, 2)
