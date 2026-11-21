import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { matchesSearch } from "@shared/search.ts";
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES } from "@shared/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { useFullScreenPicker } from "@/components/product-picker.tsx";
import type { Output } from "@/lib/api.ts";
import { api } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";

export type AccountRow = Output<typeof api.finance.accounts.list>[number];

/**
 * Searchable account picker (by code or name), grouped by type. Accounts the
 * app fills itself and inactive accounts are shown but can't be picked.
 */
export function AccountPicker({
  accounts,
  value,
  onChange,
  id,
  invalid,
  disabled,
  allowAuto = false,
}: {
  accounts: AccountRow[] | undefined;
  value: string | undefined;
  onChange: (accountId: string) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  allowAuto?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const full = useFullScreenPicker();
  const selected = accounts?.find((a) => a._id === value);

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      onClick={full ? () => setOpen(true) : undefined}
      className="h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal"
    >
      {selected ? (
        <span className="min-w-0 truncate text-start">
          <span className="font-mono text-xs text-muted-foreground">
            {selected.code}
          </span>{" "}
          {selected.name}
        </span>
      ) : (
        <span className="text-muted-foreground">
          {accounts === undefined ? t("Loading…") : t("Choose an account")}
        </span>
      )}
      <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
    </Button>
  );

  const list = (
    <Command
      className={cn(full && "min-h-0 flex-1 rounded-none")}
      filter={(itemValue, search) => {
        const a = accounts?.find((x) => x._id === itemValue);
        return a && matchesSearch(`${a.code} ${a.name} ${a.group}`, search) ? 1 : 0;
      }}
    >
      <CommandInput
        placeholder={t("Search by code or name…")}
        className={full ? "h-12 text-base" : undefined}
      />
      <CommandList className={cn(full ? "max-h-none min-h-0 flex-1" : "max-h-72")}>
        <CommandEmpty>{t("No accounts found.")}</CommandEmpty>
        {ACCOUNT_TYPES.map((type) => {
          const group = (accounts ?? []).filter((a) => a.type === type);
          if (!group.length) return null;
          return (
            <CommandGroup key={type} heading={t(ACCOUNT_TYPE_LABELS[type])}>
              {group.map((a) => {
                const blocked = !a.isActive || (a.isAuto && !allowAuto);
                return (
                  <CommandItem
                    key={a._id}
                    value={a._id}
                    disabled={blocked}
                    onSelect={() => {
                      onChange(a._id);
                      setOpen(false);
                    }}
                    className={cn("gap-2", full && "min-h-12 px-3")}
                  >
                    <span className="w-12 shrink-0 font-mono text-xs text-muted-foreground">
                      {a.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    {blocked && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {!a.isActive ? t("inactive") : t("automatic")}
                      </span>
                    )}
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === a._id ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </Command>
  );

  if (full) {
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <DialogTitle className="text-base">{t("Choose an account")}</DialogTitle>
              <DialogDescription className="sr-only">
                {t("Search by code or name…")}
              </DialogDescription>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10"
                onClick={() => setOpen(false)}
                aria-label={t("Close")}
              >
                <X className="size-5" />
              </Button>
            </div>
            {list}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[320px] p-0"
        align="start"
      >
        {list}
      </PopoverContent>
    </Popover>
  );
}
