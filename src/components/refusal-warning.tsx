import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";

export type PhoneHistory = {
  orders: number;
  refused: number;
  partlyReturned: number;
  refusedOrders: { _id: string; orderNumber: string; orderDate: string }[];
};

/**
 * Warns when the customer's phone numbers refused earlier orders, so the team
 * can ask for a deposit (or skip the order) before shipping.
 */
export function RefusalWarning({ history, className }: { history: PhoneHistory | undefined; className?: string }) {
  const { t } = useTranslation();
  if (!history || (history.refused === 0 && history.partlyReturned === 0)) return null;
  const serious = history.refused > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex gap-2.5 rounded-lg border p-3 text-sm",
        serious
          ? "border-destructive/40 bg-destructive/5 text-destructive"
          : "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300",
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 size-4 shrink-0" />
      <div className="grid gap-1">
        <p className="font-semibold">
          {serious
            ? t("This customer refused {{n}} earlier orders", { n: history.refused })
            : t("This customer partly returned {{n}} earlier orders", { n: history.partlyReturned })}
        </p>
        <p className="text-foreground/80">
          {t("{{orders}} earlier orders from these numbers · {{refused}} refused · {{partly}} partly returned", {
            orders: history.orders,
            refused: history.refused,
            partly: history.partlyReturned,
          })}
          {serious && <> · {t("Consider asking for a deposit before shipping.")}</>}
        </p>
        {history.refusedOrders.length > 0 && (
          <p className="flex flex-wrap gap-x-2 text-xs">
            {history.refusedOrders.map((o) => (
              <Link key={o._id} to={`/orders/${o._id}`} className="underline underline-offset-2">
                {o.orderNumber}
              </Link>
            ))}
          </p>
        )}
      </div>
    </div>
  );
}

/** Small badge for lists: "Refused 2×". */
export function RefusedBadge({ count }: { count: number }) {
  const { t } = useTranslation();
  if (count <= 0) return null;
  return (
    <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
      <ShieldAlert className="size-3" />
      {t("Refused {{n}}× before", { n: count })}
    </Badge>
  );
}
