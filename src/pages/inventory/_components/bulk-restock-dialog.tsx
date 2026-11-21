import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { RESTOCK_TYPE_LABELS } from "@shared/constants.ts";
import type { RestockType } from "@shared/constants.ts";
import { CsvImportDialog } from "../../products/_components/csv-import-dialog.tsx";
import type { ImportSpec } from "../../products/_components/csv-import-dialog.tsx";
import { cell, numberCell } from "../../products/_components/csv-import.ts";

// Matches imports.bulkRestock's line (Input<> can't infer mutation inputs yet)
type RestockLine = {
  row: number;
  sku: string;
  variantSku?: string;
  variantName?: string;
  restockType?: RestockType;
  quantity: number | null;
  cost: number | null;
  supplier?: string;
  date?: string;
  notes?: string;
};

function parseRestockType(
  value: string | undefined,
): RestockType | undefined | null {
  if (!value) return undefined;
  const v = value.toLowerCase().replace(/[\s-]+/g, "_");
  if (v === "purchase") return "purchase";
  if (v === "manual" || v === "manual_adjustment" || v === "adjustment")
    return "manual_adjustment";
  return null;
}

export default function BulkRestockDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const bulkRestock = useMutation(api.imports.bulkRestock);
  const { formatMoney, formatNumber } = useFormat();
  const { t } = useTranslation();

  const spec = useMemo<ImportSpec<RestockLine>>(
    () => ({
      title: t("Bulk restock"),
      description: t(
        "Restock many items from a spreadsheet, matched by SKU (or variant SKU). Blank unit cost keeps the item's average cost; blank date means today.",
      ),
      required: ["sku", "quantity"],
      optional: [
        "variant_sku",
        "variant_name",
        "restock_type",
        "unit_cost",
        "supplier",
        "date",
        "notes",
      ],
      templateName: "restock-template.csv",
      templateRows: [
        {
          sku: "TEE-001",
          quantity: 50,
          variant_sku: "TEE-001-S",
          variant_name: "",
          restock_type: "purchase",
          unit_cost: 95,
          supplier: "Acme Textiles",
          date: "",
          notes: "",
        },
        {
          sku: "MUG-001",
          quantity: 24,
          variant_sku: "",
          variant_name: "",
          restock_type: "purchase",
          unit_cost: "",
          supplier: "",
          date: "",
          notes: "Reorder",
        },
      ],
      parseRow: (raw, row) => {
        const sku = cell(raw, "sku");
        if (!sku) return { error: t("SKU is empty") };
        const quantity = numberCell(raw, t("Quantity"), "quantity", "qty");
        if (quantity.error) return { error: quantity.error };
        if (quantity.value === null) return { error: t("Quantity is empty") };
        const cost = numberCell(raw, t("Unit cost"), "unit_cost", "cost");
        if (cost.error) return { error: cost.error };
        const typeCell = cell(raw, "restock_type", "type");
        const restockType = parseRestockType(typeCell);
        if (restockType === null)
          return {
            error: t(
              'Restock type "{{value}}" should be purchase or manual_adjustment',
              { value: typeCell },
            ),
          };
        return {
          value: {
            row,
            sku,
            variantSku: cell(raw, "variant_sku"),
            variantName: cell(raw, "variant_name", "variant"),
            restockType,
            quantity: quantity.value,
            cost: cost.value,
            supplier: cell(raw, "supplier"),
            date: cell(raw, "date"),
            notes: cell(raw, "notes"),
          },
        };
      },
      preview: [
        {
          header: t("SKU"),
          cell: (r) => (
            <span className="font-mono text-xs">
              {r.variantSku ??
                (r.variantName ? `${r.sku} · ${r.variantName}` : r.sku)}
            </span>
          ),
        },
        {
          header: t("Type"),
          cell: (r) => t(RESTOCK_TYPE_LABELS[r.restockType ?? "purchase"]),
        },
        {
          header: t("Qty"),
          cell: (r) => (r.quantity === null ? "—" : formatNumber(r.quantity)),
          className: "text-end tabular-nums",
        },
        {
          header: t("Unit cost"),
          cell: (r) =>
            r.cost === null ? (
              <span className="text-muted-foreground">{t("avg")}</span>
            ) : (
              formatMoney(r.cost)
            ),
          className: "text-end tabular-nums",
        },
      ],
      submit: (lines) => bulkRestock({ lines }),
      describeResult: (res) => {
        const units = (res as { units?: number }).units;
        return units
          ? t("{{count}} restocks recorded ({{units}} units)", {
              count: res.imported,
              units: formatNumber(units),
            })
          : t("{{count}} restocks recorded", { count: res.imported });
      },
    }),
    [bulkRestock, formatMoney, formatNumber, t],
  );

  return (
    <CsvImportDialog open={open} onOpenChange={onOpenChange} spec={spec} />
  );
}
