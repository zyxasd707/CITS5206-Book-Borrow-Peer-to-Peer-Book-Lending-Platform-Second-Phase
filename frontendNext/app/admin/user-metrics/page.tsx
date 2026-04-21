"use client";

import { useEffect, useState } from "react";

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

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null;

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                if (!token) {
                    setError("No access token found. Please log in as admin.");
                    setLoading(false);
                    return;
                }

                const [metricsRes, demographicsRes] = await Promise.all([
                    fetch("http://localhost:8000/api/v1/analytics/user-metrics", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                    fetch("http://localhost:8000/api/v1/analytics/user-demographics", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                ]);

                if (!metricsRes.ok || !demographicsRes.ok) {
                    throw new Error("Failed to fetch user dashboard data");
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
                console.error(err);
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
                `http://localhost:8000/api/v1/analytics/user-signups?from_date=${fromDate}&to_date=${toDate}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to fetch sign-up data");
            }

            const result = await res.json();

            setTotalSignups(result.total_signups ?? 0);
            setUsers(result.users ?? []);
        } catch (err) {
            console.error(err);
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
        <div>
            <h1 className="text-3xl font-bold mb-6">User Metrics</h1>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <p className="text-sm text-gray-500">Total Registered Users</p>
                    <h2 className="text-2xl font-bold mt-2">{metrics.total_users}</h2>
                </div>

                <div className="bg-white rounded-xl shadow-sm border p-5">
                    <h2 className="text-lg font-semibold mb-4">New User Sign-ups</h2>

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

                    <div className="mt-4">
                        <p className="text-sm text-gray-500">
                            Total Sign-ups in Selected Period
                        </p>
                        <h2 className="text-2xl font-bold mt-1">{totalSignups}</h2>
                    </div>
                </div>
            </div>

            {signupLoading && (
                <p className="text-gray-600 mb-4">Loading sign-up data...</p>
            )}

            {error && fromDate && toDate && (
                <p className="text-red-600 mb-4">{error}</p>
            )}

            <div className="bg-white rounded-xl shadow-sm border p-6 mb-8 overflow-x-auto">
                <h2 className="text-xl font-semibold mb-4">User Sign-up Details</h2>

                <table className="min-w-full border-collapse">
                    <thead>
                        <tr className="border-b text-left">
                            <th className="py-3 px-4">Name</th>
                            <th className="py-3 px-4">Email</th>
                            <th className="py-3 px-4">Created Date</th>
                            <th className="py-3 px-4">City</th>
                            <th className="py-3 px-4">State</th>
                            <th className="py-3 px-4">Country</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.length > 0 ? (
                            users.map((user) => (
                                <tr key={user.user_id} className="border-b hover:bg-gray-50">
                                    <td className="py-3 px-4">{user.name || "-"}</td>
                                    <td className="py-3 px-4">{user.email || "-"}</td>
                                    <td className="py-3 px-4">
                                        {user.created_at
                                            ? new Date(user.created_at).toLocaleDateString()
                                            : "-"}
                                    </td>
                                    <td className="py-3 px-4">{user.city || "-"}</td>
                                    <td className="py-3 px-4">{user.state || "-"}</td>
                                    <td className="py-3 px-4">{user.country || "-"}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td
                                    colSpan={6}
                                    className="py-4 px-4 text-center text-gray-500"
                                >
                                    No sign-ups found for the selected period.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
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