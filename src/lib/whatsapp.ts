// WhatsApp "share a message" links: they open WhatsApp (app or web) with the
// text already written; the user picks the chat and taps Send. No WhatsApp
// account details are stored in the app.

import type { Gender, SalesChannel } from "@shared/constants.ts";

/** Channel names as they're written in the group, whatever the app's language. */
const CHANNELS_AR: Record<SalesChannel, string> = {
  whatsapp: "واتساب",
  facebook: "فيسبوك",
  instagram: "انستجرام",
  website: "الموقع",
};

/** Boys/girls as the moderators pick it on the order, always in Arabic for the group. */
const GENDERS_AR: Record<Gender, string> = {
  boys: "أولادي",
  girls: "بناتي",
};

export type MessageOrder = {
  /** YYYY-MM-DD */
  orderDate: string;
  customer: string;
  customerPhone?: string | null;
  customerPhone2?: string | null;
  address?: string | null;
  lineItems: {
    quantity: number;
    productName: string;
    variantName?: string | null;
    gender?: Gender | null;
    isSwapReplacement?: boolean;
  }[];
  notes?: string | null;
  shipmentNotes?: string | null;
  total: number;
  shippingFee?: number | null;
  repName: string;
  channel?: SalesChannel | null;
  shipmentNumber: string;
};

/** Plain amount as written in the group: 670, or 670.5 when there are piastres. */
const amount = (n: number) => String(Math.round(n * 100) / 100);

/** 2026-10-25 → 25/10/2026 */
const groupDate = (day: string) => {
  const [y, m, d] = day.split("-");
  return y && m && d ? `${d}/${m}/${y}` : day;
};

/**
 * The order as it's posted to the WhatsApp group, in blocks:
 * order date and customer (name, phones, address) / items and notes / amounts
 * (to collect, shipping, order total; or "total والشحن مجانا") /
 * who recorded it, page name, channel and shipment number.
 */
export function orderWhatsAppMessage(
  order: MessageOrder,
  pageName: string,
): string {
  const lines = (...items: (string | null | undefined)[]) =>
    items.map((s) => s?.trim()).filter(Boolean) as string[];

  const customer = lines(
    groupDate(order.orderDate),
    order.customer,
    order.customerPhone,
    order.customerPhone2,
    order.address,
  );
  const items = lines(
    ...order.lineItems
      .filter((l) => !l.isSwapReplacement && l.quantity > 0)
      .map((l) =>
        [
          `${l.quantity} ${l.productName}`,
          l.variantName,
          l.gender ? GENDERS_AR[l.gender] : null,
        ]
          .filter(Boolean)
          .join(" - "),
      ),
    order.notes,
    order.shipmentNotes,
  );
  const fee = order.shippingFee ?? 0;
  const money =
    fee > 0
      ? [amount(order.total + fee), amount(fee), amount(order.total)]
      : [`${amount(order.total)} والشحن مجانا`];
  const footer = lines(
    order.repName,
    pageName,
    order.channel ? CHANNELS_AR[order.channel] : null,
    order.shipmentNumber,
  );
  return [customer, items, money, footer]
    .filter((block) => block.length)
    .map((block) => block.join("\n"))
    .join("\n\n");
}

/** Opens WhatsApp with `text` ready to send, letting the user choose the chat or group. */
export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Opens a WhatsApp chat with one Egyptian mobile (01…), with `text` ready to send. */
export function whatsAppChatUrl(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, "");
  const intl = digits.startsWith("0") ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

/**
 * A message to the customer, in Arabic. For a website order still waiting for
 * confirmation it lists the items, address and amount to collect, and asks
 * the customer to confirm.
 */
export function customerWhatsAppMessage(
  order: Pick<MessageOrder, "customer" | "address" | "lineItems" | "total" | "shippingFee"> & {
    orderNumber: string;
    confirming: boolean;
  },
): string {
  const hello = `أهلاً ${order.customer} 🌸\nمعك فريق Auriance بخصوص طلبك ${order.orderNumber}.`;
  if (!order.confirming) return hello;
  const items = order.lineItems
    .filter((l) => !l.isSwapReplacement)
    .map((l) => {
      const size = l.variantName ? ` (${l.variantName})` : "";
      const gender = l.gender ? ` ${GENDERS_AR[l.gender]}` : "";
      return `- ${l.quantity} × ${l.productName}${size}${gender}`;
    });
  const collect = amount(order.total + (order.shippingFee ?? 0));
  return [
    hello,
    "",
    ...items,
    "",
    order.address ? `العنوان: ${order.address}` : null,
    `المطلوب عند الاستلام: ${collect} جنيه (شامل الشحن ${amount(order.shippingFee ?? 0)})`,
    "",
    "هل نؤكد الطلب ونشحنه؟",
  ]
    .filter((line) => line !== null)
    .join("\n");
}


/**
 * The "back in stock" message for the moderators' group, in Arabic: items that
 * were sold out and are free to sell again after a batch of returns. Each item
 * is a bold line (WhatsApp shows *text* in bold).
 */
export function backInStockMessage(
  items: { productName: string; variantName?: string | null; units: number }[],
): string {
  const lines = items.map((i) => {
    const name = [i.productName.trim(), i.variantName?.trim()].filter(Boolean).join(" - ");
    return `*• ${name} (${i.units} ${i.units === 1 ? "قطعة" : "قطع"})*`;
  });
  return [
    "🟢🔔 *رجع متاح للبيع*",
    "منتجات كان رصيدها صفر ورجعت من المرتجعات:",
    "",
    ...lines,
    "",
    "تقدروا تسجلوا عليها دلوقتي ✅",
  ].join("\n");
}
