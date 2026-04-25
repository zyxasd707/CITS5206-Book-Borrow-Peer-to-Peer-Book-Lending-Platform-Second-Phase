"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
} from "chart.js";
import { BookOpen, LibraryBig, Repeat, Tags } from "lucide-react";
import { Pie } from "react-chartjs-2";

ChartJS.register(ArcElement, Tooltip, Legend);

type BookMetricsData = {
    total_books: number;
    books_for_loan: number;
    books_for_sale: number;
};

type CategoryData = {
    category: string;
    count: number;
};

type AverageData = {
    total_books: number;
    total_users: number;
    average_books_per_user: number;
};

type UserSearchResult = {
    user_id: string;
    name: string;
    email: string;
};

type UserBook = {
    id: string;
    title_or: string;
    author: string;
    category: string | null;
    status: string;
    can_rent: boolean;
    can_sell: boolean;
    date_added: string | null;
};

export default function BookMetricsPage() {
    const [metrics, setMetrics] = useState<BookMetricsData>({
        total_books: 0,
        books_for_loan: 0,
        books_for_sale: 0,
    });

    const [categories, setCategories] = useState<CategoryData[]>([]);
    const [averageData, setAverageData] = useState<AverageData>({
        total_books: 0,
        total_users: 0,
        average_books_per_user: 0,
    });

    const [searchText, setSearchText] = useState("");
    const [matchedUsers, setMatchedUsers] = useState<UserSearchResult[]>([]);
    const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
    const [userBooks, setUserBooks] = useState<UserBook[]>([]);
    const [userBooksCount, setUserBooksCount] = useState(0);

    const [loading, setLoading] = useState(true);
    const [searchingUsers, setSearchingUsers] = useState(false);
    const [loadingUserBooks, setLoadingUserBooks] = useState(false);
    const [error, setError] = useState("");

    const token =
        typeof window !== "undefined"
            ? localStorage.getItem("access_token")
            : null;

    useEffect(() => {
        const fetchDashboardData = async () => {
            try {
                if (!token) {
                    setError("No access token found. Please log in as admin.");
                    setLoading(false);
                    return;
                }

                const [metricsRes, categoriesRes, averageRes] = await Promise.all([
                    fetch("http://localhost:8000/api/v1/analytics/book-metrics", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                    fetch("http://localhost:8000/api/v1/analytics/book-categories", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                    fetch("http://localhost:8000/api/v1/analytics/books-per-user-average", {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }),
                ]);

                if (!metricsRes.ok || !categoriesRes.ok || !averageRes.ok) {
                    throw new Error("Failed to fetch book dashboard data");
                }

                const metricsResult = await metricsRes.json();
                const categoriesResult = await categoriesRes.json();
                const averageResult = await averageRes.json();

                setMetrics({
                    total_books: metricsResult.total_books ?? 0,
                    books_for_loan: metricsResult.books_for_loan ?? 0,
                    books_for_sale: metricsResult.books_for_sale ?? 0,
                });

                setCategories(categoriesResult ?? []);

                setAverageData({
                    total_books: averageResult.total_books ?? 0,
                    total_users: averageResult.total_users ?? 0,
                    average_books_per_user: averageResult.average_books_per_user ?? 0,
                });
            } catch (err) {
                console.error(err);
                setError("Could not load book metrics.");
            } finally {
                setLoading(false);
            }
        };

        fetchDashboardData();
    }, [token]);

    useEffect(() => {
        const fetchUsers = async () => {
            const trimmed = searchText.trim();

            if (!trimmed) {
                setMatchedUsers([]);
                return;
            }

            if (!token) return;

            try {
                setSearchingUsers(true);

                const res = await fetch(
                    `http://localhost:8000/api/v1/analytics/search-users?q=${encodeURIComponent(
                        trimmed
                    )}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                );

                if (!res.ok) {
                    throw new Error("Failed to search users");
                }

                const result = await res.json();
                setMatchedUsers(result ?? []);
            } catch (err) {
                console.error(err);
                setMatchedUsers([]);
            } finally {
                setSearchingUsers(false);
            }
        };

        const timeout = setTimeout(fetchUsers, 300);
        return () => clearTimeout(timeout);
    }, [searchText, token]);

    const handleSelectUser = async (user: UserSearchResult) => {
        try {
            if (!token) {
                setError("No access token found. Please log in as admin.");
                return;
            }

            setSelectedUser(user);
            setSearchText(user.name);
            setMatchedUsers([]);
            setLoadingUserBooks(true);
            setError("");

            const res = await fetch(
                `http://localhost:8000/api/v1/analytics/books-by-user/${user.user_id}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            if (!res.ok) {
                throw new Error("Failed to fetch books for selected user");
            }

            const result = await res.json();

            setUserBooks(result.books ?? []);
            setUserBooksCount(result.total_books ?? 0);
        } catch (err) {
            console.error(err);
            setError("Could not load books for selected user.");
        } finally {
            setLoadingUserBooks(false);
        }
    };

    if (loading) {
        return <p className="text-gray-600">Loading book metrics...</p>;
    }

    if (error && !selectedUser && !loadingUserBooks) {
        return <p className="text-red-600">{error}</p>;
    }

    const cards = [
        {
            title: "Total Books Listed",
            value: metrics.total_books,
            icon: LibraryBig,
            className: "text-blue-600",
        },
        {
            title: "Books Available for Loan",
            value: metrics.books_for_loan,
            icon: Repeat,
            className: "text-green-600",
        },
        {
            title: "Books Available for Sale",
            value: metrics.books_for_sale,
            icon: Tags,
            className: "text-orange-600",
        },
        {
            title: "Books Listed Per User (Average)",
            value: averageData.average_books_per_user,
            icon: BookOpen,
            className: "text-violet-600",
        },
    ];

    const chartData = {
        labels: categories.map((item) => item.category),
        datasets: [
            {
                label: "Books by Category",
                data: categories.map((item) => item.count),
                backgroundColor: [
                    "#3b82f6",
                    "#10b981",
                    "#f59e0b",
                    "#ef4444",
                    "#8b5cf6",
                    "#14b8a6",
                    "#f97316",
                    "#ec4899",
                    "#84cc16",
                    "#6366f1",
                ],
                borderWidth: 1,
            },
        ],
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: "bottom" as const,
            },
        },
    };

    return (
        <div className="max-w-7xl mx-auto p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Book Inventory & Activity Metrics</h1>
                    <p className="text-gray-600">Overview of book listings, categories, and user activity.</p>
                </div>
                <Link href="/admin" className="text-sm underline self-center">
                    Back to Dashboard
                </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                    <div
                        key={card.title}
                        className="bg-white rounded-xl shadow-sm border p-5"
                    >
                        <div className={`flex items-center gap-2 text-sm mb-1 ${card.className}`}>
                            <Icon className="w-4 h-4" /> {card.title}
                        </div>
                        <h2 className="text-2xl font-bold mt-2">{card.value}</h2>
                    </div>
                    );
                })}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 mb-8">
                <div className="bg-white rounded-xl shadow-sm border p-6">
                    <h2 className="text-xl font-semibold mb-4">Find User Books</h2>

                    <label className="block text-sm font-medium mb-2">
                        Search User Name
                    </label>

                    <div className="relative">
                        <input
                            type="text"
                            value={searchText}
                            onChange={(e) => {
                                setSearchText(e.target.value);
                                setSelectedUser(null);
                                setUserBooks([]);
                                setUserBooksCount(0);
                            }}
                            placeholder="Enter Username"
                            className="w-full rounded-lg border px-3 py-2"
                        />

                        {searchingUsers && (
                            <p className="text-sm text-gray-500 mt-2">Searching users...</p>
                        )}

                        {matchedUsers.length > 0 && (
                            <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                                {matchedUsers.map((user) => (
                                    <button
                                        key={user.user_id}
                                        type="button"
                                        onClick={() => handleSelectUser(user)}
                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0"
                                    >
                                        <div className="font-medium">{user.name}</div>
                                        <div className="text-sm text-gray-500">{user.email}</div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {selectedUser && (
                        <div className="mt-6 bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-500">Books Listed by User</p>
                            <h3 className="text-2xl font-bold">{userBooksCount}</h3>
                        </div>
                    )}
                </div>

                <div className="flex justify-center">
                    <div className="bg-white rounded-xl shadow-sm border p-6 w-[400px]">
                        <h2 className="text-xl font-semibold mb-4 text-center">
                            Category Distribution
                        </h2>

                        {categories.length > 0 ? (
                            <div className="h-[300px]">
                                <Pie data={chartData} options={chartOptions} />
                            </div>
                        ) : (
                            <p className="text-gray-500 text-center">
                                No category data available.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border p-6 overflow-x-auto">
                <h2 className="text-xl font-semibold mb-4">
                    {selectedUser
                        ? `Books Listed by ${selectedUser.name}`
                        : "Selected User Books"}
                </h2>

                {loadingUserBooks ? (
                    <p className="text-gray-600">Loading books...</p>
                ) : (
                    <table className="min-w-full border-collapse">
                        <thead>
                            <tr className="border-b text-left">
                                <th className="py-3 px-4">Title</th>
                                <th className="py-3 px-4">Author</th>
                                <th className="py-3 px-4">Category</th>
                                <th className="py-3 px-4">Status</th>
                                <th className="py-3 px-4">Loan</th>
                                <th className="py-3 px-4">Sale</th>
                                <th className="py-3 px-4">Date Added</th>
                            </tr>
                        </thead>
                        <tbody>
                            {userBooks.length > 0 ? (
                                userBooks.map((book) => (
                                    <tr key={book.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">{book.title_or || "-"}</td>
                                        <td className="py-3 px-4">{book.author || "-"}</td>
                                        <td className="py-3 px-4">{book.category || "-"}</td>
                                        <td className="py-3 px-4">{book.status || "-"}</td>
                                        <td className="py-3 px-4">
                                            {book.can_rent ? "Yes" : "No"}
                                        </td>
                                        <td className="py-3 px-4">
                                            {book.can_sell ? "Yes" : "No"}
                                        </td>
                                        <td className="py-3 px-4">
                                            {book.date_added
                                                ? new Date(book.date_added).toLocaleDateString()
                                                : "-"}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td
                                        colSpan={7}
                                        className="py-4 px-4 text-center text-gray-500"
                                    >
                                        {selectedUser
                                            ? "No books found for this user."
                                            : "Search and select a user to view their books."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
