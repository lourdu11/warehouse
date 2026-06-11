"""
management/commands/create_admin.py

Usage:
    python manage.py create_admin

- Prompts for: username, first name, last name, email
- Auto-generates a secure random password
- Emails credentials to the admin
- Sets is_first_login = True (admin must change password on first login)
- Prints Employee ID + password to terminal for your records
- Exits safely if an admin already exists
"""

import secrets
import string
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from django.db import transaction

User = get_user_model()


def generate_secure_password(length=12):
    """
    Generates a strong random password with uppercase, lowercase,
    digits, and special characters guaranteed.
    """
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    while True:
        password = "".join(secrets.choice(alphabet) for _ in range(length))
        has_upper   = any(c.isupper()      for c in password)
        has_lower   = any(c.islower()      for c in password)
        has_digit   = any(c.isdigit()      for c in password)
        has_special = any(c in "!@#$%^&*" for c in password)
        if has_upper and has_lower and has_digit and has_special:
            return password


class Command(BaseCommand):
    help = "Create the first admin user. Auto-generates and emails credentials."

    def handle(self, *args, **options):
        # Replace 'accounts' with your actual Django app name
        from rbac.models import Role, UserRole

        # ── Guard: exit if admin already exists ───────────────────────────────
        admin_role = Role.objects.filter(name="admin").first()
        if admin_role and UserRole.objects.filter(role=admin_role).exists():
            self.stdout.write(
                self.style.WARNING(
                    "\n  An admin already exists.\n"
                    "  Use the admin dashboard to create additional admins.\n"
                )
            )
            return

        self.stdout.write(self.style.MIGRATE_HEADING("\n=== WMS Admin Setup ===\n"))

        # ── Collect input ─────────────────────────────────────────────────────
        username = input("Enter admin username   : ").strip()
        if not username:
            self.stdout.write(self.style.ERROR("Username cannot be empty."))
            return

        first_name = input("Enter first name       : ").strip()
        last_name  = input("Enter last name        : ").strip()

        email = input("Enter admin email      : ").strip().lower()
        if not email:
            self.stdout.write(self.style.ERROR("Email cannot be empty."))
            return

        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.ERROR(f"  A user with email '{email}' already exists."))
            return

        if User.objects.filter(username=username).exists():
            self.stdout.write(self.style.ERROR(f"  A user with username '{username}' already exists."))
            return

        # ── Auto-generate secure password ─────────────────────────────────────
        password = generate_secure_password()

        # ── Create admin atomically ───────────────────────────────────────────
        try:
            with transaction.atomic():
                # ADM-prefixed employee ID
                existing_adm = (
                    UserRole.objects
                    .filter(employee_id__startswith="ADM")
                    .order_by("-employee_id")
                    .first()
                )
                if existing_adm:
                    last_num = int(existing_adm.employee_id[3:])
                    new_id = f"ADM{last_num + 1:04d}"
                else:
                    new_id = "ADM0001"

                user = User.objects.create_user(
                    username=username,
                    first_name=first_name,
                    last_name=last_name,
                    email=email,
                    password=password,
                )

                role, _ = Role.objects.get_or_create(name="admin")

                # is_first_login=True → admin must change password on first login
                UserRole.objects.create(
                    employee_id=new_id,
                    user=user,
                    role=role,
                    is_first_login=True,
                )

        except Exception as exc:
            self.stdout.write(self.style.ERROR(f"\n  Failed to create admin: {exc}\n"))
            return

        # ── Send welcome email ────────────────────────────────────────────────
        email_sent = self._send_welcome_email(
            to_email=email,
            first_name=first_name or username,
            employee_id=new_id,
            password=password,
        )

        # ── Terminal output ───────────────────────────────────────────────────
        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("  ✓ Admin created successfully!\n"))
        self.stdout.write(f"    Employee ID : {new_id}")
        self.stdout.write(f"    Username    : {username}")
        self.stdout.write(f"    Email       : {email}")
        self.stdout.write(f"    Password    : {password}   ← store this safely")
        self.stdout.write("")

        if email_sent:
            self.stdout.write(self.style.SUCCESS(f"  ✓ Credentials emailed to {email}"))
        else:
            self.stdout.write(
                self.style.WARNING(
                    f"  ⚠ Email could not be sent to {email}.\n"
                    f"    Share credentials manually using the values printed above."
                )
            )

        self.stdout.write(
            self.style.WARNING("\n  Admin will be forced to change password on first login.\n")
        )

    # ─────────────────────────────────────────────────────────────────────────

    def _send_welcome_email(self, to_email, first_name, employee_id, password):
        """Send welcome email with credentials. Returns True on success."""
        login_url = getattr(settings, "FRONTEND_URL", "https://yourapp.com") + "/login"

        subject = "Your WMS Admin Account Credentials"
        message = (
            f"Hello {first_name},\n\n"
            f"Your admin account has been created for the Warehouse Management System.\n\n"
            f"------------------------------------------\n"
            f"  Employee ID : {employee_id}\n"
            f"  Password    : {password}\n"
            f"  Login URL   : {login_url}\n"
            f"------------------------------------------\n\n"
            f"Important:\n"
            f"  - You will be asked to change your password on first login.\n"
            f"  - Do not share these credentials with anyone.\n"
            f"  - Delete this email after logging in.\n\n"
            f"If you did not request this account, contact your system administrator immediately.\n\n"
            f"- WMS Team"
        )

        try:
            send_mail(
                subject=subject,
                message=message,
                from_email=settings.EMAIL_HOST_USER,
                recipient_list=[to_email],
                fail_silently=False,
            )
            return True
        except Exception:
            return False