import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useUrlState } from "@/components/data-table.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { isRangePreset, presetRange, rangeError } from "../_lib/ranges.ts";
import type { DayRange, RangePreset } from "../_lib/ranges.ts";
import ReportControls from "./report-controls.tsx";
import { ExpensesByAccountCard, KpiRow, ProfitAndLossCard } from "./summary-cards.tsx";
import { DueCard } from "./due-card.tsx";
import MonthlyTable from "./monthly-table.tsx";
import TrendChart from "./trend-chart.tsx";
import ExportMenu from "./export-menu.tsx";

/**
 * The finance overview, built from the journal (the same numbers as
 * Statements). Revenue counts when an order ships. Period and dates live in
 * the URL, so a report can be bookmarked and shared.
 */
export default function OverviewTab() {
  const { t } = useTranslation();
  const { today, formatDay } = useFormat();
  const [state, update] = useUrlState({ period: "this_month", from: "", to: "" });
  const preset: RangePreset = isRangePreset(state.period) ? state.period : "this_month";
  const todayDay = today();

  const range: DayRange = useMemo(
    () => (preset === "custom" ? { fromDay: state.from, toDay: state.to } : presetRange(preset, todayDay)),
    [preset, state.from, state.to, todayDay],
  );
  const error = rangeError(range);
  const report = useQuery(api.finance.report.report, error ? "skip" : range, { keepPrevious: true });

  const handlePreset = (next: RangePreset) => {
    if (next === "custom") update({ period: "custom", from: range.fromDay, to: range.toDay });
    else update({ period: next, from: "", to: "" });
  };

  return (
    <div className="space-y-4">
      <ReportControls
        preset={preset}
        onPresetChange={handlePreset}
        range={range}
        onCustomChange={(r) => update({ period: "custom", from: r.fromDay, to: r.toDay })}
        error={error}
        actions={<ExportMenu range={range} disabled={!!error} />}
      />

      {!error && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {formatDay(range.fromDay)} – {formatDay(range.toDay)}
          {report?.ledgerStart && range.fromDay < report.ledgerStart && (
            <> · {t("The books start on {{day}}; earlier days are in the opening balances.", { day: formatDay(report.ledgerStart) })}</>
          )}
        </p>
      )}

      {error ? null : report === undefined ? (
        <div className="space-y-4" aria-busy="true" aria-label={t("Loading report")}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <KpiRow report={report} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ProfitAndLossCard summary={report.summary} />
            <DueCard due={report.due} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ExpensesByAccountCard summary={report.summary} />
            <TrendChart trend={report.trend} />
          </div>
          <MonthlyTable months={report.months} summary={report.summary} />
        </div>
      )}
    </div>
  );
}
