import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command.tsx";
import { Input } from "@/components/ui/input.tsx";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

function supportedTimeZones(): string[] | null {
  try {
    if (typeof Intl.supportedValuesOf !== "function") return null;
    const zones = Intl.supportedValuesOf("timeZone");
    return zones.includes("UTC") ? zones : ["UTC", ...zones];
  } catch {
    return null;
  }
}

/** "GMT+02:00" for a zone, right now (for labels). */
function offsetLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      timeZoneName: "shortOffset",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  } catch {
    return "";
  }
}

/** Searchable timezone list, or a text field on runtimes that can't list zones. */
export function TimezonePicker({
  id,
  value,
  onChange,
  disabled,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (zone: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const { t } = useTranslation();
  const zones = useMemo(supportedTimeZones, []);
  const [open, setOpen] = useState(false);
  // Offsets are only worked out once the list opens (there are ~400 zones)
  const options = useMemo(
    () =>
      open && zones
        ? zones.map((z) => ({ zone: z, offset: offsetLabel(z) }))
        : [],
    [open, zones],
  );

  if (!zones) {
    return (
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Africa/Cairo"
        disabled={disabled}
        aria-invalid={invalid || undefined}
      />
    );
  }

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
              ? `${value.replaceAll("_", " ")}  ·  ${offsetLabel(value)}`
              : t("Choose a timezone")}
          </span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={t("Search city or region…")} />
          <CommandList>
            <CommandEmpty>{t("No timezone found.")}</CommandEmpty>
            {options.map(({ zone, offset }) => (
              <CommandItem
                key={zone}
                value={`${zone} ${zone.replaceAll("_", " ")} ${offset}`}
                onSelect={() => {
                  onChange(zone);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    "size-4",
                    zone === value ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="truncate">{zone.replaceAll("_", " ")}</span>
                <span
                  className="ms-auto text-xs text-muted-foreground"
                  dir="ltr"
                >
                  {offset}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
