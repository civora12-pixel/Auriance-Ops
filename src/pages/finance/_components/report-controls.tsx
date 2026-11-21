import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { PRESET_LABELS, RANGE_PRESETS } from "../_lib/ranges.ts";
import type { DayRange, RangePreset } from "../_lib/ranges.ts";

export default function ReportControls({
  preset,
  onPresetChange,
  range,
  onCustomChange,
  error,
  actions,
}: {
  preset: RangePreset;
  onPresetChange: (preset: RangePreset) => void;
  range: DayRange;
  onCustomChange: (range: DayRange) => void;
  error?: string | null;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label
            htmlFor="range-preset"
            className="text-xs text-muted-foreground"
          >
            {t("Period")}
          </Label>
          <Select
            value={preset}
            onValueChange={(v) => onPresetChange(v as RangePreset)}
          >
            <SelectTrigger id="range-preset" className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_PRESETS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t(PRESET_LABELS[p])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-from" className="text-xs text-muted-foreground">
            {t("From")}
          </Label>
          <Input
            id="range-from"
            type="date"
            value={range.fromDay}
            max={range.toDay || undefined}
            onChange={(e) =>
              e.target.value &&
              onCustomChange({ ...range, fromDay: e.target.value })
            }
            aria-invalid={!!error || undefined}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="range-to" className="text-xs text-muted-foreground">
            {t("To")}
          </Label>
          <Input
            id="range-to"
            type="date"
            value={range.toDay}
            min={range.fromDay || undefined}
            onChange={(e) =>
              e.target.value &&
              onCustomChange({ ...range, toDay: e.target.value })
            }
            aria-invalid={!!error || undefined}
            className="w-[160px]"
          />
        </div>
        {actions && (
          <div className="ms-auto flex items-center gap-2">{actions}</div>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t(error)}
        </p>
      )}
    </div>
  );
}
