import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgePercent, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { shopPost } from "../_lib/shop-api.ts";
import { SHOP_INPUT } from "./auth-card.tsx";

export type AppliedPromo = { code: string; name: string; discount: number; freeShipping: boolean };

/**
 * "Have a promo code?": typed, checked against the cart straight away, and
 * shown as what it takes off. The order checks it again when it's placed.
 */
export function PromoField({
  applied,
  onApply,
  request,
}: {
  applied: AppliedPromo | null;
  onApply: (p: AppliedPromo | null) => void;
  /** The cart and customer details the code is checked against */
  request: () => Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const apply = async () => {
    if (!code.trim()) return;
    setPending(true);
    setError(undefined);
    try {
      onApply(await shopPost<AppliedPromo>("promo", { ...request(), code: code.trim() }));
      setOpen(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  if (applied)
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-emerald-500/40 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
        <span className="flex min-w-0 items-center gap-2">
          <Check className="size-4 shrink-0 text-emerald-600" aria-hidden />
          <span className="min-w-0">
            <span className="font-mono font-semibold">{applied.code}</span>
            <span className="text-muted-foreground"> · {applied.freeShipping ? t("Free shipping") : t("{{amount}} off", { amount: formatMoney(applied.discount) })}</span>
          </span>
        </span>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" onClick={() => onApply(null)} aria-label={t("Remove the code")}>
          <X />
        </Button>
      </div>
    );

  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="flex w-fit items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline">
        <BadgePercent className="size-4" aria-hidden />
        {t("Have a promo code?")}
      </button>
    );

  return (
    <div className="grid gap-1.5">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void apply();
        }}
      >
        <Input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("Promo code")}
          aria-label={t("Promo code")}
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          className={`${SHOP_INPUT} font-mono uppercase`}
          aria-invalid={!!error}
          autoFocus
        />
        <Button type="submit" className="h-12 rounded-full px-5" disabled={pending || !code.trim()}>
          {t("Apply")}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
