"use client";

import { useEffect, useState } from "react";

type DistributionItem = {
    label: string;
    value: number;
};

type TopEarningUser = {
    user_id: string;
    user_name: string;
    earnings: number;
};

type RecentTransaction = {
    id: string;
    created_at: string | null;
    status: string | null;
    action_type: string | null;
    total_paid_amount: number;
    owner_name: string;
    borrower_name: string;
};

type FinancialMetricsData = {
    total_transactions: number;
    gross_transaction_value: number;
    platform_revenue: number;
    average_transaction_value: number;
    borrow_transactions: number;
    purchase_transactions: number;
    payment_method_distribution: DistributionItem[];
    total_refunds: number;
    total_refund_amount: number;
    refund_rate: number;
    top_earning_users: TopEarningUser[];
    recent_transactions: RecentTransaction[];
};

export default function FinancialMetricsPage() {
    const [metrics, setMetrics] = useState<FinancialMetricsData>({
        total_transactions: 0,
        gross_transaction_value: 0,
        platform_revenue: 0,
        average_transaction_value: 0,
        borrow_transactions: 0,
        purchase_transactions: 0,
        payment_method_distribution: [],
        total_refunds: 0,
        total_refund_amount: 0,
        refund_rate: 0,
        top_earning_users: [],
        recent_transactions: [],
    });

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [filterLoading, setFilterLoading] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null;

    const fetchFinancialMetrics = async (useFilter = false) => {
        if (!token) {
            setError("No access token found. Please log in as admin.");
            setLoading(false);
            return;
        }

        if (useFilter) {
            setFilterLoading(true);
        }

        setError("");

        try {
            const params = new URLSearchParams();
            if (fromDate) params.append("from_date", fromDate);
            if (toDate) params.append("to_date", toDate);

            const res = await fetch(
                `http://localhost:8000/api/v1/analytics/financial-metrics?${params.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to fetch financial metrics");
            }

            const result = await res.json();
            setMetrics({
                total_transactions: result.total_transactions ?? 0,
                gross_transaction_value: result.gross_transaction_value ?? 0,
                platform_revenue: result.platform_revenue ?? 0,
                average_transaction_value: result.average_transaction_value ?? 0,
                borrow_transactions: result.borrow_transactions ?? 0,
                purchase_transactions: result.purchase_transactions ?? 0,
                payment_method_distribution: result.payment_method_distribution ?? [],
                total_refunds: result.total_refunds ?? 0,
                total_refund_amount: result.total_refund_amount ?? 0,
                refund_rate: result.refund_rate ?? 0,
                top_earning_users: result.top_earning_users ?? [],
                recent_transactions: result.recent_transactions ?? [],
            });
        } catch (err) {
            console.error(err);
            setError("Could not load financial metrics.");
        } finally {
            setLoading(false);
            setFilterLoading(false);
        }
    };

    useEffect(() => {
        fetchFinancialMetrics();
    }, [token]);

    const handleFilter = async () => {
        await fetchFinancialMetrics(true);
    };

    if (loading) {
        return <p className="text-gray-600">Loading financial metrics...</p>;
    }

    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Financial Metrics</h1>

            {error && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border p-5 mb-8">
                <h2 className="text-lg font-semibold mb-4">Filter Transactions</h2>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium mb-2">From</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="w-full rounded-lg border px-3 py-2"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">To</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="w-full rounded-lg border px-3 py-2"
                        />
                    </div>

                    <div>
                        <button
                            onClick={handleFilter}
                            disabled={filterLoading}
                            className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                            {filterLoading ? "Loading..." : "Filter"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Total Transactions</p>
                    <h2 className="text-2xl font-bold mt-2">{metrics.total_transactions}</h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Gross Transaction Value</p>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.gross_transaction_value.toFixed(2)}
                    </h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Platform Revenue (5%)</p>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.platform_revenue.toFixed(2)}
                    </h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Average Transaction Value</p>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.average_transaction_value.toFixed(2)}
                    </h2>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Borrow Transactions</p>
                    <h2 className="text-2xl font-bold mt-2">{metrics.borrow_transactions}</h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Purchase Transactions</p>
                    <h2 className="text-2xl font-bold mt-2">{metrics.purchase_transactions}</h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Refund Rate</p>
                    <h2 className="text-2xl font-bold mt-2">{metrics.refund_rate}%</h2>
                    <p className="text-sm text-gray-500 mt-1">
                        ${metrics.total_refund_amount.toFixed(2)} across {metrics.total_refunds} refunds
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-xl font-semibold mb-4">Payment Distribution</h2>
                    <div className="space-y-2">
                        {metrics.payment_method_distribution.length > 0 ? (
                            metrics.payment_method_distribution.map((item, index) => (
                                <div key={index} className="flex justify-between">
                                    <span className="capitalize">{item.label}</span>
                                    <span className="font-semibold">{item.value}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500">No payment data available.</p>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-xl font-semibold mb-4">Top Earning Users</h2>
                    <div className="space-y-2">
                        {metrics.top_earning_users.length > 0 ? (
                            metrics.top_earning_users.map((user, index) => (
                                <div key={index} className="flex justify-between">
                                    <span>{user.user_name}</span>
                                    <span className="font-semibold">${user.earnings.toFixed(2)}</span>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-500">No earnings data available.</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 overflow-x-auto">
                <h2 className="text-xl font-semibold mb-4">Recent Transactions</h2>

                <table className="min-w-full border-collapse">
                    <thead>
                        <tr className="border-b text-left">
                            <th className="py-3 px-4">Order ID</th>
                            <th className="py-3 px-4">Created Date</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Action Type</th>
                            <th className="py-3 px-4">Owner</th>
                            <th className="py-3 px-4">Borrower</th>
                            <th className="py-3 px-4">Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.recent_transactions.length > 0 ? (
                            metrics.recent_transactions.map((txn) => (
                                <tr key={txn.id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">{txn.id}</td>
                                    <td className="py-3 px-4">
                                        {txn.created_at
                                            ? new Date(txn.created_at).toLocaleDateString()
                                            : "-"}
                                    </td>
                                    <td className="py-3 px-4">{txn.status || "-"}</td>
                                    <td className="py-3 px-4 capitalize">{txn.action_type || "-"}</td>
                                    <td className="py-3 px-4">{txn.owner_name || "-"}</td>
                                    <td className="py-3 px-4">{txn.borrower_name || "-"}</td>
                                    <td className="py-3 px-4">
                                        ${txn.total_paid_amount.toFixed(2)}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={7} className="py-4 px-4 text-center text-gray-500">
                                    No transactions found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}