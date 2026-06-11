import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, X, CheckCheck, Package, ClipboardList,
  CheckCircle, AlertTriangle, DollarSign, Info,
  Clock, ChevronRight, RefreshCw, Send
} from "lucide-react";
import {
  fetchNotifications, fetchUnreadCount,
  markRead, markAllRead,
} from "../services/notificationService";
import SendNotificationModal from "./SendNotificationModal";

/* ─── Icon per notification type ─── */
const TYPE_CONFIG = {
  task:      { icon: ClipboardList, color: "#6366f1", bg: "#eef2ff", label: "Task" },
  approval:  { icon: CheckCircle,   color: "#10b981", bg: "#ecfdf5", label: "Approval" },
  inventory: { icon: Package,       color: "#f59e0b", bg: "#fffbeb", label: "Inventory" },
  quality:   { icon: AlertTriangle, color: "#ef4444", bg: "#fef2f2", label: "Quality" },
  rejection: { icon: AlertTriangle, color: "#dc2626", bg: "#fef2f2", label: "Rejection" },
  payment:   { icon: DollarSign,    color: "#8b5cf6", bg: "#f5f3ff", label: "Payment" },
  update:    { icon: Info,          color: "#3b82f6", bg: "#eff6ff", label: "Update" },
};

function roleLabel(role) {
  return (role || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen]               = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [modalOpen, setModalOpen]     = useState(false);
  const dropRef = useRef(null);
  const navigate = useNavigate();

  /* ── Fetch count (lightweight, runs every 5 s) ── */
  const refreshCount = useCallback(async () => {
    try {
      const data = await fetchUnreadCount();
      setUnreadCount(data.count || 0);
    } catch (_) {}
  }, []);

  /* ── Fetch full list (runs when panel opens) ── */
  const refreshList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications();
      setNotifications(Array.isArray(data) ? data : []);
      const unread = (Array.isArray(data) ? data : []).filter(n => !n.is_read).length;
      setUnreadCount(unread);
    } catch (_) {}
    setLoading(false);
  }, []);

  /* Poll count every 5 s */
  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 5000);
    return () => clearInterval(id);
  }, [refreshCount]);

  /* Reload list when panel opens */
  useEffect(() => {
    if (open) refreshList();
  }, [open, refreshList]);

  /* Close on outside click */
  useEffect(() => {
    function handle(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ── Handlers ── */
  const handleMarkRead = async (id, url) => {
    await markRead(id);
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
    if (url) { setOpen(false); navigate(url); }
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const unread = notifications.filter(n => !n.is_read);
  const read   = notifications.filter(n => n.is_read);

  return (
    <>
      {/* ── Bell Button ── */}
      <div className="relative" ref={dropRef}>
        <button
          id="notification-bell-btn"
          onClick={() => setOpen(o => !o)}
          className="relative p-2 rounded-xl hover:bg-slate-100 transition-all duration-200 group"
          title="Notifications"
        >
          <Bell
            className={`w-5 h-5 transition-all duration-300 ${
              open ? "text-indigo-600" : "text-slate-500 group-hover:text-slate-700"
            } ${unreadCount > 0 ? "animate-bell" : ""}`}
          />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 shadow-md animate-pulse-once">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {/* ── Dropdown Panel ── */}
        {open && (
          <div
            className="absolute right-0 top-full mt-2 w-[400px] rounded-2xl border border-slate-200 bg-white shadow-2xl z-[100] overflow-hidden"
            style={{ animation: "notifSlideIn 0.2s ease-out" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-blue-50">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-600" />
                <span className="font-semibold text-slate-800 text-sm">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-indigo-100 text-indigo-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setModalOpen(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
                  title="Send notification"
                >
                  <Send className="w-3.5 h-3.5" /> Send
                </button>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAll}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> All read
                  </button>
                )}
                <button
                  onClick={refreshList}
                  className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="max-h-[420px] overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <RefreshCw className="w-5 h-5 text-indigo-400 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Bell className="w-10 h-10 mb-2 opacity-30" />
                  <p className="text-sm font-medium">No notifications yet</p>
                  <p className="text-xs mt-1">You're all caught up!</p>
                </div>
              ) : (
                <>
                  {/* Unread section */}
                  {unread.length > 0 && (
                    <div>
                      <div className="px-4 pt-3 pb-1">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">New</span>
                      </div>
                      {unread.map(n => (
                        <NotifItem key={n.id} n={n} onRead={handleMarkRead} />
                      ))}
                    </div>
                  )}

                  {/* Read section */}
                  {read.length > 0 && (
                    <div>
                      {unread.length > 0 && (
                        <div className="px-4 pt-3 pb-1">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Earlier</span>
                        </div>
                      )}
                      {read.map(n => (
                        <NotifItem key={n.id} n={n} onRead={handleMarkRead} />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-400">{notifications.length} total</span>
              <button
                onClick={() => { setOpen(false); navigate("/notifications"); }}
                className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
              >
                View all history <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Send Notification Modal ── */}
      {modalOpen && (
        <SendNotificationModal
          onClose={() => setModalOpen(false)}
          onSent={() => { setModalOpen(false); refreshList(); }}
        />
      )}

      <style>{`
        @keyframes notifSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
        @keyframes bellRing {
          0%,100% { transform: rotate(0); }
          15%      { transform: rotate(14deg); }
          30%      { transform: rotate(-10deg); }
          45%      { transform: rotate(6deg); }
          60%      { transform: rotate(-4deg); }
          75%      { transform: rotate(2deg); }
        }
        .animate-bell { animation: bellRing 0.8s ease; }
        @keyframes pulseOnce {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.25); }
          100% { transform: scale(1); }
        }
        .animate-pulse-once { animation: pulseOnce 0.4s ease; }
      `}</style>
    </>
  );
}

/* ── Single notification item ── */
function NotifItem({ n, onRead }) {
  const cfg = TYPE_CONFIG[n.notification_type] || TYPE_CONFIG.update;
  const Icon = cfg.icon;

  return (
    <button
      onClick={() => onRead(n.id, n.redirect_url || null)}
      className={`w-full text-left flex items-start gap-3 px-4 py-3 border-b border-slate-50 transition-colors group
        ${n.is_read ? "hover:bg-slate-50" : "bg-indigo-50/40 hover:bg-indigo-50"}`}
    >
      {/* Icon */}
      <div
        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center mt-0.5"
        style={{ background: cfg.bg }}
      >
        <Icon className="w-4.5 h-4.5" style={{ color: cfg.color }} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm leading-snug truncate ${n.is_read ? "text-slate-600" : "text-slate-800 font-semibold"}`}>
            {n.title}
          </p>
          {!n.is_read && (
            <span className="shrink-0 w-2 h-2 rounded-full bg-indigo-500 mt-1.5" />
          )}
        </div>
        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span
            className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {cfg.label}
          </span>
          <span className="text-[10px] text-slate-400">from {roleLabel(n.sender_role)}</span>
          <span className="flex items-center gap-0.5 text-[10px] text-slate-400 ml-auto">
            <Clock className="w-2.5 h-2.5" />
            {timeAgo(n.created_at)}
          </span>
        </div>
      </div>
    </button>
  );
}
