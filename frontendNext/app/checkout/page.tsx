"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Card from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import Input from "@/app/components/ui/Input";
import { LoadingState } from "@/app/components/ui/AsyncState";

import { getCurrentUser, updateUser, getUserById } from "@/utils/auth";
import type { User } from "@/app/types/user";
import { getBookById } from "@/utils/books";

import { getMyCheckouts, rebuildCheckout } from "@/utils/checkout";
import { listServiceFees } from "@/utils/serviceFee";
import { getShippingQuotes } from "@/utils/shipping";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { hasStripePublishableKey, stripePromise } from "@/utils/stripe";
import { initiatePayment } from "@/utils/payments";

// When the page loads → Check if checkout exists, create a new one if not
// The total amount is based on the calculation result returned by the backend
// Changing the address or modifying the shipping method → Rebuild the checkout (update)
// Clicking to Pay Now → Submit the checkout → jump to Stript to pay → Confirm → Create order

type DeliveryChoice = "post" | "pickup"; // delivery == post

type ShippingQuote = {
  id: string;
  ownerId: string;
  method: "post" | "pickup";
  carrier?: string;
  serviceLevel?: string; // Standard/Express
  cost: number; // AUD dollars
  currency: "AUD";
  etaDays?: string;
  expiresAt: string; // ISO
  serviceCode?: string;
};

interface CheckoutItem {
  itemId: string;
  bookId: string;
  ownerId: string;
  titleOr: string;
  actionType: "BORROW" | "PURCHASE";
  price?: number;
  deposit?: number;
  deliveryMethod?: "post" | "pickup" | "both";
  shippingMethod?: "post" | "pickup";
  shippingQuote?: number;
}

type PaymentConfirmFormProps = {
  clientSecret: string;
  onSuccess?: () => void;
};

const TEST_DESTINATION_ACCOUNT_ID =
  process.env.NEXT_PUBLIC_STRIPE_TEST_DESTINATION_ACCOUNT_ID || "acct_1TGXxXQvCdOoVRC6";

function PaymentConfirmForm({ clientSecret, onSuccess }: PaymentConfirmFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || !ready) return;

    setSubmitting(true);
    setErr(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setSubmitting(false);
      setErr(submitError.message || "Please check your details.");
      return;
    }

    const result = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url:
          typeof window !== "undefined"
            ? `${window.location.origin}/checkout/success`
            : undefined,
      },
      redirect: "if_required",
    });

    setSubmitting(false);

    if (result.error) {
      setErr(result.error.message || "Payment failed");
      return;
    }

    onSuccess?.();
  };

  return (
    <form onSubmit={handleConfirm} className="space-y-3">
      <PaymentElement
        onReady={() => setReady(true)}
        onChange={() => setReady(true)}
      />
      <button
        className="px-4 py-2 rounded-md bg-black text-white w-full"
        disabled={!stripe || !elements || !ready || submitting}
      >
        {submitting ? "Processing..." : "Confirm Payment"}
      </button>
      {err && <p className="text-red-600 text-sm">{err}</p>}
    </form>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const [globalShippingChoice, setGlobalShippingChoice] = useState<"standard" | "express" | null>("standard");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [checkouts, setCheckouts] = useState<any[]>([]);
<<<<<<< HEAD
  const [ownersMap, setOwnersMap] = useState<
    Record<string, { name: string; zipCode: string; stripeAccountId?: string }>
  >({});
  const [ownersMissingZip, setOwnersMissingZip] = useState<string[]>([]);
=======
  const [ownersMap, setOwnersMap] = useState<Record<string, { name: string; zipCode: string; stripeAccountId?: string | null }>>({});
>>>>>>> Alice_email
  const [serviceRate, setServiceRate] = useState<number>(0);
  const currentCheckout = checkouts.length > 0 ? checkouts[0] : null;
  const items: CheckoutItem[] = currentCheckout?.items || [];
  const [fullItems, setFullItems] = useState<any[]>([]);

  // Per-item shipping choice (default by book capability)
  const [itemShipping, setItemShipping] = useState<Record<string, "post" | "pickup" | "">>({});

  // Quotes per owner for DELIVERY (post)
  const [quotesByOwner, setQuotesByOwner] = useState<Record<string, ShippingQuote[]>>({});
  const [selectedQuoteByOwner, setSelectedQuoteByOwner] = useState<Record<string, ShippingQuote>>({});
  const [isEditing, setIsEditing] = useState(false);

  const [rebuilding, setRebuilding] = useState(false);
  const [loading, setLoading] = useState(false);
  const checkoutFields = [
    { f: "contactName", label: "Full Name" },
    { f: "phone", label: "Phone Number" },
    { f: "street", label: "Street Address" },
    { f: "city", label: "City" },
    { f: "state", label: "State" },
    { f: "postcode", label: "Postcode" },
  ];

  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState<string>("");
  const [deliveryMethodSaved, setDeliveryMethodSaved] = useState(false);


  // 1. load current user, fill address info
  useEffect(() => {
    async function loadUser() {
      const user = await getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }
    }
    loadUser();
  }, []);

  // 1. load owner info
  useEffect(() => {
    async function loadOwners() {
      const uniqueOwnerIds = Array.from(new Set(items.map((b) => b.ownerId)));
<<<<<<< HEAD
      const map: Record<string, { name: string; zipCode: string; stripeAccountId?: string }> = {};
      const missingZipOwnerIds: string[] = [];
=======
      const map: Record<string, { name: string; zipCode: string; stripeAccountId?: string | null }> = {};
>>>>>>> Alice_email

      for (const id of uniqueOwnerIds) {
        try {
          const u = await getUserById(id);
          if (!u?.zipCode?.trim()) {
            missingZipOwnerIds.push(id);
          }
          map[id] = {
            name: [u?.firstName, u?.lastName].filter(Boolean).join(" ") || "Unknown Owner",
            zipCode: u?.zipCode || "0000",
<<<<<<< HEAD
            stripeAccountId: u?.stripe_account_id,
          };
        } catch {
          missingZipOwnerIds.push(id);
          map[id] = { name: "Unknown Owner", zipCode: "0000", stripeAccountId: undefined };
=======
            stripeAccountId: u?.stripe_account_id || null,
          };
        } catch {
          map[id] = { name: "Unknown Owner", zipCode: "0000", stripeAccountId: null };
>>>>>>> Alice_email
        }
      }

      setOwnersMap(map);
      setOwnersMissingZip(missingZipOwnerIds);
    }

    if (items.length > 0) loadOwners();
  }, [items]);


  // 2. init checkout
  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      let data = await getMyCheckouts();
      if (!data || data.length === 0) {
        const newCheckout = await rebuildCheckout(currentUser, [], {}, {});
        data = [newCheckout];
      }
      setCheckouts(data);
    })();
  }, [currentUser]);

  // 3. enrich items with book info
  useEffect(() => {
    if (!items.length) return;
    (async () => {
      const results = await Promise.all(
        items.map(async (it) => {
          try {
            const book = await getBookById(it.bookId);
            return { ...it, titleOr: book?.titleOr, deliveryMethod: book?.deliveryMethod };
          } catch {
            return { ...it, titleOr: "Unknown Book", deliveryMethod: "" };
          }
        })
      );
      setFullItems(results);

      // initiate itemShipping
      const next: Record<string, DeliveryChoice | ""> = {};
      for (const b of results) {
        if (b.deliveryMethod === "post") {
          next[b.bookId] = "post";
        } else if (b.deliveryMethod === "pickup") {
          next[b.bookId] = "pickup";
        } else {
          next[b.bookId] = b.shippingMethod || ""; // both 或 未设置时，保持空，交给用户选择
        }
      }
      setItemShipping(next);
    })();
  }, [items]);

  // 4. init shipping state
  useEffect(() => {
    if (!items.length || Object.keys(itemShipping).length > 0) return;
    setItemShipping(Object.fromEntries(items.map((b) => [b.bookId, ""])) as Record<string, DeliveryChoice | "">);
  }, [items]);

  // 5. load service fee
  useEffect(() => {
    listServiceFees().then((fees) => {
      const activePercent = fees.find((f: any) => f.feeType === "PERCENT" && f.status);
      if (activePercent) setServiceRate(Number(activePercent.value));
    });
  }, []);


  // ---------- useEffect initialize shipping ----------
  useEffect(() => {
    if (!items.length) return;

    if (Object.keys(itemShipping).length > 0) return;

    const next: Record<string, "post" | "pickup" | ""> = {};
    for (const b of items) {
      next[b.bookId] = ""; // default empty
    }
    setItemShipping(next);
  }, [items]);

  // save address
  const saveAddress = async () => {
    if (!currentUser || !currentCheckout) return;
    await updateUser({
      id: currentUser.id,
      state: currentCheckout.state,
      city: currentCheckout.city,
      zipCode: currentCheckout.postcode,
      streetAddress: currentCheckout.street,
      name: currentCheckout.contactName,
      phoneNumber: currentCheckout.phone,
    });

    const cleaned = Object.fromEntries(currentCheckout.items.map((it: any) => [it.bookId, it.shippingMethod]));
    const newCheckout = await rebuildCheckout(currentUser, fullItems, cleaned, selectedQuoteByOwner);
    setCheckouts([newCheckout]);
    setIsEditing(false);
    alert("Address saved!");
  };

  // ---------- Get quotes per owner for DELIVERY items ----------
  async function requestQuotes() {
    if (!currentCheckout) return;
    console.log("[requestQuotes] start... currentCheckout:", currentCheckout);

    const now = Date.now();
    const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
    const result: Record<string, ShippingQuote[]> = {};

    const deliveryGroups: Record<string, any[]> = {};
    for (const b of items) {
      if (itemShipping[b.bookId] === "post") {
        (deliveryGroups[b.ownerId] ||= []).push(b);
      }
    }

    for (const ownerId of Object.keys(deliveryGroups)) {
      const group = deliveryGroups[ownerId];
      const length = 30;
      const width = 20;
      const height = 5 * group.length;
      const weight = 0.5 * group.length;

      try {
        const data = await getShippingQuotes(
          ownersMap[ownerId]?.zipCode || "6000",
          String(currentCheckout.postcode || ""),
          length,
          width,
          height,
          weight
        );
        result[ownerId] = [
          {
            id: `${ownerId}-STD`,
            ownerId,
            method: "post",
            carrier: "AusPost",
            serviceLevel: "Standard",
            cost: parseFloat(String(data.AUS_PARCEL_REGULAR?.total_cost ?? "0")),
            currency: "AUD",
            etaDays: data.AUS_PARCEL_REGULAR?.delivery_time || "-",
            expiresAt,
          },
          {
            id: `${ownerId}-EXP`,
            ownerId,
            method: "post",
            carrier: "AusPost",
            serviceLevel: "Express",
            cost: parseFloat(String(data.AUS_PARCEL_EXPRESS?.total_cost ?? "0")),
            currency: "AUD",
            etaDays: data.AUS_PARCEL_EXPRESS?.delivery_time || "-",
            expiresAt,
          },
        ];
      } catch (err) {
        console.error(`Failed to fetch quotes for ${ownerId}:`, err);
        result[ownerId] = [];
      }
    }
    setQuotesByOwner(result);
    // default Standard
    const defaults: Record<string, ShippingQuote> = {};
    for (const [ownerId, quotes] of Object.entries(result)) {
      const std = quotes.find((q) => q.serviceLevel === "Standard");
      if (std) defaults[ownerId] = std;
    }
    setSelectedQuoteByOwner(defaults);

    setGlobalShippingChoice("standard");

    // rebuildCheckout
    if (Object.keys(defaults).length > 0) {
      const cleaned = Object.fromEntries(
        fullItems.map((it) => [it.bookId, itemShipping[it.bookId]])
      ) as Record<string, DeliveryChoice>;
      const newCheckout = await rebuildCheckout(currentUser!, fullItems, cleaned, defaults);
      setCheckouts([newCheckout]);
    }
  }

  // save delivery method
  const saveDeliveryMethod = async () => {
    const unselected = items.filter((b) => !itemShipping[b.bookId]);
    if (unselected.length > 0) {
      alert("Please select delivery method for all items before saving.");
      return;
    }

    const cleaned = Object.fromEntries(
      Object.entries(itemShipping).filter(([, v]) => v)
    ) as Record<string, DeliveryChoice>;

    setItemShipping(cleaned);
    console.log("[saveDeliveryMethod] calling requestQuotes...");

    await requestQuotes();
    setDeliveryMethodSaved(true);
    alert("Delivery methods saved!");
  };


  // ---------- Handlers ----------
  const setChoice = (bookId: string, value: DeliveryChoice) => {
    setItemShipping(prev => {
      const next = { ...prev, [bookId]: value };
      return next;
    });
    // Mark delivery as unsaved when user changes selection
    setDeliveryMethodSaved(false);
  };


  // initiate PaymentIntent，to get client_secret
  const startPayment = async (donation: number = 0) => {
    const co = checkouts[0];
    if (!co || !currentUser) return;

<<<<<<< HEAD
    const ownerIds = Array.from(new Set(items.map((it) => it.ownerId))).filter(Boolean);
    const lenderAccountId =
      ownerIds.length > 0 ? ownersMap[ownerIds[0]]?.stripeAccountId : undefined;

    if (!lenderAccountId) {
      alert("Owner payout account is not set. Please contact the book owner and try again.");
      return;
    }

    const toCents = (n: number | undefined | null) =>
      Math.max(0, Math.round((n || 0) * 100));
    console.log("[startPayment] lenderAccountId =", lenderAccountId);
    console.log("[startPayment] checkout[0] =", co);
    console.log("[startPayment] donation =", donation);

    const totalAmount = co.totalDue + donation;
=======
    const ownerIds = Array.from(new Set(items.map((item) => item.ownerId).filter(Boolean)));
    const lenderAccountId =
      ownerIds.map((ownerId) => ownersMap[ownerId]?.stripeAccountId).find(Boolean) ||
      TEST_DESTINATION_ACCOUNT_ID;
>>>>>>> Alice_email

    try {
      setPaying(true);
      const toCents = (n: number | undefined | null) =>
        Math.max(0, Math.round((n || 0) * 100));
      const totalAmount = co.totalDue + donation;

      const res = await initiatePayment({
        user_id: currentUser.id,
        amount: toCents(totalAmount),
        currency: "aud",
        purchase: toCents(co.bookFee),
        deposit: toCents(co.deposit),
        shipping_fee: toCents(co.shippingFee),
        service_fee: toCents(co.serviceFee),
        donation: toCents(donation),
        checkout_id: co.checkoutId,
        lender_account_id: lenderAccountId,
      });

      if (typeof window !== "undefined") {
        localStorage.setItem("last_pi_id", res.payment_id);
        localStorage.setItem("last_pi_client_secret", res.client_secret);
        localStorage.setItem("last_checkout_id", co.checkoutId);
      }

      setClientSecret(res.client_secret);
      setShowDonationModal(false);
    } catch (e: any) {
      console.error("initiatePayment failed:", e?.response?.data || e);
      alert(e?.response?.data?.detail || "Failed to initiate payment");
    } finally {
      setPaying(false);
    }
  };

  const handleCheckout = () => {
    // Validate address fields
    const co = checkouts[0];
    if (!co) return;

    const requiredFields = [
      { field: 'contactName', label: 'Full Name' },
      { field: 'phone', label: 'Phone Number' },
      { field: 'street', label: 'Street Address' },
      { field: 'city', label: 'City' },
      { field: 'state', label: 'State' },
      { field: 'postcode', label: 'Postcode' }
    ];

    const missingFields = requiredFields.filter(({ field }) => !co[field]?.trim());

    if (missingFields.length > 0) {
      const fieldNames = missingFields.map(({ label }) => label).join(', ');
      alert(`Please fill in the following required fields: ${fieldNames}`);
      return;
    }

    // Check if address is being edited
    if (isEditing) {
      alert("Please save your delivery address before checkout.");
      return;
    }

    // Validate delivery methods are selected
    const unselected = items.filter((b) => !itemShipping[b.bookId]);
    if (unselected.length > 0) {
      alert("Please select delivery method for all items before checkout.");
      return;
    }

    // Check if delivery methods have been saved
    if (!deliveryMethodSaved) {
      alert("Please save your delivery methods by clicking the 'Save Delivery Method' button.");
      return;
    }

    // Backend requires owner zipcode for checkout creation/update.
    if (ownersMissingZip.length > 0) {
      const ownerNames = ownersMissingZip.map((id) => ownersMap[id]?.name || id).join(", ");
      alert(
        `Checkout cannot continue because owner profile postcode is missing: ${ownerNames}. ` +
        "Please contact the owner(s) to complete their profile postcode."
      );
      return;
    }

    setShowDonationModal(true);
  };

  const handleDonationSubmit = () => {
    const donation = parseFloat(donationAmount) || 0;
    if (donation < 0) {
      alert("Donation amount cannot be negative");
      return;
    }
    startPayment(donation);
  };


  // ---------- When Empty ----------
  if (!items.length) {
    return (
      <div className="p-6">
        <LoadingState
          title="Preparing checkout..."
          description="Loading cart items, shipping options, and pricing."
        />
      </div>
    );
  }

  console.log("Checkout created:", checkouts)
  console.log("fullItems grouped:", Object.entries(
    fullItems.reduce((acc, it) => {
      (acc[it.ownerId] ||= []).push(it);
      return acc;
    }, {} as Record<string, CheckoutItem[]>)
  ));

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      <h1 className="text-2xl font-bold">Checkout</h1>

      {/* Address */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Delivery Address</h2>

            {isEditing ? (
              <Button variant="outline" onClick={saveAddress} className="text-sm">Save</Button>
            ) : (
              <Button variant="outline" onClick={() => setIsEditing(true)} className="text-sm">Edit</Button>
            )}
          </div>
          {/* address form */}
          {checkouts.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {checkoutFields.map(({ f, label }) => (
                <Input key={f} label={label} value={checkouts[0][f] || ""} disabled={!isEditing}
                  onChange={(e) => setCheckouts((prev) => prev.length ? [{ ...prev[0], [f]: e.target.value }] : prev)}
                />
              ))}
            </div>
          )}
        </div>
      </Card>


      {/* Items & Delivery */}
      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Items & Delivery</h2>
            <Button variant="outline" onClick={saveDeliveryMethod} className="text-sm">Save Delivery Method</Button>

          </div>

          {/* Items group */}
          <div className="space-y-4">
            {Object.entries(
              fullItems.reduce<Record<string, typeof fullItems[number][]>>((acc, item) => {
                (acc[item.ownerId] ||= []).push(item); return acc;
              }, {})).map(([ownerId, ownerItems]) => (
                <div key={ownerId} className="border rounded-md p-4 space-y-3 bg-gray-100">
                  <div className="font-semibold">📚 Owner: {ownersMap[ownerId]?.name}</div>
                  <div className="divide-y space-y-2">
                    {ownerItems.map((b: CheckoutItem) => (
                      <div key={b.bookId} className="py-3">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div className="font-medium">
                              《{b.titleOr}》
                              <span className="text-sm text-blue-600">
                                Trading Way: {b.actionType === "BORROW" ? "Borrow" : "Purchase"}
                              </span>
                            </div>
                          </div>

                          {/* Post / Pickup select */}
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-gray-700">Delivery Method:</span>
                            {b.deliveryMethod === "post" && (
                              <span className="px-4 py-1 rounded bg-black text-white text-sm">Post</span>
                            )}
                            {b.deliveryMethod === "pickup" && (
                              <span className="px-4 py-1 rounded bg-black text-white text-sm">Pickup</span>
                            )}
                            {b.deliveryMethod === "both" && (
                              <select
                                value={itemShipping[b.bookId]}
                                onChange={(e) => setChoice(b.bookId, e.target.value as DeliveryChoice)}
                                className="px-3 py-1 border rounded bg-white text-sm"
                              >
                                <option value="" disabled>-- Select option --</option>
                                <option value="post">Post</option>
                                <option value="pickup">Pickup</option>
                              </select>
                            )}
                          </div>
                        </div>

                        {/* Pickup hint */}
                        {itemShipping[b.bookId] === "pickup" && (
                          <p className="text-sm text-green-700 mt-2">
                            Pickup is free. Details will be shared after order.
                          </p>
                        )}
                        {/* Delivery hint */}
                        {itemShipping[b.bookId] === "post" && (
                          <p className="text-sm text-orange-700 mt-2">
                            Shipping fees will be calculated after Save Delivery Method.
                          </p>
                        )}


                      </div>
                    ))}
                  </div>
                  {/* Shipping Quotes（if chose delivery, display under this owner） */}
                  {ownerItems.some((b) => itemShipping[b.bookId] === "post") &&
                    quotesByOwner[ownerId]?.length > 0 && (
                      <div className="mt-4 p-4 rounded-md border bg-white">
                        <h4 className="text-sm font-semibold mb-2 text-gray-800">
                          AusPost Shipping Quotes
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {quotesByOwner[ownerId].map((q) => {
                            const choiceKey = q.serviceLevel === "Standard" ? "standard" : "express";
                            return (
                              <button
                                key={q.id}
                                type="button"
                                onClick={async () => {
                                  setGlobalShippingChoice(choiceKey);

                                  // 所有 owner 都选择相同 serviceLevel
                                  const updated: Record<string, ShippingQuote> = {};
                                  for (const [oid, quotes] of Object.entries(quotesByOwner)) {
                                    const match = quotes.find(
                                      (x) => x.serviceLevel?.toLowerCase() === choiceKey
                                    );
                                    if (match) {
                                      updated[oid] = {
                                        ...match,
                                        serviceCode: choiceKey === "express"
                                          ? "AUS_PARCEL_EXPRESS"
                                          : "AUS_PARCEL_REGULAR",
                                      } as any;
                                    }
                                  }
                                  setSelectedQuoteByOwner(updated);

                                  // rebuild checkout
                                  const cleaned = Object.fromEntries(
                                    fullItems.map((it) => [it.bookId, itemShipping[it.bookId]])
                                  ) as Record<string, DeliveryChoice>;

                                  const newCheckout = await rebuildCheckout(currentUser!, fullItems, cleaned, updated);
                                  setCheckouts([newCheckout]);

                                }}
                                className={`px-3 py-2 rounded border text-sm ${selectedQuoteByOwner[ownerId]?.id === q.id
                                  ? "bg-black text-white"
                                  : "bg-white hover:bg-gray-50"
                                  }`}
                              >
                                {q.carrier} {q.serviceLevel} • ${q.cost} • ETA {q.etaDays || "-"}d
                              </button>
                            );
                          })}
                        </div>

                      </div>
                    )}
                </div>
              ))}
          </div>
        </div>
      </Card>

      {/* Summary */}
      <Card>
        <div className="p-4 space-y-2">
          <h2 className="text-lg font-semibold">Order Summary</h2>
          <div className="flex justify-between text-sm">
            <span>Deposits (Refundable)</span>
            <span>${checkouts[0]?.deposit?.toFixed(2) || "0.00"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Purchase Price</span>
            <span>${checkouts[0]?.bookFee?.toFixed(2) || "0.00"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Shipping Fee</span>
            <span>${checkouts[0]?.shippingFee?.toFixed(2) || "0.00"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Platform Service Fees (10%)</span>
            <span>${checkouts[0]?.serviceFee?.toFixed(2) || "0.00"}</span>
          </div>
          {donationAmount && parseFloat(donationAmount) > 0 && (
            <div className="flex justify-between text-sm text-green-600 font-medium">
              <span>Donation (Thank you! ❤️)</span>
              <span>${parseFloat(donationAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>Total {donationAmount && parseFloat(donationAmount) > 0 ? "to Pay" : "Due"}</span>
            <span>
              ${((checkouts[0]?.totalDue || 0) + (parseFloat(donationAmount) || 0)).toFixed(2)}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Deposits may be refundable upon return. Shipping is charged per owner based on your selected quote.
          </p>
        </div>
      </Card>

      {/* Summary 卡片后面 */}
      {!clientSecret ? (
        <div className="flex justify-end">
          <Button className="bg-black text-white" onClick={handleCheckout} disabled={paying}>
            {paying ? "Preparing..." : "Checkout"}
          </Button>
        </div>
      ) : !hasStripePublishableKey ? (
        <Card>
          <div className="p-4 rounded-md bg-red-50 border border-red-200 text-red-700">
            Stripe is not configured. Set `NEXT_PUBLIC_STRIPE_PK` in your environment and rebuild the frontend.
          </div>
        </Card>
      ) : (
        <Elements
          key={clientSecret}
          stripe={stripePromise}
          options={{ clientSecret, appearance: { labels: "floating" }, loader: "auto" }}
        >
          <div className="p-4 rounded-md border">
            <PaymentConfirmForm
              clientSecret={clientSecret}
              onSuccess={() => {
                // 保底：也把最近一次 PI 放到本地，success 页可读取
                const id = localStorage.getItem("last_pi_id") || "";
                window.location.href = `/checkout/success${id ? `?payment_intent=${id}` : ""}`;
                // 或者：router.push("/checkout/success")
              }}
            />
          </div>
        </Elements>

      )}

      {/* Donation Modal */}
      {showDonationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-2xl font-bold mb-4">Support BookBorrow</h2>
            <p className="text-gray-600 mb-4">
              Would you like to make a donation to support our platform? Your contribution helps us maintain and improve BookBorrow for the community.
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Donation Amount (Optional)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-8 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter any amount you'd like to donate (leave empty for no donation)
              </p>
            </div>

            {/* Quick donation buttons */}
            <div className="mb-6">
              <p className="text-sm font-medium text-gray-700 mb-2">Quick select:</p>
              <div className="flex gap-2">
                {[5, 10, 20, 50].map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setDonationAmount(amount.toString())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50 text-sm"
                  >
                    ${amount}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 mb-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Order Total</span>
                <span>${checkouts[0]?.totalDue?.toFixed(2) || "0.00"}</span>
              </div>
              {donationAmount && parseFloat(donationAmount) > 0 && (
                <div className="flex justify-between text-sm text-green-600 mb-2">
                  <span>Donation</span>
                  <span>+${parseFloat(donationAmount).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total to Pay</span>
                <span>
                  ${((checkouts[0]?.totalDue || 0) + (parseFloat(donationAmount) || 0)).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDonationModal(false);
                  setDonationAmount("");
                }}
                disabled={paying}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDonationSubmit}
                disabled={paying}
                className="flex-1 bg-black text-white"
              >
                {paying ? "Processing..." : "Pay Now"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
