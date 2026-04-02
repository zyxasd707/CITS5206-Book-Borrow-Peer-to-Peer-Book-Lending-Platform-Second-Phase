"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { getCurrentUser, getApiUrl, getToken } from "@/utils/auth";
import { useSearchParams, useRouter } from "next/navigation";
import type { ChatThread, Message, SendMessageData } from "@/app/types/message";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Avatar from "@/app/components/ui/Avatar";
import type { User } from "@/app/types/user";
import {
  getConversations,
  getConversation,
  sendMessage,
  markConversationAsRead,
  sendMessageWithImage,
  getUserByEmail,
} from "@/utils/messageApi";
import { getRefundsForOrder } from "@/utils/payments";

const API_URL = getApiUrl();
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// ── Types ──────────────────────────────────────────────────────
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

type ViewTab = "personal" | "system";

// ── Helpers ────────────────────────────────────────────────────
const formatPerthTime = (timestamp: string) => {
  const utcDate = new Date(timestamp + "Z");
  return utcDate.toLocaleTimeString("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Perth",
  });
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

// ── Component ──────────────────────────────────────────────────
export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRecipientEmail = searchParams.get("to");
  const initialBookId = searchParams.get("bookId");
  const initialBookTitle = searchParams.get("bookTitle");
  const tabParam = searchParams.get("tab");

  const [activeTab, setActiveTab] = useState<ViewTab>(
    tabParam === "system" ? "system" : "personal"
  );

  // ── Personal Chat state ──
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedThread, setSelectedThread] = useState<ChatThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const selectedThreadRef = useRef<ChatThread | null>(null);

  // ── System Notifications state ──
  const [notifications, setNotifications] = useState<OrderWithRefunds[]>([]);
  const [selectedNotification, setSelectedNotification] =
    useState<OrderWithRefunds | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [systemNotifCount, setSystemNotifCount] = useState(0);

  // Sync tab with URL param
  useEffect(() => {
    if (tabParam === "system") setActiveTab("system");
  }, [tabParam]);

  // Keep selectedThread ref in sync
  useEffect(() => {
    selectedThreadRef.current = selectedThread;
  }, [selectedThread]);

  // ── Load personal chat data ──
  useEffect(() => {
    const loadData = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);

        const conversations = await getConversations();
        setThreads(conversations);

        if (initialRecipientEmail) {
          const existingThread = conversations.find(
            (thread: { user: { email: string } }) =>
              thread.user.email === initialRecipientEmail
          );

          if (existingThread) {
            handleThreadSelect(existingThread);
          } else {
            try {
              const recipientUser = await getUserByEmail(initialRecipientEmail);
              const newThread: ChatThread = {
                user: recipientUser,
                messages: [],
                lastMessage: {
                  id: `temp-${Date.now()}`,
                  content: `Start a conversation about "${initialBookTitle || "this book"}"...`,
                  sender_email: "",
                  receiver_email: "",
                  timestamp: new Date().toISOString(),
                  read: true,
                  bookTitle: initialBookTitle || undefined,
                  bookId: initialBookId || undefined,
                },
                unreadCount: 0,
                id: "",
              };
              setThreads((prev) => [newThread, ...prev]);
              setSelectedThread(newThread);
            } catch (apiError) {
              console.error(`Failed to fetch user details for ${initialRecipientEmail}:`, apiError);
            }
          }
          if (initialBookId && initialBookTitle) {
            setMessageInput(
              `Book Request: ${initialBookTitle}\n\nHi! I am interested in this book. When would be a good time to arrange pickup/delivery?`
            );
          }
        }
        setLoading(false);
      } catch (error) {
        console.error("Error loading initial data:", error);
        setLoading(false);
      }
    };
    loadData();
  }, [initialRecipientEmail, initialBookId, initialBookTitle]);

  // ── Load system notifications ──
  useEffect(() => {
    if (activeTab === "system") {
      loadRefundNotifications();
    }
  }, [activeTab]);

  const loadRefundNotifications = async () => {
    setNotifLoading(true);
    try {
      const apiUrl = getApiUrl();
      const token = getToken();

      const res = await fetch(`${apiUrl}/api/v1/orders/?status=CANCELED`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      let orders: any[] = [];
      if (res.ok) {
        const data = await res.json();
        orders = Array.isArray(data) ? data : data.value || data.items || [];
      }

      const resCompleted = await fetch(`${apiUrl}/api/v1/orders/?status=COMPLETED`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resCompleted.ok) {
        const data = await resCompleted.json();
        const completedOrders = Array.isArray(data)
          ? data
          : data.value || data.items || [];
        orders = [...orders, ...completedOrders];
      }

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
          // skip
        }
      }

      ordersWithRefunds.sort((a, b) => {
        const aTime = new Date(a.refunds[0]?.created_at || 0).getTime();
        const bTime = new Date(b.refunds[0]?.created_at || 0).getTime();
        return bTime - aTime;
      });

      setNotifications(ordersWithRefunds);
      if (ordersWithRefunds.length > 0) {
        setSelectedNotification(ordersWithRefunds[0]);
      }

      // Mark as seen — save current timestamp
      localStorage.setItem("notif_last_seen", String(Date.now()));
      setSystemNotifCount(0);
      // Notify Header to clear badge
      window.dispatchEvent(new Event("notif-read"));
    } catch (error) {
      console.error("Failed to load refund notifications:", error);
    } finally {
      setNotifLoading(false);
    }
  };

  // ── Compute unseen notification count for sidebar badge ──
  useEffect(() => {
    if (activeTab === "personal") {
      // Compute in background for sidebar badge
      computeUnseenCount();
    }
  }, [threads]); // re-run when chat data loads (indicates page is ready)

  const computeUnseenCount = async () => {
    try {
      const apiUrl = getApiUrl();
      const token = getToken();
      const lastSeen = localStorage.getItem("notif_last_seen") || "0";

      const res = await fetch(`${apiUrl}/api/v1/orders/?status=CANCELED`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      const orders = Array.isArray(data) ? data : data.value || data.items || [];

      let count = 0;
      for (const order of orders) {
        const oid = order.order_id || order.id;
        try {
          const refundData = await getRefundsForOrder(oid);
          if (refundData.refunds) {
            for (const r of refundData.refunds) {
              if (new Date(r.created_at).getTime() > Number(lastSeen)) {
                count++;
              }
            }
          }
        } catch {
          // skip
        }
      }
      setSystemNotifCount(count);
    } catch {
      // silent
    }
  };

  // ── WebSocket ──
  useEffect(() => {
    if (!currentUser) return;
    const token = localStorage.getItem("access_token");
    const ws = new WebSocket(`${WS_URL}/api/v1/messages/ws?token=${token}`);

    ws.onopen = () => console.log("WebSocket connected");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "message") {
          const currentSelected = selectedThreadRef.current;
          const isMessageForSelectedThread =
            !!currentSelected &&
            (data.data.sender_email === currentSelected.user.email ||
              data.data.receiver_email === currentSelected.user.email);

          setThreads((prevThreads) => {
            const newMessage: Message = {
              id: data.data.message_id,
              content: data.data.content,
              sender_email: data.data.sender_email,
              receiver_email: data.data.receiver_email,
              timestamp: data.data.timestamp,
              read: false,
              imageUrl: data.data.image_url,
            };

            const otherParticipantEmail =
              data.data.sender_email === currentUser?.email
                ? data.data.receiver_email
                : data.data.sender_email;

            const threadIndex = prevThreads.findIndex(
              (t) => t.user.email === otherParticipantEmail
            );

            if (threadIndex === -1) return prevThreads;

            const updatedThreads = [...prevThreads];
            const thread = updatedThreads[threadIndex];

            updatedThreads[threadIndex] = {
              ...thread,
              messages: [...(thread.messages || []), newMessage],
              lastMessage: newMessage,
              unreadCount:
                currentUser.email === data.data.receiver_email &&
                !isMessageForSelectedThread
                  ? thread.unreadCount + 1
                  : thread.unreadCount,
            };

            updatedThreads.sort(
              (a, b) =>
                new Date(b.lastMessage.timestamp).getTime() -
                new Date(a.lastMessage.timestamp).getTime()
            );
            return updatedThreads;
          });

          if (isMessageForSelectedThread) {
            setSelectedThread((prev) => {
              if (!prev) return null;
              const newMessage: Message = {
                id: data.data.message_id,
                content: data.data.content,
                sender_email: data.data.sender_email,
                receiver_email: data.data.receiver_email,
                timestamp: data.data.timestamp,
                read: true,
                imageUrl: data.data.image_url,
              };
              return {
                ...prev,
                messages: [...(prev.messages || []), newMessage],
                lastMessage: newMessage,
                unreadCount: 0,
              };
            });
            markConversationAsRead(data.data.sender_email);
          }
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      ws.close();
    };
    ws.onclose = () => console.log("WebSocket disconnected");

    wsRef.current = ws;
    return () => ws.close();
  }, [currentUser]);

  // ── Chat handlers ──
  const handleThreadSelect = async (thread: ChatThread) => {
    setSelectedThread(thread);
    try {
      const messageHistory = await getConversation(thread.user.email);
      setSelectedThread({ ...thread, messages: messageHistory });

      if (thread.unreadCount > 0) {
        await markConversationAsRead(thread.user.email);
        setThreads((prev) =>
          prev.map((t) =>
            t.user.email === thread.user.email ? { ...t, unreadCount: 0 } : t
          )
        );
      }
    } catch (error) {
      console.error("Error marking conversation as read:", error);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!selectedThread || !currentUser) return;
    try {
      const response = await sendMessageWithImage(
        selectedThread.user.email,
        messageInput,
        file
      );
      const newMessage: Message = {
        id: response.message_id,
        content: messageInput || "",
        sender_email: currentUser.email,
        receiver_email: selectedThread.user.email,
        timestamp: response.timestamp,
        read: false,
        imageUrl: response.image_url,
      };

      setSelectedThread((prev) => {
        if (!prev) return null;
        return { ...prev, messages: [...prev.messages, newMessage], lastMessage: newMessage };
      });

      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.user.email === selectedThread.user.email
            ? { ...t, lastMessage: newMessage, unreadCount: t.unreadCount }
            : t
        );
        updated.sort(
          (a, b) =>
            new Date(b.lastMessage.timestamp).getTime() -
            new Date(a.lastMessage.timestamp).getTime()
        );
        return updated;
      });
      setMessageInput("");
    } catch (error) {
      console.error("Error uploading file:", error);
      alert("Failed to send image. Please try again.");
    }
  };

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedThread || !currentUser) return;
    try {
      const response = await sendMessage(selectedThread.user.email, messageInput);
      const newMessage: Message = {
        id: response.message_id,
        content: messageInput,
        sender_email: currentUser.email,
        receiver_email: selectedThread.user.email,
        timestamp: response.timestamp,
        read: false,
      };

      setSelectedThread((prev) => {
        if (!prev) return null;
        return { ...prev, messages: [...prev.messages, newMessage], lastMessage: newMessage };
      });

      setThreads((prev) => {
        const updated = prev.map((t) =>
          t.user.email === selectedThread.user.email
            ? { ...t, lastMessage: newMessage, unreadCount: t.unreadCount }
            : t
        );
        updated.sort(
          (a, b) =>
            new Date(b.lastMessage.timestamp).getTime() -
            new Date(a.lastMessage.timestamp).getTime()
        );
        return updated;
      });
      setMessageInput("");
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Failed to send message. Please try again.");
    }
  };

  // ── Tab switch handler ──
  const switchTab = (tab: ViewTab) => {
    setActiveTab(tab);
    // Update URL without full reload
    const url = tab === "system" ? "/message?tab=system" : "/message";
    window.history.replaceState(null, "", url);
  };

  // ── Notification helpers ──
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
    return (
      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
    );
  };

  const getNotificationTitle = (item: OrderWithRefunds) => {
    const r = item.refunds[0];
    if (r.status === "succeeded" || r.status === "refunded") return "Refund Completed";
    if (r.status === "failed") return "Refund Failed";
    return "Refund Processing";
  };

  const getNotificationMessage = (item: OrderWithRefunds) => {
    const r = item.refunds[0];
    const amount = (r.amount / 100).toFixed(2);
    if (r.status === "succeeded" || r.status === "refunded")
      return `Refund of $${amount} completed successfully to your original payment.`;
    if (r.status === "failed")
      return `Refund of $${amount} failed. Please contact support.`;
    return `Your refund of $${amount} is being processed by our system.`;
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">Loading...</div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="flex h-[calc(100vh-4rem)] bg-white">
      {/* ── Sidebar ── */}
      <aside className="w-56 bg-gray-100 p-5 space-y-5 shrink-0 border-r border-gray-200">
        <h2 className="text-2xl font-bold tracking-tight px-2">Inbox</h2>
        <nav className="space-y-1">
          {/* Personal Chats */}
          <button
            onClick={() => switchTab("personal")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${
              activeTab === "personal"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:bg-white/50"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            Personal Chats
          </button>

          {/* System Notifications */}
          <button
            onClick={() => switchTab("system")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-semibold text-sm whitespace-nowrap transition-all ${
              activeTab === "system"
                ? "bg-white text-orange-600 shadow-sm font-bold"
                : "text-orange-600 hover:bg-white/50 font-medium"
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            System Notifications
            {systemNotifCount > 0 && (
              <span className="ml-auto bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                {systemNotifCount}
              </span>
            )}
          </button>
        </nav>
      </aside>

      {/* ══ Personal Chat View ══ */}
      {activeTab === "personal" && (
        <>
          {/* Chat List */}
          <div className="w-80 border-r border-gray-200 bg-white shrink-0">
            <div className="p-5.5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-5rem)]">
              {threads.map((thread) => (
                <Card
                  key={thread.id || `thread-${thread.user.email}`}
                  className={`m-2 cursor-pointer transition-colors ${
                    selectedThread?.user.email === thread.user.email
                      ? "bg-gray-100 ring-2 ring-gray-300 ring-offset-1"
                      : "hover:bg-gray-50"
                  }`}
                  onClick={() => handleThreadSelect(thread)}
                >
                  <div className="p-4 flex items-start gap-3">
                    <Avatar user={thread.user} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-medium text-gray-900 truncate">
                          {thread.user.name}
                        </h3>
                        <span className="text-xs text-gray-500">
                          {new Date(thread.lastMessage.timestamp + "Z").toLocaleDateString("en-AU", {
                            timeZone: "Australia/Perth",
                          })}
                        </span>
                      </div>
                      {thread.lastMessage.bookTitle && (
                        <p className="text-xs text-blue-600 mb-1">
                          &lt;&lt; {thread.lastMessage.bookTitle} &gt;&gt;
                        </p>
                      )}
                      <p className="text-sm text-gray-600 truncate">
                        {thread.lastMessage.content}
                      </p>
                    </div>
                    {thread.unreadCount > 0 && (
                      <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs">
                        {thread.unreadCount}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col bg-white">
            {selectedThread ? (
              <>
                <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                  <Avatar user={selectedThread.user} size={40} />
                  <div>
                    <h3 className="font-medium text-gray-900">
                      {selectedThread.user.name}
                    </h3>
                    {selectedThread.lastMessage.bookTitle && selectedThread.lastMessage.bookId && (
                      <Link
                        href={`/books/${selectedThread.lastMessage.bookId}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        &lt;&lt; {selectedThread.lastMessage.bookTitle} &gt;&gt;
                      </Link>
                    )}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {selectedThread.messages?.map((msg) => {
                    const isOwn = msg.sender_email === currentUser?.email;
                    const displayName = isOwn
                      ? currentUser?.name || "You"
                      : selectedThread.user.name;
                    return (
                      <div
                        key={msg.id}
                        className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-xs px-4 py-2 rounded-2xl text-sm break-words ${
                            isOwn
                              ? "bg-black text-white rounded-br-none"
                              : "bg-gray-200 text-gray-900 rounded-bl-none"
                          }`}
                        >
                          <div className="text-xs font-semibold mb-1">{displayName}</div>
                          {msg.content && (
                            <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          )}
                          {msg.imageUrl && (
                            <img
                              src={`${API_URL}${msg.imageUrl}`}
                              alt="Message attachment"
                              className="max-w-full rounded-lg mt-2"
                              style={{ maxHeight: "200px" }}
                            />
                          )}
                          <div className="text-xs text-gray-400 mt-1">
                            {formatPerthTime(msg.timestamp)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="p-4 border-t border-gray-200">
                  <div className="flex gap-2 items-center">
                    <label className="w-10 h-10 flex items-center justify-center bg-black text-white rounded-md cursor-pointer hover:bg-gray-800 transition">
                      +
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              alert("File size must be less than 5MB");
                              return;
                            }
                            handleFileUpload(file);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <Input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder="Type your message..."
                      className="flex-1"
                    />
                    <button
                      className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 transition"
                      onClick={handleSendMessage}
                      disabled={!messageInput.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500">
                Select a conversation to start messaging
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ System Notifications View ══ */}
      {activeTab === "system" && (
        <>
          {/* Notification List */}
          <section className="w-96 bg-white border-r border-gray-200 flex flex-col shrink-0">
            <div className="p-6 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                Recent Activity
              </span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
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
                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                              System
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {formatTimeAgo(latestRefund.created_at)}
                            </span>
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
                              <span className="text-[10px] font-bold text-amber-700">
                                Pending Authorization
                              </span>
                            </div>
                          )}
                          {(latestRefund.status === "succeeded" ||
                            latestRefund.status === "refunded") && (
                            <div className="mt-2 flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-green-500" />
                              <span className="text-[10px] font-bold text-green-700">
                                Funds Released
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Auto-cancel entries */}
              {notifications
                .filter((n) => n.status === "CANCELED")
                .map((item) => (
                  <div
                    key={`cancel-${item.orderId}`}
                    className="p-5 border-b border-gray-100 opacity-70"
                  >
                    <div className="flex gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                            System
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {item.canceledAt ? formatTimeAgo(item.canceledAt) : ""}
                          </span>
                        </div>
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          Order auto-cancelled
                        </h3>
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
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div>
                        <h1 className="font-bold text-xl leading-tight">System Message</h1>
                        <p className="text-xs text-gray-400">
                          Order: {selectedNotification.orderId.slice(0, 16)}...
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${
                        selectedNotification.refunds[0].status === "succeeded" ||
                        selectedNotification.refunds[0].status === "refunded"
                          ? "bg-green-100 text-green-800"
                          : selectedNotification.refunds[0].status === "failed"
                          ? "bg-red-100 text-red-800"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {selectedNotification.refunds[0].status === "succeeded" ||
                      selectedNotification.refunds[0].status === "refunded"
                        ? "Completed"
                        : selectedNotification.refunds[0].status === "failed"
                        ? "Failed"
                        : "Processing"}
                    </span>
                  </div>

                  <div className="space-y-6">
                    <div
                      className={`p-6 rounded-xl border-l-4 ${
                        selectedNotification.refunds[0].status === "failed"
                          ? "bg-red-50 border-red-500"
                          : "bg-gray-50 border-orange-500"
                      }`}
                    >
                      <p className="text-sm leading-relaxed text-gray-700 font-medium">
                        {getNotificationMessage(selectedNotification)}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Timeline
                      </h4>
                      <div className="relative pl-6 space-y-6 before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[2px] before:bg-gray-200">
                        {selectedNotification.refunds.map((refund) => (
                          <div key={refund.refund_id} className="relative">
                            <div
                              className={`absolute -left-[27px] top-1 w-3 h-3 rounded-full ring-4 ring-white ${
                                refund.status === "succeeded" || refund.status === "refunded"
                                  ? "bg-green-500"
                                  : refund.status === "failed"
                                  ? "bg-red-500"
                                  : "bg-orange-500"
                              }`}
                            />
                            <p className="text-xs font-bold text-gray-900">
                              {refund.status === "succeeded" || refund.status === "refunded"
                                ? "Refund Completed"
                                : refund.status === "failed"
                                ? "Refund Failed"
                                : "Refund Initiated"}
                              {" - "}${(refund.amount / 100).toFixed(2)}{" "}
                              {refund.currency.toUpperCase()}
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

                    <div className="pt-8 flex flex-col gap-3">
                      <button
                        onClick={() =>
                          router.push(`/borrowing/${selectedNotification.orderId}`)
                        }
                        className="w-full py-4 bg-black text-white font-bold rounded-xl text-sm transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        View Order Details
                      </button>
                      <button
                        onClick={() =>
                          router.push(
                            `/complain?orderId=${selectedNotification.orderId}`
                          )
                        }
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
        </>
      )}
    </div>
  );
}
