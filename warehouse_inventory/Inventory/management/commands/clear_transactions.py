"""
Management command: clear_transactions

Deletes all transactional data from the database while preserving
master/reference data (users, vendors, customers, products, zones, etc.).

Usage:
    python manage.py clear_transactions
    python manage.py clear_transactions --no-input   (skip confirmation prompt)
"""

from django.core.management.base import BaseCommand
from django.db import connection


class Command(BaseCommand):
    help = (
        "Clear all transactional data (PRs, POs, ASNs, GRNs, stock movements, "
        "inventory, sales orders, payments) while keeping master data intact."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--no-input",
            action="store_true",
            dest="no_input",
            help="Skip the confirmation prompt.",
        )

    def handle(self, *args, **options):
        # ── Late imports so models are fully loaded ──────────────────────────
        from Inventory.models import (
            PutawayPlan, GRNItem, GRN,
            ASNItem, ASN,
            PurchaseOrder, PurchaseRequest,
            StockMovement, Inventory, Batch,
        )
        from sales.models import SOPayment, SalesOrder, CustomerPurchaseRequest

        # ── Count records before deletion ────────────────────────────────────
        counts = {
            "SOPayment":               SOPayment.objects.count(),
            "SalesOrder":              SalesOrder.objects.count(),
            "CustomerPurchaseRequest": CustomerPurchaseRequest.objects.count(),
            "PutawayPlan":             PutawayPlan.objects.count(),
            "GRNItem":                 GRNItem.objects.count(),
            "GRN":                     GRN.objects.count(),
            "ASNItem":                 ASNItem.objects.count(),
            "ASN":                     ASN.objects.count(),
            "PurchaseOrder":           PurchaseOrder.objects.count(),
            "PurchaseRequest":         PurchaseRequest.objects.count(),
            "StockMovement":           StockMovement.objects.count(),
            "Inventory":               Inventory.objects.count(),
            "Batch":                   Batch.objects.count(),
        }

        total = sum(counts.values())

        # ── Summary ──────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(self.style.WARNING("  TRANSACTION CLEAR SUMMARY"))
        self.stdout.write("=" * 60)
        for model, count in counts.items():
            self.stdout.write(f"  {model:<30} {count:>6} records")
        self.stdout.write("-" * 60)
        self.stdout.write(f"  {'TOTAL':<30} {total:>6} records")
        self.stdout.write("=" * 60)

        if total == 0:
            self.stdout.write(self.style.SUCCESS("\nDatabase is already clean. Nothing to delete."))
            return

        # ── Confirmation ─────────────────────────────────────────────────────
        if not options["no_input"]:
            self.stdout.write(
                self.style.ERROR(
                    "\n⚠️  This will PERMANENTLY delete all the records listed above."
                )
            )
            self.stdout.write(
                "  Master data (users, products, vendors, customers, zones) "
                "will NOT be affected.\n"
            )
            confirm = input("Type YES to proceed, or anything else to cancel: ")
            if confirm.strip() != "YES":
                self.stdout.write(self.style.WARNING("Aborted. No data was deleted."))
                return

        # ── Deletion (FK-safe order) ──────────────────────────────────────────
        self.stdout.write("\nDeleting transactions...")

        SOPayment.objects.all().delete()
        self.stdout.write(f"  [OK] SOPayment cleared")

        SalesOrder.objects.all().delete()
        self.stdout.write(f"  [OK] SalesOrder cleared")

        CustomerPurchaseRequest.objects.all().delete()
        self.stdout.write(f"  [OK] CustomerPurchaseRequest cleared")

        PutawayPlan.objects.all().delete()
        self.stdout.write(f"  [OK] PutawayPlan cleared")

        GRNItem.objects.all().delete()
        self.stdout.write(f"  [OK] GRNItem cleared")

        GRN.objects.all().delete()
        self.stdout.write(f"  [OK] GRN cleared")

        ASNItem.objects.all().delete()
        self.stdout.write(f"  [OK] ASNItem cleared")

        ASN.objects.all().delete()
        self.stdout.write(f"  [OK] ASN cleared")

        PurchaseOrder.objects.all().delete()
        self.stdout.write(f"  [OK] PurchaseOrder cleared")

        PurchaseRequest.objects.all().delete()
        self.stdout.write(f"  [OK] PurchaseRequest cleared")

        StockMovement.objects.all().delete()
        self.stdout.write(f"  [OK] StockMovement cleared")

        Inventory.objects.all().delete()
        self.stdout.write(f"  [OK] Inventory cleared")

        Batch.objects.all().delete()
        self.stdout.write(f"  [OK] Batch cleared")

        # ── Reset SQLite auto-increment sequences ─────────────────────────────
        tables = [
            "sales_sopayment",
            "sales_salesorder",
            "sales_customerpurchaserequest",
            "Inventory_putawayplan",
            "Inventory_grnitem",
            "Inventory_grn",
            "Inventory_asnitem",
            "Inventory_asn",
            "Inventory_purchaseorder",
            "Inventory_purchaserequest",
            "Inventory_stockmovement",
            "Inventory_inventory",
            "Inventory_batch",
        ]

        with connection.cursor() as cursor:
            for table in tables:
                try:
                    cursor.execute(
                        "DELETE FROM sqlite_sequence WHERE name = %s", [table]
                    )
                except Exception:
                    pass  # sqlite_sequence row may not exist if table was never populated

        # ── Done ─────────────────────────────────────────────────────────────
        self.stdout.write("\n" + "=" * 60)
        self.stdout.write(
            self.style.SUCCESS(
                f"  SUCCESS: Cleared {total} transaction records."
            )
        )
        self.stdout.write(
            "  Master data (users, products, vendors, customers, zones, "
            "bins, racks) is untouched."
        )
        self.stdout.write("=" * 60 + "\n")
