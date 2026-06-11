

from django.urls import path
from .views import (
    CreateProductView,
    ListProductsView,
    ProductDetailView,
    UpdateProductView,
    AssignProductZoneView,
    DeleteProductView,
    BarcodeLookupView,
    ProductsNeedingZoneView,
)

urlpatterns = [
    # Blocked
    path("create/",                          CreateProductView.as_view()),

    # Read
    path("listall/",                         ListProductsView.as_view()),
    path("list/<str:product_id>/",           ProductDetailView.as_view()),
    path("needs-zone/",                      ProductsNeedingZoneView.as_view()),
    path("barcode/<str:barcode>/",           BarcodeLookupView.as_view()),

    # Write
    path("update/<str:product_id>/",         UpdateProductView.as_view()),
    path("<str:product_id>/assign-zone/",    AssignProductZoneView.as_view()),
    path("delete/<str:product_id>/",         DeleteProductView.as_view()),
]