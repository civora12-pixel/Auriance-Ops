import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, FileUp, Trash2, TriangleAlert } from "lucide-react";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { ME_KEY, useAdminMode, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { QuantityInput, MoneyInput } from "@/components/number-input.tsx";
import { parseNumber } from "@/lib/forms.ts";
import type { Output } from "@/lib/api.ts";
import { readSheet, readStatementPdf, rowsFromTable } from "./_lib.ts";
import type { SheetRow } from "./_lib.ts";

type Checked = Output<typeof api.finance.courier.check>["rows"][number];
/** What you changed on a row while reviewing */
type Edit = {
  skip?: boolean;
  returnLines?: Record<string, string>;
  refund?: string;
  /** Partial return: choose the pieces now, or record the money and let the warehouse record the pieces later */
  partial?: "pieces" | "later";
  /** "later": the amount collected for the kept pieces, if changed */
  collected?: string;
};
/** Extra columns a PDF statement has, shown while reviewing */
type Extra = { date?: string; paid?: number | null; shipping?: number | null };

/** Finance → Courier settlements: upload the collection sheet and post it in one go. */
export default function CourierPage() {
  const { t } = useTranslation();
  const { formatMoney, formatDay, today } = useFormat();
  const { canEdit, isAdmin } = useCurrentUser();
  const { isAdminMode } = useAdminMode();
  const queryClient = useQueryClient();
  const post = useMutation(api.finance.courier.post);
  const remove = useMutation(api.finance.courier.remove);
  const history = useQuery(api.finance.courier.list);
  const options = useQuery(api.finance.accounts.paymentOptions);
  const banks = (options ?? []).filter((a) => a.code < 20000);

  const [fileName, setFileName] = useState<string>();
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const [extra, setExtra] = useState<Record<string, Extra>>({});
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [received, setReceived] = useState("");
  const [error, setError] = useState<string>();
  const [date, setDate] = useState(today());
  const [accountId, setAccountId] = useState("");
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  // The rows as you've reviewed them: left out, or with the returned pieces chosen
  const reviewed = (rows ?? []).map((r) => {
    const e = edits[r.shipment];
    const paid = extra[r.shipment]?.paid;
    if (!e) return paid != null ? { ...r, paid } : r;
    const returnLines = e.returnLines
      ? Object.entries(e.returnLines)
          .map(([lineItemId, q]) => ({ lineItemId, quantity: Math.max(0, Math.floor(parseNumber(q) ?? 0)) }))
          .filter((l) => l.quantity > 0)
      : undefined;
    return {
      ...r,
      treatment: e.skip ? ("skip" as const) : undefined,
      returnLines: returnLines?.length ? returnLines : undefined,
      refund: e.refund ? parseNumber(e.refund) : undefined,
      paid: paid ?? undefined,
      partial: e.partial,
      collected: e.partial === "later" && e.collected ? parseNumber(e.collected) : undefined,
    };
  });
  const check = useQuery(api.finance.courier.check, reviewed.length ? { rows: reviewed } : "skip", { keepPrevious: true });
  const edit = (shipment: string, patch: Edit) =>
    setEdits((all) => ({ ...all, [shipment]: { ...all[shipment], ...patch } }));

  const onFile = async (file: File | undefined) => {
    setError(undefined);
    setRows(null);
    setEdits({});
    setExtra({});
    setReceived("");
    if (!file) return;
    setFileName(file.name);
    try {
      if (/\.pdf$/i.test(file.name)) {
        // The courier's account statement, read here in the browser
        const statement = await readStatementPdf(file);
        if (!statement.length) {
          setError(t("Couldn't read any shipments from this PDF. Is it the courier's account statement?"));
          return;
        }
        setRows(statement.map((r) => ({ shipment: r.shipment, status: r.status, due: r.due, customer: r.customer })));
        setExtra(Object.fromEntries(statement.map((r) => [r.shipment, { date: r.date, paid: r.paid, shipping: r.shipping }])));
        return;
      }
      const parsed = rowsFromTable(await readSheet(file));
      if (parsed.error) setError(t(parsed.error));
      else if (!parsed.rows.length) setError(t("The sheet has no rows"));
      else setRows(parsed.rows);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const submit = async () => {
    if (!rows) return;
    setPosting(true);
    try {
      const res = await post({
        date,
        accountId: accountId || undefined,
        fileName,
        rows: reviewed,
        received: received.trim() ? parseNumber(received) : undefined,
      });
      toast.success(
        t("{{number}} posted: {{n}} shipments", { number: res.number, n: res.posted }),
        res.skipped ? { description: t("{{n}} rows skipped (see the problems listed)", { n: res.skipped }) } : undefined,
      );
      setRows(null);
      setEdits({});
      setReceived("");
      setFileName(undefined);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPosting(false);
    }
  };

  const totals = check?.totals;
  return (
    <PageBody>
      <PageHeader
        title={t("Courier settlements")}
        description={t(
          "Upload the courier's statement (PDF) or sheet. Review what each shipment will do, then post: delivered orders are marked paid, returns go in transit for the warehouse to confirm, and the courier's charges are recorded as shipping costs.",
        )}
      />

      {canEdit("finance") && (
        <Card>
          <CardHeader>
            <CardTitle>{t("Upload a statement")}</CardTitle>
            <CardDescription>
              {t("The courier's account statement as a PDF, or an Excel/CSV sheet with the shipment number, status and amount due to you. Nothing is posted until you press Post.")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center hover:bg-muted/40">
              <FileUp className="size-6 text-muted-foreground" />
              <span className="font-medium">{fileName ?? t("Choose the statement")}</span>
              <input
                type="file"
                accept=".pdf,.xlsx,.csv"
                className="sr-only"
                onChange={(e) => void onFile(e.target.files?.[0])}
              />
            </label>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {rows && !check && (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            )}
            {check && totals && (
              <>
                <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-4">
                  <Stat label={t("Ready to post")} value={`${totals.ready} / ${totals.rows}`} />
                  <Stat label={t("Net to the bank")} value={formatMoney(totals.net)} strong />
                  <Stat label={t("Courier charges")} value={formatMoney(totals.fees + totals.refused)} />
                  <Stat label={t("Receivables cleared")} value={formatMoney(totals.receivable)} />
                  <Stat label={t("Collected")} value={String(totals.collected)} />
                  <Stat label={t("Returns (in transit)")} value={String(totals.returns)} />
                  <Stat label={t("Partial returns")} value={String(totals.partials)} />
                  <Stat label={t("From before the app")} value={String(totals.preApp)} />
                </div>
                {totals.needsInput > 0 && (
                  <p className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-sm">
                    <TriangleAlert className="size-4 shrink-0 text-amber-600" />
                    {t("{{n}} partial returns need you to choose the pieces that came back (in the table below).", {
                      n: totals.needsInput,
                    })}
                  </p>
                )}
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <span className="sr-only">{t("Include")}</span>
                        </TableHead>
                        <TableHead>{t("Shipment")}</TableHead>
                        <TableHead>{t("Order")}</TableHead>
                        <TableHead>{t("Courier status")}</TableHead>
                        <TableHead className="text-end">{t("Due to you")}</TableHead>
                        <TableHead className="text-end">{t("Charges")}</TableHead>
                        <TableHead className="min-w-64">{t("What posting does")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {check.rows.map((r) => (
                        <ReviewRow
                          key={`${r.shipment}-${r.line}`}
                          row={r}
                          extra={extra[r.shipment]}
                          edit={edits[r.shipment]}
                          onEdit={(patch) => edit(r.shipment, patch)}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="cs-date">{t("Date received")}</Label>
                    <Input id="cs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cs-account">{t("Received in")}</Label>
                    <Select value={accountId || banks[0]?._id || ""} onValueChange={setAccountId}>
                      <SelectTrigger id="cs-account" className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {banks.map((a) => (
                          <SelectItem key={a._id} value={a._id}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="cs-received">{t("Amount that arrived in the bank")}</Label>
                    <MoneyInput
                      id="cs-received"
                      value={received}
                      onChange={setReceived}
                      placeholder={String(totals.net)}
                      className="w-44"
                    />
                  </div>
                  {received.trim() && parseNumber(received) !== undefined && Math.abs(parseNumber(received)! - totals.net) >= 0.005 && (
                    <p className="max-w-60 self-center text-xs text-muted-foreground">
                      {t("Difference {{amount}}: posted to Unidentified difference (gain or loss), like balance differences.", {
                        amount: formatMoney(parseNumber(received)! - totals.net),
                      })}
                    </p>
                  )}
                  <Button
                    className="ms-auto"
                    disabled={posting || totals.ready === 0 || totals.needsInput > 0}
                    title={totals.needsInput > 0 ? t("Choose the returned pieces (or untick those rows) first") : undefined}
                    onClick={() => void submit()}
                  >
                    {posting && <Spinner />}
                    {t("Post {{n}} shipments", { n: totals.ready })}
                  </Button>
                </div>
                {totals.problems > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t("Rows with a problem, or left out, are skipped. Fix them in the app and upload the statement again; posted rows won't be posted twice.")}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("Posted settlements")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          {history && history.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground sm:px-0">{t("None yet.")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Number")}</TableHead>
                  <TableHead>{t("Date")}</TableHead>
                  <TableHead className="text-end">{t("Shipments")}</TableHead>
                  <TableHead className="text-end">{t("Charges")}</TableHead>
                  <TableHead className="text-end">{t("Net")}</TableHead>
                  {isAdmin && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).map((s) => (
                  <TableRow key={s._id}>
                    <TableCell className="font-mono text-xs">
                      {s.number}
                      {s.fileName && <span className="block font-sans text-muted-foreground">{s.fileName}</span>}
                    </TableCell>
                    <TableCell>{formatDay(s.date)}</TableCell>
                    <TableCell className="text-end tabular-nums">{s.orders}</TableCell>
                    <TableCell className="text-end tabular-nums">{formatMoney(s.fees)}</TableCell>
                    <TableCell className="text-end font-medium tabular-nums">{formatMoney(s.netAmount)}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={t("Undo {{number}}", { number: s.number })}
                          onClick={() => {
                            setDeleting(s._id);
                            if (!isAdminMode) setAdminOpen(true);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AdminModeDialog
        open={adminOpen}
        onOpenChange={(open) => {
          setAdminOpen(open);
          if (open) return;
          const until = queryClient.getQueryData<{ adminModeUntil?: number | null }>(ME_KEY)?.adminModeUntil;
          if (!until || until <= Date.now()) setDeleting(null);
        }}
      />
      <ConfirmDialog
        open={!!deleting && isAdminMode && !adminOpen}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("Undo this settlement?")}
        description={t("Its orders go back to unpaid and its accounting entry is removed.")}
        confirmLabel={t("Undo settlement")}
        destructive
        onConfirm={() => deleting && remove({ settlementId: deleting })}
        successMessage={t("Settlement undone")}
      />
      {!canEdit("finance") && <Badge variant="outline">{t("View only")}</Badge>}
    </PageBody>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums", strong && "text-base font-semibold")}>{value}</p>
    </div>
  );
}

const ACTION_LABELS: Record<NonNullable<Checked["action"]>, string> = {
  collect: "Collected: marked paid",
  return: "Returned: recorded in transit until the warehouse confirms it",
  returned: "Return already recorded: shipping charge only",
  partial_return: "Partial return: the chosen pieces in transit, the rest collected",
  partial_collect: "Partial return: the money collected now; the rest closes when the warehouse records the returned pieces",
  pre_app: "Courier money from before the app",
};

/** One shipment on the review screen: what posting will do, and the choices it needs. */
function ReviewRow({
  row: r,
  extra,
  edit,
  onEdit,
}: {
  row: Checked;
  extra?: Extra;
  edit?: Edit;
  onEdit: (patch: Edit) => void;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const skipped = !!edit?.skip;
  const isPartial = (r.action === "partial_return" || r.action === "partial_collect" || r.asFullReturn) && !skipped;
  const later = edit?.partial === "later";
  const showPicker = isPartial && !later && !!r.lines?.length;
  const needsRefund = r.message === "This order has a custom total: enter the refund for the returned pieces" || edit?.refund !== undefined;
  return (
    <TableRow className={cn(skipped ? "opacity-50" : !r.ok && (r.needsInput ? "bg-amber-500/5" : "bg-destructive/5"))}>
      <TableCell>
        <Checkbox
          checked={!skipped}
          onCheckedChange={(c) => onEdit({ skip: c !== true })}
          aria-label={t("Include {{shipment}}", { shipment: r.shipment })}
        />
      </TableCell>
      <TableCell className="font-mono text-xs">
        {r.shipment}
        {extra?.date && <span className="block font-sans text-muted-foreground">{extra.date}</span>}
      </TableCell>
      <TableCell>
        {r.orderNumber ?? "—"}
        <span className="block text-xs text-muted-foreground" dir="auto">
          {r.customer}
        </span>
      </TableCell>
      <TableCell dir="auto" className="text-sm">
        {r.statusText}
        {extra?.paid != null && (
          <span className="block text-xs text-muted-foreground" dir="ltr">
            {t("Paid {{paid}} · shipping {{shipping}}", { paid: formatMoney(extra.paid), shipping: formatMoney(extra.shipping ?? 0) })}
          </span>
        )}
      </TableCell>
      <TableCell className="text-end tabular-nums">{formatMoney(r.due)}</TableCell>
      <TableCell className="text-end tabular-nums">{r.ok ? formatMoney(r.fee + r.refused) : ""}</TableCell>
      <TableCell className="max-w-sm min-w-64 whitespace-normal">
        {skipped ? (
          <span className="text-sm text-muted-foreground">{t("Left out of this settlement")}</span>
        ) : (
          <div className="grid gap-1.5">
            {r.action && (r.ok || r.needsInput) && (
              <span
                className={cn(
                  "flex items-start gap-1 text-sm",
                  r.ok ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                )}
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
                {t(ACTION_LABELS[r.action])}
              </span>
            )}
            {isPartial && (
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("Partial return")}>
                {(["pieces", "later"] as const).map((mode) => (
                  <Button
                    key={mode}
                    type="button"
                    size="sm"
                    variant={(edit?.partial ?? "pieces") === mode ? "secondary" : "outline"}
                    role="radio"
                    aria-checked={(edit?.partial ?? "pieces") === mode}
                    className="h-7 text-xs"
                    onClick={() => onEdit({ partial: mode })}
                  >
                    {mode === "pieces" ? t("Choose the pieces now") : t("Pieces not known yet")}
                  </Button>
                ))}
              </div>
            )}
            {isPartial && later && (
              <div className="grid gap-1.5 rounded-md border bg-background p-2">
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span>{t("Collected for the pieces kept")}</span>
                  <MoneyInput
                    value={edit?.collected ?? (r.suggestedCollected != null ? String(r.suggestedCollected) : "")}
                    onChange={(v) => onEdit({ collected: v })}
                    className="h-8 w-28"
                  />
                </label>
                <span className="text-xs text-muted-foreground">
                  {r.suggestedCollected != null
                    ? t("Suggested: what the customer paid minus the order's shipping fee. The order waits for the warehouse to record the pieces that came back.")
                    : t("The order waits for the warehouse to record the pieces that came back.")}
                </span>
              </div>
            )}
            {showPicker && (
              <div className="grid gap-1.5 rounded-md border bg-background p-2">
                <span className="text-xs font-medium">{t("Pieces that came back")}</span>
                {r.lines!.map((l) => (
                  <label key={l.lineItemId} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate" dir="auto">
                      {l.name} <span className="text-xs text-muted-foreground">({t("of {{n}}", { n: l.returnable })})</span>
                    </span>
                    <QuantityInput
                      value={edit?.returnLines?.[l.lineItemId] ?? ""}
                      onChange={(v) => onEdit({ returnLines: { ...edit?.returnLines, [l.lineItemId]: v } })}
                      className="h-8 w-20"
                      aria-label={t("Returned pieces of {{item}}", { item: l.name })}
                    />
                  </label>
                ))}
                {needsRefund && (
                  <label className="flex items-center justify-between gap-2 text-sm">
                    <span>{t("Refund for these pieces")}</span>
                    <MoneyInput value={edit?.refund ?? ""} onChange={(v) => onEdit({ refund: v })} className="h-8 w-28" />
                  </label>
                )}
                {r.ok && r.refund !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {t("Refund {{refund}} · collected {{collected}}", { refund: formatMoney(r.refund), collected: formatMoney(r.receivable) })}
                  </span>
                )}
              </div>
            )}
            {r.warning && (
              <span className="flex items-start gap-1 text-xs text-amber-700 dark:text-amber-400">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                {t(r.warning)}
              </span>
            )}
            {!r.ok && r.message && (
              <span className={cn("flex items-start gap-1 text-sm", r.needsInput ? "text-amber-700 dark:text-amber-400" : "text-destructive")}>
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {t(r.message)}
              </span>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
