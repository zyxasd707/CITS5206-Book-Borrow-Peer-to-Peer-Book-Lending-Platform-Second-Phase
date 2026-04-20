"use client";

import { useEffect, useMemo, useState } from "react";
import { getApiUrl, getToken } from "@/utils/auth";

type SignupDetail = {
    name: string;
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
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<UserMetricsResponse>({
        total_registered_users: 0,
        signups_in_selected_period: 0,
        signup_details: [],
        age_distribution: [],
        location_distribution: [],
    });

    const fetchMetrics = async () => {
        setLoading(true);
        try {
            const apiUrl = getApiUrl();
            const token = getToken();

            const params = new URLSearchParams();
            if (fromDate) params.append("from_date", fromDate);
            if (toDate) params.append("to_date", toDate);

            const res = await fetch(
                `${apiUrl}/api/v1/analytics/user-metrics?${params.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to fetch user metrics");
            }

            const result = await res.json();
            setData(result);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchMetrics();
    }, []);

    const ageDistributionText = useMemo(() => {
        if (data.age_distribution.length === 0) return "No age data";
        return data.age_distribution.map((item) => `${item.label}: ${item.value}`).join(" | ");
    }, [data.age_distribution]);

    const locationDistributionText = useMemo(() => {
        if (data.location_distribution.length === 0) return "No location data";
        return data.location_distribution.map((item) => `${item.label}: ${item.value}`).join(" | ");
    }, [data.location_distribution]);

    return (
        <div className="min-h-screen bg-[#f3f4f6] p-6">
            <div className="grid grid-cols-12 gap-6">
                <aside className="col-span-12 md:col-span-3 lg:col-span-2 rounded-2xl bg-white p-5 shadow-sm">
                    <h2 className="mb-6 text-3xl font-bold">Admin Dashboard</h2>
                    <div className="space-y-3">
                        <div className="rounded-xl bg-blue-100 px-4 py-3 font-medium text-blue-700">
                            User Metrics
                        </div>
                        <div className="rounded-xl px-4 py-3 font-medium text-gray-700">
                            Book Metrics
                        </div>
                        <div className="rounded-xl px-4 py-3 font-medium text-gray-700">
                            View Orders
                        </div>
                    </div>
                </aside>

                <main className="col-span-12 md:col-span-9 lg:col-span-10 space-y-6">
                    <h1 className="text-5xl font-bold text-gray-900">User Metrics</h1>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <p className="text-2xl text-gray-500">Total Registered Users</p>
                            <p className="mt-4 text-5xl font-bold">{data.total_registered_users}</p>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-3xl font-semibold">New User Sign-ups</h2>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                <div>
                                    <label className="mb-2 block text-lg font-medium">From</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-xl border px-4 py-3"
                                        value={fromDate}
                                        onChange={(e) => setFromDate(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="mb-2 block text-lg font-medium">To</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-xl border px-4 py-3"
                                        value={toDate}
                                        onChange={(e) => setToDate(e.target.value)}
                                    />
                                </div>

                                <button
                                    onClick={fetchMetrics}
                                    className="rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white"
                                >
                                    Filter
                                </button>
                            </div>

                            <p className="mt-6 text-2xl text-gray-500">Total Sign-ups in Selected Period</p>
                            <p className="mt-2 text-5xl font-bold">
                                {loading ? "..." : data.signups_in_selected_period}
                            </p>
                        </section>
                    </div>

                    <section className="rounded-2xl bg-white p-6 shadow-sm">
                        <h2 className="text-3xl font-semibold">User Sign-up Details</h2>

                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b text-lg">
                                        <th className="py-4">Name</th>
                                        <th className="py-4">Email</th>
                                        <th className="py-4">Created Date</th>
                                        <th className="py-4">City</th>
                                        <th className="py-4">State</th>
                                        <th className="py-4">Country</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.signup_details.length > 0 ? (
                                        data.signup_details.map((user, index) => (
                                            <tr key={index} className="border-b">
                                                <td className="py-4">{user.name || "-"}</td>
                                                <td className="py-4">{user.email || "-"}</td>
                                                <td className="py-4">
                                                    {user.created_at
                                                        ? new Date(user.created_at).toLocaleDateString()
                                                        : "-"}
                                                </td>
                                                <td className="py-4">{user.city || "-"}</td>
                                                <td className="py-4">{user.state || "-"}</td>
                                                <td className="py-4">{user.country || "-"}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="py-8 text-center text-gray-500">
                                                No sign-ups found for the selected period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-2xl font-semibold">Age Distribution</h2>
                            <p className="mt-4 text-gray-700">{ageDistributionText}</p>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-2xl font-semibold">Location Distribution</h2>
                            <p className="mt-4 text-gray-700">{locationDistributionText}</p>
                        </section>

                        <section className="rounded-2xl bg-white p-6 shadow-sm">
                            <h2 className="text-2xl font-semibold">Reading Preferences</h2>
                            <p className="mt-4 text-gray-500">Phase 2</p>
                        </section>
                    </div>
                </main>
            </div>
        </div>
    );
}