"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeftRight,
  PackageCheck,
  PackageSearch,
  Truck,
} from "lucide-react";
import { getCurrentUser } from "@/utils/auth";
import { formatLocalDate } from "@/utils/datetime";
import {
  getShippingMetrics,
  ShippingMetricsData,
} from "@/utils/analytics";

const emptyMetrics: ShippingMetricsData = {
  total_orders: 0,
  delivery_orders: 0,
  pickup_orders: 0,
  delivery_ratio: 0,
  pickup_ratio: 0,
  missing_tracking_orders: 0,
  outbound_tracking_orders: 0,
  return_tracking_orders: 0,
  average_estimated_delivery_time: 0,
  shipping_fee_total: 0,
  checkout_summary: {
    checkout_items: 0,
    delivery_items: 0,
    pickup_items: 0,
    shipping_quote_total: 0,
    average_estimated_delivery_time: 0,
  },
  recent_shipments: [],
};

function isAdminLikeUser(user: { is_admin?: boolean } | null) {
  return Boolean(user?.is_admin);
}

function formatDate(value: string | null) {
  return formatLocalDate(value, "-");
}

function statusClass(status: string | null) {
  switch (status) {
    case "COMPLETED":
      return "bg-green-100 text-green-700";
    case "BORROWING":
      return "bg-yellow-100 text-yellow-700";
    case "OVERDUE":
      return "bg-red-100 text-red-700";
    case "PENDING_SHIPMENT":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function ShippingDashboardPage() {
  const [metrics, setMetrics] = useState<ShippingMetricsData>(emptyMetrics);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");
  const [meAdmin, setMeAdmin] = useState(false);

  const loadMetrics = async (useFilter = false) => {
    try {
      if (useFilter) setFilterLoading(true);
      setError("");

      const params: { from_date?: string; to_date?: string } = {};
      if (fromDate) params.from_date = fromDate;
      if (toDate) params.to_date = toDate;

      const data = await getShippingMetrics(params);
      setMetrics(data);
    } catch (err) {
      console.error(err);
      setError("Could not load shipping metrics.");
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  };

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
    if (meAdmin) loadMetrics();
  }, [meAdmin]);

  useEffect(() => {
    if (!fromDate || !toDate) {
      setDateError("");
      return;
    }

    if (new Date(fromDate) > new Date(toDate)) {
      setDateError("From date must be before or equal to To date.");
    } else {
      setDateError("");
    }
  }, [fromDate, toDate]);

  if (loading) {
    return <p className="p-6 text-gray-600">Loading shipping dashboard...</p>;
  }

  if (!meAdmin) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Shipping Dashboard</h1>
        <p className="text-red-600">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Shipping Dashboard</h1>
          <p className="text-gray-600">
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

      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="text-lg font-semibold mb-4">Filter Orders</h2>
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
              onClick={() => loadMetrics(true)}
              disabled={filterLoading || !!dateError}
              className="w-full rounded-lg bg-blue-600 text-white px-4 py-2 font-medium hover:bg-blue-700 disabled:opacity-60"
            >
              {filterLoading ? "Loading..." : "Filter"}
            </button>
            {dateError && <p className="text-sm text-red-600 mt-2">{dateError}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-blue-600 text-sm mb-1">
            <Truck className="w-4 h-4" /> Delivery Orders
          </div>
          <div className="text-2xl font-bold">{metrics.delivery_orders}</div>
          <div className="text-xs text-gray-400">
            {metrics.delivery_ratio.toFixed(1)}% of {metrics.total_orders} orders
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-gray-700 text-sm mb-1">
            <PackageCheck className="w-4 h-4" /> Pickup Orders
          </div>
          <div className="text-2xl font-bold">{metrics.pickup_orders}</div>
          <div className="text-xs text-gray-400">
            {metrics.pickup_ratio.toFixed(1)}% of {metrics.total_orders} orders
          </div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-red-600 text-sm mb-1">
            <AlertTriangle className="w-4 h-4" /> Missing Tracking
          </div>
          <div className="text-2xl font-bold text-red-700">
            {metrics.missing_tracking_orders}
          </div>
          <div className="text-xs text-gray-400">delivery orders without outbound tracking</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="flex items-center gap-2 text-green-600 text-sm mb-1">
            <PackageSearch className="w-4 h-4" /> Shipping Fees
          </div>
          <div className="text-2xl font-bold">
            ${metrics.shipping_fee_total.toFixed(2)}
          </div>
          <div className="text-xs text-gray-400">collected on orders</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold mb-4">Tracking Coverage</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Outbound tracking</span>
                <span>{metrics.outbound_tracking_orders}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{
                    width: `${metrics.total_orders ? (metrics.outbound_tracking_orders / metrics.total_orders) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Return tracking</span>
                <span>{metrics.return_tracking_orders}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div
                  className="h-2 rounded-full bg-green-600"
                  style={{
                    width: `${metrics.total_orders ? (metrics.return_tracking_orders / metrics.total_orders) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold mb-4">Delivery Timing</h2>
          <div className="flex items-center gap-3">
            <ArrowLeftRight className="w-5 h-5 text-blue-600" />
            <div>
              <div className="text-2xl font-bold">
                {metrics.average_estimated_delivery_time.toFixed(1)} days
              </div>
              <div className="text-sm text-gray-500">average estimated delivery time</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <h2 className="text-lg font-semibold mb-4">Checkout Shipping</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-gray-500">Items</div>
              <div className="text-xl font-bold">{metrics.checkout_summary.checkout_items}</div>
            </div>
            <div>
              <div className="text-gray-500">Quote Total</div>
              <div className="text-xl font-bold">
                ${metrics.checkout_summary.shipping_quote_total.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-gray-500">Delivery</div>
              <div className="text-xl font-bold">{metrics.checkout_summary.delivery_items}</div>
            </div>
            <div>
              <div className="text-gray-500">Pickup</div>
              <div className="text-xl font-bold">{metrics.checkout_summary.pickup_items}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border p-6 overflow-x-auto">
        <h2 className="text-xl font-semibold mb-4">Recent Shipments</h2>
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b text-left">
              <th className="py-3 px-4">Order ID</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Method</th>
              <th className="py-3 px-4">Owner</th>
              <th className="py-3 px-4">Borrower</th>
              <th className="py-3 px-4">Outbound Tracking</th>
              <th className="py-3 px-4">Return Tracking</th>
              <th className="py-3 px-4">Fee</th>
              <th className="py-3 px-4">Created</th>
            </tr>
          </thead>
          <tbody>
            {metrics.recent_shipments.length > 0 ? (
              metrics.recent_shipments.map((order) => (
                <tr key={order.id} className="border-b hover:bg-gray-50 align-top">
                  <td className="py-3 px-4 font-mono text-xs">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-blue-600 underline"
                    >
                      {order.id}
                    </Link>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${statusClass(order.status)}`}
                    >
                      {order.status || "-"}
                    </span>
                  </td>
                  <td className="py-3 px-4 capitalize">{order.shipping_method || "-"}</td>
                  <td className="py-3 px-4">{order.owner_name}</td>
                  <td className="py-3 px-4">{order.borrower_name}</td>
                  <td className="py-3 px-4">
                    {order.shipping_out_tracking_number || (
                      <span className="text-red-600">Missing</span>
                    )}
                  </td>
                  <td className="py-3 px-4">{order.shipping_return_tracking_number || "-"}</td>
                  <td className="py-3 px-4">
                    ${order.shipping_out_fee_amount.toFixed(2)}
                  </td>
                  <td className="py-3 px-4">{formatDate(order.created_at)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="py-4 px-4 text-center text-gray-500">
                  No shipment data found for the selected filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
