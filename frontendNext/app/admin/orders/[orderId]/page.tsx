"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CreditCard,
  FileText,
  MessageSquareWarning,
  PackageCheck,
  ReceiptText,
  ShieldCheck,
  Star,
  Truck,
  Users,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import {
  AdminOrderDetails,
  AdminOrderUser,
  getAdminOrderDetails,
} from "@/utils/analytics";

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

function fmtDate(value?: string | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

function fmtMoney(value?: number | null) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function fmtCents(value?: number | null) {
  return `$${(Number(value || 0) / 100).toFixed(2)}`;
}

function text(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function statusClass(status?: string | null) {
  switch (status) {
    case "COMPLETED":
    case "released":
    case "succeeded":
    case "resolved":
      return "bg-green-100 text-green-700";
    case "BORROWING":
    case "pending_review":
    case "pending":
    case "PENDING_SHIPMENT":
      return "bg-yellow-100 text-yellow-700";
    case "RETURNED":
      return "bg-amber-200 text-amber-900 ring-2 ring-amber-400";
    case "OVERDUE":
    case "forfeited":
    case "open":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-4 h-4 text-blue-600" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-1 text-sm font-medium text-gray-900 break-words">{value}</div>
    </div>
  );
}

function UserCard({ title, user }: { title: string; user: AdminOrderUser }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-4">
      <div className="text-sm font-semibold mb-3">{title}</div>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Name" value={user.name || "-"} />
        <Field label="Email" value={user.email || "-"} />
        <Field label="Phone" value={user.phone_number || "-"} />
        <Field
          label="Location"
          value={[user.city, user.state, user.country].filter(Boolean).join(", ") || "-"}
        />
        <Field
          label="Risk"
          value={`${user.damage_strike_count ?? 0} strike(s), severity score ${user.damage_severity_score ?? 0}`}
        />
        <Field
          label="Restricted"
          value={user.is_restricted ? user.restriction_reason || "Yes" : "No"}
        />
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-500">{label}</p>;
}

export default function AdminOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;

  const [detail, setDetail] = useState<AdminOrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [meAdmin, setMeAdmin] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const me = await getCurrentUser();
        const admin = isAdminLikeUser(me);
        setMeAdmin(admin);
        if (!admin) return;

        const data = await getAdminOrderDetails(orderId);
        setDetail(data);
      } catch (err) {
        console.error(err);
        setError("Could not load order details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  if (loading) {
    return <p className="p-6 text-gray-600">Loading order details...</p>;
  }

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Order Details</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <button onClick={() => router.back()} className="text-sm underline mb-4">
          Back
        </button>
        <p className="text-red-600">{error || "Order details unavailable."}</p>
      </div>
    );
  }

  const order = detail.order;
  const needsDamageReview = order.status === "RETURNED" && detail.deposit.status === "pending_review";

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <button onClick={() => router.back()} className="text-sm underline mb-2">
            Back
          </button>
          <h1 className="text-2xl font-bold">Order Details</h1>
          <p className="text-gray-600 font-mono text-sm break-all">{order.id}</p>
        </div>
        <span
          className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}
        >
          {order.status}
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
            <ReceiptText className="w-4 h-4" /> Type
          </div>
          <div className="text-2xl font-bold capitalize">{order.action_type}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
            <CreditCard className="w-4 h-4" /> Total Paid
          </div>
          <div className="text-2xl font-bold">{fmtMoney(detail.payment.total_paid_amount)}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
            <Truck className="w-4 h-4" /> Shipping
          </div>
          <div className="text-2xl font-bold capitalize">{detail.shipping.method || "-"}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-violet-600 text-sm mb-1">
            <ShieldCheck className="w-4 h-4" /> Deposit
          </div>
          <div className="text-2xl font-bold capitalize">{detail.deposit.status}</div>
        </div>
      </div>

      {needsDamageReview && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-semibold text-yellow-900">Admin review required</div>
              <p className="text-sm text-yellow-800">
                The lender reported damage after return. This order must stay RETURNED until the
                deposit review is resolved.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/admin/deposits/${order.id}`}
                className="rounded-md bg-black px-3 py-2 text-sm text-white hover:bg-gray-800"
              >
                Resolve Deposit
              </Link>
              {detail.complaints[0] && (
                <Link
                  href={`/complain/${detail.complaints[0].id}`}
                  className="rounded-md border bg-white px-3 py-2 text-sm hover:bg-gray-50"
                >
                  View Complaint
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Order Summary" icon={ReceiptText}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Status" value={order.status} />
            <Field label="Action Type" value={order.action_type} />
            <Field label="Created" value={fmtDate(order.created_at)} />
            <Field label="Updated" value={fmtDate(order.updated_at)} />
            <Field label="Started" value={fmtDate(order.start_at)} />
            <Field label="Due" value={fmtDate(order.due_at)} />
            <Field label="Returned" value={fmtDate(order.returned_at)} />
            <Field label="Completed" value={fmtDate(order.completed_at)} />
            <Field label="Canceled" value={fmtDate(order.canceled_at)} />
            <Field label="Notes" value={order.notes || "-"} />
          </div>
        </Section>

        <Section title="People" icon={Users}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UserCard title="Owner" user={detail.people.owner} />
            <UserCard title="Borrower" user={detail.people.borrower} />
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Contact Name" value={detail.people.contact.name} />
            <Field label="Contact Email" value={detail.people.contact.email || "-"} />
            <Field label="Contact Phone" value={detail.people.contact.phone || "-"} />
          </div>
        </Section>
      </div>

      <Section title="Books" icon={BookOpen}>
        {detail.books.length ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {detail.books.map((book) => (
              <div key={book.id} className="rounded-lg border bg-gray-50 p-4">
                <div className="font-semibold">{book.title_or}</div>
                <div className="text-sm text-gray-600">{book.title_en || "-"}</div>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="Author" value={book.author || "-"} />
                  <Field label="Category" value={book.category || "-"} />
                  <Field label="Condition" value={book.condition || "-"} />
                  <Field label="Status" value={book.status || "-"} />
                  <Field label="Sale Price" value={fmtMoney(book.sale_price)} />
                  <Field label="Deposit" value={fmtMoney(book.deposit)} />
                  <Field label="Max Lending" value={`${book.max_lending_days} days`} />
                  <Field label="Date Added" value={fmtDate(book.date_added)} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState label="No books linked to this order." />
        )}
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Shipping" icon={Truck}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Method" value={detail.shipping.method || "-"} />
            <Field
              label="Estimated Delivery"
              value={
                detail.shipping.estimated_delivery_time
                  ? `${detail.shipping.estimated_delivery_time} days`
                  : "-"
              }
            />
            <Field label="Street" value={detail.shipping.address.street} />
            <Field
              label="City / Postcode"
              value={`${detail.shipping.address.city}, ${detail.shipping.address.postcode}`}
            />
            <Field label="Country" value={detail.shipping.address.country} />
            <Field label="Outbound Carrier" value={detail.shipping.outbound.carrier || "-"} />
            <Field label="Outbound Tracking" value={detail.shipping.outbound.tracking_number || "-"} />
            <Field label="Return Carrier" value={detail.shipping.return.carrier || "-"} />
            <Field label="Return Tracking" value={detail.shipping.return.tracking_number || "-"} />
          </div>
        </Section>

        <Section title="Payment" icon={CreditCard}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Payment ID" value={detail.payment.payment_id || "-"} />
            <Field label="Payment Status" value={detail.payment.payment_status || "-"} />
            <Field label="Payment Amount" value={fmtCents(detail.payment.payment_amount_cents)} />
            <Field label="Payment Created" value={fmtDate(detail.payment.payment_created_at)} />
            <Field label="Deposit / Sale" value={fmtMoney(detail.payment.deposit_or_sale_amount)} />
            <Field label="Owner Income" value={fmtMoney(detail.payment.owner_income_amount)} />
            <Field label="Service Fee" value={fmtMoney(detail.payment.service_fee_amount)} />
            <Field label="Shipping Fee" value={fmtMoney(detail.payment.shipping_out_fee_amount)} />
            <Field label="Total Paid" value={fmtMoney(detail.payment.total_paid_amount)} />
            <Field label="Total Refunded" value={fmtMoney(detail.payment.total_refunded_amount)} />
            <Field label="Late Fee" value={fmtMoney(detail.payment.late_fee_amount)} />
            <Field label="Damage Fee" value={fmtMoney(detail.payment.damage_fee_amount)} />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Deposit & Evidence" icon={ShieldCheck}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="Status" value={detail.deposit.status} />
            <Field label="Deducted" value={fmtCents(detail.deposit.deducted_cents)} />
            <Field label="Final Severity" value={detail.deposit.damage_severity_final || "-"} />
          </div>
          {detail.deposit_evidence.length ? (
            <div className="space-y-3">
              {detail.deposit_evidence.map((item) => (
                <div key={String(item.id)} className="rounded-lg border bg-gray-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Role" value={text(item.submitter_role)} />
                    <Field label="Severity" value={text(item.claimed_severity)} />
                    <Field label="Submitted" value={fmtDate(item.submitted_at)} />
                  </div>
                  <p className="mt-3 text-sm text-gray-700">{text(item.note)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No deposit evidence recorded." />
          )}
        </Section>

        <Section title="Payment Splits" icon={PackageCheck}>
          {detail.payment_splits.length ? (
            <div className="space-y-3">
              {detail.payment_splits.map((split) => (
                <div key={String(split.id)} className="rounded-lg border bg-gray-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label="Transfer Status" value={text(split.transfer_status)} />
                    <Field label="Transfer ID" value={text(split.transfer_id)} />
                    <Field label="Owner Transfer" value={fmtCents(split.transfer_amount_cents)} />
                    <Field label="Service Fee" value={fmtCents(split.service_fee_cents)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No payment split records found." />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Refunds & Disputes" icon={AlertTriangle}>
          <h3 className="text-sm font-semibold mb-2">Refunds</h3>
          {detail.refunds.length ? (
            <div className="space-y-2 mb-4">
              {detail.refunds.map((refund) => (
                <div key={String(refund.id)} className="rounded-lg border bg-gray-50 p-3">
                  <Field
                    label="Refund"
                    value={`${refund.refund_id} / ${fmtCents(refund.amount_cents)} / ${refund.status}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No refunds found." />
          )}
          <h3 className="text-sm font-semibold mt-4 mb-2">Disputes</h3>
          {detail.disputes.length ? (
            <div className="space-y-2">
              {detail.disputes.map((dispute) => (
                <div key={String(dispute.id)} className="rounded-lg border bg-gray-50 p-3">
                  <Field
                    label="Dispute"
                    value={`${dispute.reason} / ${dispute.status} / ${fmtCents(dispute.deduction_cents)}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No disputes found." />
          )}
        </Section>

        <Section title="Complaints" icon={MessageSquareWarning}>
          {detail.complaints.length ? (
            <div className="space-y-3">
              {detail.complaints.map((complaint) => (
                <div key={String(complaint.id)} className="rounded-lg border bg-gray-50 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="font-semibold">{text(complaint.subject)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(complaint.status)}`}>
                      {complaint.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700">{text(complaint.description)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No complaints linked to this order." />
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Reviews" icon={Star}>
          {detail.reviews.length ? (
            <div className="space-y-3">
              {detail.reviews.map((review) => (
                <div key={String(review.id)} className="rounded-lg border bg-gray-50 p-4">
                  <div className="font-semibold">{text(review.rating)} / 5 stars</div>
                  <p className="mt-2 text-sm text-gray-700">{text(review.comment)}</p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No reviews linked to this order." />
          )}
        </Section>

        <Section title="Deposit Audit History" icon={FileText}>
          {detail.deposit_audit_logs.length ? (
            <div className="space-y-3">
              {detail.deposit_audit_logs.map((audit) => (
                <div key={String(audit.id)} className="rounded-lg border bg-gray-50 p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <Field label="Action" value={text(audit.action)} />
                    <Field label="Actor Role" value={text(audit.actor_role)} />
                    <Field label="Amount" value={audit.amount_cents === null ? "-" : fmtCents(audit.amount_cents)} />
                    <Field label="Created" value={fmtDate(audit.created_at)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState label="No deposit audit entries found." />
          )}
        </Section>
      </div>

      <div className="flex justify-end">
        <Link href="/admin/view-orders" className="text-sm text-blue-600 underline">
          Back to all orders
        </Link>
      </div>
    </div>
  );
}
