// app/checkout/success/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasStripePublishableKey, stripePromise } from "@/utils/stripe";
import { createOrder } from "@/utils/borrowingOrders";

export default function CheckoutSuccessPage() {
  const [status, setStatus] = useState<"succeeded"|"processing"|"canceled"|"unknown">("unknown");
  const [pi, setPi] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [orderCreated, setOrderCreated] = useState(false);

  const log = (msg: string, extra?: any) => {
    console.log(msg, extra ?? "");
    setLogs(prev => [...prev, `${msg} ${extra ? JSON.stringify(extra) : ""}`]);
  };

  useEffect(() => {
  (async () => {
    const p = new URLSearchParams(window.location.search);
    const paymentIntentFromUrl = p.get("payment_intent");
    const redirectStatus = p.get("redirect_status");
    const csFromUrl = p.get("payment_intent_client_secret");

    log("[success] params ->", {
      paymentIntentId: paymentIntentFromUrl,
      redirectStatus,
      clientSecret: csFromUrl,
    });

    // 先从 URL，再从 localStorage 兜底
    let clientSecret =
      csFromUrl || localStorage.getItem("last_pi_client_secret") || "";

    let piId =
      paymentIntentFromUrl || localStorage.getItem("last_pi_id") || null;
    const checkoutId = localStorage.getItem("last_checkout_id") || "";

    setPi(piId);

    // 读完就清理，避免下次误读
    localStorage.removeItem("last_pi_client_secret");
    localStorage.removeItem("last_pi_id");
    localStorage.removeItem("last_checkout_id");

    // 没有 client_secret：多数是 no-redirect 的成功场景
    // 先展示 processing，等 webhook 创建订单
    if (!clientSecret) {
      if (piId) {
        log("[success] no client_secret, but have PI -> processing");
        setStatus("processing");
      } else {
        log("[success] no client_secret & no PI -> unknown");
        setStatus("unknown");
      }
      return;
    }

    const stripe = await stripePromise;
    if (!stripe) {
      log("[success] stripe not loaded");
      setStatus("unknown");
      return;
    }

    const { paymentIntent: piObj, error } =
      await stripe.retrievePaymentIntent(clientSecret);

    log("[success] retrievePaymentIntent ->", {
      piId: piObj?.id,
      status: piObj?.status,
      error,
    });

    if (error) {
      setStatus("unknown");
      return;
    }

    setPi(piObj?.id || piId);

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
          }
        }
        break;
      case "processing":
      case "requires_action":
        setStatus("processing");
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
          <p className="text-sm text-green-700">
            {orderCreated ? "Order created successfully." : "Payment succeeded. Finalizing your order..."}
          </p>
        </div>
      )}

      {status === "processing" && (
        <div className="p-4 rounded-md bg-yellow-50 border border-yellow-200">
          <p className="font-medium text-yellow-800">Payment processing...</p>
          <p className="text-sm text-yellow-800">We’ll update your order once it clears.</p>
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
        <Link href="/borrowing" className="px-4 py-2 rounded-md bg-black text-white">View Orders</Link>
      </div>
    </div>
  );
}
