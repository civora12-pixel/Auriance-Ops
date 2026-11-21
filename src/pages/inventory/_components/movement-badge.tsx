import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { MOVEMENT_TYPE_LABELS } from "@shared/constants.ts";
import type { MovementType, RestockType } from "@shared/constants.ts";

const TYPE_STYLES: Record<MovementType, string> = {
  restock: "border-chart-3/40 bg-chart-3/15 text-chart-3",
  shipment: "border-border bg-muted text-muted-foreground",
  return: "border-chart-2/40 bg-chart-2/15 text-chart-2",
  swap_out: "border-chart-4/40 bg-chart-4/15 text-chart-4",
  swap_in: "border-chart-4/40 bg-chart-4/15 text-chart-4",
  adjustment: "border-destructive/30 bg-destructive/10 text-destructive",
  not_sellable_in: "border-chart-1/40 bg-chart-1/15 text-chart-1",
  write_off: "border-destructive/30 bg-destructive/10 text-destructive",
  back_to_sellable: "border-chart-3/40 bg-chart-3/15 text-chart-3",
  return_in_transit: "border-chart-5/40 bg-chart-5/15 text-chart-5",
  transit_received: "border-chart-2/40 bg-chart-2/15 text-chart-2",
  transit_write_off: "border-destructive/30 bg-destructive/10 text-destructive",
  return_write_off: "border-destructive/30 bg-destructive/10 text-destructive",
  cost_correction: "border-border bg-muted text-muted-foreground",
};

export function MovementTypeBadge({
  type,
  restockType,
}: {
  type: MovementType;
  restockType?: RestockType;
}) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={cn("font-normal", TYPE_STYLES[type])}>
      {t(MOVEMENT_TYPE_LABELS[type])}
      {restockType === "manual_adjustment" && (
        <span className="opacity-75">· {t("manual")}</span>
      )}
    </Badge>
  );
}

/** +12 in green, −3 in red. */
export function QuantityChange({ value }: { value: number }) {
  const { formatNumber } = useFormat();
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        value > 0
          ? "text-chart-3"
          : value < 0
            ? "text-destructive"
            : "text-muted-foreground",
      )}
    >
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {formatNumber(Math.abs(value))}
    </span>
  );
}

export function OrderLink({
  orderId,
  orderNumber,
}: {
  orderId?: string;
  orderNumber?: string;
}) {
  if (!orderId || !orderNumber)
    return <span className="text-muted-foreground">—</span>;
  return (
    <Link
      to={`/orders/${orderId}`}
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {orderNumber}
    </Link>
  );
}
