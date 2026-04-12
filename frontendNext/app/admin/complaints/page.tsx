"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleX, Clock3, MessageSquareWarning } from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import { getComplaints, resolveComplaint, type Complaint } from "@/utils/complaints";

function isAdminLikeUser(user: { email?: string; is_admin?: boolean } | null) {
  if (!user) return false;
  return Boolean(user.is_admin) || Boolean(user.email?.toLowerCase().includes("admin"));
}

export default function AdminComplaintsPage() {
  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | Complaint["status"]>("all");

  const loadComplaints = async () => {
    try {
      const data = await getComplaints("admin");
      setComplaints(data);
    } catch (error) {
      console.error("Failed to load admin complaints:", error);
      setComplaints([]);
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
      await loadComplaints();
    })();
  }, []);

  const filteredComplaints = useMemo(() => {
    if (statusFilter === "all") return complaints;
    return complaints.filter((c) => c.status === statusFilter);
  }, [complaints, statusFilter]);

  const handleApprove = async (item: Complaint) => {
    const note = prompt("Approval note (optional):", "Approved by admin.") || "Approved by admin.";
    try {
      setSubmittingId(item.id);
      await resolveComplaint(item.id, { status: "resolved", adminResponse: note });
      await loadComplaints();
    } catch (error) {
      console.error("Approve complaint failed:", error);
      alert("Failed to approve complaint.");
    } finally {
      setSubmittingId(null);
    }
  };

  const handleReject = async (item: Complaint) => {
    const note = prompt("Rejection note (required):", "Rejected after review.");
    if (!note || !note.trim()) {
      alert("Please provide a rejection reason.");
      return;
    }
    try {
      setSubmittingId(item.id);
      await resolveComplaint(item.id, { status: "closed", adminResponse: note.trim() });
      await loadComplaints();
    } catch (error) {
      console.error("Reject complaint failed:", error);
      alert("Failed to reject complaint.");
    } finally {
      setSubmittingId(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading admin complaints panel...</div>;
  }

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Admin Complaints</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Complaint Approvals</h1>
          <p className="text-gray-600">Approve or reject complaint outcomes.</p>
        </div>
        <Link href="/admin/analytics" className="text-sm underline">
          Back to Dashboard
        </Link>
      </div>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap gap-2">
          {(["all", "pending", "investigating", "resolved", "closed"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                statusFilter === st ? "bg-black text-white border-black" : "hover:bg-gray-50"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquareWarning className="w-5 h-5" />
          Complaint Queue ({filteredComplaints.length})
        </h2>

        {filteredComplaints.length === 0 ? (
          <p className="text-gray-500 text-sm">No complaints in this filter.</p>
        ) : (
          <div className="space-y-3">
            {filteredComplaints.map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{item.subject}</p>
                    <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    <div className="text-xs text-gray-500 mt-1">
                      <span>Type: {item.type}</span>{" · "}
                      <span>Status: {item.status}</span>{" · "}
                      <span>Created: {new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Link href={`/complain/${item.id}`} className="text-sm underline shrink-0">
                    View detail
                  </Link>
                </div>

                {(item.status === "pending" || item.status === "investigating") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      disabled={submittingId === item.id}
                      onClick={() => handleApprove(item)}
                      className="px-3 py-2 rounded-md bg-green-600 text-white text-sm disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" />
                        Approve
                      </span>
                    </button>
                    <button
                      disabled={submittingId === item.id}
                      onClick={() => handleReject(item)}
                      className="px-3 py-2 rounded-md bg-red-600 text-white text-sm disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1">
                        <CircleX className="w-4 h-4" />
                        Reject
                      </span>
                    </button>
                    <button
                      disabled={submittingId === item.id}
                      onClick={async () => {
                        try {
                          setSubmittingId(item.id);
                          await resolveComplaint(item.id, {
                            status: "investigating",
                            adminResponse: "Complaint is under investigation.",
                          });
                          await loadComplaints();
                        } catch (error) {
                          console.error("Failed to set investigating:", error);
                          alert("Failed to update complaint status.");
                        } finally {
                          setSubmittingId(null);
                        }
                      }}
                      className="px-3 py-2 rounded-md border text-sm hover:bg-gray-50 disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="w-4 h-4" />
                        Mark Investigating
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
