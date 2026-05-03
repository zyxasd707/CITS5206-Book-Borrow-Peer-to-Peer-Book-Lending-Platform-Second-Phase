"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, CalendarDays, Filter, MapPin, UserPlus, Users } from "lucide-react";
import { getApiUrl, getToken } from "@/utils/auth";
import { formatLocalDate } from "@/utils/datetime";

type UserMetricsData = {
    total_users: number;
};

type DemographicsData = {
    age_groups: Record<string, number>;
    locations: Record<string, number>;
    reading_preferences: { category: string; count: number }[];
};

type SignupUser = {
    user_id: string;
    name: string;
    email: string;
    created_at: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
};

function DistributionPanel({
    title,
    emptyLabel,
    items,
}: {
    title: string;
    emptyLabel: string;
    items: { label: string; count: number }[];
}) {
    const max = Math.max(...items.map((item) => item.count), 0);

    return (
        <section className="rounded-lg border bg-white p-5">
            <h2 className="text-base font-semibold text-gray-950">{title}</h2>
            <div className="mt-4 space-y-4">
                {items.length > 0 ? (
                    items.map((item) => {
                        const width = max > 0 ? `${Math.max((item.count / max) * 100, 6)}%` : "0%";
                        return (
                            <div key={item.label} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-3 text-sm">
                                    <span className="truncate text-gray-700">{item.label}</span>
                                    <span className="font-semibold text-gray-950">{item.count}</span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-100">
                                    <div className="h-2 rounded-full bg-gray-900" style={{ width }} />
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <p className="text-sm text-gray-500">{emptyLabel}</p>
                )}
            </div>
        </section>
    );
}

export default function UserMetricsPage() {
    const [metrics, setMetrics] = useState<UserMetricsData>({
        total_users: 0,
    });

    const [demographics, setDemographics] = useState<DemographicsData>({
        age_groups: {},
        locations: {},
        reading_preferences: [],
    });

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [signupLoading, setSignupLoading] = useState(false);
    const [totalSignups, setTotalSignups] = useState(0);
    const [users, setUsers] = useState<SignupUser[]>([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const token = typeof window !== "undefined" ? getToken() : null;
    const API_URL = getApiUrl();

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                if (!token) {
                    setError("No access token found. Please log in as admin.");
                    setLoading(false);
                    return;
                }

                const [metricsRes, demographicsRes] = await Promise.all([
                    fetch(`${API_URL}/api/v1/analytics/user-metrics`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                    fetch(`${API_URL}/api/v1/analytics/user-demographics`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                ]);

                if (!metricsRes.ok || !demographicsRes.ok) {
                    const status = !metricsRes.ok ? metricsRes.status : demographicsRes.status;
                    setError(
                        status === 401
                            ? "Your admin session has expired. Please log in again."
                            : status === 403
                                ? "Admin access is required to view user metrics."
                                : "Could not load user metrics."
                    );
                    return;
                }

                const metricsResult = await metricsRes.json();
                const demographicsResult = await demographicsRes.json();

                setMetrics({
                    total_users: metricsResult.total_users ?? 0,
                });

                setDemographics({
                    age_groups: demographicsResult.age_groups ?? {},
                    locations: demographicsResult.locations ?? {},
                    reading_preferences: demographicsResult.reading_preferences ?? [],
                });
            } catch (err) {
                setError("Could not load user metrics.");
            } finally {
                setLoading(false);
            }
        };

        fetchInitialData();
    }, [token]);

    const fetchSignups = async () => {
        if (!fromDate || !toDate) {
            setError("Please select both From and To dates.");
            return;
        }

        if (!token) {
            setError("No access token found. Please log in as admin.");
            return;
        }

        setSignupLoading(true);
        setError("");

        try {
            const res = await fetch(
                `${API_URL}/api/v1/analytics/user-signups?from_date=${fromDate}&to_date=${toDate}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                setError(
                    res.status === 401
                        ? "Your admin session has expired. Please log in again."
                        : res.status === 403
                            ? "Admin access is required to view sign-up data."
                            : "Could not load sign-up data."
                );
                return;
            }

            const result = await res.json();

            setTotalSignups(result.total_signups ?? 0);
            setUsers(result.users ?? []);
        } catch (err) {
            setError("Could not load sign-up data.");
        } finally {
            setSignupLoading(false);
        }
    };

    if (loading) {
        return <p className="text-gray-600">Loading user metrics...</p>;
    }

    if (error && !signupLoading && !fromDate && !toDate) {
        return <p className="text-red-600">{error}</p>;
    }

    const ageItems = Object.entries(demographics.age_groups).map(([label, count]) => ({
        label,
        count,
    }));
    const locationItems = Object.entries(demographics.locations).map(([label, count]) => ({
        label,
        count,
    }));
    const readingItems = demographics.reading_preferences.map((item) => ({
        label: item.category,
        count: item.count,
    }));
    const cards = [
        {
            title: "Total Registered Users",
            value: metrics.total_users,
            icon: Users,
            className: "text-blue-600",
        },
        {
            title: "Sign-ups Selected",
            value: totalSignups,
            icon: UserPlus,
            className: "text-green-600",
        },
        {
            title: "Reading Prefs",
            value: demographics.reading_preferences.length,
            icon: BookMarked,
            className: "text-violet-600",
        },
        {
            title: "Locations",
            value: Object.keys(demographics.locations).length,
            icon: MapPin,
            className: "text-orange-600",
        },
    ];

    return (
        <div className="mx-auto max-w-7xl p-6">
            <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-end md:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-950">User Metrics</h1>
                    <p className="mt-1 text-sm text-gray-600">
                        Monitor user growth, signup geography, and reading preference patterns.
                    </p>
                </div>
                <Link href="/admin" className="text-sm font-medium text-gray-700 underline">
                    Back to Dashboard
                </Link>
            </div>

            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div
                            key={card.title}
                            className="bg-white rounded-xl shadow-sm border p-5 text-left"
                        >
                            <div className={`flex items-center gap-2 text-sm mb-1 ${card.className}`}>
                                <Icon className="w-4 h-4" /> {card.title}
                            </div>
                            <h2 className="text-2xl font-bold mt-2">{card.value}</h2>
                        </div>
                    );
                })}
            </div>

            <section className="mt-6 rounded-lg border bg-white p-5">
                <div className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5 text-gray-500" />
                    <h2 className="text-base font-semibold text-gray-950">Signup Date Range</h2>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[1fr_1fr_180px]">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">From</label>
                        <input
                            type="date"
                            value={fromDate}
                            onChange={(e) => setFromDate(e.target.value)}
                            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">To</label>
                        <input
                            type="date"
                            value={toDate}
                            onChange={(e) => setToDate(e.target.value)}
                            className="h-11 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
                        />
                    </div>
                    <button
                        onClick={fetchSignups}
                        disabled={signupLoading}
                        className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-md bg-gray-950 px-4 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    >
                        <Filter className="h-4 w-4" />
                        {signupLoading ? "Filtering..." : "Filter"}
                    </button>
                </div>
                {error && fromDate && toDate && (
                    <p className="mt-3 text-sm text-red-600">{error}</p>
                )}
            </section>

            <section className="mt-6 rounded-lg border bg-white">
                <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-950">User Sign-up Details</h2>
                        <p className="mt-1 text-sm text-gray-500">
                            {users.length > 0
                                ? `${users.length} user${users.length === 1 ? "" : "s"} found for the selected range`
                                : "Select a date range to inspect new accounts"}
                        </p>
                    </div>
                    {fromDate && toDate && (
                        <span className="rounded-md bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                            {fromDate} to {toDate}
                        </span>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-gray-600">
                            <tr>
                                <th className="px-5 py-3 text-left font-medium">Name</th>
                                <th className="px-5 py-3 text-left font-medium">Email</th>
                                <th className="px-5 py-3 text-left font-medium">Created Date</th>
                                <th className="px-5 py-3 text-left font-medium">City</th>
                                <th className="px-5 py-3 text-left font-medium">State</th>
                                <th className="px-5 py-3 text-left font-medium">Country</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.length > 0 ? (
                                users.map((user) => (
                                    <tr key={user.user_id} className="hover:bg-gray-50">
                                        <td className="px-5 py-4 font-medium text-gray-950">{user.name || "-"}</td>
                                        <td className="px-5 py-4 text-gray-700">{user.email || "-"}</td>
                                        <td className="px-5 py-4 text-gray-700">{formatLocalDate(user.created_at, "-")}</td>
                                        <td className="px-5 py-4 text-gray-700">{user.city || "-"}</td>
                                        <td className="px-5 py-4 text-gray-700">{user.state || "-"}</td>
                                        <td className="px-5 py-4 text-gray-700">{user.country || "-"}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={6} className="px-5 py-12 text-center">
                                        <div className="mx-auto max-w-sm">
                                            <Users className="mx-auto h-8 w-8 text-gray-300" />
                                            <p className="mt-3 font-medium text-gray-700">
                                                No sign-ups found
                                            </p>
                                            <p className="mt-1 text-sm text-gray-500">
                                                Choose a different date range to check user registrations.
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <DistributionPanel
                    title="Age Distribution"
                    emptyLabel="No age data available."
                    items={ageItems}
                />
                <DistributionPanel
                    title="Location Distribution"
                    emptyLabel="No location data available."
                    items={locationItems}
                />
                <DistributionPanel
                    title="Reading Preferences"
                    emptyLabel="No reading preference data available."
                    items={readingItems}
                />
            </div>
        </div>
    );
}
