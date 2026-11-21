import { useTranslation } from "react-i18next";
import { round2 } from "@shared/constants.ts";
import { LOWEST_SHIPPING_FEE } from "@shared/shipping-zones.ts";
import { useFormat } from "@/lib/format.ts";

/** Subtotal, shipping and total. Shipping is null until the governorate is known. */
export function OrderSums({
  subtotal,
  shipping,
  discount = 0,
  freeShipping = false,
}: {
  subtotal: number;
  shipping: number | null;
  /** A promo code's discount on the goods */
  discount?: number;
  /** A promo code's free shipping */
  freeShipping?: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  return (
    <dl className="grid gap-2 text-sm">
      <div className="flex justify-between">
        <dt>{t("Subtotal")}</dt>
        <dd className="tabular-nums">{formatMoney(subtotal)}</dd>
      </div>
      {discount > 0 && (
        <div className="flex justify-between font-medium text-emerald-700 dark:text-emerald-400">
          <dt>{t("Promo code")}</dt>
          <dd className="tabular-nums">−{formatMoney(discount)}</dd>
        </div>
      )}
      <div className="flex justify-between gap-3">
        <dt>{t("Shipping")}</dt>
        <dd className="text-end tabular-nums">
          {freeShipping ? (
            <span className="font-medium text-emerald-700 dark:text-emerald-400">{t("Free")}</span>
          ) : shipping === null ? (
            <span className="text-muted-foreground">
              {t("From {{amount}}, by governorate", { amount: formatMoney(LOWEST_SHIPPING_FEE) })}
            </span>
          ) : (
            formatMoney(shipping)
          )}
        </dd>
      </div>
      <div className="flex justify-between border-t border-border pt-2 text-lg font-semibold">
        <dt>{t("Total")}</dt>
        <dd className="tabular-nums">
          {formatMoney(round2(subtotal - discount + (freeShipping ? 0 : (shipping ?? 0))))}
          {shipping === null && !freeShipping && <span className="ms-1 text-sm font-normal text-muted-foreground">+ {t("Shipping")}</span>}
        </dd>
      </div>
    </dl>
  );
}
