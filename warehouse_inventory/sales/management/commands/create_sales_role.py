"""
Management command: python manage.py create_sales_role
Creates the 'sales_manager' role in the database if it doesn't exist.
"""
from django.core.management.base import BaseCommand
from rbac.models import Role


class Command(BaseCommand):
    help = "Create the sales_manager role in the RBAC system."

    def handle(self, *args, **options):
        role, created = Role.objects.get_or_create(name="sales_manager")
        if created:
            self.stdout.write(self.style.SUCCESS("[OK] 'sales_manager' role created successfully."))
        else:
            self.stdout.write(self.style.WARNING("[INFO] 'sales_manager' role already exists."))

