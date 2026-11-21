import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { api, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { CsvImportDialog } from "./csv-import-dialog.tsx";
import { cell, numberCell } from "./csv-import.ts";
import type { ImportSpec } from "./csv-import-dialog.tsx";

// Matches imports.bulkProductImport's row (Input<> can't infer mutation inputs yet)
type ProductRow = {
  row: number;
  sku: string;
  name: string;
  unitPrice: number | null;
  uom: string;
  reorderThreshold: number | null;
  imageUrl?: string;
  variantName?: string;
  variantSku?: string;
};

export default function BulkImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const importProducts = useMutation(api.imports.bulkProductImport);
  const { formatMoney } = useFormat();
  const { t } = useTranslation();

  const spec = useMemo<ImportSpec<ProductRow>>(
    () => ({
      title: t("Import products"),
      description: t(
        "Add products from a spreadsheet. Leave the SKU empty to get the next automatic one; rows with the same product name become one product with a variant per row.",
      ),
      required: ["name", "unit_price", "uom"],
      optional: [
        "sku",
        "reorder_threshold",
        "image_url",
        "variant_name",
        "variant_sku",
      ],
      templateName: "products-template.csv",
      templateRows: [
        {
          sku: "",
          name: "Classic Tee",
          unit_price: 250,
          uom: "pcs",
          reorder_threshold: 10,
          image_url: "",
          variant_name: "Small",
          variant_sku: "",
        },
        {
          sku: "",
          name: "Classic Tee",
          unit_price: 250,
          uom: "pcs",
          reorder_threshold: 10,
          image_url: "",
          variant_name: "Medium",
          variant_sku: "",
        },
        {
          sku: "",
          name: "Ceramic Mug",
          unit_price: 120,
          uom: "each",
          reorder_threshold: 5,
          image_url: "",
          variant_name: "",
          variant_sku: "",
        },
      ],
      parseRow: (raw, row) => {
        const sku = cell(raw, "sku") ?? "";
        const price = numberCell(raw, t("Unit price"), "unit_price", "price");
        if (price.error) return { error: price.error };
        const threshold = numberCell(
          raw,
          t("Reorder threshold"),
          "reorder_threshold",
          "reorder_at",
        );
        if (threshold.error) return { error: threshold.error };
        return {
          value: {
            row,
            sku,
            name: cell(raw, "name") ?? "",
            unitPrice: price.value,
            uom: cell(raw, "uom", "unit") ?? "",
            reorderThreshold: threshold.value,
            imageUrl: cell(raw, "image_url", "image"),
            variantName: cell(raw, "variant_name", "variant"),
            variantSku: cell(raw, "variant_sku"),
          },
        };
      },
      preview: [
        {
          header: t("SKU"),
          cell: (r) =>
            r.sku ? (
              <span className="font-mono text-xs">{r.sku}</span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("Automatic")}
              </span>
            ),
        },
        {
          header: t("Name"),
          cell: (r) =>
            r.name || <span className="text-destructive">{t("missing")}</span>,
        },
        {
          header: t("Variant"),
          cell: (r) =>
            r.variantName ?? <span className="text-muted-foreground">—</span>,
        },
        {
          header: t("Price"),
          cell: (r) => formatMoney(r.unitPrice),
          className: "text-end tabular-nums",
        },
      ],
      // Same grouping as the server: by SKU, or by name when the SKU is empty
      groupKey: (r) =>
        r.sku ? r.sku.toLowerCase() : `name:${r.name.trim().toLowerCase()}`,
      submit: (products) => importProducts({ products }),
      describeResult: (res) => {
        const variants = (res as { variants?: number }).variants ?? 0;
        return variants
          ? t("{{count}} products imported with {{variants}} variants", {
              count: res.imported,
              variants,
            })
          : t("{{count}} products imported", { count: res.imported });
      },
    }),
    [importProducts, formatMoney, t],
  );

  return (
    <CsvImportDialog open={open} onOpenChange={onOpenChange} spec={spec} />
  );
}
