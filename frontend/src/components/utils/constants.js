export const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000/api";

// export const ROLES = {
//   ADMIN: 'admin',
//   INVENTORY_MANAGER: 'inventory_manager',
//   QUALITY_ASSISTANT: 'quality_assistant',
//   MANAGER: 'manager',
//   SUPERVISOR: 'supervisor',
//   FOUNDER_ADMIN: 'FOUNDER_ADMIN'
// };

export const STORAGE_KEYS = {
  USER_DATA: 'userData',
  ACCESS_TOKEN: 'accessToken',
  REFRESH_TOKEN: 'refreshToken',
  LOGIN_MESSAGE_SHOWN: 'loginMessageShown'
};

export const OTP_LENGTH = 6;
export const OTP_EXPIRY_TIME = 60; // seconds

export const ALERT_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
  WARNING: 'warning'
};

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SERVER_ERROR: 500
};

export const ROLES = {
  // All available roles in the system
  INVENTORY_MANAGER: 'inventory_manager',
  QUALITY_ASSISTANT: 'quality_assistant',
  MANAGER: 'manager',
  SUPERVISOR: 'supervisor',
  ADMIN: 'admin',
  FOUNDER_ADMIN: 'FOUNDER_ADMIN'
};

export const ROLE_LABELS = {
  [ROLES.INVENTORY_MANAGER]: 'Inventory Manager',
  [ROLES.QUALITY_ASSISTANT]: 'Quality Assistant',
  [ROLES.MANAGER]: 'Manager',
  [ROLES.SUPERVISOR]: 'Supervisor',
  [ROLES.ADMIN]: 'Admin',
  [ROLES.FOUNDER_ADMIN]: 'Founder Admin'
};

export const ROLE_PERMISSIONS = {
  [ROLES.INVENTORY_MANAGER]: {
    canManageInventory: true,
    canViewReports: true,
    canManageVendors: false,
    canManageUsers: false
  },
  [ROLES.QUALITY_ASSISTANT]: {
    canManageInventory: false,
    canViewReports: true,
    canManageVendors: false,
    canManageUsers: false
  },
  [ROLES.MANAGER]: {
    canManageInventory: true,
    canViewReports: true,
    canManageVendors: true,
    canManageUsers: false
  },
  [ROLES.SUPERVISOR]: {
    canManageInventory: true,
    canViewReports: true,
    canManageVendors: false,
    canManageUsers: false
  },
  [ROLES.ADMIN]: {
    canManageInventory: true,
    canViewReports: true,
    canManageVendors: true,
    canManageUsers: true
  }
};

export const ROLE_OPTIONS = [
  { value: ROLES.INVENTORY_MANAGER, label: ROLE_LABELS[ROLES.INVENTORY_MANAGER] },
  { value: ROLES.QUALITY_ASSISTANT, label: ROLE_LABELS[ROLES.QUALITY_ASSISTANT] },
  { value: ROLES.MANAGER, label: ROLE_LABELS[ROLES.MANAGER] },
  { value: ROLES.SUPERVISOR, label: ROLE_LABELS[ROLES.SUPERVISOR] },
  { value: ROLES.ADMIN, label: ROLE_LABELS[ROLES.ADMIN] }
];

// For dropdown selection in forms
export const ROLE_SELECT_OPTIONS = [
  { value: '', label: 'Select Role', disabled: true },
  ...ROLE_OPTIONS
];