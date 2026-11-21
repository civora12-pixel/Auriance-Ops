import { useTranslation } from "react-i18next";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { MAX_ATTRIBUTES, newAttributeRow } from "./attributes.ts";
import type { AttributeRow } from "./attributes.ts";

/** Name/value rows for variant attributes (Color: Red, Size: M). */
export function AttributesEditor({
  rows,
  onChange,
  disabled,
  idPrefix,
}: {
  rows: AttributeRow[];
  onChange: (rows: AttributeRow[]) => void;
  disabled?: boolean;
  idPrefix: string;
}) {
  const { t } = useTranslation();
  const update = (id: number, patch: Partial<AttributeRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="grid gap-2">
      {rows.map((row, i) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            id={i === 0 ? `${idPrefix}attributes` : undefined}
            aria-label={t("Attribute {{number}} name", { number: i + 1 })}
            placeholder={t("Name (e.g. Color)")}
            value={row.key}
            maxLength={50}
            disabled={disabled}
            onChange={(e) => update(row.id, { key: e.target.value })}
          />
          <Input
            aria-label={t("Attribute {{number}} value", { number: i + 1 })}
            placeholder={t("Value (e.g. Red)")}
            value={row.value}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => update(row.id, { value: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("Remove attribute {{number}}", { number: i + 1 })}
            disabled={disabled}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-fit"
        disabled={disabled || rows.length >= MAX_ATTRIBUTES}
        onClick={() => onChange([...rows, newAttributeRow()])}
      >
        <Plus />
        {t("Add attribute")}
      </Button>
    </div>
  );
}

/** Attributes shown as small chips. */
export function AttributeChips({
  attributes,
}: {
  attributes?: Record<string, string>;
}) {
  const entries = Object.entries(attributes ?? {});
  if (!entries.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => (
        <Badge key={k} variant="secondary" className="font-normal">
          <span className="text-muted-foreground">{k}:</span> {v || "—"}
        </Badge>
      ))}
    </div>
  );
}
