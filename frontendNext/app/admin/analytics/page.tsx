"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
    getApiUrl,
    getCurrentUser,
    getToken,
    isAuthenticated,
} from "@/utils/auth";

type SignupDetail = {
    name: string | null;
    email: string;
    created_at: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
};

type DistributionItem = {
    label: string;
    value: number;
};

type UserMetricsResponse = {
    total_registered_users: number;
    signups_in_selected_period: number;
    signup_details: SignupDetail[];
    age_distribution: DistributionItem[];
    location_distribution: DistributionItem[];
};

export default function AdminAnalyticsPage() {
    const router = useRouter();

    const [isLoadingPage, setIsLoadingPage] = useState(true);
    const [loadingMetrics, setLoadingMetrics] = useState(false);
    const [error, setError] = useState("");

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");

    const [data, setData] = useState<UserMetricsResponse>({
        total_registered_users: 0,
        signups_in_selected_period: 0,
        signup_details: [],
        age_distribution: [],
        location_distribution: [],
    });

    useEffect(() => {
        const init = async () => {
            try {
                if (!isAuthenticated()) {
                    router.push("/auth");
                    return;
                }

                const me = await getCurrentUser();

                if (!me || !me.is_admin) {
                    router.push("/");
                    return;
                }

                await fetchMetrics();
            } catch (err) {
                console.error("Failed to initialize analytics page:", err);
                setError("Failed to load user metrics.");
            } finally {
                setIsLoadingPage(false);
            }
        };

        init();
    }, [router]);

    const fetchMetrics = async () => {
        try {
            setLoadingMetrics(true);
            setError("");

            const apiUrl = getApiUrl();
            const token = getToken();

            const params = new URLSearchParams();
            if (fromDate) params.append("from_date", fromDate);
            if (toDate) params.append("to_date", toDate);

            const response = await fetch(
                `${apiUrl}/api/v1/analytics/user-metrics?${params.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!response.ok) {
                throw new Error("Failed to fetch user metrics");
            }

            const result = await response.json();
            setData(result);
        } catch (err) {
            console.error("Failed to fetch user metrics:", err);
            setError("Unable to load user metrics.");
        } finally {
            setLoadingMetrics(false);
        }
    };

    if (isLoadingPage) {
        return (
            <div className="flex-1 bg-gray-50 py-8">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
                        Loading user metrics...
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 bg-gray-50 py-8">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">User Metrics</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        View registered users and sign-up insights.
                    </p>
                </div>

                {error && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                        <p className="text-sm text-gray-500">Total Registered Users</p>
                        <p className="mt-2 text-3xl font-bold text-gray-900">
                            {data.total_registered_users}
                        </p>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900">
                            New User Sign-ups
                        </h2>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    From
                                </label>
                                <input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                    To
                                </label>
                                <input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                    className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                                />
                            </div>

                            <div className="flex items-end">
                                <button
                                    onClick={fetchMetrics}
                                    disabled={loadingMetrics}
                                    className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {loadingMetrics ? "Loading..." : "Filter"}
                                </button>
                            </div>
                        </div>

                        <div className="mt-5 border-t border-gray-100 pt-4">
                            <p className="text-sm text-gray-500">Total Sign-ups in Selected Period</p>
                            <p className="mt-2 text-3xl font-bold text-gray-900">
                                {data.signups_in_selected_period}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-gray-900">
                            User Sign-up Details
                        </h2>
                        <span className="text-sm text-gray-500">
                            {data.signup_details.length} record
                            {data.signup_details.length === 1 ? "" : "s"}
                        </span>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="py-3 pr-4 text-left font-medium text-gray-600">Name</th>
                                    <th className="py-3 pr-4 text-left font-medium text-gray-600">Email</th>
                                    <th className="py-3 pr-4 text-left font-medium text-gray-600">Created Date</th>
                                    <th className="py-3 pr-4 text-left font-medium text-gray-600">City</th>
                                    <th className="py-3 pr-4 text-left font-medium text-gray-600">State</th>
                                    <th className="py-3 text-left font-medium text-gray-600">Country</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.signup_details.length > 0 ? (
                                    data.signup_details.map((user, index) => (
                                        <tr key={index} className="border-b border-gray-100 last:border-b-0">
                                            <td className="py-3 pr-4 text-gray-900">{user.name || "-"}</td>
                                            <td className="py-3 pr-4 text-gray-700">{user.email}</td>
                                            <td className="py-3 pr-4 text-gray-700">
                                                {user.created_at
                                                    ? new Date(user.created_at).toLocaleDateString()
                                                    : "-"}
                                            </td>
                                            <td className="py-3 pr-4 text-gray-700">{user.city || "-"}</td>
                                            <td className="py-3 pr-4 text-gray-700">{user.state || "-"}</td>
                                            <td className="py-3 text-gray-700">{user.country || "-"}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="py-8 text-center text-sm text-gray-500">
                                            No sign-ups found for the selected period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">
                            Age Distribution
                        </h2>

                        <div className="space-y-3">
                            {data.age_distribution.length > 0 ? (
                                data.age_distribution.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <span className="text-gray-700">{item.label}</span>
                                        <span className="font-medium text-gray-900">{item.value}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">No age data available.</p>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-4">
                            Location Distribution
                        </h2>

                        <div className="space-y-3">
                            {data.location_distribution.length > 0 ? (
                                data.location_distribution.map((item, index) => (
                                    <div key={index} className="flex items-center justify-between text-sm">
                                        <span className="text-gray-700">{item.label}</span>
                                        <span className="font-medium text-gray-900">{item.value}</span>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500">No location data available.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}