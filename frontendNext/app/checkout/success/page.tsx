// app/checkout/success/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasStripePublishableKey, stripePromise } from "@/utils/stripe";
import { createOrder } from "@/utils/borrowingOrders";
import { getApiUrl } from "@/utils/auth";
import { useCartStore } from "@/app/store/cartStore";

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<"succeeded" | "processing" | "canceled" | "unknown">("unknown");
  const [pi, setPi] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [orderCreated, setOrderCreated] = useState(false);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [confirmStatus, setConfirmStatus] = useState<"idle" | "confirming" | "done" | "error">("idle");
  const fetchCart = useCartStore((state) => state.fetchCart);

  const log = (msg: string, extra?: any) => {
    console.log(msg, extra ?? "");
    setLogs(prev => [...prev, `${msg} ${extra ? JSON.stringify(extra) : ""}`]);
  };

  // Confirm order with backend (fallback for when webhook doesn't fire)
  const confirmOrder = async (paymentId: string) => {
    setConfirmStatus("confirming");
    try {
      const apiUrl = getApiUrl();
      const token = localStorage.getItem("access_token");
      const res = await fetch(`${apiUrl}/api/v1/payment_gateway/payment/confirm-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ payment_id: paymentId }),
      });

      if (res.ok) {
        const data = await res.json();
        setOrderIds(data.order_ids || []);
        setConfirmStatus("done");
        // Refresh cart (items should be cleared by backend)
        fetchCart();
        // Trigger notification badge refresh in Header
        window.dispatchEvent(new Event("notif-update"));
      } else {
        const rawText = await res.text();
        let err: any = {};

        if (rawText) {
          try {
            err = JSON.parse(rawText);
          } catch {
            err = { rawText };
          }
        }

        console.error("Confirm order failed:", {
          status: res.status,
          statusText: res.statusText,
          ...err,
        });
        setConfirmStatus("error");
      }
    } catch (e) {
      console.error("Confirm order error:", e);
      setConfirmStatus("error");
    }
  };

  useEffect(() => {
    (async () => {
      const p = new URLSearchParams(window.location.search);
      const paymentIntentFromUrl = p.get("payment_intent");
      const redirectStatus = p.get("redirect_status");
      const csFromUrl = p.get("payment_intent_client_secret");

      let clientSecret =
        csFromUrl || localStorage.getItem("last_pi_client_secret") || "";
      let piId =
        paymentIntentFromUrl || localStorage.getItem("last_pi_id") || null;

      setPi(piId);

      // Clean up localStorage
      localStorage.removeItem("last_pi_client_secret");
      localStorage.removeItem("last_pi_id");

      if (!clientSecret) {
        if (piId) {
          log("[success] no client_secret, but have PI ->", {
            paymentIntentId: piId,
            redirectStatus,
          });
          if (redirectStatus === "succeeded") {
            setStatus("succeeded");
            await confirmOrder(piId);
          } else {
            setStatus("processing");
            await confirmOrder(piId);
          }
        } else {
          setStatus("unknown");
        }
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        setStatus("unknown");
        return;
      }

      const { paymentIntent: piObj, error } =
        await stripe.retrievePaymentIntent(clientSecret);
      if (error) {
        setStatus("unknown");
        return;
      }

      setPi(piObj?.id || piId);
      const finalPiId = piObj?.id || piId;
      const checkoutId = localStorage.getItem("last_checkout_id") || "";
      localStorage.removeItem("last_checkout_id");

      switch (piObj?.status) {
        case "succeeded":
          setStatus("succeeded");
          if (piObj?.id && checkoutId) {
            try {
              const createdKey = `order_created_for_${checkoutId}`;
              if (!sessionStorage.getItem(createdKey)) {
                await createOrder(checkoutId, piObj.id);
                sessionStorage.setItem(createdKey, "1");
              }
              setOrderCreated(true);
            } catch (orderError: any) {
              log("[success] createOrder failed ->", orderError?.response?.data || orderError);
              if (finalPiId) {
                await confirmOrder(finalPiId);
              }
            }
          } else if (finalPiId) {
            await confirmOrder(finalPiId);
          }
          break;
        case "processing":
        case "requires_action":
          setStatus("processing");
          if (finalPiId) {
            await confirmOrder(finalPiId);
          }
          break;
        case "requires_payment_method":
        case "canceled":
          setStatus("canceled");
          break;
        default:
          setStatus("unknown");
      }
    })();
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Payment Result</h1>

      {status === "succeeded" && (
        <div className="p-4 rounded-md bg-green-50 border border-green-200">
          <p className="font-medium text-green-700">Payment succeeded!</p>
          <p className="text-sm text-green-700">Payment Intent: {pi}</p>
          {confirmStatus === "done" && orderIds.length > 0 && (
            <p className="text-sm text-green-700 mt-1">
              Order created successfully. You can view it in your borrowing orders.
            </p>
          )}
          {confirmStatus === "confirming" && (
            <p className="text-sm text-green-600 mt-1">Creating your order...</p>
          )}
          {confirmStatus === "error" && (
            <p className="text-sm text-yellow-700 mt-1">
              Order may take a moment to appear. Please check your borrowing orders.
            </p>
          )}
        </div>
      )}

      {status === "processing" && (
        <div className="p-4 rounded-md bg-yellow-50 border border-yellow-200">
          <p className="font-medium text-yellow-800">Payment processing...</p>
          {confirmStatus === "confirming" && (
            <p className="text-sm text-yellow-700 mt-1">Creating your order...</p>
          )}
          {confirmStatus === "done" && (
            <p className="text-sm text-green-700 mt-1">Order created successfully!</p>
          )}
          {confirmStatus === "idle" || confirmStatus === "error" ? (
            <p className="text-sm text-yellow-800">We'll update your order once it clears.</p>
          ) : null}
        </div>
      )}

      {(status === "canceled" || status === "unknown") && (
        <div className="p-4 rounded-md bg-red-50 border border-red-200">
          <p className="font-medium text-red-700">Payment not completed.</p>
          <p className="text-sm text-red-700">
            {hasStripePublishableKey
              ? "You can try again from the checkout page."
              : "Stripe is not configured. Set `NEXT_PUBLIC_STRIPE_PK` and rebuild the frontend."}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <Link href="/borrowing" className="px-4 py-2 rounded-md bg-black text-white">
          View Orders
        </Link>
      </div>
    </div>
  );
}
