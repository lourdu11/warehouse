"""
vendors/management/commands/migrate_products_to_agreement.py

Phase 8 — Data Migration Command

Migrates all existing legacy Product records into VendorAgreementProducts.

Usage:
    python manage.py migrate_products_to_agreement
    python manage.py migrate_products_to_agreement --vendor-id VEN0001
    python manage.py migrate_products_to_agreement --dry-run

What it does:
  1. Finds all non-deprecated Product records
  2. Creates a "Legacy Migration" VendorAgreement (once per vendor)
  3. Creates a VendorAgreementProduct for each Product
  4. Marks old Product records as is_deprecated=True
  5. Old records are NEVER deleted (Phase 8 rule)
"""

import logging
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Migrate legacy Product records into VendorAgreementProduct (Phase 8)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--vendor-id",
            type=str,
            default=None,
            help="Assign migrated products to this vendor ID (uses first active vendor if omitted)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Simulate migration without writing anything to the database",
        )
        parser.add_argument(
            "--include-deprecated",
            action="store_true",
            default=False,
            help="Also attempt to re-migrate already-deprecated products",
        )

    def handle(self, *args, **options):
        from products.models import Product
        from vendors.models import Vendor, VendorAgreement, VendorAgreementProduct

        dry_run = options["dry_run"]
        vendor_id = options["vendor_id"]
        include_deprecated = options["include_deprecated"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no changes will be written.\n"))

        # ── 1. Resolve vendor ─────────────────────────────────────────────────
        if vendor_id:
            try:
                vendor = Vendor.objects.get(vendor_id=vendor_id)
            except Vendor.DoesNotExist:
                raise CommandError(f"Vendor '{vendor_id}' not found.")
        else:
            vendor = Vendor.objects.filter(is_active=True).order_by("created_at").first()
            if not vendor:
                raise CommandError(
                    "No active vendor found. Create a vendor first:\n"
                    "  POST /api/vendors/vendor/create/"
                )

        self.stdout.write(f"Using vendor: {vendor.vendor_name} ({vendor.vendor_id})")

        # ── 2. Get or create a "Legacy Migration" agreement ───────────────────
        if not dry_run:
            agreement, created = VendorAgreement.objects.get_or_create(
                vendor=vendor,
                payment_terms="Legacy Migration",
                defaults={
                    "delivery_location": "Default Warehouse",
                    "notes": "Auto-generated agreement for migrating legacy Product records.",
                },
            )
            if created:
                self.stdout.write(f"Created migration agreement: {agreement.agreement_id}")
            else:
                self.stdout.write(f"Using existing migration agreement: {agreement.agreement_id}")
        else:
            # In dry-run, create a fake agreement object for logging
            class FakeAgreement:
                agreement_id = "AGR-DRY"
            agreement = FakeAgreement()

        # ── 3. Collect products to migrate ────────────────────────────────────
        qs = Product.objects.all()
        if not include_deprecated:
            qs = qs.filter(is_deprecated=False)

        products = list(qs)
        total = len(products)
        self.stdout.write(f"Found {total} product(s) to migrate.\n")

        if total == 0:
            self.stdout.write(self.style.SUCCESS("Nothing to migrate."))
            return

        # ── 4. Migrate each product ───────────────────────────────────────────
        migrated = 0
        skipped = 0
        errors = 0

        for p in products:
            barcode = f"LEGACY-{p.product_id}"

            # Skip if already migrated
            if VendorAgreementProduct.objects.filter(
                migrated_from_product_id=p.product_id
            ).exists():
                self.stdout.write(f"  SKIP  {p.product_id} — already migrated")
                skipped += 1
                continue

            # Ensure barcode uniqueness (deduplicate with suffix)
            final_barcode = barcode
            suffix = 1
            while VendorAgreementProduct.objects.filter(barcode=final_barcode).exists():
                final_barcode = f"{barcode}-{suffix}"
                suffix += 1

            self.stdout.write(
                f"  {'[DRY]' if dry_run else 'MIGR'} "
                f"{p.product_id} | {p.product_name[:40]:<40} | barcode={final_barcode}"
            )

            if dry_run:
                migrated += 1
                continue

            try:
                with transaction.atomic():
                    VendorAgreementProduct.objects.create(
                        vendor=vendor,
                        agreement=agreement,
                        product_name=p.product_name,
                        variant=p.size or "",
                        barcode=final_barcode,
                        sku=p.sku_code or "",
                        base_unit="Piece",
                        purchase_unit="Box",
                        conversion_factor=1,
                        vendor_price=max(p.unit_price, 1),  # guard against 0
                        gst_percent=18,
                        moq=max(p.re_order or 1, 1),
                        lead_time=None,
                        migrated_from_product_id=p.product_id,
                    )
                    # Phase 8: mark old record as deprecated (NOT deleted)
                    p.is_deprecated = True
                    p.save(update_fields=["is_deprecated"])
                    migrated += 1

            except Exception as e:
                self.stderr.write(f"  ERROR {p.product_id}: {e}")
                logger.error(f"Migration failed for {p.product_id}: {e}", exc_info=True)
                errors += 1

        # ── 5. Summary ────────────────────────────────────────────────────────
        self.stdout.write("\n" + "─" * 60)
        self.stdout.write(
            self.style.SUCCESS(
                f"Migration {'simulation' if dry_run else 'complete'}:\n"
                f"  Migrated : {migrated}\n"
                f"  Skipped  : {skipped}\n"
                f"  Errors   : {errors}\n"
                f"  Agreement: {agreement.agreement_id}"
            )
        )

        if not dry_run and migrated > 0:
            self.stdout.write(
                "\nProducts are now available via:\n"
                "  GET /api/vendors/agreement-products/\n"
                "  GET /api/products/listall/  (adapter-backed)\n"
            )
