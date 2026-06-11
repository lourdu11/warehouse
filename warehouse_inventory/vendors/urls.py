from django.urls import path
from .views import (
    # Category
    ListCategoryView, CreateCategoryView, GetCategoryView,
    # Warehouse
    GetWarehouse, CreateWarehouse, UpdateWarehouse,
    # Vendor CRUD
    CreateVendorView, ListVendorView, GetVendorView, UpdateVendor, DeleteVendor,
    # Agreements
    CreateVendorAgreementView, ListVendorAgreementsView, GetAgreementView,
    UploadSmartVendorAgreementView,
    UploadVendorAgreementView,
    # Agreement products
    AddProductToAgreementView, ListAgreementProductsView,
    GetAgreementProductView, ListAllAgreementProductsView,
    # Barcode
    BarcodeLookupView,
    # Audit log
    ListRejectedAgreementsView,
    # Multi-vendor
    ProductVendorsView,
    # Legacy
    MapVendorProductView, ListVendorProductsView, UnmappedVendorProductsView,
)

urlpatterns = [

    # ── CATEGORY ──────────────────────────────────────────────────────────────
    path("categories/",            ListCategoryView.as_view()),
    path("categories/create/",     CreateCategoryView.as_view()),
    path("categories/<int:pk>/",   GetCategoryView.as_view()),

    # ── WAREHOUSE ─────────────────────────────────────────────────────────────
    path("warehouse/",             GetWarehouse.as_view()),
    path("warehouse/create/",      CreateWarehouse.as_view()),
    path("warehouse/update/",      UpdateWarehouse.as_view()),

    # ── VENDOR CRUD ───────────────────────────────────────────────────────────
    path("vendor/create/",                   CreateVendorView.as_view()),
    path("vendor/list/",                     ListVendorView.as_view()),
    path("vendor/<str:vendor_id>/",          GetVendorView.as_view()),
    path("vendor/update/<str:vendor_id>/",   UpdateVendor.as_view()),
    path("vendor/delete/<str:vendor_id>/",   DeleteVendor.as_view()),

    # ── AGREEMENTS ────────────────────────────────────────────────────────────
    # PRIMARY canonical upload endpoint
    path("vendor/<str:vendor_id>/upload-agreement/",
         UploadVendorAgreementView.as_view()),

    path("vendor/<str:vendor_id>/agreements/create/",
         CreateVendorAgreementView.as_view()),
    path("vendor/<str:vendor_id>/agreements/",
         ListVendorAgreementsView.as_view()),
    path("agreements/<str:agreement_id>/",
         GetAgreementView.as_view()),

    # Backward-compat stub
    path("upload-agreement/",
         UploadSmartVendorAgreementView.as_view()),

    # ── AGREEMENT PRODUCTS ────────────────────────────────────────────────────
    path("agreements/<str:agreement_id>/products/add/",
         AddProductToAgreementView.as_view()),
    path("agreements/<str:agreement_id>/products/",
         ListAgreementProductsView.as_view()),
    path("agreement-products/<int:pk>/",
         GetAgreementProductView.as_view()),
    path("agreement-products/",
         ListAllAgreementProductsView.as_view()),

    # ── BARCODE LOOKUP ────────────────────────────────────────────────────────
    path("barcode/<str:barcode>/",
         BarcodeLookupView.as_view()),

    # ── AUDIT LOG ─────────────────────────────────────────────────────────────
    path("rejected-agreements/",
         ListRejectedAgreementsView.as_view()),

    # ── MULTI-VENDOR ─────────────────────────────────────────────────────────
    path("product/<str:product_id>/vendors/",
         ProductVendorsView.as_view()),

    # ── LEGACY ───────────────────────────────────────────────────────────────
    path("vendor-products/",
         ListVendorProductsView.as_view()),
    path("vendor-products/unmapped/",
         UnmappedVendorProductsView.as_view()),
    path("vendor-products/<int:vendor_product_id>/map/",
         MapVendorProductView.as_view()),
]