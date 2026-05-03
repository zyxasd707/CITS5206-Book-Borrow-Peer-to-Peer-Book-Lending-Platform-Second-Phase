"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CreditCard,
  Download,
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
import { formatLocalDateTime } from "@/utils/datetime";

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

function fmtDate(value?: string | null) {
  return formatLocalDateTime(value, "-");
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

type ReportRow = {
  section: string;
  field: string;
  value: string;
};

function addReportRow(
  rows: ReportRow[],
  section: string,
  field: string,
  value?: string | number | null
) {
  rows.push({ section, field, value: text(value) });
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function buildOrderReportRows(detail: AdminOrderDetails): ReportRow[] {
  const rows: ReportRow[] = [];
  const { order } = detail;

  addReportRow(rows, "Order Summary", "Order ID", order.id);
  addReportRow(rows, "Order Summary", "Status", order.status);
  addReportRow(rows, "Order Summary", "Action Type", order.action_type);
  addReportRow(rows, "Order Summary", "Created", fmtDate(order.created_at));
  addReportRow(rows, "Order Summary", "Updated", fmtDate(order.updated_at));
  addReportRow(rows, "Order Summary", "Started", fmtDate(order.start_at));
  addReportRow(rows, "Order Summary", "Due", fmtDate(order.due_at));
  addReportRow(rows, "Order Summary", "Returned", fmtDate(order.returned_at));
  addReportRow(rows, "Order Summary", "Completed", fmtDate(order.completed_at));
  addReportRow(rows, "Order Summary", "Canceled", fmtDate(order.canceled_at));
  addReportRow(rows, "Order Summary", "Notes", order.notes);

  [
    ["Owner", detail.people.owner],
    ["Borrower", detail.people.borrower],
  ].forEach(([role, user]) => {
    const person = user as AdminOrderUser;
    addReportRow(rows, role as string, "Name", person.name);
    addReportRow(rows, role as string, "Email", person.email);
    addReportRow(rows, role as string, "Phone", person.phone_number);
    addReportRow(
      rows,
      role as string,
      "Location",
      [person.city, person.state, person.country].filter(Boolean).join(", ")
    );
    addReportRow(rows, role as string, "Damage Strikes", person.damage_strike_count ?? 0);
    addReportRow(rows, role as string, "Severity Score", person.damage_severity_score ?? 0);
    addReportRow(rows, role as string, "Restricted", person.is_restricted ? "Yes" : "No");
  });

  addReportRow(rows, "Contact", "Name", detail.people.contact.name);
  addReportRow(rows, "Contact", "Email", detail.people.contact.email);
  addReportRow(rows, "Contact", "Phone", detail.people.contact.phone);

  detail.books.forEach((book, index) => {
    const section = `Book ${index + 1}`;
    addReportRow(rows, section, "Title", book.title_or);
    addReportRow(rows, section, "English Title", book.title_en);
    addReportRow(rows, section, "Author", book.author);
    addReportRow(rows, section, "Category", book.category);
    addReportRow(rows, section, "Condition", book.condition);
    addReportRow(rows, section, "Status", book.status);
    addReportRow(rows, section, "Sale Price", fmtMoney(book.sale_price));
    addReportRow(rows, section, "Deposit", fmtMoney(book.deposit));
    addReportRow(rows, section, "Max Lending", `${book.max_lending_days} days`);
    addReportRow(rows, section, "Date Added", fmtDate(book.date_added));
  });

  addReportRow(rows, "Shipping", "Method", detail.shipping.method);
  addReportRow(rows, "Shipping", "Estimated Delivery", detail.shipping.estimated_delivery_time ? `${detail.shipping.estimated_delivery_time} days` : "-");
  addReportRow(rows, "Shipping", "Street", detail.shipping.address.street);
  addReportRow(rows, "Shipping", "City", detail.shipping.address.city);
  addReportRow(rows, "Shipping", "Postcode", detail.shipping.address.postcode);
  addReportRow(rows, "Shipping", "Country", detail.shipping.address.country);
  addReportRow(rows, "Shipping", "Outbound Carrier", detail.shipping.outbound.carrier);
  addReportRow(rows, "Shipping", "Outbound Tracking", detail.shipping.outbound.tracking_number);
  addReportRow(rows, "Shipping", "Return Carrier", detail.shipping.return.carrier);
  addReportRow(rows, "Shipping", "Return Tracking", detail.shipping.return.tracking_number);

  addReportRow(rows, "Payment", "Payment ID", detail.payment.payment_id);
  addReportRow(rows, "Payment", "Payment Status", detail.payment.payment_status);
  addReportRow(rows, "Payment", "Payment Amount", fmtCents(detail.payment.payment_amount_cents));
  addReportRow(rows, "Payment", "Payment Created", fmtDate(detail.payment.payment_created_at));
  addReportRow(rows, "Payment", "Deposit / Sale", fmtMoney(detail.payment.deposit_or_sale_amount));
  addReportRow(rows, "Payment", "Owner Income", fmtMoney(detail.payment.owner_income_amount));
  addReportRow(rows, "Payment", "Service Fee", fmtMoney(detail.payment.service_fee_amount));
  addReportRow(rows, "Payment", "Shipping Fee", fmtMoney(detail.payment.shipping_out_fee_amount));
  addReportRow(rows, "Payment", "Total Paid", fmtMoney(detail.payment.total_paid_amount));
  addReportRow(rows, "Payment", "Total Refunded", fmtMoney(detail.payment.total_refunded_amount));
  addReportRow(rows, "Payment", "Late Fee", fmtMoney(detail.payment.late_fee_amount));
  addReportRow(rows, "Payment", "Damage Fee", fmtMoney(detail.payment.damage_fee_amount));

  addReportRow(rows, "Deposit", "Status", detail.deposit.status);
  addReportRow(rows, "Deposit", "Deducted", fmtCents(detail.deposit.deducted_cents));
  addReportRow(rows, "Deposit", "Final Severity", detail.deposit.damage_severity_final);

  detail.deposit_evidence.forEach((item, index) => {
    const section = `Deposit Evidence ${index + 1}`;
    addReportRow(rows, section, "Submitter", item.submitter.name);
    addReportRow(rows, section, "Role", item.submitter_role);
    addReportRow(rows, section, "Severity", item.claimed_severity);
    addReportRow(rows, section, "Submitted", fmtDate(item.submitted_at));
    addReportRow(rows, section, "Note", item.note);
  });

  detail.payment_splits.forEach((split, index) => {
    const section = `Payment Split ${index + 1}`;
    addReportRow(rows, section, "Owner", split.owner.name);
    addReportRow(rows, section, "Transfer Status", split.transfer_status);
    addReportRow(rows, section, "Transfer ID", split.transfer_id);
    addReportRow(rows, section, "Owner Transfer", fmtCents(split.transfer_amount_cents));
    addReportRow(rows, section, "Service Fee", fmtCents(split.service_fee_cents));
  });

  detail.refunds.forEach((refund, index) => {
    const section = `Refund ${index + 1}`;
    addReportRow(rows, section, "Refund ID", refund.refund_id);
    addReportRow(rows, section, "Amount", fmtCents(refund.amount_cents));
    addReportRow(rows, section, "Status", refund.status);
    addReportRow(rows, section, "Reason", refund.reason);
    addReportRow(rows, section, "Created", fmtDate(refund.created_at));
  });

  detail.disputes.forEach((dispute, index) => {
    const section = `Dispute ${index + 1}`;
    addReportRow(rows, section, "Dispute ID", dispute.dispute_id);
    addReportRow(rows, section, "User", dispute.user.name);
    addReportRow(rows, section, "Reason", dispute.reason);
    addReportRow(rows, section, "Status", dispute.status);
    addReportRow(rows, section, "Deduction", fmtCents(dispute.deduction_cents));
    addReportRow(rows, section, "Note", dispute.note);
  });

  detail.complaints.forEach((complaint, index) => {
    const section = `Complaint ${index + 1}`;
    addReportRow(rows, section, "Type", complaint.type);
    addReportRow(rows, section, "Subject", complaint.subject);
    addReportRow(rows, section, "Status", complaint.status);
    addReportRow(rows, section, "Damage Severity", complaint.damage_severity);
    addReportRow(rows, section, "Complainant", complaint.complainant.name);
    addReportRow(rows, section, "Respondent", complaint.respondent?.name);
    addReportRow(rows, section, "Description", complaint.description);
    addReportRow(rows, section, "Admin Response", complaint.admin_response);
  });

  detail.reviews.forEach((review, index) => {
    const section = `Review ${index + 1}`;
    addReportRow(rows, section, "Rating", `${review.rating} / 5`);
    addReportRow(rows, section, "Reviewer", review.reviewer.name);
    addReportRow(rows, section, "Reviewee", review.reviewee.name);
    addReportRow(rows, section, "Comment", review.comment);
    addReportRow(rows, section, "Created", fmtDate(review.created_at));
  });

  detail.deposit_audit_logs.forEach((audit, index) => {
    const section = `Deposit Audit ${index + 1}`;
    addReportRow(rows, section, "Action", audit.action);
    addReportRow(rows, section, "Actor", audit.actor?.name);
    addReportRow(rows, section, "Actor Role", audit.actor_role);
    addReportRow(rows, section, "Amount", audit.amount_cents === null ? "-" : fmtCents(audit.amount_cents));
    addReportRow(rows, section, "Final Severity", audit.final_severity);
    addReportRow(rows, section, "Note", audit.note);
    addReportRow(rows, section, "Created", fmtDate(audit.created_at));
  });

  return rows;
}

function exportOrderCsv(detail: AdminOrderDetails) {
  const rows = buildOrderReportRows(detail);
  const csv = [
    ["Section", "Field", "Value"].map(csvEscape).join(","),
    ...rows.map((row) => [row.section, row.field, row.value].map(csvEscape).join(",")),
  ].join("\n");

  downloadTextFile(
    `bookborrow-order-${detail.order.id}.csv`,
    csv,
    "text/csv;charset=utf-8"
  );
}

function exportOrderPdf(detail: AdminOrderDetails) {
  const rows = buildOrderReportRows(detail);
  const sections = rows.reduce<Record<string, ReportRow[]>>((acc, row) => {
    acc[row.section] = acc[row.section] || [];
    acc[row.section].push(row);
    return acc;
  }, {});

  const reportHtml = Object.entries(sections)
    .map(
      ([section, sectionRows]) => `
        <section>
          <h2>${escapeHtml(section)}</h2>
          <table>
            <tbody>
              ${sectionRows
                .map(
                  (row) => `
                    <tr>
                      <th>${escapeHtml(row.field)}</th>
                      <td>${escapeHtml(row.value)}</td>
                    </tr>
                  `
                )
                .join("")}
            </tbody>
          </table>
        </section>
      `
    )
    .join("");

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.title = "BookBorrow order PDF export";

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>BookBorrow Order Report - ${escapeHtml(detail.order.id)}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
          h1 { font-size: 24px; margin: 0 0 4px; }
          .meta { color: #4b5563; margin: 0 0 24px; }
          section { break-inside: avoid; margin: 0 0 24px; }
          h2 { border-bottom: 1px solid #d1d5db; font-size: 16px; margin: 0 0 8px; padding-bottom: 6px; }
          table { border-collapse: collapse; width: 100%; }
          th, td { border: 1px solid #e5e7eb; font-size: 12px; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f9fafb; width: 28%; }
          @media print { body { margin: 18mm; } button { display: none; } }
        </style>
      </head>
      <body>
        <h1>BookBorrow Order Report</h1>
        <p class="meta">Order ${escapeHtml(detail.order.id)} | Generated ${escapeHtml(new Date().toLocaleString())}</p>
        ${reportHtml}
      </body>
    </html>
  `;

  document.body.appendChild(iframe);
  const iframeDocument = iframe.contentWindow?.document;
  if (!iframeDocument || !iframe.contentWindow) {
    iframe.remove();
    alert("Unable to prepare the PDF export. Please try again.");
    return;
  }

  iframeDocument.open();
  iframeDocument.write(html);
  iframeDocument.close();

  window.setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    window.setTimeout(() => iframe.remove(), 1000);
  }, 100);
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
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exportOrderCsv(detail)}
            className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
          <button
            type="button"
            onClick={() => exportOrderPdf(detail)}
            className="inline-flex items-center gap-2 rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            <FileText className="h-4 w-4" />
            Export PDF
          </button>
          <span
            className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}
          >
            {order.status}
          </span>
        </div>
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
