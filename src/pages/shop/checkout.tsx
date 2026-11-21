import { useRef, useState } from "react";
import { round2 } from "@shared/constants.ts";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { isEgyptianMobile, isEgyptianPhone } from "@shared/phone.ts";
import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { useCartRows } from "./_lib/cart-lines.ts";
import { rememberGuestSizes } from "./_lib/guest.ts";
import { crawlerFor, isKids } from "./_lib/sections.ts";
import { useCatalog, useShopAction, useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import type { PlacedOrder, ShopCustomer, ShopProduct } from "./_lib/shop-api.ts";
import { SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";
import { CheckoutSteps } from "./_components/checkout-steps.tsx";
import { OrderSums } from "./_components/order-sums.tsx";
import { PromoField } from "./_components/promo-field.tsx";
import type { AppliedPromo } from "./_components/promo-field.tsx";
import { AreaFields } from "./_components/area-fields.tsx";
import { CheckoutExtra } from "./_components/checkout-extra.tsx";
import { shippingFeeFor } from "@shared/shipping-zones.ts";
import { isCourierCity } from "@shared/courier-areas.ts";

/** Checkout: delivery details, then a last look and Place order (cash on delivery). */
export default function ShopCheckout() {
  const products = useCatalog();
  const me = useShopMe();
  if (products === undefined || me === undefined) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="size-6 text-primary" />
      </div>
    );
  }
  return <Checkout products={products} customer={me.customer} />;
}

function Checkout({ products, customer }: { products: ShopProduct[]; customer: ShopCustomer | null }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatMoney, today } = useFormat();
  const config = useShopConfig();
  const action = useShopAction();
  const { cart, ready, subtotal, missingGender } = useCartRows(products);

  const [step, setStep] = useState<1 | 2>(1);
  const placedRef = useRef(false);
  const [form, setForm] = useState(() => ({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    phone2: customer?.phone2 ?? "",
    // Only kept when it's one of the courier's areas
    governorate: isCourierCity(customer?.governorate, customer?.city) ? customer!.governorate! : "",
    city: isCourierCity(customer?.governorate, customer?.city) ? customer!.city! : "",
    address: customer?.address ?? "",
    notes: "",
  }));
  const [save, setSave] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  // Once placed, the emptied cart must not send the shopper back to it
  // A promo code checked against this cart; changing the cart asks for it again
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const cartKey = ready.map((r) => `${r.line.productId}:${r.line.variantId}:${r.quantity}`).join("|");
  const [promoCart, setPromoCart] = useState(cartKey);
  if (promoCart !== cartKey) {
    setPromoCart(cartKey);
    if (promo) setPromo(null);
  }
  if (placedRef.current) return null;
  if (ready.length === 0 || missingGender) return <Navigate to="/shop/cart" replace />;

  const kind = crawlerFor(ready.every((r) => r.product?.section === "women") ? "women" : undefined);
  const shipping = shippingFeeFor(form.governorate, form.city) ?? (form.governorate ? (config?.shippingFee ?? 0) : null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [key]: e.target.value }));
    setErrors(({ [key]: _, ...rest }) => rest);
  };

  const next = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t("Enter your name");
    if (!isEgyptianMobile(form.phone)) errs.phone = t("Enter an Egyptian mobile number, like 01012345678");
    if (form.phone2.trim() && !isEgyptianPhone(form.phone2))
      errs.phone2 = t("Use an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)");
    if (!form.governorate) errs.governorate = t("Choose your governorate from the list");
    if (!form.city) errs.city = t("Choose your city or area from the list");
    if (!form.address.trim()) errs.address = t("Enter your delivery address");
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`co-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const grandTotal = round2(subtotal - (promo?.discount ?? 0) + (promo?.freeShipping ? 0 : (shipping ?? 0)));


  const place = async () => {
    setPending(true);
    setError(undefined);
    try {
      const res = await action<{ number: string; total: number; shippingFee: number }>("checkout", {
        name: form.name.trim(),
        phone: form.phone,
        phone2: form.phone2 || undefined,
        governorate: form.governorate,
        city: form.city,
        address: form.address,
        notes: form.notes || undefined,
        saveDetails: customer ? save : undefined,
        promoCode: promo?.code,
        lines: ready.map((r) => ({
          productId: r.line.productId,
          variantId: r.line.variantId,
          quantity: r.quantity,
          gender: r.line.gender,
        })),
      });
      // Guests: remember the baby sizes on this device for the age suggestions
      if (!customer) {
        const day = today();
        rememberGuestSizes(
          ready
            .filter((r) => r.product && isKids(r.product.section) && r.option?.name)
            .map((r) => ({ size: r.option!.name!, day })),
        );
      }
      placedRef.current = true;
      const placed: PlacedOrder = { ...res, name: form.name.trim() };
      navigate("/shop/thanks", { replace: true, state: placed });
      cart.clear();
    } catch (err) {
      setError(getErrorMessage(err));
      setPending(false);
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <CheckoutSteps step={step} kind={kind} />
      {step === 1 ? (
        <form onSubmit={next} className="grid gap-5 rounded-3xl border border-border bg-card p-5 sm:p-6" noValidate>
          <div>
            <h1 className="font-display text-2xl font-bold text-shop-deep">{t("Delivery details")}</h1>
            {!customer && (
              <p className="text-sm text-muted-foreground">
                {t("Have an account?")}{" "}
                <Link to="/shop/signin?next=%2Fshop%2Fcheckout" className="font-medium text-primary hover:underline">
                  {t("Sign in")}
                </Link>{" "}
                {t("to fill this in for you.")}
              </p>
            )}
          </div>
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={!!errors.name}>
              <FieldLabel htmlFor="co-name">{t("Your name")}</FieldLabel>
              <Input id="co-name" autoComplete="name" value={form.name} onChange={set("name")} className={SHOP_INPUT} aria-invalid={!!errors.name} />
              {errors.name && <FieldDescription className="text-destructive">{errors.name}</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.phone}>
              <FieldLabel htmlFor="co-phone">{t("Mobile number")}</FieldLabel>
              <Input id="co-phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01012345678" value={form.phone} onChange={set("phone")} className={SHOP_INPUT} aria-invalid={!!errors.phone} />
              {errors.phone && <FieldDescription className="text-destructive">{errors.phone}</FieldDescription>}
            </Field>
            <Field data-invalid={!!errors.phone2}>
              <FieldLabel htmlFor="co-phone2">
                {t("Alternative number or landline")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
              </FieldLabel>
              <Input id="co-phone2" type="tel" inputMode="tel" dir="ltr" value={form.phone2} onChange={set("phone2")} className={SHOP_INPUT} aria-invalid={!!errors.phone2} />
              {errors.phone2 ? (
                <FieldDescription className="text-destructive">{errors.phone2}</FieldDescription>
              ) : (
                <FieldDescription>{t("For the courier, in case the mobile signal is weak where you are")}</FieldDescription>
              )}
            </Field>
            <AreaFields
              idPrefix="co"
              governorate={form.governorate}
              city={form.city}
              errors={{ governorate: errors.governorate, city: errors.city }}
              onChange={(next) => {
                setForm((f) => ({ ...f, ...next }));
                setErrors(({ governorate: _g, city: _c, ...rest }) => rest);
              }}
            />
            <Field className="sm:col-span-2" data-invalid={!!errors.address}>
              <FieldLabel htmlFor="co-address">{t("Delivery address")}</FieldLabel>
              <Textarea
                id="co-address"
                autoComplete="street-address"
                rows={3}
                value={form.address}
                onChange={set("address")}
                placeholder={t("Full address: governorate, city, street, building, floor, flat number, landmark")}
                maxLength={500}
                className="rounded-xl bg-background text-base"
                aria-invalid={!!errors.address}
              />
              {errors.address && <FieldDescription className="text-destructive">{errors.address}</FieldDescription>}
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel htmlFor="co-notes">
                {t("Notes for us")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
              </FieldLabel>
              <Textarea id="co-notes" rows={2} value={form.notes} onChange={set("notes")} className="rounded-xl bg-background text-base" />
            </Field>
          </FieldGroup>
          {customer && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={save} onCheckedChange={(c) => setSave(!!c)} />
              {t("Save these details to my account")}
            </label>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <Button asChild variant="ghost" className="rounded-full">
              <Link to="/shop/cart">{t("Back to cart")}</Link>
            </Button>
            <Button type="submit" size="lg" className={`${SHOP_BUTTON} px-8`}>
              {t("Continue")}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid gap-5 rounded-3xl border border-border bg-card p-5 sm:p-6">
          <h1 className="font-display text-2xl font-bold text-shop-deep">{t("Check and place your order")}</h1>
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <ul className="grid gap-2 text-sm">
            {ready.map((r) => (
              <li key={r.key} className="flex justify-between gap-3">
                <span dir="auto">
                  {r.quantity} × {r.product!.name}
                  {r.option?.name && <span className="text-muted-foreground"> · {r.option.name}</span>}
                  {r.line.gender && (
                    <span className="text-muted-foreground"> · {r.line.gender === "boys" ? t("Boy") : t("Girl")}</span>
                  )}
                </span>
                <span className="tabular-nums">{formatMoney(r.quantity * r.product!.price)}</span>
              </li>
            ))}
          </ul>
          <OrderSums subtotal={subtotal} shipping={shipping} discount={promo?.discount ?? 0} freeShipping={!!promo?.freeShipping} />
          <PromoField
            applied={promo}
            onApply={setPromo}
            request={() => ({
              phone: form.phone,
              governorate: form.governorate,
              city: form.city,
              lines: ready.map((r) => ({ productId: r.line.productId, variantId: r.line.variantId, quantity: r.quantity })),
            })}
          />
          <CheckoutExtra products={products} inCart={new Set(ready.map((r) => r.line.productId))} />
          <div className="flex items-start justify-between gap-3 rounded-2xl bg-secondary p-4 text-sm text-secondary-foreground">
            <div className="grid gap-0.5">
              <span className="font-semibold">{form.name}</span>
              <span dir="ltr" className="text-start">
                {[form.phone, form.phone2].filter(Boolean).join(" · ")}
              </span>
              <span dir="auto">{form.address}</span>
            </div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => setStep(1)}>
              <Pencil />
              {t("Edit")}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("Cash on delivery. We'll message you on WhatsApp to confirm before we ship. Shipping may change slightly by area; we'll tell you when we confirm.")}
          </p>
          {config?.ordersPaused && !config.preview && (
            <Alert role="status">
              <AlertDescription>{t("We've paused new orders for a short while. Please try again soon.")}</AlertDescription>
            </Alert>
          )}
          <Button
            type="button"
            size="lg"
            className={SHOP_BUTTON}
            disabled={pending || (!!config?.ordersPaused && !config.preview)}
            onClick={() => void place()}
          >
            {pending && <Spinner />}
            {t("Place order · {{total}}", { total: formatMoney(grandTotal) })}
          </Button>
        </div>
      )}
    </div>
  );
}
