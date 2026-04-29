 import axios from "axios";
import { getApiUrl } from "./auth";

const API_URL = getApiUrl();

export type ShippingQuote = {
  service: string;
  total_cost: number;
  delivery_time: string;
};

export type ShippingQuotesResponse = {
  AUS_PARCEL_REGULAR?: ShippingQuote;
  AUS_PARCEL_EXPRESS?: ShippingQuote;
};

/**
 * 调用后端 shipping API 获取报价
 * @param fromPostcode 发货人邮编（书主）
 * @param toPostcode 收货人邮编（当前用户）
 * @param length 包裹长 cm
 * @param width 包裹宽 cm
 * @param height 包裹高 cm
 * @param weight 包裹重量 kg
 */
export async function getShippingQuotes(
  fromPostcode: string,
  toPostcode: string,
  length: number,
  width: number,
  height: number,
  weight: number
): Promise<ShippingQuotesResponse> {
  try {
    const res = await axios.get(`${API_URL}/api/v1/shipping/domestic/postage/calculate`, {
      params: {
        from_postcode: fromPostcode,
        to_postcode: toPostcode,
        length,
        width,
        height,
        weight,
      },
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      withCredentials: true,
    });

    return res.data;
  } catch (err) {
    console.error("Failed to fetch shipping quotes:", err);
    throw err;
  }
}


export type ShipmentLeg = "out" | "return";
export type ShipmentRole = "sender" | "recipient";
export type TrackingState = "in_transit" | "delivered";

export type TrackingNumberItem = {
  order_id: string;
  leg: ShipmentLeg;
  role: ShipmentRole;
  tracking_state: TrackingState;
  carrier?: string | null;
  tracking_number?: string | null;
  book_title?: string | null;
  counterpart_name?: string | null;
  counterpart_role?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
};

/**
 * Fetch the current user's shipments (both outbound and return legs across all
 * orders they participate in). Each item is a single shipment leg labelled
 * with whether the user is the sender or recipient and whether the package
 * is in transit or already delivered.
 *
 * @param userId optional — admin-only override to query another user's shipments.
 */
export async function getUserShipments(
  userId?: string
): Promise<TrackingNumberItem[]> {
  try {
    const res = await axios.get(`${API_URL}/api/v1/orders/tracking`, {
      params: userId ? { user_id: userId } : {},
      headers: {
        Authorization: `Bearer ${localStorage.getItem("access_token")}`,
      },
      withCredentials: true,
    });

    return res.data;
  } catch (err) {
    console.error("Failed to fetch shipments:", err);
    throw err;
  }
}
