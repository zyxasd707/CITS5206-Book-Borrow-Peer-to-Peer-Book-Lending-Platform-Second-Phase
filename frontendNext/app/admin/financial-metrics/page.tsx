"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/utils/auth";
import { BarChart3, CircleDollarSign, ReceiptText, TrendingUp } from "lucide-react";
import {
    getFinancialMetrics,
    getPlatformFeeSetting,
    updatePlatformFeeSetting,
    FinancialMetricsData,
} from "@/utils/analytics";

export default function FinancialMetricsPage() {
    const [metrics, setMetrics] = useState<FinancialMetricsData>({
        total_transactions: 0,
        gross_transaction_value: 0,
        platform_revenue: 0,
        platform_fee_per_transaction: 2,
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
    const [platformFee, setPlatformFee] = useState<number>(2);

    const [filterLoading, setFilterLoading] = useState(false);
    const [feeSaving, setFeeSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [dateError, setDateError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const [meAdmin, setMeAdmin] = useState(false);

    function isAdminLikeUser(user: { is_admin?: boolean } | null) {
        return Boolean(user?.is_admin);
    }

    const fetchPlatformFee = async () => {
        try {
            const setting = await getPlatformFeeSetting();
            setPlatformFee(setting.max_value);
        } catch (err) {
            console.error(err);
            setError("Could not load platform fee setting.");
        }
    };

    const fetchFinancialMetrics = async (useFilter = false) => {
        if (useFilter) setFilterLoading(true);
        setError("");

        try {
            const params: { from_date?: string; to_date?: string } = {};
            if (fromDate) params.from_date = fromDate;
            if (toDate) params.to_date = toDate;

            const result = await getFinancialMetrics(params);
            setMetrics(result);

            if (result.platform_fee_per_transaction !== undefined) {
                setPlatformFee(result.platform_fee_per_transaction);
            }
        } catch (err) {
            console.error(err);
            setError("Could not load financial metrics.");
        } finally {
            setLoading(false);
            setFilterLoading(false);
        }
    };

    const handleUpdatePlatformFee = async () => {
        if (platformFee < 0) {
            setError("Platform fee cannot be negative.");
            return;
        }

        try {
            setFeeSaving(true);
            setError("");
            setSuccessMessage("");

            await updatePlatformFeeSetting(platformFee);
            await fetchFinancialMetrics();

            setSuccessMessage("Platform fee updated successfully.");
        } catch (err) {
            console.error(err);
            setError("Could not update platform fee.");
        } finally {
            setFeeSaving(false);
        }
    };

    useEffect(() => {
        if (!fromDate || !toDate) {
            setDateError("");
            return;
        }

        const f = new Date(fromDate);
        const t = new Date(toDate);

        if (f > t) {
            setDateError("From date must be before or equal to To date.");
        } else {
            setDateError("");
        }
    }, [fromDate, toDate]);

    useEffect(() => {
        (async () => {
            try {
                const me = await getCurrentUser();
                setMeAdmin(isAdminLikeUser(me));
            } catch {
                setMeAdmin(false);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    useEffect(() => {
        if (meAdmin) {
            fetchPlatformFee();
            fetchFinancialMetrics();
        }
    }, [meAdmin]);

    const handleFilter = async () => {
        await fetchFinancialMetrics(true);
    };

    if (loading) {
        return <p className="text-gray-600">Loading financial metrics...</p>;
    }

    if (!meAdmin) {
        return (
            <div className="max-w-4xl mx-auto p-6">
                <h1 className="text-3xl font-bold mb-6">Financial Metrics</h1>
                <p className="text-red-600">Admin access required.</p>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Financial Metrics</h1>
                    <p className="text-gray-600">
                        Platform financial overview and transactions.
                    </p>
                </div>
                <Link href="/admin" className="text-sm underline self-center">
                    Back to Dashboard
                </Link>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {successMessage && (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                    {successMessage}
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border p-5">
                <h2 className="text-lg font-semibold mb-2">Platform Fee Setting</h2>
                <p className="text-sm text-gray-600 mb-4">
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Max Value / Fee per Transaction (AUD)
                        </label>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={platformFee}
                            onChange={(e) => setPlatformFee(Number(e.target.value))}
                            className="w-full rounded-lg border px-3 py-2"
                        />
                    </div>

                    <button
                        onClick={handleUpdatePlatformFee}
                        disabled={feeSaving}
                        className="rounded-lg bg-green-600 text-white px-4 py-2 font-medium hover:bg-green-700 disabled:opacity-60"
                    >
                        {feeSaving ? "Saving..." : "Update Fee"}
                    </button>
                </div>
            </div>

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
                            disabled={filterLoading || !!dateError}
                            className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
                        >
                            {filterLoading ? "Loading..." : "Filter"}
                        </button>
                        {dateError && (
                            <p className="text-sm text-red-600 mt-2">{dateError}</p>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
                        <ReceiptText className="w-4 h-4" /> Total Transactions
                    </div>
                    <h2 className="text-2xl font-bold mt-2">{metrics.total_transactions}</h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
                        <CircleDollarSign className="w-4 h-4" /> Gross Transaction Value
                    </div>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.gross_transaction_value.toFixed(2)}
                    </h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <div className="flex items-center gap-2 text-violet-600 text-sm mb-1">
                        <TrendingUp className="w-4 h-4" />
                        Platform Revenue (${platformFee.toFixed(2)} per transaction)
                    </div>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.platform_revenue.toFixed(2)}
                    </h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
                        <BarChart3 className="w-4 h-4" /> Average Transaction Value
                    </div>
                    <h2 className="text-2xl font-bold mt-2">
                        ${metrics.average_transaction_value.toFixed(2)}
                    </h2>
                </div>
            </div>

            {/* Keep the rest of your existing sections below this unchanged */}
        </div>
    );
}
