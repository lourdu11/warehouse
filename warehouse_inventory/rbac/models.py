from django.db import models
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils.timezone import now as tz_now


class Role(models.Model):
    ROLE_CHOICES = (
        ("admin", "Admin"),
        ("inventory_manager", "Inventory Manager"),
        ("quality_assistant", "Quality Assistant"),
        ("finance_director", "Finance Director"),
        ("manager", "Manager"),
        ("supervisor", "Supervisor"),
        ("sales_manager", "Sales Manager"),
    )

    name = models.CharField(max_length=50, choices=ROLE_CHOICES, unique=True)

    def __str__(self):
        return self.get_name_display()


class Permission(models.Model):
    ACTION_CHOICES = (
        ("create", "Create"),
        ("read", "Read"),
        ("update", "Update"),
        ("delete", "Delete"),
    )

    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    model_name = models.CharField(max_length=100)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)

    def __str__(self):
        return f"{self.role.name} - {self.model_name} - {self.action}"


class UserRole(models.Model):
    employee_id = models.CharField(max_length=100, unique=True, primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_role"
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    is_first_login = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} - {self.role.name}"


User = get_user_model()


class OTP(models.Model):
    PURPOSE_CHOICES = (
        ("REGISTER", "Register"),
        ("RESET_PASSWORD", "Reset Password"),
        ("LOGIN", "Login"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    email = models.EmailField()
    otp_code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    expiry_time = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() > self.expiry_time

    def __str__(self):
        return f"{self.email} - {self.purpose}"


class LoginLogs(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    login_time = models.DateTimeField(auto_now_add=True)
    logout_time = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField()
    device_info = models.CharField(max_length=255)
    login_status = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user} - {self.login_time}"


# ─────────────────────────────────────────────────────────────────────────────
# NOTIFICATION SYSTEM
# ─────────────────────────────────────────────────────────────────────────────

User = get_user_model()


class Notification(models.Model):
    """A notification sent from one role to another."""

    TYPE_CHOICES = (
        ("task",      "Task Assigned"),
        ("approval",  "Approval Request"),
        ("inventory", "Inventory Alert"),
        ("quality",   "Quality Alert"),
        ("rejection", "Rejection Alert"),
        ("payment",   "Payment Alert"),
        ("update",    "General Update"),
    )

    # Who sent it
    sender      = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_notifications",
        null=True, blank=True
    )
    sender_role = models.CharField(max_length=50, null=True, blank=True)

    # Role-broadcast: all users with this role receive the notification
    recipient_role = models.CharField(max_length=50)

    # Optional: direct to one specific user (overrides role-broadcast)
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="direct_notifications",
    )

    notification_type = models.CharField(
        max_length=20, choices=TYPE_CHOICES, default="update"
    )
    title        = models.CharField(max_length=200)
    message      = models.TextField()
    redirect_url = models.CharField(max_length=200, blank=True, default="")
    created_at   = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.notification_type}] {self.title} → {self.recipient_role}"


class NotificationRead(models.Model):
    """Tracks which user has read which notification."""

    notification = models.ForeignKey(
        Notification, on_delete=models.CASCADE, related_name="reads"
    )
    user    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    read_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("notification", "user")

    def __str__(self):
        return f"{self.user} read {self.notification_id}"