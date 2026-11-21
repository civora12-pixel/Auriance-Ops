import { useTranslation } from "react-i18next";
import { api } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

export function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "good" | "bad";
}) {
  return (
    <div className={cn("flex justify-between gap-3", strong && "border-t pt-2 text-base font-semibold")}>
      <span className={cn(!strong && "text-muted-foreground")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          tone === "good" && "text-emerald-700 dark:text-emerald-400",
          tone === "bad" && "text-destructive",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AllocationTable({
  allocation,
  byDays = false,
}: {
  allocation: Output<typeof api.finance.closing.previewOpening>["allocation"];
  /** A closing shares by capital and the days it was held; the opening by capital alone */
  byDays?: boolean;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  if (Math.abs(allocation.result) < 0.005) return null;
  return (
    <div className="mt-2 grid gap-1">
      {allocation.charity > 0 && (
        <Line label={t("Charity 3% (owed until paid)")} value={formatMoney(-allocation.charity)} />
      )}
      {allocation.compensation > 0 && (
        <>
          <Line label={t("Compensation – Osama")} value={formatMoney(-allocation.compensationOsama)} />
          <Line label={t("Compensation – Hazar")} value={formatMoney(-allocation.compensationHazar)} />
        </>
      )}
      <Line label={byDays ? t("To the partners, by capital and days held") : t("To the partners, by capital")} value={formatMoney(allocation.toPartners)} strong />
      {allocation.partners.map((p) => (
        <Line
          key={p.code}
          label={`${p.name} · ${p.sharePct.toFixed(2)}%`}
          value={formatMoney(p.amount)}
        />
      ))}
    </div>
  );
}
