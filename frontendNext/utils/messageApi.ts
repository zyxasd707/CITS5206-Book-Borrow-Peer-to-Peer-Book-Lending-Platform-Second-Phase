import axios from 'axios';
import { getToken, getApiUrl } from "./auth";
import type { Message, ChatThread } from '../app/types/message';

const API_URL = getApiUrl();

// Get user details by email
export async function getUserByEmail(email: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/users/by-email/${email}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch user details by email");
  }
  return res.json();
}

// Get all conversations
export async function getConversations() {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/conversations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    if (res.status === 404) return []; // No conversations
    throw new Error("Failed to fetch conversations");
  }
  
  return res.json();
}

// Get conversation with specific user
export async function getConversation(otherUserEmail: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/conversation/${otherUserEmail}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to fetch conversation");
  }
  const data = await res.json();
  // Map backend field names (snake_case) to frontend Message type (camelCase)
  return data.map((m: any) => ({
    id: m.message_id,
    sender_email: m.sender_email,
    receiver_email: m.receiver_email,
    content: m.content,
    timestamp: m.timestamp,
    read: m.is_read,
    imageUrl: m.image_url,
  }));
}

// Send a text message
export async function sendMessage(receiverEmail: string, content: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
    body: JSON.stringify({
      receiver_email: receiverEmail,
      content: content
    })
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(`Failed to send message: ${JSON.stringify(error)}`);
  }

  return res.json();
}

// Mark conversation as read
export async function markConversationAsRead(otherUserEmail: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/mark-conversation-read/${otherUserEmail}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to mark conversation as read");
  }
  return res.json();
}

// Get unread count for specific sender
export async function getUnreadCount(otherUserEmail: string) {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/v1/messages/unread-count/${otherUserEmail}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Failed to get unread count");
  }
  const data = await res.json();
  return data.unread_count;
}

// Send a message with an image attachment
export async function sendMessageWithImage(receiverEmail: string, content: string | null, file: File) {
  try {
    const token = getToken();
    const formData = new FormData();
    formData.append('receiver_email', receiverEmail);
    if (content) {
      formData.append('content', content);
    }
    formData.append('file', file);

    const res = await fetch(`${API_URL}/api/v1/messages/send-with-image`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Failed to send message with image");
    }
    return res.json();
  } catch (err: any) {
    console.error("Send message with image failed:", err);
    throw new Error("Failed to send message with image");
  }
}