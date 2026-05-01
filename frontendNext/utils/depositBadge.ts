// Shared financial-badge mapping for order rows on /borrowing and /lending.
// Mirrors BRD v2.4 §6.7 (PR #97 refund_ready model).

import type { OrderStatus } from "@/app/types/order";
import type { DepositSummaryItem } from "@/utils/deposits";

export type DepositStatus = DepositSummaryItem["depositStatus"];

export interface DepositBadge {
  label: string;
  className: string;
  highlight?: boolean; // refund_ready (borrower view) — animate + clickable
}

const fmt = (cents: number) => `A$${(cents / 100).toFixed(2)}`;

export function getDepositBadge(args: {
  orderStatus: OrderStatus;
  depositStatus?: DepositStatus | null;
  depositCents: number;
  depositDeductedCents: number;
  isBorrower: boolean;
}): DepositBadge | null {
  const {
    orderStatus,
    depositStatus,
    depositCents,
    depositDeductedCents,
    isBorrower,
  } = args;
  const refundable = depositCents - depositDeductedCents;

  if (orderStatus === "CANCELED") {
    return {
      label: "Total refunded ✓",
      className: "bg-emerald-50 text-emerald-700 border-emerald-200",
    };
  }

  if (orderStatus === "PENDING_SHIPMENT") {
    return {
      label: `${fmt(depositCents)} deposit held · Cancellable`,
      className: "bg-amber-50 text-amber-700 border-amber-200",
    };
  }

  if (orderStatus === "BORROWING" || orderStatus === "OVERDUE") {
    // Borrower's money is exposed to deduction; lender just sees the platform
    // is holding the borrower's deposit until return is confirmed.
    return isBorrower
      ? {
          label: `${fmt(depositCents)} deposit at risk`,
          className: "bg-orange-50 text-orange-700 border-orange-200",
        }
      : {
          label: `${fmt(depositCents)} held by platform`,
          className: "bg-blue-50 text-blue-700 border-blue-200",
        };
  }

  if (orderStatus === "RETURNED") {
    if (depositStatus === "pending_review") {
      return {
        label: `Pending review · ${fmt(depositCents)} at stake`,
        className: "bg-yellow-50 text-yellow-700 border-yellow-200",
      };
    }
    return {
      label: "Awaiting lender confirmation",
      className: "bg-gray-50 text-gray-700 border-gray-200",
    };
  }

  if (orderStatus === "COMPLETED") {
    switch (depositStatus) {
      case "pending_review":
        return {
          label: `Pending review · ${fmt(depositCents)} at stake`,
          className: "bg-yellow-50 text-yellow-700 border-yellow-200",
        };
      case "refund_ready":
        return isBorrower
          ? {
              label: `✋ Click to claim ${fmt(refundable)} refund`,
              className:
                "bg-emerald-500 text-white border-emerald-600 animate-pulse",
              highlight: true,
            }
          : {
              label: "Decision made · awaiting borrower claim",
              className: "bg-gray-100 text-gray-500 border-gray-200",
            };
      case "released":
        return {
          label: "Deposit refunded ✓",
          className: "bg-emerald-50 text-emerald-700 border-emerald-200",
        };
      case "partially_deducted":
        return {
          label: `Refunded ${fmt(refundable)} of ${fmt(depositCents)}`,
          className: "bg-orange-50 text-orange-700 border-orange-200",
        };
      case "forfeited":
        return {
          label: "Deposit forfeited (severe damage)",
          className: "bg-red-50 text-red-700 border-red-200",
        };
      default:
        return null;
    }
  }

  return null;
}
