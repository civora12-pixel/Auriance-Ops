import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { linkTo } from "../_lib/links.ts";
import type { Benchmark, Metric, Step, StepLink } from "@shared/performance.ts";

export type { Benchmark, Metric, Step, StepLink };

function useStepValue() {
  const { formatMoney, formatPercent, formatNumber } = useFormat();
  return (s: { amount?: number; pct?: number; times?: number; count?: number }) => {
    const parts: string[] = [];
    if (s.count !== undefined) parts.push(formatNumber(s.count));
    if (s.amount !== undefined) parts.push(formatMoney(s.amount));
    if (s.pct !== undefined) parts.push(formatPercent(s.pct));
    if (s.times !== undefined) parts.push(`${formatNumber(s.times)}×`);
    return parts.join(" · ");
  };
}

/** The working behind a figure, line by line, each linked to the records it comes from. */
export function StepsList({ steps, benchmarks = [] }: { steps: Step[]; benchmarks?: Benchmark[] }) {
  const { t } = useTranslation();
  const { canAccess } = useCurrentUser();
  const value = useStepValue();
  // Names and periods inside a line are translated too
  const trVars = (v?: Record<string, string | number>) =>
    v && Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === "string" ? t(x) : x]));
  const canOpen = (l?: StepLink) => !!l && (l.kind === "account" ? canAccess("finance") : canAccess("orders"));
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        {steps.map((s, i) => {
          const label = t(s.label, trVars(s.vars));
          const v = value(s);
          return (
            <div
              key={i}
              className={cn(
                "flex items-baseline justify-between gap-3",
                s.sub ? "ps-4 text-xs text-muted-foreground" : "text-sm",
                s.strong && "border-t pt-1.5 font-semibold",
                !v && "text-xs text-muted-foreground",
              )}
            >
              {canOpen(s.link) ? (
                <Link to={linkTo(s.link!)} className="inline-flex min-w-0 items-center gap-1 underline-offset-4 hover:underline">
                  {label}
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </Link>
              ) : (
                <span className="min-w-0">{label}</span>
              )}
              {v && <span className="shrink-0 tabular-nums">{v}</span>}
            </div>
          );
        })}
      </div>
      {benchmarks.length > 0 && (
        <div className="grid gap-1.5 rounded-lg bg-muted/50 p-3">
          <span className="text-xs font-medium text-muted-foreground">{t("To compare against")}</span>
          {benchmarks.map((b, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">{t(b.label, trVars(b.vars))}</span>
              <span className="shrink-0 tabular-nums">{value(b) || "—"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function BreakdownDialog({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Sales in the books for some days against the orders shipped on them. */
export function SalesCheckDialog({ fromDay, toDay, title, onClose }: { fromDay: string; toDay: string; title: string; onClose: () => void }) {
  const { t } = useTranslation();
  const data = useQuery(api.dashboard.salesCheck, { fromDay, toDay });
  return (
    <BreakdownDialog
      title={title}
      description={t("The orders shipped on these days and the sales entries in the books should agree.")}
      onClose={onClose}
    >
      {data === undefined ? <Skeleton className="h-40 w-full" /> : <StepsList steps={data.steps} />}
    </BreakdownDialog>
  );
}
