import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { api, getErrorMessage, useApiClient } from "@/lib/api.ts";
import { downloadCsv } from "@/lib/csv.ts";
import { useFormat } from "@/lib/format.ts";
import { EXPORT_KINDS, EXPORT_LABELS, buildExport } from "../_lib/export.ts";
import type { ExportKind } from "../_lib/export.ts";
import type { DayRange } from "../_lib/ranges.ts";

/** Accounting CSVs for the selected period (formula-safe, Excel-friendly). */
export default function ExportMenu({ range, disabled }: { range: DayRange; disabled?: boolean }) {
  const { t } = useTranslation();
  const client = useApiClient();
  const { dayOf } = useFormat();
  const [busy, setBusy] = useState<ExportKind | null>(null);

  const handleExport = async (kind: ExportKind) => {
    setBusy(kind);
    try {
      const data = await client.query(api.finance.exports.exportData, range);
      const { rows, columns } = buildExport(kind, data, dayOf);
      const label = t(EXPORT_LABELS[kind].label);
      if (rows.length === 0) {
        toast.info(
          t("No rows to export for {{report}} in this period", {
            report: label,
          }),
        );
        return;
      }
      downloadCsv(
        `${kind}-${range.fromDay}-to-${range.toDay}.csv`,
        rows,
        columns,
      );
      toast.success(
        t("{{report}} exported ({{count}} rows)", {
          report: label,
          count: rows.length,
        }),
      );
    } catch (error) {
      toast.error(getErrorMessage(error, t("Export failed. Try again.")));
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || busy !== null}>
          {busy ? <Spinner /> : <Download />}
          {busy ? t("Exporting…") : t("Export")}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {t("CSV for the selected period")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {EXPORT_KINDS.map((kind) => (
          <DropdownMenuItem
            key={kind}
            onSelect={() => void handleExport(kind)}
            className="flex-col items-start gap-0.5"
          >
            <span className="font-medium">{t(EXPORT_LABELS[kind].label)}</span>
            <span className="text-xs text-muted-foreground">
              {t(EXPORT_LABELS[kind].description)}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
