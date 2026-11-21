import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import {
  COMMON_CURRENCIES,
  currencyName,
  supportedCurrencies,
} from "@/lib/currencies.ts";
import { cn } from "@/lib/utils.ts";

/** Searchable currency list with the common ones pinned at the top, named in the interface language. */
export function CurrencyPicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [open, setOpen] = useState(false);
  const codes = useMemo(supportedCurrencies, []);
  const options = useMemo(
    () =>
      open
        ? codes.map((code) => ({
            code,
            name: currencyName(code, locale) ?? code,
          }))
        : [],
    [open, codes, locale],
  );
  const common = options.filter((o) => COMMON_CURRENCIES.includes(o.code));
  const others = options.filter((o) => !COMMON_CURRENCIES.includes(o.code));
  const selectedName = currencyName(value, locale);

  const item = ({ code, name }: { code: string; name: string }) => (
    <CommandItem
      key={code}
      value={`${code} ${name}`}
      onSelect={() => {
        onChange(code);
        setOpen(false);
      }}
    >
      <Check
        className={cn("size-4", code === value ? "opacity-100" : "opacity-0")}
      />
      <span className="w-10 font-mono text-xs">{code}</span>
      <span className="truncate">{name}</span>
    </CommandItem>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value
              ? selectedName
                ? `${value} · ${selectedName}`
                : value
              : t("Choose a currency")}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t("Search code or name…")} />
          <CommandList>
            <CommandEmpty>{t("No currency found.")}</CommandEmpty>
            <CommandGroup heading={t("Common")}>
              {common.map(item)}
            </CommandGroup>
            <CommandGroup heading={t("All currencies")}>
              {others.map(item)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
