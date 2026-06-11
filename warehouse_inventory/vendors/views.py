"""
vendors/views.py

Canonical agreement upload flow:
  1. POST /api/vendors/vendor/create/
  2. POST /api/vendors/vendor/<vendor_id>/upload-agreement/

PDF validation: GSTIN + Email must both exactly match the selected vendor.
Products are created here (not in products/views.py) via the agreement flow.
Category is auto-resolved from PDF or request body → determines zone eligibility.
"""
import logging

from django.shortcuts import get_object_or_404
from django.db import transaction
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser

from .models import (
    Category, Vendor, Warehouse,
    VendorAgreement, VendorAgreementProduct,
    VendorProduct, RejectedAgreement,
)
from .serializers import (
    CategorySerializer, WarehouseSerializer, VendorSerializer,
    VendorAgreementSerializer, VendorAgreementProductSerializer,
    VendorProductSerializer, RejectedAgreementSerializer,
)
from .utils import (
    parse_vendor_agreement,
    fetch_product_name_by_barcode,
    get_or_create_category,
)
from products.models import Product

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# CATEGORY
# ─────────────────────────────────────────────

class ListCategoryView(APIView):
    def get(self, request):
        cats = Category.objects.all()
        return Response(CategorySerializer(cats, many=True).data)


class CreateCategoryView(APIView):
    def post(self, request):
        s = CategorySerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response(s.data, status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class GetCategoryView(APIView):
    def get(self, request, pk):
        cat = get_object_or_404(Category, pk=pk)
        return Response(CategorySerializer(cat).data)

    def patch(self, request, pk):
        cat = get_object_or_404(Category, pk=pk)
        s   = CategorySerializer(cat, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response(s.data)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        get_object_or_404(Category, pk=pk).delete()
        return Response({"message": "Category deleted."})


# ─────────────────────────────────────────────
# WAREHOUSE
# ─────────────────────────────────────────────

class GetWarehouse(APIView):
    def get(self, request):
        wh = Warehouse.objects.first()
        if not wh:
            return Response({"error": "Warehouse not created yet."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(WarehouseSerializer(wh).data)


class CreateWarehouse(APIView):
    def post(self, request):
        if Warehouse.objects.exists():
            return Response({"error": "Warehouse already exists."},
                            status=status.HTTP_400_BAD_REQUEST)
        s = WarehouseSerializer(data=request.data)
        if s.is_valid():
            wh = s.save()
            return Response({"message": "Warehouse created.", "warehouse_id": wh.warehouse_id},
                            status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class UpdateWarehouse(APIView):
    def patch(self, request):
        wh = Warehouse.objects.first()
        if not wh:
            return Response({"error": "Warehouse not found."},
                            status=status.HTTP_404_NOT_FOUND)
        s = WarehouseSerializer(wh, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Warehouse updated."})
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# VENDOR CRUD
# ─────────────────────────────────────────────

class CreateVendorView(APIView):
    """
    POST /api/vendors/vendor/create/

    Deduplication:
      - Same GSTIN → 200 {reused: true}
      - Same email  → 200 {reused: true}
      - New         → 201 Created
    """

    def post(self, request):
        wh = Warehouse.objects.first()
        if not wh:
            return Response({"error": "Create a warehouse first."},
                            status=status.HTTP_400_BAD_REQUEST)

        gstin = (request.data.get("gstin") or "").strip().upper()
        email = (request.data.get("email") or "").strip().lower()

        if gstin:
            existing = Vendor.objects.filter(gstin=gstin).first()
            if existing:
                return Response({
                    "message":     f"Vendor with GSTIN '{gstin}' already exists.",
                    "reused":      True,
                    "vendor_id":   existing.vendor_id,
                    "vendor_name": existing.vendor_name,
                }, status=status.HTTP_200_OK)

        if email:
            existing = Vendor.objects.filter(email__iexact=email).first()
            if existing:
                return Response({
                    "message":     f"Vendor with email '{email}' already exists.",
                    "reused":      True,
                    "vendor_id":   existing.vendor_id,
                    "vendor_name": existing.vendor_name,
                }, status=status.HTTP_200_OK)

        s = VendorSerializer(data=request.data)
        if s.is_valid():
            vendor = s.save(warehouse=wh)
            if vendor.email:
                self._welcome_email(vendor, wh)
            return Response({
                "message":   "Vendor created.",
                "vendor_id": vendor.vendor_id,
                "reused":    False,
            }, status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

    def _welcome_email(self, vendor, wh):
        send_mail(
            subject="Welcome to Our Warehouse Management System",
            message=(
                f"Hello {vendor.vendor_name},\n\n"
                f"Vendor ID  : {vendor.vendor_id}\n"
                f"Lead Time  : {vendor.lead_time} days\n"
                f"Warehouse  : {wh.warehouse_name}\n"
            ),
            from_email=settings.EMAIL_HOST_USER,
            recipient_list=[vendor.email],
            fail_silently=True,
        )


class ListVendorView(APIView):
    def get(self, request):
        vendors = Vendor.objects.all().order_by("lead_time")
        return Response(VendorSerializer(vendors, many=True).data)


class GetVendorView(APIView):
    def get(self, request, vendor_id):
        return Response(VendorSerializer(get_object_or_404(Vendor, vendor_id=vendor_id)).data)


class UpdateVendor(APIView):
    def patch(self, request, vendor_id):
        vendor = get_object_or_404(Vendor, vendor_id=vendor_id)
        s = VendorSerializer(vendor, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Vendor updated."})
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class DeleteVendor(APIView):
    def delete(self, request, vendor_id):
        get_object_or_404(Vendor, vendor_id=vendor_id).delete()
        return Response({"message": "Vendor deleted."})


# ─────────────────────────────────────────────
# VENDOR AGREEMENT — MANUAL CREATE / LIST / GET
# ─────────────────────────────────────────────

class CreateVendorAgreementView(APIView):
    def post(self, request, vendor_id):
        vendor = get_object_or_404(Vendor, vendor_id=vendor_id)
        data   = request.data.copy()
        data["vendor"] = vendor.vendor_id
        s = VendorAgreementSerializer(data=data)
        if s.is_valid():
            agreement = s.save()
            return Response({
                "message":      "Agreement created.",
                "agreement_id": agreement.agreement_id,
                "is_active":    agreement.is_active,
            }, status=status.HTTP_201_CREATED)
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class ListVendorAgreementsView(APIView):
    def get(self, request, vendor_id):
        vendor     = get_object_or_404(Vendor, vendor_id=vendor_id)
        agreements = VendorAgreement.objects.filter(vendor=vendor).order_by("-uploaded_at")
        return Response({
            "count":   agreements.count(),
            "results": VendorAgreementSerializer(agreements, many=True).data,
        })


class GetAgreementView(APIView):
    def get(self, request, agreement_id):
        agreement = get_object_or_404(VendorAgreement, agreement_id=agreement_id)
        return Response(VendorAgreementSerializer(agreement).data)


# ─────────────────────────────────────────────
# SMART UPLOAD STUB  (backward compat only)
# ─────────────────────────────────────────────

class UploadSmartVendorAgreementView(APIView):
    """
    Kept for import backward compat.
    All upload logic lives in UploadVendorAgreementView.
    """
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        return Response({
            "error":        "Use the canonical endpoint instead.",
            "instructions": "POST /api/vendors/vendor/<vendor_id>/upload-agreement/",
        }, status=status.HTTP_405_METHOD_NOT_ALLOWED)


# ─────────────────────────────────────────────
# AGREEMENT PRODUCTS — MANUAL ADD / LIST / GET
# ─────────────────────────────────────────────

class AddProductToAgreementView(APIView):
    """
    POST /api/vendors/agreements/<agreement_id>/products/add/

    Manual (non-PDF) path.
    - If barcode exists in Product table → maps vendor to product
    - Otherwise → creates Product + VendorAgreementProduct
    """

    def post(self, request, agreement_id):
        agreement = get_object_or_404(VendorAgreement, agreement_id=agreement_id)
        if not agreement.is_active:
            return Response({"error": "Cannot add products to an expired agreement."},
                            status=status.HTTP_400_BAD_REQUEST)

        vendor  = agreement.vendor
        barcode = (request.data.get("barcode") or "").strip()
        if not barcode:
            return Response({"error": "barcode is required."},
                            status=status.HTTP_400_BAD_REQUEST)

        # Resolve category
        raw_cat   = (request.data.get("category") or "").strip()
        zone_type = (request.data.get("zone_type") or "Dry").strip()
        category  = get_or_create_category(raw_cat, zone_type) if raw_cat else None

        data = request.data.copy()
        data["vendor"]    = vendor.vendor_id
        data["agreement"] = agreement.agreement_id

        s = VendorAgreementProductSerializer(data=data)
        if not s.is_valid():
            return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            existing_product = Product.objects.filter(barcode=barcode).first()

            if existing_product:
                # ── Existing product path ──────────────────────────────────
                other_vendor_ids = set(
                    VendorAgreementProduct.objects
                    .filter(mapped_product=existing_product)
                    .exclude(vendor=vendor)
                    .values_list("vendor_id", flat=True)
                )
                is_multi = bool(other_vendor_ids)
                if is_multi and not existing_product.is_multi_vendor:
                    existing_product.is_multi_vendor = True
                    existing_product.save(update_fields=["is_multi_vendor"])

                vap, _ = VendorAgreementProduct.objects.get_or_create(
                    vendor=vendor, agreement=agreement, barcode=barcode,
                    defaults={
                        "variant":           request.data.get("variant", ""),
                        "product_name":      existing_product.product_name,
                        "sku":               barcode,
                        "category":          category or (
                            get_or_create_category(existing_product.category)
                            if existing_product.category else None
                        ),
                        "base_unit":         existing_product.base_unit,
                        "purchase_unit":     s.validated_data.get("purchase_unit", "Carton"),
                        "conversion_factor": s.validated_data.get("conversion_factor", 1.0),
                        "vendor_price":      s.validated_data["vendor_price"],
                        "gst_percent":       existing_product.gst_percent,
                        "moq":               s.validated_data.get("moq", 1),
                        "lead_time":         s.validated_data.get("lead_time") or vendor.lead_time,
                        "mapped_product":    existing_product,
                        "is_mapped":         True,
                        "is_multi_vendor":   is_multi,
                        "is_new_product":    False,
                    },
                )
                is_new_product = False
                mapped_product = existing_product

            else:
                # ── New product path ───────────────────────────────────────
                product_name = s.validated_data.get("product_name", "Unknown Product")
                new_product  = Product.objects.create(
                    product_name      = product_name,
                    barcode           = barcode,
                    brand_name        = vendor.vendor_name,
                    category          = raw_cat.lower() if raw_cat else "",
                    base_unit         = s.validated_data.get("base_unit", "Piece"),
                    purchase_unit     = s.validated_data.get("purchase_unit", "Carton"),
                    conversion_factor = s.validated_data.get("conversion_factor", 1.0),
                    carton_price      = s.validated_data["vendor_price"],
                    gst_percent       = float(s.validated_data.get("gst_percent", 18.0)),
                    vendor            = vendor,
                    is_first_vendor   = True,
                    is_multi_vendor   = False,
                )

                vap, _ = VendorAgreementProduct.objects.get_or_create(
                    vendor=vendor, agreement=agreement, barcode=barcode,
                    defaults={
                        "variant":           request.data.get("variant", ""),
                        "product_name":      product_name,
                        "sku":               barcode,
                        "category":          category,
                        "base_unit":         new_product.base_unit,
                        "purchase_unit":     new_product.purchase_unit,
                        "conversion_factor": new_product.conversion_factor,
                        "vendor_price":      s.validated_data["vendor_price"],
                        "gst_percent":       new_product.gst_percent,
                        "moq":               s.validated_data.get("moq", 1),
                        "lead_time":         s.validated_data.get("lead_time") or vendor.lead_time,
                        "mapped_product":    new_product,
                        "is_mapped":         True,
                        "is_multi_vendor":   False,
                        "is_new_product":    True,
                    },
                )
                is_new_product = True
                mapped_product = new_product

        return Response({
            "message":               "Product added to agreement.",
            "vap_id":                vap.id,
            "barcode":               barcode,
            "is_new_product":        is_new_product,
            "mapped_product_id":     mapped_product.product_id,
            "vendor_id":             vendor.vendor_id,
            "needs_zone_assignment": is_new_product,
            "assign_zone_url": (
                f"/api/products/{mapped_product.product_id}/assign-zone/"
                if is_new_product else None
            ),
        }, status=status.HTTP_201_CREATED)


class ListAgreementProductsView(APIView):
    def get(self, request, agreement_id):
        agreement = get_object_or_404(VendorAgreement, agreement_id=agreement_id)
        products  = VendorAgreementProduct.objects.filter(
            agreement=agreement
        ).select_related("vendor", "mapped_product", "category")
        return Response({
            "agreement_id": agreement_id,
            "is_active":    agreement.is_active,
            "count":        products.count(),
            "products":     VendorAgreementProductSerializer(products, many=True).data,
        })


class GetAgreementProductView(APIView):
    def get(self, request, pk):
        vap = get_object_or_404(VendorAgreementProduct, pk=pk)
        return Response(VendorAgreementProductSerializer(vap).data)

    def patch(self, request, pk):
        vap = get_object_or_404(VendorAgreementProduct, pk=pk)
        s   = VendorAgreementProductSerializer(vap, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Updated.", "data": s.data})
        return Response(s.errors, status=status.HTTP_400_BAD_REQUEST)


class ListAllAgreementProductsView(APIView):
    """GET /api/vendors/agreement-products/?vendor_id=&barcode="""
    def get(self, request):
        qs = VendorAgreementProduct.objects.select_related(
            "vendor", "agreement", "mapped_product", "category"
        ).all()
        if vid := request.GET.get("vendor_id"):
            qs = qs.filter(vendor__vendor_id=vid)
        if bc := request.GET.get("barcode"):
            qs = qs.filter(barcode=bc)
        return Response({
            "count":   qs.count(),
            "results": VendorAgreementProductSerializer(qs, many=True).data,
        })


class BarcodeLookupView(APIView):
    """GET /api/vendors/barcode/<barcode>/"""
    def get(self, request, barcode):
        try:
            vap = VendorAgreementProduct.objects.select_related(
                "vendor", "agreement", "mapped_product", "category"
            ).get(barcode=barcode)
            return Response(VendorAgreementProductSerializer(vap).data)
        except VendorAgreementProduct.DoesNotExist:
            return Response({"error": f"No product found for barcode: {barcode}"},
                            status=status.HTTP_404_NOT_FOUND)


# ─────────────────────────────────────────────
# REJECTED AGREEMENT AUDIT LOG
# ─────────────────────────────────────────────

class ListRejectedAgreementsView(APIView):
    """GET /api/vendors/rejected-agreements/?reason=&gstin=&email="""
    def get(self, request):
        qs = RejectedAgreement.objects.all()
        if reason := request.GET.get("reason"):
            qs = qs.filter(reason=reason)
        if gstin := request.GET.get("gstin"):
            qs = qs.filter(gstin_in_pdf__iexact=gstin)
        if email := request.GET.get("email"):
            qs = qs.filter(email_in_pdf__iexact=email)
        return Response({"count": qs.count(),
                         "results": RejectedAgreementSerializer(qs, many=True).data})


# ─────────────────────────────────────────────
# PRIMARY AGREEMENT UPLOAD ENDPOINT
# ─────────────────────────────────────────────

class UploadVendorAgreementView(APIView):
    """
    POST /api/vendors/vendor/<vendor_id>/upload-agreement/

    Pipeline:
      1. Validate: GSTIN and Email in PDF must match vendor record exactly.
         Both fields checked in parallel; rejection is atomic (BOTH_MISMATCH).
      2. Create VendorAgreement record.
      3. For each parsed product row:
         a. Resolve category (PDF row → PDF header → request body → default "general")
         b. If barcode exists in Product table → map vendor, detect multi-vendor
         c. Otherwise → create Product, set vendor as primary
         d. Create VendorAgreementProduct catalog entry
      4. Send approval or rejection email.

    Unit contract
    -------------
    item["price"]             → price per purchase unit (carton)
    item["conversion_factor"] → base units per carton
    Product.carton_price      → stores price per purchase unit
    Product.unit_price        → auto-derived = carton_price / conversion_factor
    """
    parser_classes = [MultiPartParser, FormParser]

    # ─────────────────────────────────────────────
    # EMAIL HELPERS
    # ─────────────────────────────────────────────

    def _build_rejection_message(self, vendor, reason, detail,
                                  email_in_pdf="", gstin_in_pdf=""):
        if reason == "EMAIL_MISMATCH":
            return (
                f"Hello {vendor.vendor_name},\n\n"
                f"Agreement rejected.\nReason: EMAIL_MISMATCH\n\n"
                f"Registered Email : {vendor.email}\n"
                f"Document Email   : {email_in_pdf or 'Not Found'}\n\n"
                f"Please correct the email and re-upload.\n\n- Warehouse Team"
            )
        if reason == "GSTIN_MISMATCH":
            return (
                f"Hello {vendor.vendor_name},\n\n"
                f"Agreement rejected.\nReason: GSTIN_MISMATCH\n\n"
                f"Registered GSTIN : {vendor.gstin}\n"
                f"Document GSTIN   : {gstin_in_pdf or 'Not Found'}\n\n"
                f"Please correct the GSTIN and re-upload.\n\n- Warehouse Team"
            )
        if reason == "MISSING_EMAIL":
            return (
                f"Hello {vendor.vendor_name},\n\n"
                f"Agreement rejected.\nReason: MISSING_EMAIL\n\n"
                f"No email found in PDF. Registered: {vendor.email}\n\n"
                f"Please include the registered email and re-upload.\n\n- Warehouse Team"
            )
        if reason == "MISSING_GSTIN":
            return (
                f"Hello {vendor.vendor_name},\n\n"
                f"Agreement rejected.\nReason: MISSING_GSTIN\n\n"
                f"No GSTIN found in PDF. Registered: {vendor.gstin}\n\n"
                f"Please include the correct GSTIN and re-upload.\n\n- Warehouse Team"
            )
        if reason == "BOTH_MISMATCH":
            lines = []
            lines.append(
                f"  - GSTIN: doc='{gstin_in_pdf or 'N/A'}', "
                f"registered='{vendor.gstin}'"
            )
            lines.append(
                f"  - Email: doc='{email_in_pdf or 'N/A'}', "
                f"registered='{vendor.email}'"
            )
            return (
                f"Hello {vendor.vendor_name},\n\n"
                f"Agreement rejected.\nReason: BOTH_MISMATCH\n\n"
                f"Multiple fields do not match:\n" + "\n".join(lines) +
                f"\n\nPlease correct both and re-upload.\n\n- Warehouse Team"
            )
        return (
            f"Hello {vendor.vendor_name},\n\n"
            f"Agreement rejected.\nReason: {reason}\n\n{detail}\n\n- Warehouse Team"
        )

    def _send_rejection_email(self, vendor, reason, detail,
                               email_in_pdf="", gstin_in_pdf=""):
        if not vendor.email:
            return
        try:
            send_mail(
                subject="Vendor Agreement Rejected",
                message=self._build_rejection_message(
                    vendor, reason, detail, email_in_pdf, gstin_in_pdf
                ),
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[vendor.email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.warning("Rejection email failed: %s", exc)

    def _send_approval_email(self, email, vendor_name, agreement_id):
        if not email:
            return
        try:
            wh = Warehouse.objects.first()
            send_mail(
                subject="Vendor Agreement Approved",
                message=(
                    f"Hello {vendor_name},\n\n"
                    f"Agreement (ID: {agreement_id}) approved.\n\n"
                    f"Warehouse : {getattr(wh, 'warehouse_name', 'N/A')}\n"
                    f"Email     : {getattr(wh, 'warehouse_email', 'N/A')}\n"
                    f"Phone     : {getattr(wh, 'warehouse_phone', 'N/A')}\n"
                    f"Address   : {getattr(wh, 'address', 'N/A')}\n\n"
                    f"- Warehouse Team"
                ),
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[email],
                fail_silently=True,
            )
        except Exception as exc:
            logger.warning("Approval email failed: %s", exc)

    # ─────────────────────────────────────────────
    # AUDIT LOG HELPER
    # ─────────────────────────────────────────────

    def _log_rejection(self, reason, *, gstin="", email="",
                       vendor_id_provided="", file_name="", detail=""):
        RejectedAgreement.objects.create(
            reason=reason, gstin_in_pdf=gstin, email_in_pdf=email,
            vendor_id_provided=vendor_id_provided, file_name=file_name, detail=detail,
        )
        return Response({"error": detail, "reason": reason},
                        status=status.HTTP_400_BAD_REQUEST)

    # ─────────────────────────────────────────────
    # MAIN POST
    # ─────────────────────────────────────────────

    def post(self, request, vendor_id):
        vendor   = get_object_or_404(Vendor, vendor_id=vendor_id)
        response = self._run_pipeline(request, vendor)

        if response.status_code != 201:
            import re as _re
            reason   = response.data.get("reason", "VALIDATION_ERROR")
            detail   = response.data.get("error", "Agreement validation failed")
            email_m  = _re.search(r"PDF email '([^']+)'",  detail)
            gstin_m  = _re.search(r"PDF GSTIN '([^']+)'",  detail)
            self._send_rejection_email(
                vendor, reason, detail,
                email_in_pdf  = email_m.group(1) if email_m else "",
                gstin_in_pdf  = gstin_m.group(1) if gstin_m else "",
            )
        else:
            self._send_approval_email(
                vendor.email, vendor.vendor_name,
                response.data.get("agreement_id"),
            )

        return response

    # ─────────────────────────────────────────────
    # PIPELINE
    # ─────────────────────────────────────────────

    def _run_pipeline(self, request, vendor):
        file = request.FILES.get("file")
        if not file:
            return Response({"error": "PDF file is required."}, status=400)
        if not file.name.lower().endswith(".pdf"):
            return Response({"error": "Only PDF files are allowed."}, status=400)

        file_name = file.name
        vendor_id = vendor.vendor_id

        # ── 1. Parse PDF ──────────────────────────────────────────────────────
        try:
            file.seek(0)
            parsed = parse_vendor_agreement(file)
        except Exception as exc:
            return Response({"error": str(exc)}, status=400)

        metadata     = parsed["metadata"]
        items        = parsed["items"]
        gstin_in_pdf = (metadata.get("gstin") or "").strip().upper()
        email_in_pdf = (metadata.get("email") or "").strip().lower()

        wh = Warehouse.objects.first()
        if not wh:
            return Response({"error": "Create warehouse first."}, status=400)

        # ── 2. Parallel validation (GSTIN + Email) ────────────────────────────
        _errors      = []
        vendor_gstin = (vendor.gstin or "").strip().upper()
        vendor_email = (vendor.email or "").strip().lower()

        if not gstin_in_pdf:
            _errors.append(("MISSING_GSTIN",
                f"No GSTIN in PDF. Vendor '{vendor_id}' requires '{vendor.gstin}'."))
        elif gstin_in_pdf != vendor_gstin:
            _errors.append(("GSTIN_MISMATCH",
                f"PDF GSTIN '{gstin_in_pdf}' ≠ vendor GSTIN '{vendor_gstin}'."))

        if not email_in_pdf:
            _errors.append(("MISSING_EMAIL",
                f"No email in PDF. Vendor '{vendor_id}' requires '{vendor.email}'."))
        elif email_in_pdf != vendor_email:
            _errors.append(("EMAIL_MISMATCH",
                f"PDF email '{email_in_pdf}' ≠ vendor email '{vendor_email}'."))

        if _errors:
            reason_code     = _errors[0][0] if len(_errors) == 1 else "BOTH_MISMATCH"
            combined_detail = (
                f"Agreement validation failed for vendor '{vendor_id}' "
                f"({vendor.vendor_name}). " +
                " | ".join(msg for _, msg in _errors)
            )
            return self._log_rejection(
                reason_code,
                gstin=gstin_in_pdf, email=email_in_pdf,
                vendor_id_provided=vendor_id,
                file_name=file_name,
                detail=combined_detail,
            )

        # ── Header-level category from PDF or request body ────────────────────
        header_category_raw = (
            metadata.get("category") or
            request.data.get("category") or ""
        ).strip()
        header_zone_type = (request.data.get("zone_type") or "Dry").strip()
        header_category  = (
            get_or_create_category(header_category_raw, header_zone_type)
            if header_category_raw else None
        )

        # ── 3. Create Agreement + Products (atomic) ───────────────────────────
        with transaction.atomic():
            import dateutil.parser as _dp

            def parse_date(val):
                try:
                    return _dp.parse(val).date() if val else None
                except Exception:
                    return None

            agreement = VendorAgreement.objects.create(
                vendor            = vendor,
                file              = file,
                valid_from        = parse_date(
                    request.data.get("valid_from") or metadata.get("valid_from")
                ),
                valid_until       = parse_date(
                    request.data.get("valid_until") or metadata.get("valid_until")
                ),
                payment_terms     = (
                    request.data.get("payment_terms") or
                    metadata.get("payment_terms") or ""
                ),
                delivery_location = (
                    request.data.get("delivery_location") or
                    metadata.get("delivery_location") or ""
                ),
                notes             = (
                    request.data.get("notes") or
                    metadata.get("notes") or ""
                ),
            )

            mapped_products       = []
            new_products          = []
            needs_zone_assignment = []
            multi_vendor_barcodes = []

            for item in items:
                barcode = item["barcode"]

                # ── Unit / pricing fields ─────────────────────────────────────
                carton_price      = float(item["price"])           # per purchase unit
                conversion_factor = float(item.get("conversion_factor", 1) or 1)
                purchase_unit     = item.get("purchase_unit", "Carton")
                base_unit         = item.get("base_unit", "Piece")
                lead_time         = item.get("lead_time") or 0

                # Validate conversion_factor to prevent division-by-zero later
                if conversion_factor <= 0:
                    logger.warning("Row barcode=%s: invalid conversion_factor=%s, defaulting to 1",
                                   barcode, conversion_factor)
                    conversion_factor = 1.0

                # ── Physical dims (base unit) ─────────────────────────────────
                weight = item.get("weight", 0) or 0
                length = item.get("length", 0) or 0
                width  = item.get("width",  0) or 0
                height = item.get("height", 0) or 0

                # ── Carton dims ───────────────────────────────────────────────
                carton_weight = item.get("carton_weight", 0) or 0
                carton_length = item.get("carton_length", 0) or 0
                carton_width  = item.get("carton_width",  0) or 0
                carton_height = item.get("carton_height", 0) or 0

                # ── Category resolution: row > header > default ───────────────
                row_cat_raw = (item.get("category") or "").strip()
                if row_cat_raw:
                    item_category = get_or_create_category(row_cat_raw, header_zone_type)
                elif header_category:
                    item_category = header_category
                else:
                    item_category = get_or_create_category("general", "Dry")

                existing = Product.objects.filter(barcode=barcode).first()

                if existing:
                    # ── Existing product ──────────────────────────────────────
                    other_vendors = (
                        VendorAgreementProduct.objects
                        .filter(mapped_product=existing)
                        .exclude(vendor=vendor)
                        .values_list("vendor_id", flat=True)
                        .distinct()
                    )
                    is_multi = other_vendors.exists()
                    if is_multi and not existing.is_multi_vendor:
                        existing.is_multi_vendor = True
                        existing.save(update_fields=["is_multi_vendor"])
                    if is_multi:
                        multi_vendor_barcodes.append(barcode)

                    # Update physical dims on existing product if missing
                    upd = {}
                    if weight and not existing.weight_kg: upd["weight_kg"] = weight
                    if length and not existing.length_cm: upd["length_cm"] = length
                    if width  and not existing.width_cm:  upd["width_cm"]  = width
                    if height and not existing.height_cm: upd["height_cm"] = height
                    if upd:
                        for k, v in upd.items():
                            setattr(existing, k, v)
                        existing.save(update_fields=list(upd.keys()))

                    # Update carton_price if higher (never silently reduce)
                    # Vendor pricing changes are reflected in the VAP, not Product.
                    VendorAgreementProduct.objects.get_or_create(
                        vendor=vendor, agreement=agreement, barcode=barcode,
                        defaults={
                            "product_name":      existing.product_name,
                            "sku":               barcode,
                            "category":          item_category,
                            "base_unit":         existing.base_unit,
                            "purchase_unit":     purchase_unit,
                            "conversion_factor": conversion_factor,
                            "vendor_price":      carton_price,
                            "gst_percent":       existing.gst_percent,
                            "lead_time":         lead_time,
                            "weight_kg":         weight  or existing.weight_kg,
                            "length_cm":         length  or existing.length_cm,
                            "width_cm":          width   or existing.width_cm,
                            "height_cm":         height  or existing.height_cm,
                            "carton_weight_kg":  carton_weight,
                            "carton_length_cm":  carton_length,
                            "carton_width_cm":   carton_width,
                            "carton_height_cm":  carton_height,
                            "mapped_product":    existing,
                            "is_mapped":         True,
                            "is_multi_vendor":   is_multi,
                            "is_new_product":    False,
                        },
                    )

                    # Trigger reorder recalculation
                    try:
                        from Inventory.utils import update_product_reorder_level
                        update_product_reorder_level(existing)
                    except Exception as exc:
                        logger.warning("Reorder update failed for %s: %s",
                                       existing.product_id, exc)

                    mapped_products.append(barcode)

                else:
                    # ── New product ───────────────────────────────────────────
                    api_name = fetch_product_name_by_barcode(barcode)
                    product  = Product.objects.create(
                        product_name      = api_name or item.get("name") or f"Product {barcode}",
                        barcode           = barcode,
                        brand_name        = vendor.vendor_name,
                        category          = (item_category.name
                                             if item_category else "general"),
                        base_unit         = base_unit,
                        purchase_unit     = purchase_unit,
                        conversion_factor = conversion_factor,
                        carton_price      = carton_price,
                        gst_percent       = 18.0,
                        weight_kg         = weight,
                        length_cm         = length,
                        width_cm          = width,
                        height_cm         = height,
                        vendor            = vendor,
                        is_first_vendor   = True,
                        is_multi_vendor   = False,
                    )

                    try:
                        from Inventory.utils import update_product_reorder_level
                        update_product_reorder_level(product)
                    except Exception as exc:
                        logger.warning("Reorder update skipped for %s: %s",
                                       product.product_id, exc)

                    VendorAgreementProduct.objects.create(
                        vendor            = vendor,
                        agreement         = agreement,
                        barcode           = barcode,
                        product_name      = product.product_name,
                        sku               = barcode,
                        category          = item_category,
                        base_unit         = base_unit,
                        purchase_unit     = purchase_unit,
                        conversion_factor = conversion_factor,
                        vendor_price      = carton_price,
                        lead_time         = lead_time,
                        weight_kg         = weight,
                        length_cm         = length,
                        width_cm          = width,
                        height_cm         = height,
                        carton_weight_kg  = carton_weight,
                        carton_length_cm  = carton_length,
                        carton_width_cm   = carton_width,
                        carton_height_cm  = carton_height,
                        mapped_product    = product,
                        is_mapped         = True,
                        is_new_product    = True,
                    )

                    new_products.append(barcode)
                    needs_zone_assignment.append({
                        "product_id":      product.product_id,
                        "product_name":    product.product_name,
                        "barcode":         barcode,
                        "category":        item_category.name if item_category else "",
                        "zone_type":       item_category.zone_type if item_category else "",
                        "assign_zone_url": f"/api/products/{product.product_id}/assign-zone/",
                    })

        return Response({
            "message":               "Upload successful",
            "vendor_id":             vendor.vendor_id,
            "agreement_id":          agreement.agreement_id,
            "total_items":           len(items),
            "mapped":                len(mapped_products),
            "new":                   len(new_products),
            "multi_vendor":          len(multi_vendor_barcodes),
            "multi_vendor_barcodes": multi_vendor_barcodes,
            "needs_zone_assignment": needs_zone_assignment,
        }, status=201)


# ─────────────────────────────────────────────
# MULTI-VENDOR: ALL VENDORS FOR A PRODUCT
# ─────────────────────────────────────────────

class ProductVendorsView(APIView):
    """GET /api/vendors/product/<product_id>/vendors/"""

    def get(self, request, product_id):
        product = get_object_or_404(Product, product_id=product_id)

        vaps = (
            VendorAgreementProduct.objects
            .filter(mapped_product=product)
            .select_related("vendor", "agreement", "category")
            .order_by("vendor__vendor_name", "-agreement__uploaded_at")
        )

        # Keep latest VAP per vendor
        vendor_map = {}
        for vap in vaps:
            vid = vap.vendor.vendor_id
            if vid in vendor_map:
                continue
            v = vap.vendor
            vendor_map[vid] = {
                "vendor_id":             v.vendor_id,
                "vendor_name":           v.vendor_name,
                "contact_person":        v.contact_person,
                "email":                 v.email,
                "phone":                 v.phone,
                "gstin":                 v.gstin,
                "address":               v.address,
                "city":                  v.city,
                "state":                 v.state,
                "country":               v.country,
                "is_active":             v.is_active,
                # Per-vendor agreement terms
                "vendor_price":          float(vap.vendor_price),
                "unit_price":            vap.unit_price,
                "gst_percent":           float(vap.gst_percent),
                "moq":                   vap.moq,
                "lead_time":             vap.lead_time or v.lead_time,
                "base_unit":             vap.base_unit,
                "purchase_unit":         vap.purchase_unit,
                "conversion_factor":     float(vap.conversion_factor),
                # Category
                "category":              vap.category.name if vap.category else "",
                "zone_type":             vap.category.zone_type if vap.category else "",
                # Agreement reference
                "agreement_id":          vap.agreement.agreement_id,
                "agreement_valid_from":  str(vap.agreement.valid_from or ""),
                "agreement_valid_until": str(vap.agreement.valid_until or ""),
                "payment_terms":         vap.agreement.payment_terms,
                "delivery_location":     vap.agreement.delivery_location,
                "is_primary":            (v.vendor_id == (product.vendor_id or "")),
            }

        vendors = sorted(
            vendor_map.values(),
            key=lambda x: (0 if x["is_primary"] else 1, x["vendor_name"])
        )

        return Response({
            "product_id":      product_id,
            "product_name":    product.product_name,
            "is_multi_vendor": product.is_multi_vendor,
            "vendor_count":    len(vendors),
            "vendors":         vendors,
        })


# ─────────────────────────────────────────────
# LEGACY VENDOR PRODUCT VIEWS
# ─────────────────────────────────────────────

class MapVendorProductView(APIView):
    def post(self, request, vendor_product_id):
        product_id = request.data.get("product_id")
        vp         = get_object_or_404(VendorProduct, id=vendor_product_id)
        product    = get_object_or_404(Product, product_id=product_id)
        vp.mapped_product = product
        vp.is_mapped      = True
        vp.match_score    = 100
        vp.save()
        return Response({"message": "Mapped successfully."})


class ListVendorProductsView(APIView):
    def get(self, request):
        qs = VendorProduct.objects.all().order_by("-created_at")
        if vid := request.GET.get("vendor_id"):
            qs = qs.filter(vendor__vendor_id=vid)
        s = VendorProductSerializer(qs, many=True)
        return Response({"count": len(s.data), "results": s.data})


class UnmappedVendorProductsView(APIView):
    def get(self, request):
        qs = VendorProduct.objects.filter(is_mapped=False).order_by("-created_at")
        if vid := request.GET.get("vendor_id"):
            qs = qs.filter(vendor__vendor_id=vid)
        s = VendorProductSerializer(qs, many=True)
        return Response({"count": len(s.data), "results": s.data})