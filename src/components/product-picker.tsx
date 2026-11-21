import { matchesSearch } from "@shared/search.ts";
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, ImageOff, Package, X } from "lucide-react";
import { useTranslation } from "react-i18next";
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
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { api, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { stockLevel } from "@/lib/status.ts";
import { cn } from "@/lib/utils.ts";

export type SellableItem = Output<
  typeof api.products.listSellableItems
>[number];

/** Every sellable line (product, or product + variant), cached and shared by every picker. */
export function useSellableItems() {
  return useQuery(api.products.listSellableItems);
}

export function sellableKey(
  productId: string,
  variantId?: string | null,
): string {
  return variantId ? `${productId}:${variantId}` : productId;
}

const FULL_SCREEN_QUERY = "(max-width: 767px), (pointer: coarse)";

/**
 * Phones and touch screens get the picker as a full-screen panel. A dropdown
 * there opens right where the on-screen keyboard pops up, so it looks like the
 * tap did nothing and the next tap closes it again.
 */
export function useFullScreenPicker() {
  const [full, setFull] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(FULL_SCREEN_QUERY).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(FULL_SCREEN_QUERY);
    const onChange = () => setFull(mql.matches);
    mql.addEventListener("change", onChange);
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return full;
}

function Thumb({ url }: { url?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {url ? <ImageOff className="size-4" /> : <Package className="size-4" />}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="size-8 shrink-0 rounded-md object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * Searchable product/variant picker (by name, variant or SKU) showing stock
 * and price. `value` is a sellable key from `sellableKey()`.
 */
export function ProductPicker({
  value,
  onChange,
  items: itemsProp,
  exclude,
  showPrice = true,
  warnOutOfStock = false,
  disabled,
  invalid,
  id,
  placeholder,
  className,
}: {
  value: string | undefined;
  onChange: (item: SellableItem) => void;
  /** Override the list (for example to only offer certain items) */
  items?: SellableItem[];
  /** Keys that can't be picked (already on the order) */
  exclude?: string[];
  showPrice?: boolean;
  warnOutOfStock?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const full = useFullScreenPicker();
  const all = useSellableItems();
  const items = itemsProp ?? all;
  const { formatMoney, formatNumber } = useFormat();
  const selected = items?.find((i) => i.key === value);

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={open}
      onClick={full ? () => setOpen(true) : undefined}
      aria-invalid={invalid || undefined}
      disabled={disabled}
      className={cn(
        "h-auto min-h-9 w-full justify-between px-3 py-1.5 font-normal",
        className,
      )}
    >
      {selected ? (
        <span className="flex min-w-0 items-center gap-2 text-start">
          <Thumb url={selected.imageUrl} />
          <span className="min-w-0">
            <span className="block truncate">{selected.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {selected.sku} ·{" "}
              {t("{{quantity}} {{uom}} on hand", {
                quantity: formatNumber(selected.onHand),
                uom: selected.uom,
              })}
            </span>
          </span>
        </span>
      ) : (
        <span className="text-muted-foreground">
          {items === undefined
            ? t("Loading products…")
            : (placeholder ?? t("Select a product…"))}
        </span>
      )}
      <ChevronsUpDown className="ms-2 size-4 shrink-0 opacity-50" />
    </Button>
  );

  const list = (
    <Command
      className={cn(full && "min-h-0 flex-1 rounded-none")}
      filter={(itemValue, search) => {
        const item = items?.find((i) => i.key === itemValue);
        if (!item) return 0;
        return matchesSearch(
          `${item.label} ${item.sku} ${item.category}`,
          search,
        )
          ? 1
          : 0;
      }}
    >
      <CommandInput
        placeholder={t("Search by name or SKU…")}
        className={full ? "h-12 text-base" : undefined}
      />
      <CommandList
        className={cn(full ? "max-h-none min-h-0 flex-1" : "max-h-72")}
      >
        {items === undefined ? (
          <div className="space-y-2 p-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <>
            <CommandEmpty>{t("No products found.")}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => {
                // Selling: what's free to promise. Elsewhere: what's physically on hand.
                const qty = warnOutOfStock ? item.available : item.onHand;
                const level = stockLevel(qty, item.reorderThreshold);
                const excluded =
                  exclude?.includes(item.key) && item.key !== value;
                return (
                  <CommandItem
                    key={item.key}
                    value={item.key}
                    disabled={excluded || !item.isActive}
                    onSelect={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    className={cn("gap-2", full && "min-h-14 px-3 py-2")}
                  >
                    <Thumb url={item.imageUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.sku}
                        {excluded
                          ? ` · ${t("already added")}`
                          : !item.isActive
                            ? ` · ${t("inactive")}`
                            : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-end text-xs">
                      {showPrice && (
                        <span className="block tabular-nums">
                          {formatMoney(item.unitPrice)}
                        </span>
                      )}
                      <span
                        className={cn(
                          "block tabular-nums",
                          level === "out"
                            ? "text-destructive"
                            : level === "low"
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-muted-foreground",
                        )}
                      >
                        {level === "out" && warnOutOfStock
                          ? t("Out of stock")
                          : warnOutOfStock
                            ? t("{{quantity}} available", {
                                quantity: formatNumber(qty),
                              })
                            : t("{{quantity}} on hand", {
                                quantity: formatNumber(qty),
                              })}
                      </span>
                    </span>
                    <Check
                      className={cn(
                        "size-4 shrink-0",
                        value === item.key ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
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
            className="flex h-dvh max-h-dvh w-full max-w-none translate-x-[-50%] translate-y-[-50%] flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
            // Show the list first; the keyboard only comes up when they tap search
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <DialogTitle className="text-base">
                {placeholder ?? t("Select a product…")}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {t("Search by name or SKU…")}
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
    // Modal so the list scrolls even inside a dialog (which blocks scrolling outside itself)
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[300px] p-0"
        align="start"
      >
        {list}
      </PopoverContent>
    </Popover>
  );
}
