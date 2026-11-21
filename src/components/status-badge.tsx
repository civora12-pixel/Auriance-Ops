import { useTranslation } from "react-i18next";
import { CalendarClock, PackageOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { cn } from "@/lib/utils.ts";
import { useFormat } from "@/lib/format.ts";
import {
  STATUS_STYLES,
  STOCK_LEVEL_LABELS,
  STOCK_LEVEL_STYLES,
  statusLabel,
  stockLevel,
} from "@/lib/status.ts";
import type { OrderStatus } from "@shared/constants.ts";

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status as OrderStatus], className)}
    >
      {t(statusLabel(status))}
    </Badge>
  );
}

export function PaymentBadge({
  paid,
  className,
}: {
  paid: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        paid
          ? "bg-chart-3/15 text-chart-3 border-chart-3/40"
          : "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      {paid ? t("Paid") : t("Unpaid")}
    </Badge>
  );
}

/** A website order nobody has confirmed with the customer yet. */
export function NeedsConfirmationBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      {t("Needs confirmation")}
    </Badge>
  );
}

/** The customer asked to ship later: "Delayed · ship on Nov 17", in red. */
export function DelayedBadge({ shipOn, large, className }: { shipOn: string; large?: boolean; className?: string }) {
  const { t } = useTranslation();
  const { formatShortDay } = useFormat();
  return (
    <Badge
      className={cn(
        "border-transparent bg-red-600 font-semibold text-white dark:bg-red-500",
        large && "h-auto px-3 py-1.5 text-sm uppercase [&>svg]:size-4",
        className,
      )}
    >
      <CalendarClock aria-hidden />
      {t("Delayed · ship on {{day}}", { day: formatShortDay(shipOn) })}
    </Badge>
  );
}

/** Partly collected through the courier: the warehouse still has to record which pieces came back. */
export function PiecesPendingBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={cn("border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300", className)}
    >
      <PackageOpen aria-hidden />
      {t("Waiting for returned pieces")}
    </Badge>
  );
}

export function StockBadge({
  onHand,
  threshold,
  className,
}: {
  onHand: number;
  threshold: number;
  className?: string;
}) {
  const { t } = useTranslation();
  const level = stockLevel(onHand, threshold);
  return (
    <Badge
      variant="outline"
      className={cn(STOCK_LEVEL_STYLES[level], className)}
    >
      {t(STOCK_LEVEL_LABELS[level])}
    </Badge>
  );
}
