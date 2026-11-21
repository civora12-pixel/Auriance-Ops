import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Plus, Power } from "lucide-react";
import {
  ACCOUNT_TYPE_LABELS,
  ACCOUNT_TYPES,
  MONEY_EPSILON,
  round2,
} from "@shared/constants.ts";
import { isValidDay } from "@shared/dates.ts";
import { LinkRow, useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { TableSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
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
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import AccountDialog from "../_components/account-dialog.tsx";
import type { AccountRow } from "../_components/account-picker.tsx";

/** Finance → Chart of accounts: every account with its balance, grouped by type. */
export default function AccountsPage() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const { canEdit } = useCurrentUser();
  const canChange = canEdit("finance");
  const setActive = useMutation(api.finance.accounts.setActive);
  const [state, update] = useUrlState({ asof: "" });
  const asOfDay = isValidDay(state.asof) ? state.asof : undefined;
  const accounts = useQuery(api.finance.accounts.list, { asOfDay }, { keepPrevious: true });
  const [dialog, setDialog] = useState<{ key: number; account: AccountRow | null } | null>(null);
  const openDialog = (account: AccountRow | null) =>
    setDialog((d) => ({ key: (d?.key ?? 0) + 1, account }));

  const toggle = async (a: AccountRow) => {
    try {
      await setActive({ accountId: a._id, isActive: !a.isActive });
      toast.success(a.isActive ? t("Account deactivated") : t("Account reactivated"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const groups = [...new Set((accounts ?? []).map((a) => a.group))];
  const sum = (pick: (a: AccountRow) => number) =>
    round2((accounts ?? []).reduce((s, a) => s + pick(a), 0));
  const debits = sum((a) => a.debitTotal);
  const credits = sum((a) => a.creditTotal);
  const balanced = Math.abs(debits - credits) < MONEY_EPSILON;

  return (
    <PageBody>
      <PageHeader
        title={t("Chart of accounts")}
        description={t(
          "Accounts marked Automatic are filled by orders and stock. Open an account to see its entries.",
        )}
        actions={
          canChange && (
            <Button onClick={() => openDialog(null)}>
              <Plus />
              {t("Add account")}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="space-y-1">
          <Label htmlFor="coa-asof" className="text-xs text-muted-foreground">
            {t("Balances as of")}
          </Label>
          <Input
            id="coa-asof"
            type="date"
            value={state.asof}
            onChange={(e) => update({ asof: e.target.value })}
            className="w-[170px]"
          />
        </div>
        {accounts && (
          <p
            className={cn(
              "ms-auto text-sm",
              balanced ? "text-muted-foreground" : "font-medium text-destructive",
            )}
          >
            {balanced
              ? t("Books balance: debits {{d}} = credits {{c}}", {
                  d: formatMoney(debits),
                  c: formatMoney(credits),
                })
              : t("Books out of balance: debits {{d}}, credits {{c}}", {
                  d: formatMoney(debits),
                  c: formatMoney(credits),
                })}
          </p>
        )}
      </div>

      {accounts === undefined ? (
        <TableSkeleton rows={10} />
      ) : (
        <div className="space-y-6">
          {ACCOUNT_TYPES.map((type) => {
            const rows = accounts.filter((a) => a.type === type);
            if (!rows.length) return null;
            const total = round2(rows.reduce((s, a) => s + a.balance, 0));
            return (
              <section key={type} className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-lg font-semibold">{t(ACCOUNT_TYPE_LABELS[type])}</h2>
                  <span className="font-semibold tabular-nums">{formatMoney(total)}</span>
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-20">{t("Code")}</TableHead>
                        <TableHead>{t("Account")}</TableHead>
                        <TableHead className="hidden md:table-cell">{t("Group")}</TableHead>
                        <TableHead className="text-end">{t("Balance")}</TableHead>
                        {canChange && <TableHead className="w-12" />}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((a) => (
                        <LinkRow
                          key={a._id}
                          to={`/finance/accounts/${a._id}`}
                          label={`${a.code} ${a.name}`}
                          className={cn(!a.isActive && "opacity-60")}
                        >
                          <TableCell className="font-mono text-xs">{a.code}</TableCell>
                          <TableCell>
                            <span className="flex flex-wrap items-center gap-1.5">
                              {a.name}
                              {a.isAuto && <Badge variant="secondary">{t("Automatic")}</Badge>}
                              {!a.isActive && <Badge variant="outline">{t("Inactive")}</Badge>}
                            </span>
                            <span className="block text-xs text-muted-foreground md:hidden">
                              {a.group}
                            </span>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground md:table-cell">
                            {a.group}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-end tabular-nums",
                              a.balance < 0 && "text-destructive",
                              a.balance === 0 && "text-muted-foreground",
                            )}
                          >
                            {formatMoney(a.balance)}
                          </TableCell>
                          {canChange && (
                            <TableCell>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={t("Actions for {{account}}", { account: a.name })}
                                  >
                                    <MoreHorizontal />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => openDialog(a)}>
                                    <Pencil />
                                    {t("Edit")}
                                  </DropdownMenuItem>
                                  {!a.systemKey && (
                                    <DropdownMenuItem onSelect={() => void toggle(a)}>
                                      <Power />
                                      {a.isActive ? t("Deactivate") : t("Reactivate")}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </LinkRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {dialog && (
        <AccountDialog
          key={dialog.key}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          account={dialog.account}
          groups={groups}
        />
      )}
    </PageBody>
  );
}
