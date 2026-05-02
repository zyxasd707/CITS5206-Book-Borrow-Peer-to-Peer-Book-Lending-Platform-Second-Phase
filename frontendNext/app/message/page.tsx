"use client";

import Link from "next/link";
import { useState, useEffect, useRef, type ReactNode } from "react";
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
import { formatLocalDateTime } from "@/utils/datetime";

const API_URL = getApiUrl();
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// ── Types ──────────────────────────────────────────────────────
interface SystemNotification {
  id: string;
  order_id: string | null;
  type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
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

const NOTIF_ICON_MAP: Record<string, { bg: string; color: string; icon: ReactNode }> = {
  PAYMENT_CONFIRMED: {
    bg: "bg-green-100", color: "text-green-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  },
  SHIPMENT_SENT: {
    bg: "bg-blue-100", color: "text-blue-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  },
  BORROWING: {
    bg: "bg-indigo-100", color: "text-indigo-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>,
  },
  OVERDUE: {
    bg: "bg-red-100", color: "text-red-600",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  },
  RETURNED: {
    bg: "bg-purple-100", color: "text-purple-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>,
  },
  COMPLETED: {
    bg: "bg-green-100", color: "text-green-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>,
  },
  CANCELED: {
    bg: "bg-gray-200", color: "text-gray-600",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  },
  REFUND: {
    bg: "bg-amber-100", color: "text-amber-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
  },
  DEPOSIT_UPDATED: {
    bg: "bg-orange-100", color: "text-orange-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>,
  },
  DEPOSIT_EVIDENCE_RECEIVED: {
    bg: "bg-blue-100", color: "text-blue-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  },
  USER_RESTRICTED: {
    bg: "bg-red-100", color: "text-red-700",
    icon: <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
  },
};

const getNotifIcon = (type: string) => {
  const config = NOTIF_ICON_MAP[type] || NOTIF_ICON_MAP.COMPLETED;
  return (
    <div className={`w-10 h-10 rounded-full ${config.bg} flex items-center justify-center shrink-0 ${config.color}`}>
      {config.icon}
    </div>
  );
};

const getStatusBadge = (type: string) => {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    PAYMENT_CONFIRMED: { bg: "bg-green-100", text: "text-green-800", label: "Payment" },
    SHIPMENT_SENT: { bg: "bg-blue-100", text: "text-blue-800", label: "Shipped" },
    BORROWING: { bg: "bg-indigo-100", text: "text-indigo-800", label: "Borrowing" },
    OVERDUE: { bg: "bg-red-100", text: "text-red-800", label: "Overdue" },
    RETURNED: { bg: "bg-purple-100", text: "text-purple-800", label: "Returned" },
    COMPLETED: { bg: "bg-green-100", text: "text-green-800", label: "Completed" },
    CANCELED: { bg: "bg-gray-100", text: "text-gray-800", label: "Cancelled" },
    REFUND: { bg: "bg-amber-100", text: "text-amber-800", label: "Refund" },
    DEPOSIT_UPDATED: { bg: "bg-orange-100", text: "text-orange-800", label: "Deposit" },
    DEPOSIT_EVIDENCE_RECEIVED: { bg: "bg-blue-100", text: "text-blue-800", label: "Evidence" },
    USER_RESTRICTED: { bg: "bg-red-100", text: "text-red-800", label: "Restricted" },
  };
  const config = map[type] || { bg: "bg-gray-100", text: "text-gray-800", label: type };
  return (
    <span className={`text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider ${config.bg} ${config.text}`}>
      {config.label}
    </span>
  );
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
  const [personalMobileView, setPersonalMobileView] = useState<"threads" | "chat">("threads");
  const wsRef = useRef<WebSocket | null>(null);
  const selectedThreadRef = useRef<ChatThread | null>(null);

  // ── System Notifications state ──
  const [notifications, setNotifications] = useState<SystemNotification[]>([]);
  const [selectedNotification, setSelectedNotification] = useState<SystemNotification | null>(null);
  const [notifLoading, setNotifLoading] = useState(false);
  const [systemNotifCount, setSystemNotifCount] = useState(0);
  const [systemMobileView, setSystemMobileView] = useState<"list" | "detail">("list");

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
      loadSystemNotifications();
    }
  }, [activeTab]);

  const loadSystemNotifications = async () => {
    setNotifLoading(true);
    try {
      const apiUrl = getApiUrl();
      const token = getToken();

      const res = await fetch(`${apiUrl}/api/v1/notifications/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to load notifications");

      const data: SystemNotification[] = await res.json();
      setNotifications(data);
      if (data.length > 0) {
        setSelectedNotification(data[0]);
      }

      // Mark all as read
      await fetch(`${apiUrl}/api/v1/notifications/mark-all-read`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}` },
      });

      setSystemNotifCount(0);
      window.dispatchEvent(new Event("notif-read"));
    } catch (error) {
      console.error("Failed to load system notifications:", error);
    } finally {
      setNotifLoading(false);
    }
  };

  // ── Compute unseen notification count for sidebar badge ──
  useEffect(() => {
    if (activeTab === "personal") {
      computeUnseenCount();
    }
  }, [threads]);

  const computeUnseenCount = async () => {
    try {
      const apiUrl = getApiUrl();
      const token = getToken();
      const res = await fetch(`${apiUrl}/api/v1/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setSystemNotifCount(data.unread_count || 0);
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
    setPersonalMobileView("chat");
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
    if (tab === "personal") {
      setPersonalMobileView("threads");
    } else {
      setSystemMobileView("list");
    }
    const url = tab === "system" ? "/message?tab=system" : "/message";
    window.history.replaceState(null, "", url);
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
    <div className="flex h-[calc(100vh-4rem)] flex-col md:flex-row bg-white">
      {/* Mobile top navigation */}
      <div className="md:hidden border-b border-gray-200 p-2 bg-gray-50">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => switchTab("personal")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === "personal" ? "bg-white text-gray-900 border border-gray-200" : "text-gray-600"
            }`}
          >
            Personal
          </button>
          <button
            onClick={() => switchTab("system")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              activeTab === "system"
                ? "bg-white text-orange-600 border border-orange-200"
                : "text-orange-600"
            }`}
          >
            System
            {systemNotifCount > 0 && (
              <span className="ml-2 inline-flex rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">
                {systemNotifCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Sidebar ── */}
      <aside className="hidden md:block w-56 bg-gray-100 p-5 space-y-5 shrink-0 border-r border-gray-200">
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
          <div
            className={`w-full md:w-80 border-r border-gray-200 bg-white shrink-0 ${
              personalMobileView === "threads" ? "block" : "hidden md:block"
            }`}
          >
            <div className="p-5 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Messages</h2>
            </div>
            <div className="overflow-y-auto h-[calc(100vh-9rem)] md:h-[calc(100vh-5rem)]">
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
          <div
            className={`flex-1 flex-col bg-white ${
              personalMobileView === "chat" ? "flex" : "hidden md:flex"
            }`}
          >
            {selectedThread ? (
              <>
                <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                  <button
                    type="button"
                    className="md:hidden rounded border border-gray-200 px-2 py-1 text-sm"
                    onClick={() => setPersonalMobileView("threads")}
                  >
                    Back
                  </button>
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
                  {selectedThread.messages?.map((msg, index) => {
                    const isOwn = msg.sender_email === currentUser?.email;
                    const displayName = isOwn
                      ? currentUser?.name || "You"
                      : selectedThread.user.name;
                    const messageKey = [
                      msg.id || "message",
                      msg.sender_email,
                      msg.receiver_email,
                      msg.timestamp,
                      index,
                    ].join("-");
                    return (
                      <div
                        key={messageKey}
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
          <section
            className={`w-full md:w-96 bg-white border-r border-gray-200 flex-col shrink-0 ${
              systemMobileView === "list" ? "flex" : "hidden md:flex"
            }`}
          >
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
                  No system notifications yet
                </div>
              ) : (
                notifications.map((item) => {
                  const isSelected = selectedNotification?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedNotification(item);
                        setSystemMobileView("detail");
                      }}
                      className={`relative p-5 border-b border-gray-100 cursor-pointer transition-colors ${
                        isSelected ? "bg-gray-50" : "hover:bg-gray-50"
                      } ${!item.is_read ? "bg-white" : "opacity-80"}`}
                    >
                      {!item.is_read && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
                      )}
                      <div className="flex gap-3">
                        {getNotifIcon(item.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">
                              System
                            </span>
                            <span className="text-[10px] text-gray-400">
                              {item.created_at ? formatTimeAgo(item.created_at) : ""}
                            </span>
                          </div>
                          <h3 className="text-sm font-semibold text-gray-900 truncate">
                            {item.title}
                          </h3>
                          <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                            {item.message}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Detail View */}
          <section
            className={`flex-1 bg-gray-100 overflow-y-auto ${
              systemMobileView === "detail" ? "block" : "hidden md:block"
            }`}
          >
            {selectedNotification ? (
              <div className="p-12 max-w-2xl mx-auto w-full">
                <div className="bg-white p-10 rounded-2xl shadow-sm">
                  <button
                    type="button"
                    className="md:hidden mb-4 rounded border border-gray-200 px-3 py-1 text-sm"
                    onClick={() => setSystemMobileView("list")}
                  >
                    Back to notifications
                  </button>
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-black text-white flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div>
                        <h1 className="font-bold text-xl leading-tight">System Message</h1>
                        {selectedNotification.order_id && (
                          <p className="text-xs text-gray-400">
                            Order: {selectedNotification.order_id.slice(0, 16)}...
                          </p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(selectedNotification.type)}
                  </div>

                  <div className="space-y-6">
                    <div className="p-6 rounded-xl border-l-4 bg-gray-50 border-orange-500">
                      <h3 className="text-base font-bold text-gray-900 mb-2">
                        {selectedNotification.title}
                      </h3>
                      <p className="text-sm leading-relaxed text-gray-700">
                        {selectedNotification.message}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        Details
                      </h4>
                      <div className="text-sm text-gray-600 space-y-1">
                        <p>
                          <span className="font-medium text-gray-900">Type:</span>{" "}
                          {selectedNotification.type.replace(/_/g, " ")}
                        </p>
                        <p>
                          <span className="font-medium text-gray-900">Time:</span>{" "}
                          {formatLocalDateTime(selectedNotification.created_at, "N/A")}
                        </p>
                      </div>
                    </div>

                    {selectedNotification.order_id && (
                      <div className="pt-8 flex flex-col gap-3">
                        <button
                          onClick={() =>
                            router.push(`/borrowing/${selectedNotification.order_id}`)
                          }
                          className="w-full py-4 bg-black text-white font-bold rounded-xl text-sm transition-transform hover:scale-[1.02] active:scale-95"
                        >
                          View Order Details
                        </button>
                        <button
                          onClick={() =>
                            router.push(
                              `/complain?orderId=${selectedNotification.order_id}`
                            )
                          }
                          className="w-full py-4 bg-gray-200 text-gray-900 font-bold rounded-xl text-sm hover:bg-gray-300 transition-colors"
                        >
                          Contact Support
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center h-full text-gray-400">
                {notifications.length === 0
                  ? "No system notifications to display"
                  : "Select a notification to view details"}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
