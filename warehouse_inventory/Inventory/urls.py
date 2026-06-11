"""
inventory/urls.py

URL configuration for the Inventory app.

Route ordering rules applied:
  - Static paths always before dynamic (e.g. grn/supervisor/create/ before grn/<grn_id>/)
  - Conflict-prone prefixes (grn/qc/, grn/decode-barcode/, putaway/pending/) placed first.
  - The catch-all GRN detail route  grn/<str:pk>/  is last in its group.
"""

from django.urls import path

from .views import (
    # ── Zone ──────────────────────────────────────────────────────────────────
    ListZoneView,
    CreateZoneView,
    GetZoneView,
    UpdateZoneView,
    DeleteZoneView,
    # ── Rack ──────────────────────────────────────────────────────────────────
    ListRackView,
    CreateRackView,
    GetRackView,
    UpdateRackView,
    DeleteRackView,
    # ── Shelf (read-only) ─────────────────────────────────────────────────────
    ListShelfView,
    GetShelfView,
    # ── Bin (read-only) ───────────────────────────────────────────────────────
    ListBinView,
    GetBinView,
    ListAvailableBinsView,
    BinContentsView,
    # ── Batch ─────────────────────────────────────────────────────────────────
    BatchListView,
    BatchDetailView,
    BatchLookupView,
    # ── Inventory ─────────────────────────────────────────────────────────────
    ListInventoryView,
    GetInventoryView,
    ProductStockView,
    ProductStockByVendorView,
    CrossVendorPurchaseView,
    RemoveStockByProductView,
    StockMovementListView,
    StockMovementByProductView,
    # ── Vendor scoring ────────────────────────────────────────────────────────
    VendorScoreView,
    # ── Purchase Request / Order ──────────────────────────────────────────────
    ManualCreatePRView,
    PurchaseRequestListView,
    PurchaseRequestDetailView,
    ManagerApprovePR,
    ManagerRejectPR,
    FinanceApprovePR,
    PurchaseOrderListView,
    PurchaseOrderDetailView,
    # ── ASN ───────────────────────────────────────────────────────────────────
    ASNCreateView,
    ASNListView,
    ASNDetailView,
    CreateASNItemView,
    ASNItemListView,
    ASNItemDetailView,
    # ── GRN ───────────────────────────────────────────────────────────────────
    SupervisorCreateGRN,
    SupervisorScanBarcodeView,
    SupervisorAddGRNItem,
    SupervisorGRNListView,
    QCUpdateGRNItem,
    QCApproveGRN,
    ListRejectedItemsView,
    ManagerConfirmRejectionView,
    GRNQCPendingListView,
    GRNBarcodeDecodeView,
    GRNListView,
    GRNDetailView,
    GRNItemsByGRNView,
    GRNSummaryView,
    GRNItemListView,
    GRNItemDetailView,
    # ── Putaway ───────────────────────────────────────────────────────────────
    PutawayPlanListView,
    PutawayPlanByGRNView,
    ConfirmPutawayPlanView,
    ReassignPutawayBinView,
    # ── Outbound ──────────────────────────────────────────────────────────────
    OptimizedOutboundView,
)

urlpatterns = [

    # ═══════════════════════════════════════════
    # WAREHOUSE STRUCTURE
    # ═══════════════════════════════════════════

    # Zone
    path("zones/",                          ListZoneView.as_view(),   name="zone-list"),
    path("zones/create/",                   CreateZoneView.as_view(), name="zone-create"),
    path("zones/<str:zone_id>/",            GetZoneView.as_view(),    name="zone-detail"),
    path("zones/<str:zone_id>/update/",     UpdateZoneView.as_view(), name="zone-update"),
    path("zones/<str:zone_id>/delete/",     DeleteZoneView.as_view(), name="zone-delete"),

    # Rack  (auto-creates shelves + bins)
    path("racks/",                          ListRackView.as_view(),   name="rack-list"),
    path("racks/create/",                   CreateRackView.as_view(), name="rack-create"),
    path("racks/<str:rack_id>/",            GetRackView.as_view(),    name="rack-detail"),
    path("racks/<str:rack_id>/update/",     UpdateRackView.as_view(), name="rack-update"),
    path("racks/<str:rack_id>/delete/",     DeleteRackView.as_view(), name="rack-delete"),

    # Shelf (read-only — auto-created by rack)
    path("shelves/",                        ListShelfView.as_view(),  name="shelf-list"),
    path("shelves/<str:shelf_id>/",         GetShelfView.as_view(),   name="shelf-detail"),

    # Bin (read-only — auto-created by rack)
    path("bins/",                           ListBinView.as_view(),          name="bin-list"),
    path("bins/available/",                 ListAvailableBinsView.as_view(), name="bin-available"),
    path("bins/<str:bin_id>/",              GetBinView.as_view(),            name="bin-detail"),
    path("bins/<str:bin_id>/contents/",     BinContentsView.as_view(),       name="bin-contents"),

    # ═══════════════════════════════════════════
    # BATCH
    # ═══════════════════════════════════════════

    path("batches/",                        BatchListView.as_view(),   name="batch-list"),
    path("batches/lookup/",                 BatchLookupView.as_view(), name="batch-lookup"),
    path("batches/<str:batch_id>/",         BatchDetailView.as_view(), name="batch-detail"),

    # ═══════════════════════════════════════════
    # INVENTORY
    # ═══════════════════════════════════════════

    path("inventory/",                      ListInventoryView.as_view(), name="inventory-list"),
    path("inventory/<str:inventory_id>/",   GetInventoryView.as_view(),  name="inventory-detail"),

    path("product/<str:product_id>/stock/",
         ProductStockView.as_view(),        name="product-stock"),
    path("product/<str:product_id>/by-vendor/",
         ProductStockByVendorView.as_view(), name="product-stock-by-vendor"),
    path("product/<str:product_id>/cross-vendor/",
         CrossVendorPurchaseView.as_view(), name="product-cross-vendor"),
    path("product/<str:product_id>/remove-stock/",
         RemoveStockByProductView.as_view(), name="product-remove-stock"),

    path("stock-movements/",
         StockMovementListView.as_view(),   name="stock-movement-list"),
    path("stock-movements/<str:product_id>/",
         StockMovementByProductView.as_view(), name="stock-movement-by-product"),

    # ═══════════════════════════════════════════
    # VENDOR SCORING
    # ═══════════════════════════════════════════

    path("vendor-scores/<str:product_id>/",
         VendorScoreView.as_view(),         name="vendor-scores"),

    # ═══════════════════════════════════════════
    # PURCHASE REQUEST / ORDER
    # ═══════════════════════════════════════════

    # Manual PR — static path must precede list path
    path("purchase-request/manual/",
         ManualCreatePRView.as_view(),      name="pr-manual-create"),

    path("purchase-requests/",
         PurchaseRequestListView.as_view(), name="pr-list"),
    path("purchase-requests/<str:pr_id>/",
         PurchaseRequestDetailView.as_view(), name="pr-detail"),
    path("purchase-requests/<str:pr_id>/manager-approve/",
         ManagerApprovePR.as_view(),        name="pr-manager-approve"),
    path("purchase-requests/<str:pr_id>/manager-reject/",
         ManagerRejectPR.as_view(),         name="pr-manager-reject"),
    path("purchase-requests/<str:pr_id>/finance-approve/",
         FinanceApprovePR.as_view(),        name="pr-finance-approve"),

    path("purchase-orders/",
         PurchaseOrderListView.as_view(),   name="po-list"),
    path("purchase-orders/<str:po_id>/",
         PurchaseOrderDetailView.as_view(), name="po-detail"),

    # ═══════════════════════════════════════════
    # ASN
    # ═══════════════════════════════════════════

    path("asn/",                            ASNListView.as_view(),    name="asn-list"),
    path("asn/create/",                     ASNCreateView.as_view(),  name="asn-create"),
    path("asn/<str:pk>/",                   ASNDetailView.as_view(),  name="asn-detail"),

    path("asn-items/",                      ASNItemListView.as_view(),   name="asn-item-list"),
    path("asn-items/create/",               CreateASNItemView.as_view(), name="asn-item-create"),
    path("asn-items/<str:pk>/",             ASNItemDetailView.as_view(), name="asn-item-detail"),

    # ═══════════════════════════════════════════
    # GRN  —  static routes FIRST, dynamic last
    # ═══════════════════════════════════════════

    # Supervisor — static
    path("grn/supervisor/create/",          SupervisorCreateGRN.as_view(),   name="grn-supervisor-create"),
    path("grn/supervisor/my-grns/",         SupervisorGRNListView.as_view(), name="grn-supervisor-list"),

    # QC — static
    path("grn/qc/pending/",                 GRNQCPendingListView.as_view(), name="grn-qc-pending"),

    # Rejections — static
    path("rejections/",                     ListRejectedItemsView.as_view(),     name="rejection-list"),
    path("rejections/<str:pk>/confirm/",    ManagerConfirmRejectionView.as_view(), name="rejection-confirm"),

    # Barcode decode — static (inventory manager scans GRN/item barcode)
    path("grn/decode-barcode/",             GRNBarcodeDecodeView.as_view(), name="grn-decode-barcode"),

    # GRN list
    path("grn/",                            GRNListView.as_view(),          name="grn-list"),

    # Dynamic — grn_id
    path("grn/<str:grn_id>/scan/",          SupervisorScanBarcodeView.as_view(), name="grn-scan"),
    path("grn/<str:grn_id>/add-item/",      SupervisorAddGRNItem.as_view(),      name="grn-add-item"),
    path("grn/<str:grn_id>/qc-approve/",    QCApproveGRN.as_view(),              name="grn-qc-approve"),
    path("grn/<str:grn_id>/items/",         GRNItemsByGRNView.as_view(),         name="grn-items"),
    path("grn/<str:grn_id>/summary/",       GRNSummaryView.as_view(),            name="grn-summary"),
    path("grn/<str:grn_id>/putaway-plan/",  PutawayPlanByGRNView.as_view(),      name="grn-putaway-plan"),

    # GRN detail — must be LAST in this group (catch-all dynamic)
    path("grn/<str:pk>/",                   GRNDetailView.as_view(),             name="grn-detail"),

    # GRN Items
    path("grn-items/",                      GRNItemListView.as_view(),   name="grn-item-list"),
    path("grn-items/<str:pk>/qc/",          QCUpdateGRNItem.as_view(),   name="grn-item-qc"),
    path("grn-items/<str:pk>/",             GRNItemDetailView.as_view(), name="grn-item-detail"),

    # ═══════════════════════════════════════════
    # PUTAWAY PLAN
    # ═══════════════════════════════════════════

    # Static before dynamic
    path("putaway/pending/",                PutawayPlanListView.as_view(),     name="putaway-pending"),
    path("putaway/<str:plan_id>/confirm/",  ConfirmPutawayPlanView.as_view(),  name="putaway-confirm"),
    path("putaway/<str:plan_id>/reassign/", ReassignPutawayBinView.as_view(), name="putaway-reassign"),

    # ═══════════════════════════════════════════
    # OUTBOUND
    # ═══════════════════════════════════════════

    path("outbound/pick/<str:product_id>/", OptimizedOutboundView.as_view(), name="outbound-pick"),
]