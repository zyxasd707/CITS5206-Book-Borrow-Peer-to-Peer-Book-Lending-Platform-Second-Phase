"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Ban, ShieldCheck, ShieldX, UserRoundSearch } from "lucide-react";
import { createBan, getCurrentUser, getUserById, listBans, unban, type BanItem } from "@/utils/auth";

type LookupResult = {
  id: string;
  name: string;
  email: string;
  isAdmin?: boolean;
};

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

export default function AdminUsersPage() {
  const [meAdmin, setMeAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [bans, setBans] = useState<BanItem[]>([]);
  const [lookupId, setLookupId] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [banReason, setBanReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  const handleLookup = async () => {
    setLookupError(null);
    setLookupResult(null);

    const userId = lookupId.trim();
    if (!userId) {
      setLookupError("Please enter a user ID.");
      return;
    }

    try {
      const user = await getUserById(userId);
      if (!user) {
        setLookupError("User not found.");
        return;
      }
      setLookupResult({
        id: user.id,
        name: user.name || `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown",
        email: user.email,
        isAdmin: user.is_admin,
      });
    } catch (error) {
      console.error("Lookup failed:", error);
      setLookupError("Failed to load user details.");
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
        <Link href="/admin/analytics" className="text-sm underline">
          Back to Dashboard
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <UserRoundSearch className="w-5 h-5" />
          Search User by ID
        </h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={lookupId}
            onChange={(e) => setLookupId(e.target.value)}
            placeholder="Enter user ID..."
            className="flex-1 border rounded-md px-3 py-2"
          />
          <button onClick={handleLookup} className="px-4 py-2 rounded-md bg-black text-white">
            Search
          </button>
        </div>
        {lookupError && <p className="text-sm text-red-600">{lookupError}</p>}

        {lookupResult && (
          <div className="rounded-lg border p-3 space-y-3">
            <div className="text-sm">
              <p><span className="font-medium">Name:</span> {lookupResult.name}</p>
              <p><span className="font-medium">Email:</span> {lookupResult.email}</p>
              <p><span className="font-medium">User ID:</span> {lookupResult.id}</p>
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
                  <p className="text-gray-500">Banned at: {new Date(item.banned_at).toLocaleString()}</p>
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
