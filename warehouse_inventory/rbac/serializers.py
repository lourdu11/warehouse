from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Role, UserRole, OTP
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()


class RoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Role
        fields = ["id", "name"]


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    role = serializers.CharField()
    otp = serializers.CharField()


class LoginSerializer(serializers.Serializer):
    employee_id = serializers.CharField()
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, data):
        if not data.get("employee_id") or not data.get("email"):
            raise serializers.ValidationError(
                "employee_id and email are required."
            )
        return data



class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()
    otp = serializers.CharField()
    new_password = serializers.CharField(write_only=True)


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)

        if hasattr(user, "user_role"):
            token["role"] = user.user_role.role.name
            token["employee_id"] = user.user_role.employee_id
            token["is_first_login"] = user.user_role.is_first_login

        token["email"] = user.email
        token["username"] = user.username

        return token