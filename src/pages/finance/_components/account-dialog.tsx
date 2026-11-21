import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "@shared/constants.ts";
import type { AccountType } from "@shared/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import type { AccountRow } from "./account-picker.tsx";

/** Add or edit an account: code, name, type and the group it's listed under. */
export default function AccountDialog({
  open,
  onOpenChange,
  account,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRow | null;
  groups: string[];
}) {
  const { t } = useTranslation();
  const create = useMutation(api.finance.accounts.create);
  const update = useMutation(api.finance.accounts.update);
  const [code, setCode] = useState(account ? String(account.code) : "");
  const [name, setName] = useState(account?.name ?? "");
  const [type, setType] = useState<AccountType>(account?.type ?? "expense");
  const [group, setGroup] = useState(account?.group ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const typeLocked = !!account && (!!account.systemKey || account.hasEntries);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(undefined);
    const n = Number(code);
    if (!/^\d{5}$/.test(code.trim())) return setError(t("Use a 5-digit code, e.g. 60008"));
    if (!name.trim()) return setError(t("Enter the account name"));
    if (!group.trim()) return setError(t("Enter the group"));
    setPending(true);
    try {
      const payload = { code: n, name: name.trim(), type, group: group.trim() };
      if (account) {
        await update({ accountId: account._id, ...payload });
        toast.success(t("Account updated"));
      } else {
        await create(payload);
        toast.success(t("Account added"));
      }
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>{account ? t("Edit account") : t("Add account")}</DialogTitle>
            <DialogDescription>
              {t("Codes follow the chart: 1 assets, 2 liabilities, 3 equity, 4 revenue, 5–6 costs.")}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-code">{t("Code")}</Label>
              <Input
                id="acc-code"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="60008"
                disabled={pending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-name">{t("Name")}</Label>
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-type">{t("Type")}</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as AccountType)}
              disabled={pending || typeLocked}
            >
              <SelectTrigger id="acc-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(ACCOUNT_TYPE_LABELS[x])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {typeLocked && (
              <p className="text-xs text-muted-foreground">
                {t("The type can't change once an account is used.")}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="acc-group">{t("Group")}</Label>
            <Input
              id="acc-group"
              list="acc-groups"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder={t("e.g. Selling & admin")}
              disabled={pending}
            />
            <datalist id="acc-groups">
              {groups.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {account ? t("Save changes") : t("Add account")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
