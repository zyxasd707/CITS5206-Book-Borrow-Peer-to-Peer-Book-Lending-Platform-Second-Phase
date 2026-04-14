"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const menuItems = [
        { label: "User Metrics", href: "/admin/user-metrics" },
        { label: "Book Metrics", href: "/admin/book-metrics" },
        { label: "View Orders", href: "/admin/view-orders" },
    ];

    return (
        <div className="min-h-screen flex bg-gray-100">
            <aside className="w-72 bg-white border-r p-6">
                <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>

                <nav className="space-y-2">
                    {menuItems.map((item) => {
                        const isActive = pathname === item.href;

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`block rounded-lg px-4 py-3 text-sm font-medium ${isActive
                                    ? "bg-blue-100 text-blue-700"
                                    : "text-gray-700 hover:bg-gray-100"
                                    }`}
                            >
                                {item.label}
                            </Link>
                        );
                    })}
                </nav>
            </aside>

            <main className="flex-1 p-8">{children}</main>
        </div>
    );
}