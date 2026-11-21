import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Truck } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";

/**
 * The courier's bulk-upload template (Orders_dd_mm_yyyy.xlsx): English keys on
 * row 1, Arabic labels on row 2, one order per row after that. Their "City" is
 * the governorate and "Region" the city or area.
 */
const KEYS = [
  "م", "CustName", "Company", "subComp", "Cost", "Weight", "Parcode", "Phone", "SecPhone",
  "City", "Region", "address", "createdDate", "Notes", "Replacing", "OrderContent", "PiecesNum", "EmpName",
];
// Their row 2 starts with a 1 under م; kept as-is so the file matches theirs
const LABELS = [
  "1", "المرسل اليه", "العميل", "عميل فرعى", "التكلفة", "الوزن", "رقم الشحنة", "الهاتف", "هاتف آخر",
  "المحافظة", "المدينة", "العنوان", "التاريخ", "ملحوظة", "استبدال", "محتوى الأوردر", "عدد القطع", "المندوب",
];

type SheetRow = Output<typeof api.orders.courierSheet>[number];

async function downloadCourierFile(rows: SheetRow[], fileName: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  // Phone numbers stay text so the leading 0 is kept
  const text = (value: string) => ({ type: String, value });
  const data = [
    KEYS.map(text),
    [{ type: Number, value: 1 }, ...LABELS.slice(1).map(text)],
    ...rows.map((r, i) => [
      { type: Number, value: i + 1 },
      text(r.recipient),
      text(""),
      text(""),
      { type: Number, value: r.collect },
      text(""),
      text(""),
      text(r.phone),
      text(r.phone2),
      text(r.governorate),
      text(r.city),
      text(r.address),
      text(""),
      text([r.orderNumber, r.notes].filter(Boolean).join(" · ")),
      text(""),
      text(r.content),
      { type: Number, value: r.pieces },
      text(""),
    ]),
  ];
  await writeExcelFile(data, { sheet: "Sheet1", rightToLeft: true }).toFile(fileName);
}

/**
 * Website orders → the courier: download one sheet for their bulk upload, then
 * paste back the shipment numbers they give to confirm the orders in one go.
 */
export function CourierSheetDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const { formatMoney, today } = useFormat();
  const sheet = useMutation(api.orders.courierSheet);
  const confirm = useMutation(api.orders.confirmWebOrders);
  const waiting = useQuery(
    api.orders.list,
    open ? { needsConfirmation: true, sort: "number", dir: "asc", pageSize: 200 } : "skip",
  );
  const [includeExported, setIncludeExported] = useState(false);
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<"sheet" | "confirm" | null>(null);

  const orders = waiting?.items ?? [];
  const newCount = orders.filter((o) => !o.courierExportedAt).length;
  const filled = orders.filter((o) => numbers[o._id]?.trim());

  const download = async () => {
    setBusy("sheet");
    try {
      const rows = await sheet({ includeExported });
      if (!rows.length) {
        toast.info(t("No new website orders to export"));
        return;
      }
      const [y, m, d] = today().split("-");
      await downloadCourierFile(rows, `Orders_${d}_${m}_${y}.xlsx`);
      toast.success(t("{{n}} orders in the sheet", { n: rows.length }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy("confirm");
    try {
      await confirm({ items: filled.map((o) => ({ orderId: o._id, shipmentNumber: numbers[o._id].trim() })) });
      toast.success(t("{{n}} orders confirmed and sent to packing", { n: filled.length }));
      setNumbers({});
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92svh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="size-5" />
            {t("Website orders → courier")}
          </DialogTitle>
          <DialogDescription>
            {t("1. Download the sheet and upload it on the courier's site. 2. Type the shipment numbers they give you below and confirm. The manual way still works.")}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {t("{{n}} website orders waiting · {{fresh}} not in a sheet yet", { n: orders.length, fresh: newCount })}
            </p>
            <Button onClick={() => void download()} disabled={busy !== null || (!includeExported && newCount === 0)}>
              {busy === "sheet" ? <Spinner /> : <Download />}
              {t("Download courier sheet")}
            </Button>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={includeExported} onCheckedChange={(c) => setIncludeExported(!!c)} />
            {t("Include orders already in an earlier sheet")}
          </label>
        </div>

        <div className="min-h-24 flex-1 overflow-auto rounded-lg border">
          {waiting === undefined ? (
            <div className="flex justify-center p-6">
              <Spinner />
            </div>
          ) : orders.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">{t("No website orders are waiting for confirmation.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Order")}</TableHead>
                  <TableHead>{t("Customer")}</TableHead>
                  <TableHead className="text-end">{t("To collect")}</TableHead>
                  <TableHead className="w-48">{t("Shipment number")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => (
                  <TableRow key={o._id}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {o.displayOrderNumber}
                      {o.courierExportedAt && (
                        <FileSpreadsheet className="ms-1.5 inline size-3.5 text-muted-foreground" aria-label={t("In a sheet")} />
                      )}
                    </TableCell>
                    <TableCell dir="auto">
                      {o.customer}
                      <span className="block text-xs text-muted-foreground">
                        {[o.city, o.governorate].filter(Boolean).join("، ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(o.total + o.shippingFee)}</TableCell>
                    <TableCell>
                      <Input
                        dir="ltr"
                        value={numbers[o._id] ?? ""}
                        onChange={(e) => setNumbers((n) => ({ ...n, [o._id]: e.target.value }))}
                        aria-label={t("Shipment number for {{order}}", { order: o.displayOrderNumber })}
                        className="h-8"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => void save()} disabled={busy !== null || filled.length === 0}>
            {busy === "confirm" && <Spinner />}
            {filled.length ? t("Confirm {{n}} orders", { n: filled.length }) : t("Type shipment numbers to confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
