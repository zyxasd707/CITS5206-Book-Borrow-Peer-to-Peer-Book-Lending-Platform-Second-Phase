"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getApiUrl, getToken } from "@/utils/auth";
import { getRefundsForOrder } from "@/utils/payments";
import Card from "@/app/components/ui/Card";

interface OrderWithRefunds {
  orderId: string;
  status: string;
  canceledAt: string | null;
  refunds: Array<{
    refund_id: string;
    amount: number;
    currency: string;
    status: string;
    reason: string | null;
    created_at: string;
  }>;
}

type TabType = "all" | "personal" | "system";

export default function NotificationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("system");
  const [notifications, setNotifications] = useState<OrderWithRefunds[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<OrderWithRefunds | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRefundNotifications();
  }, []);

  const loadRefundNotifications = async () => {
    try {
      const apiUrl = getApiUrl();
      const token = getToken();

      // Fetch user's orders that are CANCELED or COMPLETED (may have refunds)
      const res = await fetch(`${apiUrl}/api/v1/orders/?status=CANCELED`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let orders: any[] = [];
      if (res.ok) {
        const data = await res.json();
        orders = Array.isArray(data) ? data : (data.value || data.items || []);
      }

      // Also fetch COMPLETED orders (deposit refunds)
      const resCompleted = await fetch(`${apiUrl}/api/v1/orders/?status=COMPLETED`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resCompleted.ok) {
        const data = await resCompleted.json();
        const completedOrders = Array.isArray(data) ? data : (data.value || data.items || []);
        orders = [...orders, ...completedOrders];
      }

      // For each order, fetch refund records
      const ordersWithRefunds: OrderWithRefunds[] = [];
      for (const order of orders) {
        const oid = order.order_id || order.id;
        try {
          const refundData = await getRefundsForOrder(oid);
          if (refundData.refunds && refundData.refunds.length > 0) {
            ordersWithRefunds.push({
              orderId: oid,
              status: order.status,
              canceledAt: order.canceledAt || order.canceled_at,
              refunds: refundData.refunds,
            });
          }
        } catch {
          // Order might not have refunds, skip
        }
      }

      // Sort by most recent refund
      ordersWithRefunds.sort((a, b) => {
        const aTime = new Date(a.refunds[0]?.created_at || 0).getTime();
        const bTime = new Date(b.refunds[0]?.created_at || 0).getTime();
        return bTime - aTime;
      });

      setNotifications(ordersWithRefunds);
      if (ordersWithRefunds.length > 0) {
        setSelectedNotification(ordersWithRefunds[0]);
      }
    } catch (error) {
      console.error("Failed to load refund notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const getRefundStatusIcon = (status: string) => {
    if (status === "succeeded" || status === "refunded") {
      return (
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-green-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      );
    }
    if (status === "failed") {
      return (
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        </div>
      );
    }
    // pending / processing
    return (
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
    );
  };

  const getNotificationTitle = (item: OrderWithRefunds) => {
    const latestRefund = item.refunds[0];
    if (latestRefund.status === "succeeded" || latestRefund.status === "refunded") {
      return "Refund Completed";
    }
    if (latestRefund.status === "failed") return "Refund Failed";
    return "Refund Processing";
  };

  const getNotificationMessage = (item: OrderWithRefunds) => {
    const latestRefund = item.refunds[0];
    const amount = (latestRefund.amount / 100).toFixed(2);
    if (latestRefund.status === "succeeded" || latestRefund.status === "refunded") {
      return `Refund of $${amount} completed successfully to your original payment.`;
    }
    if (latestRefund.status === "failed") {
      return `Refund of $${amount} failed. Please contact support.`;
    }
    return `Your refund of $${amount} is being processed by our system.`;
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        Loading notifications...
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 p-6 space-y-6 shrink-0">
        <h2 className="text-2xl font-bold tracking-tight">Inbox</h2>
        <nav className="space-y-1">
          <button
            onClick={() => router.push("/message")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-white/50 transition-all font-medium text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            All Messages
          </button>
          <button
            onClick={() => router.push("/message")}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-white/50 transition-all font-medium text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Personal Chats
          </button>
          <button
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white text-orange-600 shadow-sm transition-all font-bold text-sm"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            System Notifications
          </button>
        </nav>
      </aside>

      {/* Notification List */}
      <section className="w-96 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">Recent Activity</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No refund notifications yet
            </div>
          ) : (
            notifications.map((item) => {
              const latestRefund = item.refunds[0];
              const isSelected = selectedNotification?.orderId === item.orderId;
              const isProcessing = latestRefund.status === "pending";
              return (
                <div
                  key={item.orderId}
                  onClick={() => setSelectedNotification(item)}
                  className={`p-5 border-b border-gray-100 cursor-pointer transition-colors relative ${
                    isSelected ? "bg-white" : "hover:bg-gray-50"
                  } ${isProcessing ? "bg-white" : "opacity-80"}`}
                >
                  {isProcessing && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
                  )}
                  <div className="flex gap-3">
                    {getRefundStatusIcon(latestRefund.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">System</span>
                        <span className="text-[10px] text-gray-400">{formatTimeAgo(latestRefund.created_at)}</span>
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {getNotificationTitle(item)}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                        {getNotificationMessage(item)}
                      </p>
                      {isProcessing && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                          <span className="text-[10px] font-bold text-amber-700">Pending Authorization</span>
                        </div>
                      )}
                      {(latestRefund.status === "succeeded" || latestRefund.status === "refunded") && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-[10px] font-bold text-green-700">Funds Released</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Auto-cancel notification for CANCELED orders without refunds */}
          {notifications.filter(n => n.status === "CANCELED").map((item) => (
            <div key={`cancel-${item.orderId}`} className="p-5 border-b border-gray-100 opacity-70">
              <div className="flex gap-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">System</span>
                    <span className="text-[10px] text-gray-400">
                      {item.canceledAt ? formatTimeAgo(item.canceledAt) : ""}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 truncate">Order auto-cancelled</h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                    The lender did not ship within the required 3 days.
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Detail View */}
      <section className="flex-1 bg-gray-100 overflow-y-auto">
        {selectedNotification ? (
          <div className="p-12 max-w-2xl mx-auto w-full">
            <div className="bg-white p-10 rounded-2xl shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  </div>
                  <div>
                    <h1 className="font-bold text-xl leading-tight">System Message</h1>
                    <p className="text-xs text-gray-400">Order: {selectedNotification.orderId.slice(0, 16)}...</p>
                  </div>
                </div>
                <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                  selectedNotification.refunds[0].status === "succeeded" || selectedNotification.refunds[0].status === "refunded"
                    ? "bg-green-100 text-green-800"
                    : selectedNotification.refunds[0].status === "failed"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {selectedNotification.refunds[0].status === "succeeded" || selectedNotification.refunds[0].status === "refunded"
                    ? "Completed"
                    : selectedNotification.refunds[0].status === "failed"
                    ? "Failed"
                    : "Processing"}
                </span>
              </div>

              {/* Message Content */}
              <div className="space-y-6">
                <div className={`p-6 rounded-xl border-l-4 ${
                  selectedNotification.refunds[0].status === "failed"
                    ? "bg-red-50 border-red-500"
                    : "bg-gray-50 border-orange-500"
                }`}>
                  <p className="text-sm leading-relaxed text-gray-700 font-medium">
                    {getNotificationMessage(selectedNotification)}
                  </p>
                </div>

                {/* Timeline */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Timeline</h4>
                  <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200">
                    {selectedNotification.refunds.map((refund, idx) => (
                      <div key={refund.refund_id} className="relative">
                        <div className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
                          refund.status === "succeeded" || refund.status === "refunded"
                            ? "bg-green-500"
                            : refund.status === "failed"
                            ? "bg-red-500"
                            : "bg-orange-500"
                        }`} />
                        <p className="text-xs font-bold text-gray-900">
                          {refund.status === "succeeded" || refund.status === "refunded"
                            ? "Refund Completed"
                            : refund.status === "failed"
                            ? "Refund Failed"
                            : "Refund Initiated"}
                          {" - "}${(refund.amount / 100).toFixed(2)} {refund.currency.toUpperCase()}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {new Date(refund.created_at).toLocaleString()}
                        </p>
                        {refund.reason && (
                          <p className="text-[11px] text-gray-400 mt-1">{refund.reason}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-8 flex flex-col gap-3">
                  <button
                    onClick={() => router.push(`/borrowing/${selectedNotification.orderId}`)}
                    className="w-full py-4 bg-black text-white font-bold rounded-xl text-sm transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    View Order Details
                  </button>
                  <button
                    onClick={() => router.push(`/complain?orderId=${selectedNotification.orderId}`)}
                    className="w-full py-4 bg-gray-200 text-gray-900 font-bold rounded-xl text-sm hover:bg-gray-300 transition-colors"
                  >
                    Contact Support
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center h-full text-gray-400">
            {notifications.length === 0
              ? "No refund notifications to display"
              : "Select a notification to view details"}
          </div>
        )}
      </section>
    </div>
  );
}
