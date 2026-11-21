import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { COURIER_AREAS, GOVERNORATES } from "@shared/courier-areas.ts";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

/** Arabic spelling differences people don't type consistently (أ/ا, ة/ه, ى/ي) and Latin case. */
function normalizeArea(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْـ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Matches when every typed word is found in the option. */
function areaFilter(value: string, search: string): number {
  const text = normalizeArea(value);
  const words = normalizeArea(search).split(" ").filter(Boolean);
  if (!words.length) return 1;
  if (!words.every((w) => text.includes(w))) return 0;
  // Names starting with what was typed come first
  return text.startsWith(words[0]) ? 1 : 0.5;
}

const TRIGGER =
  "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-start text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

function AreaCombobox({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly string[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={TRIGGER}
        >
          <span dir="rtl" className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command filter={areaFilter}>
          <CommandInput dir="auto" placeholder={searchPlaceholder} className="text-base" />
          <CommandList className="max-h-72">
            <CommandEmpty>{t("Nothing matches. Try fewer letters.")}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option}
                value={option}
                dir="rtl"
                onSelect={() => {
                  onChange(option);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === option ? "opacity-100" : "opacity-0")} />
                {option}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Governorate, then city or area, from the courier's own list: they set the
 * shipping fee and fill the courier's upload sheet. Type a few letters to narrow it down.
 */
export function AreaFields({
  idPrefix,
  governorate,
  city,
  onChange,
  errors,
}: {
  idPrefix: string;
  governorate: string;
  city: string;
  onChange: (next: { governorate: string; city: string }) => void;
  errors?: { governorate?: string; city?: string };
}) {
  const { t } = useTranslation();
  const cities = governorate ? (COURIER_AREAS[governorate] ?? []) : [];
  return (
    <>
      <Field data-invalid={!!errors?.governorate}>
        <FieldLabel htmlFor={`${idPrefix}-governorate`}>{t("Governorate")}</FieldLabel>
        <AreaCombobox
          id={`${idPrefix}-governorate`}
          value={governorate}
          options={GOVERNORATES}
          placeholder={t("Choose a governorate")}
          searchPlaceholder={t("Type to search…")}
          invalid={!!errors?.governorate}
          onChange={(g) => onChange({ governorate: g, city: g === governorate ? city : "" })}
        />
        {errors?.governorate && <FieldDescription className="text-destructive">{errors.governorate}</FieldDescription>}
      </Field>
      <Field data-invalid={!!errors?.city}>
        <FieldLabel htmlFor={`${idPrefix}-city`}>{t("City / area")}</FieldLabel>
        <AreaCombobox
          id={`${idPrefix}-city`}
          value={city}
          options={cities}
          placeholder={governorate ? t("Choose a city or area") : t("Choose the governorate first")}
          searchPlaceholder={t("Type to search…")}
          disabled={!governorate}
          invalid={!!errors?.city}
          onChange={(c) => onChange({ governorate, city: c })}
        />
        {errors?.city && <FieldDescription className="text-destructive">{errors.city}</FieldDescription>}
      </Field>
    </>
  );
}
