"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, Search, ShieldCheck, ShieldPlus, ShieldX, UserRoundSearch } from "lucide-react";
import {
  createBan,
  getApiUrl,
  getCurrentUser,
  getToken,
  listBans,
  unban,
  type BanItem,
} from "@/utils/auth";
import { formatLocalDateTime } from "@/utils/datetime";

type LookupResult = {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
};

type SearchResult = {
  user_id: string;
  name: string;
  email: string;
  is_admin?: boolean;
};

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

export default function AdminUsersPage() {
  const [meAdmin, setMeAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [permissionLoadingId, setPermissionLoadingId] = useState<string | null>(null);

  const API_URL = getApiUrl();

  const activeBans = useMemo(() => bans.filter((b) => b.is_active), [bans]);

  const loadBans = async () => {
    try {
      const data = await listBans();
      setBans(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to load bans:", error);
      setBans([]);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        setMeAdmin(isAdminLikeUser(me));
      } finally {
        setLoading(false);
      }
      await loadBans();
    })();
  }, []);

  const searchUsers = async (query: string, showNoResults = false) => {
    setLookupError(null);
    setSuccessMessage(null);

    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    try {
      setSearchLoading(true);
      const token = getToken();
      if (!token) {
        setLookupError("No access token found. Please log in as admin.");
        return;
      }

      const res = await fetch(
        `${API_URL}/api/v1/analytics/search-users?q=${encodeURIComponent(trimmedQuery)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        setLookupError("Failed to search users.");
        return;
      }

      const users = await res.json();
      const results = Array.isArray(users) ? users : [];
      setSearchResults(results);
      setDropdownOpen(true);
      if (results.length === 0 && showNoResults) {
        setLookupError("No users found.");
        return;
      }
    } catch (error) {
      console.error("Lookup failed:", error);
      setLookupError("Failed to search users.");
    } finally {
      setSearchLoading(false);
    }
  };

  useEffect(() => {
    const query = lookupId.trim();
    if (lookupResult && query === `${lookupResult.name} (${lookupResult.email})`) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    if (query.length < 2) {
      setSearchResults([]);
      setDropdownOpen(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      searchUsers(query);
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [lookupId]);

  const handleLookup = async () => {
    setLookupResult(null);
    setSearchResults([]);
    setSuccessMessage(null);

    const query = lookupId.trim();
    if (!query) {
      setLookupError("Please enter a name, email, or user ID.");
      return;
    }

    await searchUsers(query, true);
  };

  const selectUser = (user: SearchResult) => {
    setLookupResult({
      id: user.user_id,
      name: user.name || "Unknown",
      email: user.email,
      isAdmin: Boolean(user.is_admin),
    });
    setLookupId(`${user.name || "Unknown"} (${user.email})`);
    setDropdownOpen(false);
    setSearchResults([]);
    setLookupError(null);
    setBanReason("");
  };

  const selectedSearchUser: SearchResult | null = lookupResult
    ? {
        user_id: lookupResult.id,
        name: lookupResult.name,
        email: lookupResult.email,
        is_admin: lookupResult.isAdmin,
      }
    : null;

  const handleAdminPermission = async (user: SearchResult, makeAdmin: boolean) => {
    const action = makeAdmin ? "make this user an admin" : "remove admin access from this user";
    if (!confirm(`Are you sure you want to ${action}?`)) return;

    try {
      setPermissionLoadingId(user.user_id);
      setLookupError(null);
      setSuccessMessage(null);

      const token = getToken();
      if (!token) {
        setLookupError("No access token found. Please log in as admin.");
        return;
      }

      const res = await fetch(
        `${API_URL}/api/v1/analytics/users/${user.user_id}/admin-status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_admin: makeAdmin }),
        }
      );

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        setLookupError(result.detail || "Failed to update admin permission.");
        return;
      }

      setSearchResults((items) =>
        items.map((item) =>
          item.user_id === user.user_id ? { ...item, is_admin: makeAdmin } : item
        )
      );

      setLookupResult((current) =>
        current?.id === user.user_id ? { ...current, isAdmin: makeAdmin } : current
      );

      setSuccessMessage(`${user.name || user.email} is now ${makeAdmin ? "an admin" : "a standard user"}.`);
    } catch (error) {
      console.error("Admin permission update failed:", error);
      setLookupError("Failed to update admin permission.");
    } finally {
      setPermissionLoadingId(null);
    }
  };

  const handleCreateBan = async () => {
    if (!lookupResult) return;
    if (!banReason.trim()) {
      alert("Please enter a ban reason.");
      return;
    }

    try {
      setSubmitting(true);
      await createBan(lookupResult.id, banReason.trim());
      setBanReason("");
      await loadBans();
      alert("User has been banned successfully.");
    } catch (error: any) {
      console.error("Create ban failed:", error);
      alert(error?.response?.data?.detail || "Failed to ban user.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnban = async (banId: string) => {
    if (!confirm("Remove this ban?")) return;
    try {
      setSubmitting(true);
      await unban(banId);
      await loadBans();
    } catch (error: any) {
      console.error("Unban failed:", error);
      alert(error?.response?.data?.detail || "Failed to unban user.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-6">Loading admin users panel...</div>;
  }

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Users</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-gray-600">Manage user bans and moderation actions.</p>
        </div>
        <Link href="/admin" className="text-sm underline">
          Back to Dashboard
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserRoundSearch className="w-5 h-5" />
          Search Users
        </h2>
        <p className="text-sm text-gray-600">
          Find a user, update admin access, or select them for moderation actions.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              value={lookupId}
              onChange={(e) => {
                setLookupId(e.target.value);
                setLookupResult(null);
              }}
              onFocus={() => {
                if (!lookupResult && searchResults.length > 0) setDropdownOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLookup();
                if (e.key === "Escape") setDropdownOpen(false);
              }}
              placeholder="Type at least 2 letters to search users..."
              className="w-full border rounded-md px-3 py-2"
              autoComplete="off"
            />
            {dropdownOpen && !lookupResult && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg">
                {searchLoading ? (
                  <div className="px-4 py-3 text-sm text-gray-500">Searching users...</div>
                ) : searchResults.length > 0 ? (
                  <div className="max-h-72 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.user_id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectUser(user)}
                        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span>
                          <span className="block font-medium text-gray-900">
                            {user.name || "Unknown"}
                          </span>
                          <span className="block text-xs text-gray-500">{user.email}</span>
                          <span className="block text-xs text-gray-400">{user.user_id}</span>
                        </span>
                        {user.is_admin ? (
                          <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            Admin
                          </span>
                        ) : (
                          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                            User
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 text-sm text-gray-500">No users found.</div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleLookup}
            disabled={searchLoading}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-black text-white disabled:opacity-60"
          >
            <Search className="w-4 h-4" />
            {searchLoading ? "Searching..." : "Search"}
          </button>
        </div>
        {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}
        {successMessage && <p className="text-sm text-green-700">{successMessage}</p>}

        {lookupResult && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="text-sm">
                <p><span className="font-medium">Name:</span> {lookupResult.name}</p>
                <p><span className="font-medium">Email:</span> {lookupResult.email}</p>
                <p><span className="font-medium">User ID:</span> {lookupResult.id}</p>
                <p>
                  <span className="font-medium">Role:</span>{" "}
                  {lookupResult.isAdmin ? "Admin" : "User"}
                </p>
              </div>
              {selectedSearchUser && (
                <button
                  type="button"
                  onClick={() => handleAdminPermission(selectedSearchUser, !selectedSearchUser.is_admin)}
                  disabled={permissionLoadingId === selectedSearchUser.user_id}
                  className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-2 disabled:opacity-60 ${
                    selectedSearchUser.is_admin
                      ? "border border-red-200 text-red-700 hover:bg-red-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {selectedSearchUser.is_admin ? (
                    <>
                      <ShieldX className="w-4 h-4" />
                      Remove Admin
                    </>
                  ) : (
                    <>
                      <ShieldPlus className="w-4 h-4" />
                      Make Admin
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="Ban reason..."
                className="flex-1 border rounded-md px-3 py-2"
              />
              <button
                onClick={handleCreateBan}
                disabled={submitting}
                className="px-4 py-2 rounded-md bg-red-600 text-white disabled:opacity-60"
              >
                <span className="inline-flex items-center gap-1">
                  <Ban className="w-4 h-4" />
                  Ban User
                </span>
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold">Active Bans ({activeBans.length})</h2>
        {activeBans.length === 0 ? (
          <p className="text-gray-500 text-sm">No active bans.</p>
        ) : (
          <div className="space-y-2">
            {activeBans.map((item) => (
              <div key={item.ban_id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p><span className="font-medium">User:</span> {item.user_id}</p>
                  <p><span className="font-medium">Reason:</span> {item.reason}</p>
                  <p className="text-gray-500">Banned at: {formatLocalDateTime(item.banned_at)}</p>
                </div>
                <button
                  onClick={() => handleUnban(item.ban_id)}
                  disabled={submitting}
                  className="px-3 py-2 rounded-md border hover:bg-gray-50 disabled:opacity-60"
                >
                  <span className="inline-flex items-center gap-1">
                    <ShieldX className="w-4 h-4" />
                    Unban
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-white p-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" />
          Related Admin Actions
        </h2>
        <div className="mt-2">
          <Link href="/admin/complaints" className="text-sm underline">
            Go to complaint approvals and resolutions
          </Link>
        </div>
      </section>
    </div>
  );
}
