"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardList,
  UserCog,
  MessageSquareWarning,
  DollarSign,
  Wallet,
} from "lucide-react";

type MenuItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

const menuItems: MenuItem[] = [
  { label: "User Metrics", href: "/admin/user-metrics", icon: Users },
  { label: "Book Metrics", href: "/admin/book-metrics", icon: BookOpen },
  { label: "View Orders", href: "/admin/view-orders", icon: ClipboardList },
  { label: "Users", href: "/admin/users", icon: UserCog },
  { label: "Complaints", href: "/admin/complaints", icon: MessageSquareWarning },
  { label: "Refunds", href: "/admin/refunds", icon: DollarSign },
  { label: "Deposits", href: "/admin/deposits", icon: Wallet },
  { label: "Financial Metrics", href: "/admin/financial-metrics", icon: Wallet },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="min-h-screen flex bg-gray-100">
      <aside className="w-64 bg-white border-r border-gray-200 p-5 shrink-0">
        <h1 className="text-xl font-bold mb-6 text-gray-900">Admin Dashboard</h1>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${active
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
                  }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
