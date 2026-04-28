"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookMarked, MapPin, UserPlus, Users } from "lucide-react";
import { getApiUrl, getToken } from "@/utils/auth";

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

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">User Metrics</h1>
                    <p className="text-gray-600">Overview of registered users and demographics.</p>
                </div>
                <Link href="/admin" className="text-sm underline self-center">
                    Back to Dashboard
                </Link>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
                        <Users className="w-4 h-4" /> Total Registered Users
                    </div>
                    <div className="text-2xl font-bold">{metrics.total_users}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
                        <UserPlus className="w-4 h-4" /> Sign-ups Selected
                    </div>
                    <div className="text-2xl font-bold">{totalSignups}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 text-violet-600 text-sm mb-1">
                        <BookMarked className="w-4 h-4" /> Reading Prefs
                    </div>
                    <div className="text-2xl font-bold">{demographics.reading_preferences.length}</div>
                </div>

                <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center gap-2 text-orange-600 text-sm mb-1">
                        <MapPin className="w-4 h-4" /> Locations
                    </div>
                    <div className="text-2xl font-bold">{Object.keys(demographics.locations).length}</div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-xl shadow-sm border p-4 space-y-3">
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
                            onClick={fetchSignups}
                            className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700"
                        >
                            Filter
                        </button>
                    </div>
                </div>
            </div>

            {signupLoading && (
                <p className="text-gray-600 mb-4">Loading sign-up data...</p>
            )}

            {error && fromDate && toDate && (
                <p className="text-red-600 mb-4">{error}</p>
            )}

            {/* Table */}
            <div className="rounded-xl border bg-white overflow-hidden">
                <div className="p-6">
                    <h2 className="text-xl font-semibold mb-4">User Sign-up Details</h2>

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                                <tr>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Created Date</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">City</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">State</th>
                                    <th className="text-left px-4 py-3 font-medium text-gray-600">Country</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {users.length > 0 ? (
                                    users.map((user) => (
                                        <tr key={user.user_id} className="hover:bg-gray-50">
                                            <td className="px-4 py-3">{user.name || "-"}</td>
                                            <td className="px-4 py-3">{user.email || "-"}</td>
                                            <td className="px-4 py-3">{user.created_at ? new Date(user.created_at).toLocaleDateString() : "-"}</td>
                                            <td className="px-4 py-3">{user.city || "-"}</td>
                                            <td className="px-4 py-3">{user.state || "-"}</td>
                                            <td className="px-4 py-3">{user.country || "-"}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-gray-500">
                                            No sign-ups found for the selected period.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-xl font-semibold mb-4">Age Distribution</h2>
                    <div className="space-y-2">
                        {Object.entries(demographics.age_groups).map(([group, count]) => (
                            <div key={group} className="flex justify-between">
                                <span>{group}</span>
                                <span className="font-semibold">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-xl font-semibold mb-4">Location Distribution</h2>
                    <div className="space-y-2">
                        {Object.entries(demographics.locations).map(([location, count]) => (
                            <div key={location} className="flex justify-between">
                                <span>{location}</span>
                                <span className="font-semibold">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-xl font-semibold mb-4">Reading Preferences</h2>
                    <div className="space-y-2">
                        {demographics.reading_preferences.map((item) => (
                            <div key={item.category} className="flex justify-between">
                                <span>{item.category}</span>
                                <span className="font-semibold">{item.count}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
