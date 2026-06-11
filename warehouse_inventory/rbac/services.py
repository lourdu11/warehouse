import random
from .models import UserRole, Permission
from django.core.mail import send_mail
from django.utils import timezone
from datetime import timedelta
from .models import OTP
import string

def generate_random_password(length=12):
    """
    Generates a secure random password containing at least:
    - 1 lowercase letter
    - 1 uppercase letter
    - 1 digit
    - 1 special character (@#$%^&*)
    """
    if length < 4:
        length = 12
        
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    special = "@#$%^&*"
    
    # Guarantee at least one of each
    password = [
        random.choice(lowercase),
        random.choice(uppercase),
        random.choice(digits),
        random.choice(special)
    ]
    
    # Fill the rest randomly
    all_chars = lowercase + uppercase + digits + special
    password += [random.choice(all_chars) for _ in range(length - 4)]
    
    # Shuffle the list so the guaranteed chars aren't always at the start
    random.shuffle(password)
    
    return "".join(password)



def has_permission(user, model_name, action):

    if not user.is_authenticated:
        return False

    # Superuser bypass (very important)
    if user.is_superuser:
        return True

    try:
        user_role = UserRole.objects.select_related("role").get(user=user)
    except UserRole.DoesNotExist:
        return False

    return Permission.objects.filter(
        role=user_role.role,
        model_name=model_name,
        action=action
    ).exists()


def generate_otp():
    return str(random.randint(100000, 999999))


def send_otp_email(email, purpose):

    otp_code = generate_otp()
    expiry = timezone.now() + timedelta(minutes=5)
    print(otp_code)

    OTP.objects.create(
        email=email,
        otp_code=otp_code,
        purpose=purpose,
        expiry_time=expiry,
        is_used=False
    )

    try:
        send_mail(
            subject="Your OTP Code",
            message=f"Your OTP is {otp_code}. It expires in 5 minutes.",
            from_email=None,
            recipient_list=[email],
        )
    except Exception as e:
        print(f"Failed to send email: {e}")
