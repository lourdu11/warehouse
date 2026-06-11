from .models import Notification, UserRole

def notify_role(sender, recipient_role_name, notification_type, title, message, redirect_url=None):
    """
    Unified helper to create a role-based notification.
    Handles sender_role resolution automatically.
    """
    try:
        sender_role_name = "system"
        if sender:
            try:
                ur = UserRole.objects.select_related("role").get(user=sender)
                sender_role_name = ur.role.name
            except UserRole.DoesNotExist:
                sender_role_name = "unknown"

        notification = Notification.objects.create(
            sender=sender,
            sender_role=sender_role_name,
            recipient_role=recipient_role_name,
            notification_type=notification_type,
            title=title,
            message=message,
            redirect_url=redirect_url
        )
        return notification
    except Exception as e:
        print(f"[rbac.utils.notify_role] Failed: {e}")
        return None


def get_user_role_name(user):
    """Returns the role name string or 'unknown'."""
    try:
        user_role = UserRole.objects.select_related("role").get(user=user)
        return user_role.role.name
    except (UserRole.DoesNotExist, AttributeError):
        return "unknown"
    except Exception:
        return "unknown"
