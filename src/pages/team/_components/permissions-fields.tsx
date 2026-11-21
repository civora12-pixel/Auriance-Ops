import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { tk } from "@/lib/i18n.ts";
import { matchingPreset } from "../_lib/preset.ts";
import {
  ACCESS_LEVEL_LABELS,
  PERMISSION_PRESETS,
  SECTIONS,
  SECTION_LABELS,
} from "@shared/constants.ts";
import type {
  AccessLevel,
  PermissionPreset,
  Permissions,
  Section,
} from "@shared/constants.ts";

const SECTION_HINTS: Record<Section, string> = {
  dashboard: tk("Sales, open orders and low-stock alerts"),
  orders: tk("Orders: create, edit, cancel, swap and re-record"),
  inventory: tk("Products, stock, packing queue, movements and adjustments"),
  finance: tk("Profit and loss, expenses and reports"),
};

const PRESETS = Object.keys(PERMISSION_PRESETS) as PermissionPreset[];

/** Presets, then No access / View / Edit per section, plus shipping and returns. */
export function PermissionsFields({
  value,
  onChange,
  disabled,
  idPrefix,
}: {
  value: Permissions;
  onChange: (next: Permissions) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const preset = matchingPreset(value);
  const setLevel = (section: Section, level: string) => {
    if (!level) return;
    const access = { ...value.access };
    if (level === "none") delete access[section];
    else access[section] = level as AccessLevel;
    onChange({
      access,
      canShipAndReturn: value.canShipAndReturn && access.orders === "edit",
    });
  };
  const ordersEdit = value.access.orders === "edit";

  return (
    <FieldSet className="gap-3">
      <FieldLegend variant="label">{t("Access")}</FieldLegend>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((key) => (
          <Button
            key={key}
            type="button"
            size="sm"
            variant={preset === key ? "default" : "outline"}
            disabled={disabled}
            onClick={() =>
              onChange(
                structuredClone(
                  PERMISSION_PRESETS[key].permissions,
                ) as Permissions,
              )
            }
            title={t(PERMISSION_PRESETS[key].description)}
          >
            {t(PERMISSION_PRESETS[key].label)}
          </Button>
        ))}
      </div>
      <FieldDescription>
        {preset
          ? t(PERMISSION_PRESETS[preset].description)
          : t("Custom access. Pick a preset or set each area below.")}
      </FieldDescription>

      <div className="grid gap-3">
        {SECTIONS.map((section) => (
          <div
            key={section}
            className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {t(SECTION_LABELS[section])}
              </div>
              <div className="text-xs text-muted-foreground">
                {t(SECTION_HINTS[section])}
              </div>
            </div>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={value.access[section] ?? "none"}
              onValueChange={(v) => setLevel(section, v)}
              disabled={disabled}
              aria-label={t(SECTION_LABELS[section])}
              className="shrink-0"
            >
              {(["none", "view", "edit"] as const).map((level) => (
                <ToggleGroupItem key={level} value={level} className="px-3">
                  {t(ACCESS_LEVEL_LABELS[level])}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        ))}
      </div>

      <Field orientation="horizontal" data-disabled={!ordersEdit || undefined}>
        <Checkbox
          id={`${idPrefix}-ship`}
          checked={value.canShipAndReturn && ordersEdit}
          disabled={disabled || !ordersEdit}
          onCheckedChange={(checked) =>
            onChange({ ...value, canShipAndReturn: checked === true })
          }
        />
        <FieldContent>
          <FieldLabel htmlFor={`${idPrefix}-ship`} className="font-normal">
            {t("Can ship orders and record returns")}
          </FieldLabel>
          <FieldDescription>
            {t("Needs Orders: Edit. Team settings stay with admins.")}
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldSet>
  );
}
