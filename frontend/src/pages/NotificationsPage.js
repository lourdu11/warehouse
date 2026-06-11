import React, { useState, useEffect, useCallback } from "react";
import { 
  Bell, Search, CheckCheck, Clock, 
  Package, ClipboardList, CheckCircle, 
  AlertTriangle, DollarSign, Info, ChevronRight,
  RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { 
  fetchNotifications, markRead, markAllRead, fetchSentNotifications 
} from "../services/notificationService";


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

function formatDate(iso) {
  if (!iso) return "—";
  const date = new Date(iso);
  const dateStr = date.toLocaleDateString("en-GB"); // dd/mm/yyyy
  const timeStr = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${dateStr} ${timeStr}`;
}

export default function NotificationsPage() {
  const [activeTab, setActiveTab] = useState("inbox"); // inbox, sent
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const navigate = useNavigate();

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const data = activeTab === "inbox" 
        ? await fetchNotifications() 
        : await fetchSentNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
    setLoading(false);
  }, [activeTab]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (id, url) => {
    if (activeTab === "inbox") {
      await markRead(id);
      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    }
    if (url) navigate(url);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const filteredNotifications = notifications.filter(n => {
    const matchesSearch = n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         n.message.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterType === "all" || n.notification_type === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Notifications</h1>
          <p className="text-slate-500 text-sm">Stay updated with tasks, alerts, and system updates</p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={loadNotifications}
            className="p-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {activeTab === "inbox" && (
            <button 
              onClick={handleMarkAll}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-all shadow-sm"
            >
              <CheckCheck className="w-4 h-4" />
              Mark All Read
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between px-6 py-4 border-b border-slate-100 gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab("inbox")}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "inbox" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Inbox
            </button>
            <button
              onClick={() => setActiveTab("sent")}
              className={`px-6 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === "sent" 
                  ? "bg-white text-indigo-600 shadow-sm" 
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Sent
            </button>
          </div>

          <div className="flex flex-1 items-center gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition-all"
              />
            </div>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white transition-all"
            >
              <option value="all">All Types</option>
              {Object.keys(TYPE_CONFIG).map(type => (
                <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-slate-50">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <RefreshCw className="w-10 h-10 animate-spin mb-4" />
              <p>Loading your notifications...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-400">
              <Bell className="w-16 h-16 opacity-10 mb-4" />
              <p className="text-lg font-medium">No notifications found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            filteredNotifications.map((n) => (
              <NotificationItem 
                key={n.id} 
                n={n} 
                isSent={activeTab === "sent"} 
                onAction={handleMarkRead} 
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function NotificationItem({ n, isSent, onAction }) {
  const cfg = TYPE_CONFIG[n.notification_type] || TYPE_CONFIG.update;
  const Icon = cfg.icon;

  return (
    <div 
      className={`group flex items-start gap-4 p-6 transition-all hover:bg-slate-50 cursor-pointer ${
        !isSent && !n.is_read ? "bg-indigo-50/20" : ""
      }`}
      onClick={() => onAction(n.id, n.redirect_url)}
    >
      <div 
        className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center shadow-sm"
        style={{ background: cfg.bg }}
      >
        <Icon className="w-6 h-6" style={{ color: cfg.color }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-4 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className={`text-base truncate ${!isSent && !n.is_read ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
              {n.title}
            </h3>
            <span 
              className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shadow-sm"
              style={{ background: cfg.bg, color: cfg.color }}
            >
              {cfg.label}
            </span>
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-xs shrink-0">
             <span className="flex items-center gap-1">
               <Clock className="w-3.5 h-3.5" />
               {formatDate(n.created_at)}
             </span>
             <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        <p className={`text-sm mb-3 line-clamp-2 ${!isSent && !n.is_read ? "text-slate-700" : "text-slate-500"}`}>
          {n.message}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600">
              <span className="text-[11px] font-medium">
                {isSent ? "To: " : "From: "}
                {roleLabel(isSent ? n.recipient_role : n.sender_role)}
              </span>
            </div>
            {!isSent && n.sender_name && (
              <span className="text-[11px] text-slate-400">
                by {n.sender_name}
              </span>
            )}
          </div>
          
          {!isSent && !n.is_read && (
            <button 
              onClick={(e) => {
                e.stopPropagation();
                onAction(n.id);
              }}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
