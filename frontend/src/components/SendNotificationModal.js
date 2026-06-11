import React, { useState, useEffect, useRef } from "react";
import {
  X, Send, ClipboardList, CheckCircle,
  Package, AlertTriangle, DollarSign, Info, Loader2
} from "lucide-react";
import { sendNotification, fetchAllowedRecipients } from "../services/notificationService";

const ROLE_LABELS = {
  admin:             "Admin",
  manager:           "Manager",
  supervisor:        "Supervisor",
  inventory_manager: "Inventory Manager",
  quality_assistant: "Quality Assistant",
  finance_director:  "Finance Director",
};

const TYPE_OPTIONS = [
  { value: "task",      label: "Task Assigned",     icon: ClipboardList, color: "#6366f1" },
  { value: "approval",  label: "Approval Request",  icon: CheckCircle,   color: "#10b981" },
  { value: "inventory", label: "Inventory Alert",   icon: Package,       color: "#f59e0b" },
  { value: "quality",   label: "Quality Alert",     icon: AlertTriangle, color: "#ef4444" },
  { value: "rejection", label: "Rejection Alert",   icon: AlertTriangle, color: "#dc2626" },
  { value: "payment",   label: "Payment Alert",     icon: DollarSign,    color: "#8b5cf6" },
  { value: "update",    label: "General Update",    icon: Info,          color: "#3b82f6" },
];

/* Default redirect URL suggestions per type */
const REDIRECT_SUGGESTIONS = {
  task:      "/dashboard",
  approval:  "/purchase-requests",
  inventory: "/inventory",
  quality:   "/quality-check",
  rejection: "/quality-check",
  payment:   "/finance",
  update:    "/dashboard",
};

export default function SendNotificationModal({ onClose, onSent }) {
  const [allowedRoles, setAllowedRoles]   = useState([]);
  const [recipientRole, setRecipientRole] = useState("");
  const [notifType, setNotifType]         = useState("update");
  const [title, setTitle]                 = useState("");
  const [message, setMessage]             = useState("");
  const [redirectUrl, setRedirectUrl]     = useState("/dashboard");
  const [sending, setSending]             = useState(false);
  const [error, setError]                 = useState("");
  const [success, setSuccess]             = useState("");
  const modalRef = useRef(null);

  /* Load allowed recipients */
  useEffect(() => {
    fetchAllowedRecipients().then(data => {
      setAllowedRoles(data.allowed_roles || []);
      if ((data.allowed_roles || []).length > 0) {
        setRecipientRole(data.allowed_roles[0]);
      }
    });
  }, []);

  /* Auto-fill redirect URL when type changes */
  useEffect(() => {
    setRedirectUrl(REDIRECT_SUGGESTIONS[notifType] || "/dashboard");
  }, [notifType]);

  /* Close on escape */
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /* Close on backdrop click */
  function handleBackdrop(e) {
    if (e.target === e.currentTarget) onClose();
  }


  async function handleSend(e) {
    e.preventDefault();
    if (!recipientRole) { setError("Please select a recipient role."); return; }
    if (!title.trim())  { setError("Title is required."); return; }
    if (!message.trim()){ setError("Message is required."); return; }

    setSending(true);
    setError("");
    try {
      await sendNotification({
        recipient_role: recipientRole,
        notification_type: notifType,
        title: title.trim(),
        message: message.trim(),
        redirect_url: redirectUrl.trim(),
      });
      setSuccess("Notification sent successfully!");
      setTimeout(() => onSent(), 1200);
    } catch (err) {
      setError(err.message || "Failed to send notification.");
    }
    setSending(false);
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleBackdrop}
      style={{ animation: "fadeIn 0.15s ease" }}
    >
      <div
        ref={modalRef}
        className="w-full max-w-lg mx-4 bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ animation: "slideUp 0.2s ease-out" }}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-600 to-blue-600">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">Send Notification</h2>
              <p className="text-xs text-indigo-200">Notify a role across the warehouse</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">
            <X className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSend} className="px-6 py-5 space-y-4">
          {/* Recipient Role */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Send To (Role)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {allowedRoles.length === 0 ? (
                <p className="text-sm text-slate-400 col-span-2">Loading roles...</p>
              ) : (
                allowedRoles.map(role => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => setRecipientRole(role)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                      recipientRole === role
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${recipientRole === role ? "bg-indigo-500" : "bg-slate-300"}`} />
                    {ROLE_LABELS[role] || role}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Notification Type */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Notification Type
            </label>
            <div className="relative">
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map(t => {
                  const TIcon = t.icon;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setNotifType(t.value)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium transition-all ${
                        notifType === t.value
                          ? "border-2 text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                      style={notifType === t.value
                        ? { borderColor: t.color, background: t.color }
                        : {}}
                    >
                      <TIcon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Stock Level Critical — Warehouse A"
              maxLength={200}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Message
            </label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your notification message here..."
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all resize-none"
            />
          </div>

          {/* Redirect URL */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Redirect To (optional)
            </label>
            <input
              type="text"
              value={redirectUrl}
              onChange={e => setRedirectUrl(e.target.value)}
              placeholder="/inventory"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-800 placeholder-slate-400
                         focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
            />
            <p className="text-[11px] text-slate-400 mt-1">Recipient will be taken to this page when they click the notification.</p>
          </div>

          {/* Error / Success */}
          {error   && <div className="px-3 py-2 rounded-xl bg-red-50 border border-red-200 text-sm text-red-600">{error}</div>}
          {success && <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-600">{success}</div>}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={sending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-sm font-semibold text-white transition-all disabled:opacity-60 shadow-md"
            >
              {sending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
              ) : (
                <><Send className="w-4 h-4" /> Send Notification</>
              )}
            </button>
          </div>
        </form>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
}
