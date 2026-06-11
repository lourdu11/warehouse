import React, { createContext, useContext, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  login,
  verifyOTP,
  forceChangePassword,
  logout as apiLogout,
} from "../../services/apiService";

const AuthContext = createContext(undefined);

const normalizeRole = (role) =>
  role === "FOUNDER_ADMIN" ? "admin" : role;

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // ─── Restore session from JWT in sessionStorage ───────────────────────────
  useEffect(() => {
    const storedUser  = sessionStorage.getItem("user");
    const accessToken = sessionStorage.getItem("accessToken");

    if (storedUser && accessToken) {
      setUserState(JSON.parse(storedUser));
    }

    setIsLoading(false);
  }, []);

  // ─── Step 1: Login with credentials ──────────────────────────────────────
  // Backend: POST /auth/login/
  // • Founder Admin (admin role)  → returns access+refresh tokens immediately
  // • Regular employees           → sends OTP email, returns "OTP sent"
  const handleLogin = async (employeeId, email, password, adminId) => {
    try {
      const response = await login(employeeId, email, password, adminId);

      // Founder Admin bypasses OTP — JWT returned right away
      if (response.access) {
        const userData = {
          id:          response.employee_id || response.admin_id,
          name:        response.name
                         || response.username
                         || (employeeId ? `Employee ${employeeId}` : `Admin ${adminId}`),
          email:       email || response.email,
          role:        normalizeRole(response.role) || "admin",
          isFirstLogin: false,
          username:    response.username || "",
        };

        sessionStorage.setItem("accessToken",  response.access);
        sessionStorage.setItem("refreshToken", response.refresh);
        sessionStorage.setItem("user", JSON.stringify(userData));

        setUserState(userData);
        navigate("/dashboard");
        return { success: true, skipOTP: true };
      }

      // Non-admin — save temp data, caller shows OTP form
      sessionStorage.setItem("tempLoginData", JSON.stringify({
        employeeId,
        email:  response.email || email,
        adminId,
        role:   response.role,
      }));

      return { success: true, data: response };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // ─── Step 2: Verify OTP → receive JWT ────────────────────────────────────
  // Backend: POST /auth/verify-login-otp/
  // Returns: { access, refresh, role, employee_id/admin_id,
  //            force_change_password, email, message }
  const handleVerifyOTP = async (otp) => {
    try {
      const response = await verifyOTP(otp);

      const resolveName = (res) => {
        if (res.full_name)   return res.full_name;
        if (res.name)        return res.name;
        if (res.first_name || res.last_name)
          return `${res.first_name || ""} ${res.last_name || ""}`.trim();
        if (res.username)    return res.username;
        if (res.employee_id) return `Employee ${res.employee_id}`;
        if (res.admin_id)    return `Admin ${res.admin_id}`;
        return "User";
      };

      const userData = {
        id:          response.employee_id || response.admin_id,
        name:        resolveName(response),
        email:       response.email,
        role:        normalizeRole(response.role),
        isFirstLogin: response.force_change_password || false,
        username:    response.username || "",
      };

      // Persist JWT tokens — used by apiRequest via Authorization header
      sessionStorage.setItem("accessToken",  response.access);
      sessionStorage.setItem("refreshToken", response.refresh);
      sessionStorage.setItem("user", JSON.stringify(userData));
      sessionStorage.removeItem("tempLoginData");

      setUserState(userData);

      if (response.force_change_password) {
        navigate("/auth/force-change-password");
      } else {
        navigate("/dashboard");
      }

      return {
        success:            true,
        user:               userData,
        forceChangePassword: response.force_change_password,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // ─── Force password change after first login ──────────────────────────────
  const handleForceChangePassword = async (newPassword, confirmPassword) => {
    try {
      await forceChangePassword(newPassword, confirmPassword);

      const updatedUser = { ...user, isFirstLogin: false };
      setUserState(updatedUser);
      sessionStorage.setItem("user", JSON.stringify(updatedUser));

      navigate("/dashboard");
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // ─── Logout: blacklist refresh token, clear state ────────────────────────
  const handleLogout = async () => {
    try {
      const refreshToken = sessionStorage.getItem("refreshToken");
      if (refreshToken) {
        await apiLogout({ refresh_token: refreshToken });
      }
    } catch (error) {
      console.error("Logout API error:", error);
    } finally {
      setUserState(null);
      sessionStorage.removeItem("user");
      sessionStorage.removeItem("accessToken");
      sessionStorage.removeItem("refreshToken");
      sessionStorage.removeItem("tempLoginData");
      navigate("/auth/login");
    }
  };

  const setUser = (userData) => {
    setUserState(userData);
    sessionStorage.setItem("user", JSON.stringify(userData));
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login:               handleLogin,
        verifyOTP:           handleVerifyOTP,
        forceChangePassword: handleForceChangePassword,
        logout:              handleLogout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
