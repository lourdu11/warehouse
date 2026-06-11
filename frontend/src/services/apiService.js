import { API_BASE_URL } from '../components/utils/constants';
import { getCookie } from '../components/utils/helpers';

/* ================= CSRF ================= */

export const ensureCSRF = async () => {
  try {
    await fetch(`${API_BASE_URL}/auth/csrf/`, {
      method: 'GET',
      credentials: 'include',
    });
  } catch (error) {
    console.error('CSRF fetch failed:', error);
  }
};

/* ================= BASE API ================= */

export const apiRequest = async (endpoint, method = 'GET', data = null) => {
  // For GET requests, no CSRF needed
  if (method !== 'GET') {
    await ensureCSRF();
  }

  const csrftoken = getCookie('csrftoken');
  const accessToken = sessionStorage.getItem('accessToken');

  const headers = {
    'Content-Type': 'application/json',
  };

  if (csrftoken && method !== 'GET') {
    headers['X-CSRFToken'] = csrftoken;
  }

  // Attach JWT token for authentication
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const options = {
    method,
    credentials: 'include',
    headers,
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    // Handle 401 Unauthorized - Token expired
    if (response.status === 401) {
      // Try to refresh token
      const refreshToken = sessionStorage.getItem('refreshToken');
      if (refreshToken) {
        try {
          const refreshResponse = await fetch(`${API_BASE_URL}/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: refreshToken }),
          });
          
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            sessionStorage.setItem('accessToken', refreshData.access);
            // Retry original request with new token
            headers['Authorization'] = `Bearer ${refreshData.access}`;
            const retryResponse = await fetch(`${API_BASE_URL}${endpoint}`, {
              ...options,
              headers,
            });
            const retryData = await retryResponse.json();
            if (!retryResponse.ok) {
              throw new Error(retryData.error || retryData.detail || 'Request failed');
            }
            return retryData;
          }
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
        }
      }
      
      // Clear session and redirect to login
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      sessionStorage.removeItem('tempLoginData');
      if (!window.location.pathname.includes('/auth')) {
        window.location.href = '/auth/login';
      }
      throw new Error('Session expired. Please log in again.');
    }

    let result = {};
    const text = await response.text();
    try {
      result = text ? JSON.parse(text) : {};
    } catch (e) {
      console.warn("Failed to parse JSON response:", text);
      result = { error: text || "Invalid server response" };
    }

    if (!response.ok) {
      const errorMsg = result.error || result.detail || (typeof result === 'object' ? JSON.stringify(result) : 'Request failed');
      throw new Error(errorMsg);
    }

    return result;
  } catch (error) {
    console.error('API Error:', error.message);
    throw error;
  }
};

/* ================= AUTH ================= */

export const login = (employeeId, email, password, adminId) =>
  apiRequest('/auth/login/', 'POST', {
    employee_id: employeeId,
    email,
    password,
    admin_id: adminId,
  });

export const verifyOTP = (otp) =>
  apiRequest('/auth/verify-login-otp/', 'POST', { otp });

export const forgotPasswordOTP = (email) =>
  apiRequest('/auth/forgot-password-otp/', 'POST', { email });

export const resetPassword = (email, otp, newPassword) =>
  apiRequest('/auth/reset-password/', 'POST', {
    email,
    otp,
    new_password: newPassword,
  });

export const forceChangePassword = (newPassword, confirmPassword) =>
  apiRequest('/auth/force-change-password/', 'POST', {
    new_password: newPassword,
    confirm_password: confirmPassword,
  });

export const logout = (data = {}) => apiRequest('/auth/logout/', 'POST', data);

/* ================= CUSTOMERS ================= */

export const listCustomers = () => apiRequest('/sales/customers/');
export const createCustomer = (data) => apiRequest('/sales/customers/', 'POST', data);
export const updateCustomer = (customerId, data) => apiRequest(`/sales/customers/${customerId}/`, 'PATCH', data);
export const deleteCustomer = (customerId) => apiRequest(`/sales/customers/${customerId}/`, 'DELETE');

/* ================= EMPLOYEE ================= */

export const adminCreateUser = (data) =>
  apiRequest('/auth/admin-create-user/', 'POST', data);

export const listEmployees = () =>
  apiRequest('/auth/list-employees/', 'GET');

export const updateEmployee = (employeeId, data) =>
  apiRequest(`/auth/update-user/${employeeId}/`, 'PUT', data);

export const deleteEmployee = (employeeId) =>
  apiRequest(`/auth/delete-user/${employeeId}/`, 'DELETE');

/* ================= VENDOR ================= */

export const createVendor = (data) =>
  apiRequest('/vendors/vendor/create/', 'POST', data);

export const listVendors = () =>
  apiRequest('/vendors/vendor/list/', 'GET');

export const getVendor = (id) =>
  apiRequest(`/vendors/vendor/${id}/`, 'GET');

export const updateVendor = (id, data) =>
  apiRequest(`/vendors/vendor/update/${id}/`, 'PATCH', data);

export const deleteVendor = (id) =>
  apiRequest(`/vendors/vendor/delete/${id}/`, 'DELETE');

/* ── Agreements ── */
export const uploadVendorAgreement = async (vendorId, formData) => {
  await ensureCSRF();
  const csrftoken = getCookie('csrftoken');
  const accessToken = sessionStorage.getItem('accessToken');

  const headers = {};
  if (csrftoken) {
    headers['X-CSRFToken'] = csrftoken;
  }
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(
    `${API_BASE_URL}/vendors/vendor/${vendorId}/upload-agreement/`,
    {
      method: 'POST',
      credentials: 'include',
      headers,
      body: formData,
    }
  );
  
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json.error || 'Upload failed');
    err.reason = json.reason || null;
    err.details = json;
    throw err;
  }
  return json;
};

export const listVendorAgreements = (vendorId) =>
  apiRequest(`/vendors/vendor/${vendorId}/agreements/`, 'GET');

export const createVendorAgreement = (vendorId, data) =>
  apiRequest(`/vendors/vendor/${vendorId}/agreements/create/`, 'POST', data);

export const getAgreement = (agreementId) =>
  apiRequest(`/vendors/agreements/${agreementId}/`, 'GET');

export const listAgreementProducts = (agreementId) =>
  apiRequest(`/vendors/agreements/${agreementId}/products/`, 'GET');

export const addProductToAgreement = (agreementId, data) =>
  apiRequest(`/vendors/agreements/${agreementId}/products/add/`, 'POST', data);

export const getAgreementProduct = (id) =>
  apiRequest(`/vendors/agreement-products/${id}/`, 'GET');

export const listAllAgreementProducts = () =>
  apiRequest('/vendors/agreement-products/', 'GET');

export const listRejectedAgreements = () =>
  apiRequest('/vendors/rejected-agreements/', 'GET');

export const createWarehouse = (data) =>
  apiRequest('/vendors/warehouse/create/', 'POST', data);

export const updateWarehouse = (data) =>
  apiRequest('/vendors/warehouse/update/', 'PATCH', data);

export const getWarehouse = () =>
  apiRequest('/vendors/warehouse/', 'GET');

/* ================= CATEGORY ================= */

export const listCategories = () =>
  apiRequest('/vendors/categories/', 'GET');

export const createCategory = (data) =>
  apiRequest('/vendors/categories/create/', 'POST', data);

export const getCategory = (id) =>
  apiRequest(`/vendors/categories/${id}/`, 'GET');

/* ================= PRODUCT ================= */

export const createProduct = (data) =>
  apiRequest('/products/create/', 'POST', data);

export const listProducts = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(`/products/listall/${qs ? '?' + qs : ''}`, 'GET');
};

export const listProductsNeedingZone = () =>
  apiRequest('/products/needs-zone/', 'GET');

export const getProduct = (id) =>
  apiRequest(`/products/list/${id}/`, 'GET');

export const updateProduct = (id, data) =>
  apiRequest(`/products/update/${id}/`, 'PATCH', data);

export const assignProductZone = (id, data) =>
  apiRequest(`/products/${id}/assign-zone/`, 'PATCH', data);

export const deleteProduct = (id) =>
  apiRequest(`/products/delete/${id}/`, 'DELETE');

export const barcodeLookup = (barcode) =>
  apiRequest(`/products/barcode/${barcode}/`, 'GET');

export const listProductVendors = (productId) =>
  apiRequest(`/vendors/product/${productId}/vendors/`, 'GET');

/* ================= INVENTORY ================= */

// Zones
export const listZones = () => apiRequest('/inventory/zones/', 'GET');
export const createZone = (data) => apiRequest('/inventory/zones/create/', 'POST', data);
export const getZone = (id) => apiRequest(`/inventory/zones/${id}/`, 'GET');
export const updateZone = (id, data) => apiRequest(`/inventory/zones/${id}/update/`, 'PATCH', data);
export const deleteZone = (id) => apiRequest(`/inventory/zones/${id}/delete/`, 'DELETE');

// Racks
export const listRacks = () => apiRequest('/inventory/racks/', 'GET');
export const createRack = (data) => apiRequest('/inventory/racks/create/', 'POST', data);
export const getRack = (id) => apiRequest(`/inventory/racks/${id}/`, 'GET');
export const updateRack = (id, data) => apiRequest(`/inventory/racks/${id}/update/`, 'PATCH', data);
export const deleteRack = (id) => apiRequest(`/inventory/racks/${id}/delete/`, 'DELETE');

// Shelves & Bins
export const listShelves = () => apiRequest('/inventory/shelves/', 'GET');
export const getShelf = (id) => apiRequest(`/inventory/shelves/${id}/`, 'GET');
export const listBins = () => apiRequest('/inventory/bins/', 'GET');
export const listAvailableBins = () => apiRequest('/inventory/bins/available/', 'GET');
export const getBin = (id) => apiRequest(`/inventory/bins/${id}/`, 'GET');
export const getBinContents = (id) => apiRequest(`/inventory/bins/${id}/contents/`, 'GET');

// Batches
export const listBatches = () => apiRequest('/inventory/batches/', 'GET');
export const getBatch = (id) => apiRequest(`/inventory/batches/${id}/`, 'GET');
export const batchLookup = (params) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(`/inventory/batches/lookup/?${qs}`, 'GET');
};

// Inventory
export const listInventoryRows = () => apiRequest('/inventory/inventory/', 'GET');
export const getInventoryRow = (id) => apiRequest(`/inventory/inventory/${id}/`, 'GET');

// Stock
export const getProductStock = (productId) => 
  apiRequest(`/inventory/product/${productId}/stock/`, 'GET');
export const getProductStockByVendor = (productId) => 
  apiRequest(`/inventory/product/${productId}/by-vendor/`, 'GET');
export const getCrossVendorPurchase = (productId) => 
  apiRequest(`/inventory/product/${productId}/cross-vendor/`, 'GET');
export const removeStockByProduct = (productId, data) => 
  apiRequest(`/inventory/product/${productId}/remove-stock/`, 'POST', data);

// Stock Movements
export const listStockMovements = () => 
  apiRequest('/inventory/stock-movements/', 'GET');
export const getStockMovementsByProduct = (productId) => 
  apiRequest(`/inventory/stock-movements/${productId}/`, 'GET');

// Vendor Scoring
export const getVendorScore = (productId) => 
  apiRequest(`/inventory/vendor-scores/${productId}/`, 'GET');

/* ================= PURCHASE REQUEST ================= */

export const listPurchaseRequests = (params = {}) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(`/inventory/purchase-requests/${qs ? '?' + qs : ''}`, 'GET');
};

export const getPurchaseRequest = (id) => 
  apiRequest(`/inventory/purchase-requests/${id}/`, 'GET');

export const createManualPR = (data) => 
  apiRequest('/inventory/purchase-request/manual/', 'POST', data);

export const managerApprovePR = (id, data = {}) => {
  // If action is 'reject', use reject endpoint
  if (data.action === 'reject') {
    return apiRequest(`/inventory/purchase-requests/${id}/manager-reject/`, 'POST', data);
  }
  return apiRequest(`/inventory/purchase-requests/${id}/manager-approve/`, 'POST', data);
};

export const financeApprovePR = (id, data = { action: 'approve' }) => 
  apiRequest(`/inventory/purchase-requests/${id}/finance-approve/`, 'POST', data);

// Update purchase request (for manager edits before approval)
export const updatePurchaseRequest = (id, data) => 
  apiRequest(`/inventory/purchase-requests/${id}/`, 'PATCH', data);

// Alias for createManualPR to maintain compatibility with PurchaseRequestsPage
export const createPurchaseRequest = (data) => createManualPR(data);

/* ================= PURCHASE ORDER ================= */

export const listPurchaseOrders = () => 
  apiRequest('/inventory/purchase-orders/', 'GET');
export const getPurchaseOrder = (id) => 
  apiRequest(`/inventory/purchase-orders/${id}/`, 'GET');

/* ================= ASN ================= */

export const listASN = () => apiRequest('/inventory/asn/', 'GET');
export const createASN = (data) => apiRequest('/inventory/asn/create/', 'POST', data);
export const getASN = (id) => apiRequest(`/inventory/asn/${id}/`, 'GET');

export const listASNItems = () => apiRequest('/inventory/asn-items/', 'GET');
export const createASNItem = (data) => apiRequest('/inventory/asn-items/create/', 'POST', data);
export const getASNItem = (id) => apiRequest(`/inventory/asn-items/${id}/`, 'GET');

/* ================= GRN ================= */

// Supervisor
export const supervisorCreateGRN = (data) => 
  apiRequest('/inventory/grn/supervisor/create/', 'POST', data);
export const supervisorGRNList = () => 
  apiRequest('/inventory/grn/supervisor/my-grns/', 'GET');
export const supervisorScanBarcode = (grnId, params) => {
  const qs = new URLSearchParams(params).toString();
  return apiRequest(`/inventory/grn/${grnId}/scan/?${qs}`, 'GET');
};
export const supervisorAddGRNItem = (grnId, data) => 
  apiRequest(`/inventory/grn/${grnId}/add-item/`, 'POST', data);

// QC
export const getQCPendingGRNs = () => 
  apiRequest('/inventory/grn/qc/pending/', 'GET');
export const qcUpdateGRNItem = (id, data) => 
  apiRequest(`/inventory/grn-items/${id}/qc/`, 'PUT', data);

export const qcUpdateGRNItemWithRejection = (id, data) => 
  apiRequest(`/inventory/grn-items/${id}/qc/`, 'PUT', data);
export const qcApproveGRN = (grnId) => 
  apiRequest(`/inventory/grn/${grnId}/qc-approve/`, 'POST');

// GRN Read
export const listGRNs = () => apiRequest('/inventory/grn/', 'GET');
export const getGRN = (id) => apiRequest(`/inventory/grn/${id}/`, 'GET');
export const getGRNItems = (grnId) => 
  apiRequest(`/inventory/grn/${grnId}/items/`, 'GET');
export const getGRNSummary = (grnId) => 
  apiRequest(`/inventory/grn/${grnId}/summary/`, 'GET');

// GRN Items
export const listGRNItems = () => apiRequest('/inventory/grn-items/', 'GET');
export const getGRNItem = (id) => apiRequest(`/inventory/grn-items/${id}/`, 'GET');

// Barcode Decode
export const decodeGRNBarcode = (data) => 
  apiRequest('/inventory/grn/decode-barcode/', 'POST', data);

/* ================= PUTAWAY PLAN ================= */

export const listPendingPutaway = () => 
  apiRequest('/inventory/putaway/pending/', 'GET');
export const confirmPutaway = (planId, data) => 
  apiRequest(`/inventory/putaway/${planId}/confirm/`, 'POST', data);
export const reassignPutawayBin = (planId, data) => 
  apiRequest(`/inventory/putaway/${planId}/reassign/`, 'POST', data);
export const getPutawayByGRN = (grnId) => 
  apiRequest(`/inventory/grn/${grnId}/putaway-plan/`, 'GET');

/* ================= OUTBOUND ================= */

export const outboundPick = (productId, data) => 
  apiRequest(`/inventory/outbound/pick/${productId}/`, 'POST', data);


/* ================= BACKWARD COMPATIBILITY ALIASES ================= */

// GRN Aliases
export const getMyGRNs = () => supervisorGRNList();
export const createGRNBySupervisor = (data) => supervisorCreateGRN(data);
export const approveGRN = (id) => qcApproveGRN(id);
export const createGRN = (data) => supervisorCreateGRN(data);

// Inventory Aliases
export const listInventory = () => listInventoryRows();

// Vendor Agreement Aliases
export const uploadSmartVendorAgreement = (data) => 
  apiRequest('/vendors/upload-agreement/', 'POST', data);

/* ── REJECTIONS ────────────────────────────────────────────────────────── */
export const listRejections = () =>
  apiRequest('/inventory/rejections/', 'GET');

export const confirmRejection = (itemId) =>
  apiRequest(`/inventory/rejections/${itemId}/confirm/`, 'POST');

/* ================= SALES ================= */


// CPR (Customer Purchase Requests)
export const listCPRs = (all = false) => 
  apiRequest(`/sales/cpr/${all ? '?all=1' : ''}`, 'GET');
export const createCPR = (data) => 
  apiRequest('/sales/cpr/', 'POST', data);
export const inventoryActionCPR = (cprId, data) => 
  apiRequest(`/sales/cpr/${cprId}/inventory-action/`, 'PATCH', data);

// SO (Sales Orders)
export const listSalesOrders = () => 
  apiRequest('/sales/so/', 'GET');
export const createSalesOrder = (data) => 
  apiRequest('/sales/so/', 'POST', data);
export const supervisorActionSO = (soId, data) => 
  apiRequest(`/sales/so/${soId}/supervisor-action/`, 'PATCH', data);
export const recordSOPayment = (soId, data) => 
  apiRequest(`/sales/so/${soId}/payment/`, 'POST', data);
export const financeConfirmSO = (soId, data) => 
  apiRequest(`/sales/so/${soId}/finance-confirm/`, 'PATCH', data);
export const pickPackSO = (soId) => 
  apiRequest(`/sales/so/${soId}/pick-pack/`, 'POST');
export const printSOLogsheet = (soId) =>
  apiRequest(`/sales/so/${soId}/print-logsheet/`, 'POST');
export const dispatchSO = (soId, data) => 
  apiRequest(`/sales/so/${soId}/dispatch/`, 'POST', data);
export const decodeSOBarcode = (data) =>
  apiRequest('/sales/so/decode-barcode/', 'POST', data);

// Payments
export const listSOPayments = (all = false) => 
  apiRequest(`/sales/payments/${all ? '?all=1' : ''}`, 'GET');