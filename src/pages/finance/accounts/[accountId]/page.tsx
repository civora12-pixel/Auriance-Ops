import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ACCOUNT_TYPE_LABELS, JOURNAL_SOURCE_LABELS } from "@shared/constants.ts";
import { isValidDay } from "@shared/dates.ts";
import { useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { TableSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import { jvNumber } from "../../_lib/journal.ts";
import { PartnersOwedCard } from "../../_components/partners-owed.tsx";

/** One account's entries with the balance carried in and a running balance. */
export default function AccountLedgerPage() {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const { accountId = "" } = useParams();
  const [state, update] = useUrlState({ from: "", to: "" });
  const fromDay = isValidDay(state.from) ? state.from : undefined;
  const toDay = isValidDay(state.to) ? state.to : undefined;
  const data = useQuery(
    api.finance.accounts.ledger,
    { accountId, fromDay, toDay },
    { keepPrevious: true },
  );
  const account = data?.account;

  return (
    <PageBody>
      <PageHeader
        breadcrumbs={[
          { label: t("Chart of accounts"), to: "/finance/accounts" },
          { label: account ? `${account.code} ${account.name}` : "…" },
        ]}
        title={account ? `${account.code} · ${account.name}` : t("Account")}
        description={
          account
            ? `${t(ACCOUNT_TYPE_LABELS[account.type])} · ${account.group}`
            : undefined
        }
        actions={
          data && (
            <div className="text-end">
              <p className="text-xs text-muted-foreground">{t("Balance")}</p>
              <p className="text-2xl font-semibold tabular-nums">{formatMoney(data.closing)}</p>
            </div>
          )
        }
      />

      {account?.systemKey === "partners_payable" && <PartnersOwedCard always />}

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="led-from" className="text-xs text-muted-foreground">
            {t("From")}
          </Label>
          <Input
            id="led-from"
            type="date"
            value={state.from}
            onChange={(e) => update({ from: e.target.value })}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="led-to" className="text-xs text-muted-foreground">
            {t("To")}
          </Label>
          <Input
            id="led-to"
            type="date"
            value={state.to}
            onChange={(e) => update({ to: e.target.value })}
            className="w-[160px]"
          />
        </div>
      </div>

      {data === undefined ? (
        <TableSkeleton rows={8} />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">{t("Date")}</TableHead>
                <TableHead className="w-24">{t("Entry")}</TableHead>
                <TableHead>{t("Description")}</TableHead>
                <TableHead className="text-end">{t("Debit")}</TableHead>
                <TableHead className="text-end">{t("Credit")}</TableHead>
                <TableHead className="text-end">{t("Balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fromDay && (
                <TableRow className="bg-muted/30">
                  <TableCell colSpan={5} className="text-muted-foreground">
                    {t("Balance before {{date}}", { date: formatDay(fromDay) })}
                  </TableCell>
                  <TableCell className="text-end font-medium tabular-nums">
                    {formatMoney(data.opening)}
                  </TableCell>
                </TableRow>
              )}
              {data.lines.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    {t("No entries in this period.")}
                  </TableCell>
                </TableRow>
              ) : (
                data.lines.map((l) => (
                  <TableRow key={l.lineId}>
                    <TableCell>{formatDay(l.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{jvNumber(l.number)}</TableCell>
                    <TableCell>
                      <span dir="auto">{l.entryMemo}</span>
                      {l.memo && (
                        <span dir="auto" className="block text-xs text-muted-foreground">
                          {l.memo}
                        </span>
                      )}
                      {l.source !== "manual" && (
                        <Badge variant="secondary" className="mt-1">
                          {t(JOURNAL_SOURCE_LABELS[l.source])}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {l.debit ? formatMoney(l.debit) : ""}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {l.credit ? formatMoney(l.credit) : ""}
                    </TableCell>
                    <TableCell
                      className={cn("text-end tabular-nums", l.balance < 0 && "text-destructive")}
                    >
                      {formatMoney(l.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </PageBody>
  );
}
