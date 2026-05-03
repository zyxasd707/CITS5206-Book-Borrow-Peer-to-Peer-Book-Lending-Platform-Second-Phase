"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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

export default function ViewOrdersPage() {
    const [selectedStatus, setSelectedStatus] = useState("ALL");
    const [orders, setOrders] = useState<OrderItem[]>([]);
    const [totalOrders, setTotalOrders] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const API_URL = getApiUrl();

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null;

    const fetchOrders = async (status: string) => {
        try {
            setLoading(true);
            setError("");

            if (!token) {
                setError("No access token found. Please log in as admin.");
                setLoading(false);
                return;
            }

            const res = await fetch(
                `${API_URL}/api/v1/analytics/orders?status=${status}`,
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

            setTotalOrders(result.total_orders ?? 0);
            setOrders(result.orders ?? []);
        } catch (err) {
            console.error(err);
            setError("Could not load orders.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders(selectedStatus);
    }, [selectedStatus]);

    const completedCount = orders.filter((o) => o.status === "COMPLETED").length;
    const overdueCount = orders.filter((o) => o.status === "OVERDUE").length;
    const borrowingCount = orders.filter((o) => o.status === "BORROWING").length;
    const returnedCount = orders.filter((o) => o.status === "RETURNED").length;

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">View Orders</h1>
                    <p className="text-gray-600">Browse and filter platform orders.</p>
                </div>
                <Link href="/admin" className="text-sm underline self-center">
                    Back to Dashboard
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm text-gray-500 mb-1">Total Orders</div>
                    <div className="text-2xl font-bold">{totalOrders}</div>
                </div>

                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <div className="text-sm text-amber-800 mb-1">Returned</div>
                    <div className="text-2xl font-bold text-amber-900">{returnedCount}</div>
                    <div className="text-xs text-amber-700">needs attention</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm text-gray-500 mb-1">Completed</div>
                    <div className="text-2xl font-bold">{completedCount}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm text-gray-500 mb-1">Overdue</div>
                    <div className="text-2xl font-bold">{overdueCount}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="text-sm text-gray-500 mb-1">Borrowing</div>
                    <div className="text-2xl font-bold">{borrowingCount}</div>
                </div>
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
                    <h2 className="text-xl font-semibold mb-4">Orders List</h2>

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
                            {orders.length > 0 ? (
                                orders.map((order) => (
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
                                        No orders found for the selected filter.
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
