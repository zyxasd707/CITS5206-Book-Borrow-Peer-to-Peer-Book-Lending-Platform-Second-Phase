// lending list
"use client";

import { useState, useMemo, useEffect } from "react";
import { Search, Filter, BookOpen, MoreHorizontal, MessageSquare } from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import CoverImg from "../components/ui/CoverImg";
import Modal from "../components/ui/Modal";
import type { Book } from "@/app/types/book";
import { getApiUrl, getCurrentUser, getToken } from "@/utils/auth";
import { getBooks, updateBook, deleteBook } from "@/utils/books";
import { getOrderById, getOrdersByBookId } from "@/utils/borrowingOrders";
import { getMyDeposits, type DepositSummaryItem } from "@/utils/deposits";
import { getDepositBadge } from "@/utils/depositBadge";
import { formatLocalDate } from "@/utils/datetime";
import type { ApiOrder, OrderStatus } from "@/app/types/order";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const formatDisplayDate = (value?: string | null) =>
  value ? formatLocalDate(value) : null;

const getBookStatusDisplay = (book: Book, order?: ApiOrder) => {
  if (order) {
    if (order.status === "OVERDUE") {
      return {
        label: "Overdue",
        className: "text-red-600 font-medium",
        dateLabel: order.dueAt ? `Due on ${formatDisplayDate(order.dueAt)}` : null,
      };
    }

    if (order.status === "RETURNED") {
      return {
        label: "Returned",
        className: "text-amber-700 font-medium",
        dateLabel: order.returnedAt
          ? `Returned on ${formatDisplayDate(order.returnedAt)}`
          : null,
      };
    }

    if (order.status === "COMPLETED") {
      return {
        label: "Completed",
        className: "text-emerald-600 font-medium",
        dateLabel: order.completedAt
          ? `Completed on ${formatDisplayDate(order.completedAt)}`
          : null,
      };
    }

    if (order.status === "BORROWING") {
      return {
        label: book.status === "sold" ? "Sold" : "Lend Out",
        className: book.status === "sold"
          ? "text-emerald-600 font-medium"
          : "text-blue-600 font-medium",
        dateLabel: order.startAt ? `Started on ${formatDisplayDate(order.startAt)}` : null,
      };
    }
  }

  if (book.status === "listed") {
    return {
      label: "Listed",
      className: "text-green-600 font-medium",
      dateLabel: `Listed on ${formatDisplayDate(book.dateAdded)}`,
    };
  }

  if (book.status === "unlisted") {
    return {
      label: "Unlisted",
      className: "text-red-600 font-medium",
      dateLabel: `Listed on ${formatDisplayDate(book.dateAdded)}`,
    };
  }

  if (book.status === "sold") {
    return {
      label: "Sold",
      className: "text-emerald-600 font-medium",
      dateLabel: `Listed on ${formatDisplayDate(book.dateAdded)}`,
    };
  }

  return {
    label: "Lend Out",
    className: "text-blue-600 font-medium",
    dateLabel: `Listed on ${formatDisplayDate(book.dateAdded)}`,
  };
};

export default function LendingListPage() {
  const [items, setItems] = useState<Book[]>([]);
  const [orderMap, setOrderMap] = useState<Record<string, ApiOrder>>({});
  const [activeOrderIdByBook, setActiveOrderIdByBook] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedFilter, setSelectedFilter] = useState<"all" | Book["status"]>("all");
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("AUSPOST");
  const [depositMap, setDepositMap] = useState<Record<string, DepositSummaryItem>>({});

  // recode which book openes ...（null means no one）
  const [openId, setOpenId] = useState<string | null>(null);

  // get current user's books
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const user = await getCurrentUser();
        if (!user) {
          setItems([]);
          return;
        }

        const list = await getBooks({ ownerId: user.id, page: 1, pageSize: 100 });
        if (alive) setItems(list);

        try {
          // includeHeld=true: badge needs live BORROWING/PENDING_SHIPMENT rows too.
          const deposits = await getMyDeposits(user.id, { includeHeld: true });
          if (alive) {
            const map: Record<string, DepositSummaryItem> = {};
            deposits.forEach((d) => {
              map[d.orderId] = d;
            });
            setDepositMap(map);
          }
        } catch (e) {
          console.error("Failed to load deposit summaries:", e);
        }
      } catch (e: any) {
        if (alive) setErr(e?.message || "loading fail");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // close pull-down menu by click space
  useEffect(() => {
    const onDocClick = () => setOpenId(null);
    if (openId) document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [openId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      const booksWithOrders = items.filter(
        (book) => book.status === "lent" || book.status === "sold"
      );

      if (booksWithOrders.length === 0) {
        if (alive) {
          setOrderMap({});
          setActiveOrderIdByBook({});
        }
        return;
      }

      const resolved = await Promise.all(
        booksWithOrders.map(async (book) => {
          try {
            let orderId = book.currentOrderId;

            if (!orderId) {
              const candidateOrders = await getOrdersByBookId(book.id);
              const activeOrder =
                candidateOrders.find(
                  (candidate) =>
                    !["COMPLETED", "CANCELED"].includes(candidate.status)
                ) || candidateOrders[0];

              orderId = activeOrder?.order_id;
            }

            if (!orderId) {
              return null;
            }

            const order = await getOrderById(orderId);
            return { bookId: book.id, orderId, order };
          } catch (error) {
            console.error("Failed to load order for lending item:", error);
            return null;
          }
        })
      );

      if (!alive) {
        return;
      }

      const validResolved = resolved.filter(
        (entry): entry is { bookId: string; orderId: string; order: ApiOrder } =>
          !!entry
      );

      setOrderMap(
        Object.fromEntries(validResolved.map((entry) => [entry.orderId, entry.order]))
      );
      setActiveOrderIdByBook(
        Object.fromEntries(validResolved.map((entry) => [entry.bookId, entry.orderId]))
      );
    })();

    return () => {
      alive = false;
    };
  }, [items]);

  const toggleMenu = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setOpenId((prev) => (prev === id ? null : id));
  };

  const onEdit = (id: string) => {
    console.log("edit", id);
    setOpenId(null);
  };
  const onHistory = (id: string) => {
    console.log("history", id);
    setOpenId(null);
  };
  const onDelete = (id: string) => {
    console.log("delete", id);
    setOpenId(null);
  };

  // search + filter
  const filteredBooks = useMemo(() => {
    let filtered = items;
    if (selectedFilter !== "all") {
      filtered = filtered.filter((b) => b.status === selectedFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(
        (b) =>
          b.titleOr.toLowerCase().includes(q) ||
          (b.author || "").toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [items, search, selectedFilter]);

  const countBy = (s: Book["status"]) => items.filter((b) => b.status === s).length;
  const filterOptions = [
    { value: "all", label: "All", count: items.length },
    { value: "listed", label: "Listed", count: countBy("listed") },
    { value: "unlisted", label: "Unlisted", count: countBy("unlisted") },
    { value: "lent", label: "Lend Out", count: countBy("lent") },
    { value: "sold", label: "Sold", count: countBy("sold") },
  ] as const;

  const router = useRouter();

  const openShipmentModal = (orderId: string, order?: ApiOrder) => {
    setSelectedOrderId(orderId);
    setCarrier(order?.shippingOutCarrier || "AUSPOST");
    setTrackingNumber(order?.shippingOutTrackingNumber || "");
    setShipModalOpen(true);
  };

  const handleConfirmShipment = async () => {
    if (!selectedOrderId) return;

    try {
      const token = getToken();
      if (!token) {
        toast.error("Authentication required");
        router.push("/auth");
        return;
      }

      const res = await fetch(
        `${getApiUrl()}/api/v1/orders/${selectedOrderId}/confirm-shipment`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            tracking_number: trackingNumber,
            carrier,
          }),
        }
      );

      if (!res.ok) {
        throw new Error("Failed to confirm shipment");
      }

      setOrderMap((prev) => ({
        ...prev,
        [selectedOrderId]: prev[selectedOrderId]
          ? {
              ...prev[selectedOrderId],
              shippingOutTrackingNumber: trackingNumber.trim(),
            }
          : prev[selectedOrderId],
      }));

      const updatedOrder = await getOrderById(selectedOrderId);
      setOrderMap((prev) => ({
        ...prev,
        [selectedOrderId]: {
          ...updatedOrder,
          shippingOutTrackingNumber:
            updatedOrder?.shippingOutTrackingNumber ||
            prev[selectedOrderId]?.shippingOutTrackingNumber ||
            null,
        },
      }));
      setShipModalOpen(false);
      toast.success("Shipment confirmed successfully");
    } catch (error) {
      console.error("Failed to confirm shipment:", error);
      toast.error("Failed to confirm shipment");
    }
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          {/* Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">My Shared Books</h1>
              <p className="text-gray-600">Manage your listed, unlisted, and lent out books</p>
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mb-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search by book title..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {filterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={selectedFilter === option.value ? "default" : "outline"}
                  onClick={() => setSelectedFilter(option.value as any)}
                  className={`flex items-center gap-2 ${selectedFilter === option.value
                    ? "bg-black text-white hover:bg-gray-800 border-black"
                    : ""
                    }`}

                >
                  <Filter className="w-4 h-4" />
                  {option.label}
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
                    {option.count}
                  </span>
                </Button>
              ))}
            </div>
          </div>

          {/* Lending List */}
          <div className="space-y-4">
            {filteredBooks.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No books found</h3>
                  <p className="text-gray-500">Try adjusting filters or search terms</p>
                </div>
              </Card>
            ) : (
              filteredBooks.map((book) => {
                const activeOrderId = book.currentOrderId || activeOrderIdByBook[book.id];
                const currentOrder = activeOrderId
                  ? orderMap[activeOrderId]
                  : undefined;
                const canShip = currentOrder?.status === "PENDING_SHIPMENT";
                const hasBorrowerReceived =
                  !!currentOrder?.shippingOutTrackingNumber &&
                  ["BORROWING", "OVERDUE", "RETURNED", "COMPLETED"].includes(
                    currentOrder?.status ?? ""
                  );
                const canMessageBorrower = !!currentOrder?.borrower?.email;
                const isTransferredBook =
                  book.status === "lent" || book.status === "sold";
                const counterpartyLabel = book.status === "sold" ? "Buyer" : "Borrower";
                const statusDisplay = getBookStatusDisplay(book, currentOrder);
                const depositSummary = activeOrderId
                  ? depositMap[activeOrderId]
                  : undefined;
                const financialBadge =
                  currentOrder && depositSummary
                    ? getDepositBadge({
                        orderStatus: currentOrder.status as OrderStatus,
                        depositStatus: depositSummary.depositStatus,
                        depositCents: depositSummary.depositCents,
                        depositDeductedCents: depositSummary.depositDeductedCents,
                        isBorrower: false, // /lending shows the lender's view
                      })
                    : null;

                return (
                <Card key={book.id} className="relative overflow-visible flex gap-4 p-4 border border-gray-200 rounded-xl hover:shadow-md transition">

                  {/* ⋯ more */}
                  <div className="absolute top-3 right-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => toggleMenu(e, book.id)}
                      className="border-none text-black hover:bg-black hover:text-white"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>

                    {openId === book.id && (
                      <div
                        className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded-lg shadow-lg z-20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {(book.status === "listed" || book.status === "unlisted") && (
                          <button
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                            onClick={() => router.push(`/lending/edit/${book.id}`)}
                          >
                            Edit
                          </button>
                        )}

                        <button
                          className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={() => router.push(`/borrowing/${book.id}/history`)}
                        >
                          History
                        </button>
                        <button
                          className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                          onClick={async (e) => {
                            e.stopPropagation();

                            if (!confirm("Are you sure you want to delete this book?")) return;

                            const success = await deleteBook(book.id);
                            if (success) {
                              setItems((prev) => prev.filter((b) => b.id !== book.id));
                              alert("Book deleted successfully.");
                            } else {
                              alert("Failed to delete book.");
                            }
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Cover img */}
                  <div className="w-28 h-36 flex-shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    <CoverImg src={book.coverImgUrl} title={book.titleOr} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      {/* title */}
                      <h3 className="text-lg font-semibold text-black">{book.titleOr}</h3>

                      {/* status +  createTime */}
                      <p className="text-sm text-gray-600 mt-1">
                        <span className={statusDisplay.className}>{statusDisplay.label}</span>
                        {statusDisplay.dateLabel && ` · ${statusDisplay.dateLabel}`}
                      </p>

                      {/* Financial badge (deposit-state surfacing per BRD §6.7) */}
                      {financialBadge && (
                        <div className="mt-2">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${financialBadge.className}`}
                          >
                            {financialBadge.label}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Button */}
                    <div className="flex gap-2 mt-3">
                      {book.status === "listed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-black text-black hover:bg-black hover:text-white"
                          onClick={async () => {
                            await updateBook(book.id, { status: "unlisted" });
                            setItems((prev) =>
                              prev.map((b) => (b.id === book.id ? { ...b, status: "unlisted" } : b))
                            );
                          }}
                        >
                          Unlist
                        </Button>
                      )}
                      {book.status === "unlisted" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-black text-black hover:bg-black hover:text-white"
                          onClick={async () => {
                            await updateBook(book.id, { status: "listed" });
                            setItems((prev) =>
                              prev.map((b) => (b.id === book.id ? { ...b, status: "listed" } : b))
                            );
                          }}
                        >
                          List
                        </Button>
                      )}
                      {isTransferredBook && (
                        <>
                          {activeOrderId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-black text-black hover:bg-black hover:text-white"
                              onClick={() => router.push(`/borrowing/${activeOrderId}`)}
                            >
                              View Detail
                            </Button>
                          )}

                          {activeOrderId && (canShip || hasBorrowerReceived) && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-black text-black hover:bg-black hover:text-white"
                              disabled={hasBorrowerReceived}
                              onClick={() => {
                                if (!hasBorrowerReceived) {
                                  openShipmentModal(activeOrderId, currentOrder);
                                }
                              }}
                            >
                              {hasBorrowerReceived
                                ? "Shipped"
                                : currentOrder?.shippingOutTrackingNumber
                                  ? "Update Shipping"
                                  : "Ship"}
                            </Button>
                          )}

                          <Button
                            size="sm"
                            className="bg-black text-white hover:bg-gray-800"
                            disabled={!canMessageBorrower}
                            onClick={() => {
                              if (!currentOrder?.borrower?.email) {
                                alert(`${counterpartyLabel} contact is not available yet.`);
                                return;
                              }

                              const params = new URLSearchParams({
                                to: currentOrder.borrower.email,
                                bookId: book.id,
                                bookTitle: book.titleOr,
                              });
                              router.push(`/message?${params.toString()}`);
                            }}
                          >
                            {`Message ${counterpartyLabel}`}
                          </Button>

                          {activeOrderId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-gray-300 text-gray-700 hover:bg-gray-100 flex items-center gap-1"
                              onClick={() =>
                                router.push(
                                  `/supports-complaints?orderId=${activeOrderId}`
                                )
                              }
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Open Complaint
                            </Button>
                          )}

                          {/* due date info when book lent-out */}

                        </>
                      )}
                    </div>
                  </div>
                </Card>
                );
              })
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title="Confirm Outbound Shipment"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Carrier</label>
            <select
              className="border rounded w-full p-2"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
            >
              <option value="AUSPOST">AUSPOST</option>
              <option value="OTHER">OTHER</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Tracking Number
            </label>
            <input
              type="text"
              className="border rounded w-full p-2"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="Enter tracking number"
            />
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShipModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmShipment}
              disabled={!trackingNumber.trim()}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
