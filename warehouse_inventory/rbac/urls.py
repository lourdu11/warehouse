from django.urls import path
from django.views.decorators.csrf import ensure_csrf_cookie
from .views import (
    # Auth
    LoginView,
    VerifyLoginOTPView,
    LogoutView,
    ForceChangePasswordView,
    # Password
    ForgotPasswordOTPView,
    ResetPasswordView,
    # User management
    AdminCreateUserView,
    ListEmployeeView,
    UpdateEmployeeView,
    DeleteUserView,
    # CSRF
    get_csrf_token,
    # JWT
    CustomTokenObtainPairView,
    # Notifications
    SendNotificationView,
    ListNotificationsView,
    UnreadCountView,
    MarkReadView,
    MarkAllReadView,
    SentNotificationsView,
    AllowedRecipientsView,
)

urlpatterns = [
    # ── CSRF ─────────────────────────────────────────────────────────────────
    path("csrf/", get_csrf_token, name="csrf"),

    # ── Auth ──────────────────────────────────────────────────────────────────
    path("login/", LoginView.as_view(), name="login"),
    path("verify-login-otp/", VerifyLoginOTPView.as_view(), name="verify-login-otp"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("force-change-password/", ForceChangePasswordView.as_view(), name="force-change-password"),

    # ── Password recovery ─────────────────────────────────────────────────────
    path("forgot-password-otp/", ForgotPasswordOTPView.as_view(), name="forgot-password-otp"),
    path("reset-password/", ResetPasswordView.as_view(), name="reset-password"),

    # ── JWT ───────────────────────────────────────────────────────────────────
    path("token/", CustomTokenObtainPairView.as_view(), name="token-obtain-pair"),

    # ── User management (admin only) ──────────────────────────────────────────
    path("admin-create-user/", AdminCreateUserView.as_view(), name="admin-create-user"),
    path("list-employees/", ListEmployeeView.as_view(), name="list-employees"),
    path("update-user/<str:employee_id>/", UpdateEmployeeView.as_view(), name="update-user"),
    path("delete-user/<str:employee_id>/", DeleteUserView.as_view(), name="delete-user"),

    # ── Notifications ──────────────────────────────────────────────────────────
    path("notifications/send/",          SendNotificationView.as_view(),    name="notif-send"),
    path("notifications/",               ListNotificationsView.as_view(),   name="notif-list"),
    path("notifications/unread-count/",  UnreadCountView.as_view(),         name="notif-unread-count"),
    path("notifications/mark-read/<int:notification_id>/", MarkReadView.as_view(), name="notif-mark-read"),
    path("notifications/mark-all-read/", MarkAllReadView.as_view(),         name="notif-mark-all-read"),
    path("notifications/sent/",          SentNotificationsView.as_view(),   name="notif-sent"),
    path("notifications/allowed-recipients/", AllowedRecipientsView.as_view(), name="notif-allowed-recipients"),
]