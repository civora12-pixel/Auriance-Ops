import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookOpen, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  JOURNAL_SOURCE_LABELS,
  JOURNAL_SOURCES,
} from "@shared/constants.ts";
import type { JournalSource } from "@shared/constants.ts";
import { isValidDay } from "@shared/dates.ts";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { Pager, useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useDebouncedCallback } from "@/hooks/use-debounce.ts";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import { ME_KEY, useAdminMode, useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import EntryDialog from "../_components/entry-dialog.tsx";
import { jvNumber } from "../_lib/journal.ts";
import type { JournalEntryRow } from "../_components/entry-dialog.tsx";

const PAGE_SIZES = [25, 50, 100];
const isSource = (v: string): v is JournalSource =>
  (JOURNAL_SOURCES as readonly string[]).includes(v);

/** Finance → Journal entries: every entry, manual and automatic, newest first. */
export default function JournalPage() {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const { canEdit, isAdmin } = useCurrentUser();
  const canChange = canEdit("finance");
  const { isAdminMode } = useAdminMode();
  const queryClient = useQueryClient();
  const accounts = useQuery(api.finance.accounts.list, {});
  const remove = useMutation(api.finance.journal.remove);

  const [state, update] = useUrlState({
    source: "all",
    from: "",
    to: "",
    q: "",
    page: "1",
    size: "25",
  });
  const page = Math.max(1, Number(state.page) || 1);
  const pageSize = PAGE_SIZES.includes(Number(state.size)) ? Number(state.size) : 25;
  const source = isSource(state.source) ? state.source : undefined;
  const fromDay = isValidDay(state.from) ? state.from : undefined;
  const toDay = isValidDay(state.to) ? state.to : undefined;
  const badRange = !!fromDay && !!toDay && fromDay > toDay;
  const hasFilters = !!source || !!fromDay || !!toDay || !!state.q;

  const [search, setSearch] = useState(state.q);
  const pushSearch = useDebouncedCallback((q: string) => update({ q: q.trim() }), 300);

  const result = useQuery(
    api.finance.journal.list,
    badRange
      ? "skip"
      : { source, fromDay, toDay, search: state.q || undefined, page, pageSize },
    { keepPrevious: true },
  );

  const [dialog, setDialog] = useState<{ key: number; entry: JournalEntryRow | null } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<JournalEntryRow | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const openDialog = (entry: JournalEntryRow | null) =>
    setDialog((d) => ({ key: (d?.key ?? 0) + 1, entry }));

  const requestDelete = (entry: JournalEntryRow) => {
    setDeleting(entry);
    if (!isAdminMode) setAdminOpen(true);
  };
  const closeAdminDialog = (open: boolean) => {
    setAdminOpen(open);
    if (open) return;
    const until = queryClient.getQueryData<{ adminModeUntil?: number | null }>(ME_KEY)
      ?.adminModeUntil;
    if (!until || until <= Date.now()) setDeleting(null);
  };
  const clearFilters = () => {
    setSearch("");
    pushSearch.cancel();
    update({ source: "all", from: "", to: "", q: "" });
  };

  return (
    <PageBody>
      <PageHeader
        title={t("Journal entries")}
        description={t(
          "Every accounting entry. Automatic entries come from orders and stock; manual entries are yours.",
        )}
        actions={
          canChange && (
            <Button onClick={() => openDialog(null)}>
              <Plus />
              {t("New entry")}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="jv-search" className="text-xs text-muted-foreground">
            {t("Search")}
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="jv-search"
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                pushSearch(e.target.value);
              }}
              placeholder={t("Description or JV number")}
              className="w-[220px] ps-8"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jv-source" className="text-xs text-muted-foreground">
            {t("Type")}
          </Label>
          <Select value={source ?? "all"} onValueChange={(v) => update({ source: v })}>
            <SelectTrigger id="jv-source" className="w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All entries")}</SelectItem>
              {JOURNAL_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(JOURNAL_SOURCE_LABELS[s])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="jv-from" className="text-xs text-muted-foreground">
            {t("From")}
          </Label>
          <Input
            id="jv-from"
            type="date"
            value={state.from}
            max={state.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            aria-invalid={badRange || undefined}
            className="w-[160px]"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="jv-to" className="text-xs text-muted-foreground">
            {t("To")}
          </Label>
          <Input
            id="jv-to"
            type="date"
            value={state.to}
            min={state.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            aria-invalid={badRange || undefined}
            className="w-[160px]"
          />
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            {t("Clear filters")}
          </Button>
        )}
      </div>

      {badRange ? (
        <p role="alert" className="text-sm text-destructive">
          {t("The start date must be on or before the end date.")}
        </p>
      ) : result === undefined ? (
        <TableSkeleton rows={6} />
      ) : result.total === 0 ? (
        <EmptyState
          icon={<BookOpen />}
          title={hasFilters ? t("No entries match") : t("No journal entries yet")}
          description={
            hasFilters
              ? t("Try a different search, type or date range.")
              : t("Post your first entry, or wait for orders and stock to post theirs.")
          }
          action={
            hasFilters ? (
              <Button size="sm" variant="outline" onClick={clearFilters}>
                {t("Clear filters")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {result.items.map((entry) => (
            <article key={entry._id} className="rounded-lg border bg-card">
              <header className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-semibold">
                      {jvNumber(entry.number)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {formatDay(entry.date)}
                    </span>
                    <Badge variant={entry.source === "manual" ? "outline" : "secondary"}>
                      {t(JOURNAL_SOURCE_LABELS[entry.source])}
                    </Badge>
                    {entry.dueDay && (
                      <Badge variant="outline" className={entry.settledAt ? "text-muted-foreground" : "border-amber-500/50 text-amber-700 dark:text-amber-300"}>
                        {entry.settledAt ? t("Paid") : t("Due {{day}}", { day: formatDay(entry.dueDay) })}
                      </Badge>
                    )}
                  </div>
                  <p dir="auto" className="font-medium">
                    {entry.memo}
                  </p>
                  {entry.createdByName && (
                    <p className="text-xs text-muted-foreground">
                      {t("by {{name}}", { name: entry.createdByName })}
                    </p>
                  )}
                  {entry.orderId && (
                    <Link
                      to={`/orders/${entry.orderId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {t("Open order")}
                    </Link>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="me-2 font-semibold tabular-nums">
                    {formatMoney(entry.total)}
                  </span>
                  {canChange && entry.source === "manual" && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openDialog(entry)}
                        aria-label={t("Edit {{entry}}", { entry: jvNumber(entry.number) })}
                      >
                        <Pencil />
                      </Button>
                      {isAdmin && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => requestDelete(entry)}
                        aria-label={t("Delete {{entry}}", { entry: jvNumber(entry.number) })}
                      >
                        <Trash2 />
                      </Button>
                      )}
                    </>
                  )}
                </div>
              </header>
              <table className="w-full text-sm">
                <thead className="sr-only">
                  <tr>
                    <th>{t("Account")}</th>
                    <th>{t("Debit")}</th>
                    <th>{t("Credit")}</th>
                  </tr>
                </thead>
                <tbody>
                  {entry.lines.map((l) => (
                    <tr key={l._id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          to={`/finance/accounts/${l.accountId}`}
                          className={l.credit ? "ps-6 hover:underline" : "hover:underline"}
                        >
                          <span className="font-mono text-xs text-muted-foreground">
                            {l.accountCode}
                          </span>{" "}
                          {l.accountName}
                        </Link>
                        {l.memo && (
                          <span dir="auto" className="block ps-6 text-xs text-muted-foreground">
                            {l.memo}
                          </span>
                        )}
                      </td>
                      <td className="w-32 px-4 py-2 text-end tabular-nums">
                        {l.debit ? formatMoney(l.debit) : ""}
                      </td>
                      <td className="w-32 px-4 py-2 text-end tabular-nums">
                        {l.credit ? formatMoney(l.credit) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ))}
          <Pager
            page={page}
            pageSize={pageSize}
            total={result.total}
            onPage={(p) => update({ page: String(p) })}
            onPageSize={(s) => update({ size: String(s), page: "1" })}
            pageSizes={PAGE_SIZES}
          />
        </div>
      )}

      {dialog && (
        <EntryDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          entry={dialog.entry}
          accounts={accounts}
        />
      )}

      <AdminModeDialog open={adminOpen} onOpenChange={closeAdminDialog} />
      <ConfirmDialog
        open={!!deleting && isAdminMode && !adminOpen}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("Delete {{entry}}?", { entry: deleting ? jvNumber(deleting.number) : "" })}
        description={t(
          "The entry and its lines are removed and account balances change back. This is recorded in the deletion log.",
        )}
        confirmLabel={t("Delete entry")}
        destructive
        onConfirm={() => deleting && remove({ entryId: deleting._id })}
        successMessage={t("Entry deleted")}
      />
    </PageBody>
  );
}
