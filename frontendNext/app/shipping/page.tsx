"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Package, Truck, CheckCircle } from "lucide-react";
import Card from "@/app/components/ui/Card";
import { getCurrentUser, isAuthenticated } from "@/utils/auth";
import { getUserShipments, type TrackingNumberItem } from "@/utils/shipping";
import { formatLocalDateTime } from "@/utils/datetime";
import clsx from "clsx";

const formatDateTime = (value?: string | null) =>
  formatLocalDateTime(value);

const trackingHref = (item: TrackingNumberItem): string | null => {
  if (!item.tracking_number) return null;
  if ((item.carrier || "").toUpperCase() === "AUSPOST") {
    return `https://auspost.com.au/mypost/track/details/${item.tracking_number}`;
  }
  return null;
};

const ShippingPage: React.FC = () => {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [shipments, setShipments] = useState<TrackingNumberItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"sent" | "received">("sent");

  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated()) {
        router.push("/auth");
        return;
      }

      try {
        const userData = await getCurrentUser();
        if (userData) {
          setCurrentUser(userData);
          const data = await getUserShipments();
          setShipments(data);
        } else {
          router.push("/auth");
        }
      } catch (error) {
        console.error("Failed to load data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex-1 bg-gray-50 py-8 flex items-center justify-center">
        <div className="text-gray-500">Loading shipping information...</div>
      </div>
    );
  }

  const sentList = shipments.filter((s) => s.role === "sender");
  const receivedList = shipments.filter((s) => s.role === "recipient");
  const currentList = activeTab === "sent" ? sentList : receivedList;

  return (
    <div className="flex-1 bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Shipping</h1>
          <p className="text-gray-600">Track your outgoing and incoming shipments</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="shadow-sm">
            <div className="flex items-center">
              <Package className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total Shipments</p>
                <p className="text-2xl font-bold text-gray-900">{shipments.length}</p>
              </div>
            </div>
          </Card>
          <Card className="shadow-sm">
            <div className="flex items-center">
              <Truck className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Sent Out</p>
                <p className="text-2xl font-bold text-gray-900">{sentList.length}</p>
              </div>
            </div>
          </Card>
          <Card className="shadow-sm">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Received</p>
                <p className="text-2xl font-bold text-gray-900">{receivedList.length}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-4">
          <button
            onClick={() => setActiveTab("sent")}
            className={clsx(
              "px-4 py-2 font-medium text-sm border-b-2 transition",
              activeTab === "sent"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Sent Out
          </button>
          <button
            onClick={() => setActiveTab("received")}
            className={clsx(
              "px-4 py-2 font-medium text-sm border-b-2 transition",
              activeTab === "received"
                ? "border-black text-black"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            Received
          </button>
        </div>

        <Card className="shadow-sm">
          <h2 className="text-xl font-semibold mb-4">
            {activeTab === "sent" ? "Shipments You Sent" : "Shipments You Received"}
          </h2>

          {currentList.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No shipments found</p>
            </div>
          ) : (
            <div className="space-y-4">
              {currentList.map((item) => {
                const isDelivered = item.tracking_state === "delivered";
                const href = trackingHref(item);
                const legLabel = item.leg === "out" ? "Outgoing" : "Return";
                const dateLabel = isDelivered ? "Delivered" : "Shipped";
                const dateValue = isDelivered
                  ? item.delivered_at || item.updated_at || item.created_at
                  : item.shipped_at || item.updated_at || item.created_at;

                return (
                  <Card
                    key={`${item.order_id}-${item.leg}`}
                    className="border border-gray-200 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 text-sm text-gray-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="font-semibold text-black hover:underline cursor-pointer text-base sm:text-lg"
                            onClick={() => router.push(`/borrowing/${item.order_id}`)}
                          >
                            {item.book_title || `Order #${item.order_id}`}
                          </h3>
                          <span
                            className={clsx(
                              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                              isDelivered
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                            )}
                          >
                            {isDelivered ? "Delivered" : "In Transit"}
                          </span>
                        </div>

                        {item.counterpart_name && (
                          <p className="mt-1 text-gray-600">
                            {item.counterpart_role || "User"}: {item.counterpart_name}
                          </p>
                        )}

                        {item.tracking_number && (
                          <p className="mt-2">
                            {legLabel} Tracking
                            {item.carrier ? ` (${item.carrier})` : ""}:{" "}
                            {href ? (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-blue-600 underline hover:text-blue-800"
                              >
                                {item.tracking_number}
                              </a>
                            ) : (
                              <span className="font-mono text-gray-800">
                                {item.tracking_number}
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 text-xs text-gray-500 sm:text-right">
                        <p>
                          {dateLabel}: {formatDateTime(dateValue)}
                        </p>
                        <p className="mt-1 text-gray-400">Order ID: {item.order_id}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

export default ShippingPage;
