import type { BabyKind, Child } from "@shared/little-ones.ts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import type { ShopSection } from "@shared/constants.ts";
import { request } from "@/lib/api.ts";

/** The customer shop's own API (/api/shop): works for guests and customer accounts, not only the team. */

export type ShopConfig = {
  open: boolean;
  /** Down for maintenance ("back shortly" page for visitors) */
  maintenance?: boolean;
  preview: boolean;
  whatsapp?: string | null;
  /** The Facebook page's Messenger name, for the help button */
  messenger?: string | null;
  ordersPaused?: boolean;
  signupsPaused?: boolean;
  announcement?: string | null;
  /** Where to find us: usernames, phone and email (null = not shown) */
  contact?: {
    facebook: string | null;
    instagram: string | null;
    tiktok: string | null;
    phone: string | null;
    email: string | null;
  };
  shippingFee: number;
  emailEnabled: boolean;
};

export type ShopOption = {
  variantId?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  maxQuantity: number;
};

export type ShopProduct = {
  productId: string;
  name: string;
  section: ShopSection;
  price: number;
  imageUrl?: string | null;
  hasSizes: boolean;
  needsGender: boolean;
  /** Most one order can take, all sizes together (null = no limit) */
  maxPerOrder?: number | null;
  options: ShopOption[];
  /** Every size sold out (shown only when Website controls keep sold-out items) */
  soldOut?: boolean;
  season?: "all" | "winter" | "summer";
  /** Who it's for: boys, girls or both */
  audience?: "both" | "boys" | "girls";
  /** Out of season now: listed last and never suggested */
  offSeason?: boolean;
  createdAt: number;
};

export type ShopCustomer = {
  _id: string;
  name: string;
  phone: string;
  phone2?: string | null;
  email?: string | null;
  emailVerified: boolean;
  governorate?: string | null;
  city?: string | null;
  address?: string | null;
  babyAgeMonths?: number | null;
  babyAgeDay?: string | null;
  children: Child[];
  shoppingFor?: BabyKind | null;
};

export type ShopMe = { customer: ShopCustomer | null; sizes: { size: string; day: string }[] };

export type ShopOrder = {
  _id: string;
  number: string;
  date: string;
  status: string;
  total: number;
  shippingFee: number;
  items: { name: string; size?: string | null; quantity: number; price: number }[];
};

/** What the thank-you page shows after Place order. */
export type PlacedOrder = { number: string; total: number; shippingFee: number; name: string };

const KEY = "shop";
const get = <T>(path: string) => request<T>("GET", `/api/shop/${path}`);
export const shopPost = <T>(path: string, body: unknown = {}) => request<T>("POST", `/api/shop/${path}`, body);

export function useShopConfig() {
  return useQuery({ queryKey: [KEY, "config"], queryFn: () => get<ShopConfig>("config"), staleTime: 60_000 }).data;
}

/** Undefined while loading; only asked once the shop may be used. */
export function useCatalog(enabled = true) {
  return useQuery({
    queryKey: [KEY, "catalog"],
    queryFn: () => get<ShopProduct[]>("catalog"),
    enabled,
    refetchInterval: 60_000,
  }).data;
}

/** Product ids the checkout offers as a small extra. */
export function useCheckoutExtras(enabled = true) {
  return useQuery({ queryKey: [KEY, "extras"], queryFn: () => get<string[]>("extras"), enabled, staleTime: 60_000 }).data;
}

export function useShopMe(enabled = true) {
  return useQuery({ queryKey: [KEY, "me"], queryFn: () => get<ShopMe>("me"), enabled, staleTime: 30_000 }).data;
}

export function useMyOrders(enabled: boolean) {
  return useQuery({ queryKey: [KEY, "orders"], queryFn: () => get<ShopOrder[]>("orders"), enabled }).data;
}

/** Runs a shop call, then refreshes everything the shop shows. */
export function useShopAction() {
  const queryClient = useQueryClient();
  return useCallback(
    async <T>(path: string, body?: unknown): Promise<T> => {
      const result = await shopPost<T>(path, body);
      await queryClient.invalidateQueries({ queryKey: [KEY] });
      return result;
    },
    [queryClient],
  );
}
