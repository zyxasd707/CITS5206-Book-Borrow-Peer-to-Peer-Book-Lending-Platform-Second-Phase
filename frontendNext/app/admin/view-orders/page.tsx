"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { getApiUrl } from "@/utils/auth";
import { formatLocalDate } from "@/utils/datetime";

type OrderItem = {
    id: string;
    status: string;
    action_type: string;
    owner_name: string;
    borrower_name: string;
    created_at: string | null;
    due_at: string | null;
    total_paid_amount: number;
    books: string[];
};

const FILTER_OPTIONS = ["ALL", "RETURNED", "COMPLETED", "OVERDUE", "BORROWING"];

function getStatusBadgeClass(status: string) {
    switch (status) {
        case "COMPLETED":
            return "bg-green-100 text-green-700";
        case "OVERDUE":
            return "bg-red-100 text-red-700";
        case "BORROWING":
            return "bg-yellow-100 text-yellow-700";
        case "RETURNED":
            return "bg-amber-200 text-amber-900 ring-2 ring-amber-400";
        default:
            return "bg-gray-100 text-gray-700";
    }
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

function buildOrderReportRows(orders: OrderItem[]) {
    return orders.map((order) => ({
        "Order ID": order.id,
        Status: order.status || "-",
        Type: order.action_type || "-",
        Owner: order.owner_name || "-",
        Borrower: order.borrower_name || "-",
        Books: order.books.join("; ") || "-",
        "Created Date": formatLocalDate(order.created_at, "-"),
        "Due Date": formatLocalDate(order.due_at, "-"),
        "Total Paid": `$${Number(order.total_paid_amount || 0).toFixed(2)}`,
    }));
}

function exportOrdersCsv(orders: OrderItem[]) {
    const rows = buildOrderReportRows(orders);
    const headers = ["Order ID", "Status", "Type", "Owner", "Borrower", "Books", "Created Date", "Due Date", "Total Paid"];
    const csv = [
        headers.map(csvEscape).join(","),
        ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(",")),
    ].join("\n");

    downloadTextFile("bookborrow-all-orders.csv", csv, "text/csv;charset=utf-8");
}

function exportOrdersPdf(orders: OrderItem[]) {
    const rows = buildOrderReportRows(orders);
    const headers = ["Order ID", "Status", "Type", "Owner", "Borrower", "Books", "Created Date", "Due Date", "Total Paid"];
    const bodyRows = rows
        .map(
            (row) => `
                <tr>
                    ${headers.map((header) => `<td>${escapeHtml(row[header as keyof typeof row])}</td>`).join("")}
                </tr>
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
    iframe.title = "BookBorrow all orders PDF export";

    const html = `
        <!doctype html>
        <html>
          <head>
            <title>BookBorrow All Orders Report</title>
            <style>
              body { font-family: Arial, sans-serif; color: #111827; margin: 32px; }
              h1 { font-size: 24px; margin: 0 0 4px; }
              .meta { color: #4b5563; margin: 0 0 24px; }
              table { border-collapse: collapse; width: 100%; }
              th, td { border: 1px solid #e5e7eb; font-size: 11px; padding: 7px; text-align: left; vertical-align: top; }
              th { background: #f9fafb; }
              @media print { body { margin: 14mm; } }
            </style>
          </head>
          <body>
            <h1>BookBorrow All Orders Report</h1>
            <p class="meta">${rows.length} order(s) | Generated ${escapeHtml(new Date().toLocaleString())}</p>
            <table>
              <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
              <tbody>${bodyRows}</tbody>
            </table>
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

export default function ViewOrdersPage() {
    const [selectedStatus, setSelectedStatus] = useState("ALL");
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const API_URL = getApiUrl();

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null;

    const fetchOrders = async () => {
        try {
            setLoading(true);
            setError("");

            if (!token) {
                setError("No access token found. Please log in as admin.");
                setLoading(false);
                return;
            }

            const res = await fetch(
                `${API_URL}/api/v1/analytics/orders?status=ALL`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to fetch orders");
            }

            const result = await res.json();

            setOrders(result.orders ?? []);
        } catch (err) {
            console.error(err);
            setError("Could not load orders.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, []);

    const completedCount = orders.filter((o) => o.status === "COMPLETED").length;
    const overdueCount = orders.filter((o) => o.status === "OVERDUE").length;
    const borrowingCount = orders.filter((o) => o.status === "BORROWING").length;
    const returnedCount = orders.filter((o) => o.status === "RETURNED").length;
    const visibleOrders =
        selectedStatus === "ALL"
            ? orders
            : orders.filter((order) => order.status === selectedStatus);

    const kpiCards = [
        {
            status: "ALL",
            label: "Total Orders",
            count: orders.length,
            hint: "all statuses",
            className: "border-gray-200 bg-white text-gray-900",
            labelClassName: "text-gray-500",
        },
        {
            status: "RETURNED",
            label: "Returned",
            count: returnedCount,
            hint: "needs attention",
            className: "border-amber-300 bg-amber-50 text-amber-900",
            labelClassName: "text-amber-800",
        },
        {
            status: "COMPLETED",
            label: "Completed",
            count: completedCount,
            hint: "resolved orders",
            className: "border-gray-200 bg-white text-gray-900",
            labelClassName: "text-gray-500",
        },
        {
            status: "OVERDUE",
            label: "Overdue",
            count: overdueCount,
            hint: "past due date",
            className: "border-gray-200 bg-white text-gray-900",
            labelClassName: "text-gray-500",
        },
        {
            status: "BORROWING",
            label: "Borrowing",
            count: borrowingCount,
            hint: "currently active",
            className: "border-gray-200 bg-white text-gray-900",
            labelClassName: "text-gray-500",
        },
    ];

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">View Orders</h1>
                    <p className="text-gray-600">Browse and filter platform orders.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => exportOrdersCsv(orders)}
                        disabled={orders.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <Download className="h-4 w-4" />
                        Export CSV
                    </button>
                    <button
                        type="button"
                        onClick={() => exportOrdersPdf(orders)}
                        disabled={orders.length === 0}
                        className="inline-flex items-center gap-2 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <FileText className="h-4 w-4" />
                        Export PDF
                    </button>
                    <Link href="/admin" className="text-sm underline self-center">
                        Back to Dashboard
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                {kpiCards.map((card) => {
                    const selected = selectedStatus === card.status;

                    return (
                        <button
                            key={card.status}
                            type="button"
                            onClick={() => setSelectedStatus(card.status)}
                            aria-pressed={selected}
                            className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                card.className
                            } ${selected ? "ring-2 ring-blue-500" : ""}`}
                        >
                            <div className={`text-sm mb-1 ${card.labelClassName}`}>{card.label}</div>
                            <div className="text-2xl font-bold">{card.count}</div>
                            <div className="text-xs opacity-80">{card.hint}</div>
                        </button>
                    );
                })}
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium mb-2">Filter by Status</label>
                        <select
                            value={selectedStatus}
                            onChange={(e) => setSelectedStatus(e.target.value)}
                            className="w-full rounded-lg border px-3 py-2"
                        >
                            {FILTER_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option === "ALL" ? "All Orders" : option}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {loading && <p className="text-gray-600">Loading orders...</p>}
            {error && <p className="text-red-600">{error}</p>}

            {!loading && !error && (
                <div className="bg-white rounded-xl shadow-sm border p-6 overflow-x-auto">
                    <h2 className="text-xl font-semibold mb-4">
                        {selectedStatus === "ALL" ? "Orders List" : `${selectedStatus} Orders`}
                    </h2>

                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="py-3 px-4">Order ID</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4">Type</th>
                                <th className="py-3 px-4">Owner</th>
                                <th className="py-3 px-4">Borrower</th>
                                <th className="py-3 px-4">Books</th>
                                <th className="py-3 px-4">Created Date</th>
                                <th className="py-3 px-4">Due Date</th>
                                <th className="py-3 px-4">Total Paid</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleOrders.length > 0 ? (
                                visibleOrders.map((order) => (
                                    <tr
                                        key={order.id}
                                        className={`border-b align-top ${
                                            order.status === "RETURNED"
                                                ? "bg-amber-50 hover:bg-amber-100"
                                                : "hover:bg-gray-50"
                                        }`}
                                    >
                                        <td className="py-3 px-4">
                                            <Link
                                                href={`/admin/orders/${order.id}`}
                                                className="text-blue-600 underline"
                                            >
                                                {order.id}
                                            </Link>
                                        </td>
                                        <td className="py-3 px-4">
                                            <span
                                                className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeClass(
                                                    order.status
                                                )}`}
                                            >
                                                {order.status}
                                            </span>
                                            {order.status === "RETURNED" && (
                                                <div className="mt-1 text-xs font-medium text-amber-800">
                                                    Awaiting admin review
                                                </div>
                                            )}
                                        </td>
                                        <td className="py-3 px-4">{order.action_type || "-"}</td>
                                        <td className="py-3 px-4">{order.owner_name || "-"}</td>
                                        <td className="py-3 px-4">{order.borrower_name || "-"}</td>
                                        <td className="py-3 px-4">
                                            {order.books.length > 0 ? (
                                                <div className="space-y-1">
                                                    {order.books.map((book, index) => (
                                                        <div
                                                            key={index}
                                                            className="inline-block mr-2 mb-1 rounded-md bg-gray-100 px-2 py-1 text-sm"
                                                        >
                                                            {book}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                        <td className="py-3 px-4">
                                            {formatLocalDate(order.created_at, "-")}
                                        </td>
                                        <td className="py-3 px-4">
                                            {formatLocalDate(order.due_at, "-")}
                                        </td>
                                        <td className="py-3 px-4">
                                            ${Number(order.total_paid_amount || 0).toFixed(2)}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={9} className="py-4 px-4 text-center text-gray-500">
                                        No orders found for the selected status.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
