import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, LogOut, Package } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@shared/constants.ts";
import type { OrderStatus } from "@shared/constants.ts";
import { isEgyptianMobile, isEgyptianPhone } from "@shared/phone.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { updateGuest } from "./_lib/guest.ts";
import { useMyOrders, useShopAction, useShopConfig, useShopMe } from "./_lib/shop-api.ts";
import type { ShopCustomer } from "./_lib/shop-api.ts";
import { BabyAgeCard } from "./_components/baby-age-card.tsx";
import { ShoppingForCard } from "./_components/shopping-for-card.tsx";
import { BIRTHDAYS_ON } from "./_lib/shopping-for.ts";
import { AreaFields } from "./_components/area-fields.tsx";
import { isCourierCity } from "@shared/courier-areas.ts";
import { SHOP_BUTTON, SHOP_INPUT } from "./_components/auth-card.tsx";

/** My account: details and address, baby's age, password and order history. */
export default function ShopAccount() {
  const { t } = useTranslation();
  const me = useShopMe();
  const navigate = useNavigate();
  const action = useShopAction();

  if (me === undefined) return null;
  if (!me.customer) return <Navigate to="/shop/signin?next=%2Fshop%2Faccount" replace />;
  const customer = me.customer;

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-shop-deep">{t("My account")}</h1>
          <p className="text-muted-foreground">{t("Hi {{name}}!", { name: customer.name })}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-full bg-card"
          onClick={() => {
            void action("logout").then(() => {
              // Back to the welcome screen on this device
              updateGuest({ guest: false });
              navigate("/shop/welcome", { replace: true });
            });
          }}
        >
          <LogOut />
          {t("Sign out")}
        </Button>
      </div>
      {BIRTHDAYS_ON ? <BabyAgeCard /> : <ShoppingForCard />}
      <Details key={customer._id} customer={customer} />
      <Orders />
      <PasswordForm />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-3xl border border-border bg-card p-5 sm:p-6">
      <h2 className="font-display text-xl font-semibold text-shop-deep">{title}</h2>
      {children}
    </section>
  );
}

function Details({ customer }: { customer: ShopCustomer }) {
  const { t } = useTranslation();
  const action = useShopAction();
  const config = useShopConfig();
  const [form, setForm] = useState({
    name: customer.name,
    phone: customer.phone,
    phone2: customer.phone2 ?? "",
    email: customer.email ?? "",
    governorate: isCourierCity(customer.governorate, customer.city) ? customer.governorate! : "",
    city: isCourierCity(customer.governorate, customer.city) ? customer.city! : "",
    address: customer.address ?? "",
  });
  const [pending, setPending] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEgyptianMobile(form.phone)) {
      toast.error(t("Enter an Egyptian mobile number, like 01012345678"));
      return;
    }
    if (form.phone2 && !isEgyptianPhone(form.phone2)) {
      toast.error(t("Use an Egyptian mobile (11 digits: 010, 011, 012 or 015) or a landline with its area code (10 digits, like 0238221076)"));
      return;
    }
    setPending(true);
    try {
      const res = await action<{ customer: ShopCustomer }>("profile", {
        ...form,
        phone2: form.phone2 || undefined,
        email: form.email || undefined,
      });
      toast.success(t("Saved"), {
        description:
          res.customer.email && !res.customer.emailVerified && res.customer.email !== customer.email && config?.emailEnabled
            ? t("We sent a link to your email. Open it to confirm your address.")
            : undefined,
      });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const resend = async () => {
    try {
      await action("resend-verification");
      toast.success(t("We sent a link to your email. Open it to confirm your address."));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Section title={t("My details")}>
      <form onSubmit={save} className="grid gap-4" noValidate>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="ac-name">{t("Your name")}</FieldLabel>
            <Input id="ac-name" autoComplete="name" value={form.name} onChange={set("name")} className={SHOP_INPUT} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ac-phone">{t("Mobile number")}</FieldLabel>
            <Input id="ac-phone" type="tel" dir="ltr" value={form.phone} onChange={set("phone")} className={SHOP_INPUT} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ac-phone2">
              {t("Alternative number or landline")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
            </FieldLabel>
            <Input id="ac-phone2" type="tel" dir="ltr" value={form.phone2} onChange={set("phone2")} className={SHOP_INPUT} />
            <FieldDescription>{t("For the courier, in case the mobile signal is weak where you are")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="ac-email" className="flex flex-wrap items-center gap-2">
              {t("Email")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
              {customer.email &&
                (customer.emailVerified ? (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="size-3" />
                    {t("Confirmed")}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("Not confirmed")}</Badge>
                ))}
            </FieldLabel>
            <Input id="ac-email" type="email" dir="ltr" value={form.email} onChange={set("email")} className={SHOP_INPUT} />
            {customer.email && !customer.emailVerified && config?.emailEnabled && (
              <FieldDescription>
                <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => void resend()}>
                  {t("Send the confirmation link again")}
                </button>
              </FieldDescription>
            )}
          </Field>
          <AreaFields
            idPrefix="ac"
            governorate={form.governorate}
            city={form.city}
            onChange={(next) => setForm((f) => ({ ...f, ...next }))}
          />
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="ac-address">{t("Delivery address")}</FieldLabel>
            <Textarea
              id="ac-address"
              autoComplete="street-address"
              rows={3}
              value={form.address}
              onChange={set("address")}
              className="rounded-xl bg-background text-base"
              placeholder={t("Full address: governorate, city, street, building, floor, flat number, landmark")}
                maxLength={500}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" size="lg" className={`${SHOP_BUTTON} sm:w-fit sm:px-8`} disabled={pending}>
          {pending && <Spinner />}
          {t("Save details")}
        </Button>
      </form>
    </Section>
  );
}

function Orders() {
  const { t } = useTranslation();
  const { formatMoney, formatDay } = useFormat();
  const orders = useMyOrders(true);
  return (
    <Section title={t("My orders")}>
      {orders === undefined ? (
        <Spinner className="text-primary" />
      ) : orders.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Package className="size-5 shrink-0" />
          {t("No orders yet. Orders you place while signed in show up here.")}
        </div>
      ) : (
        <ul className="grid gap-3">
          {orders.map((o) => (
            <li key={o._id} className="grid gap-2 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {o.number} · <span className="font-normal text-muted-foreground">{formatDay(o.date)}</span>
                </span>
                <Badge variant="secondary">{t(ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status)}</Badge>
              </div>
              <ul className="grid gap-1 text-sm">
                {o.items.map((item, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span dir="auto">
                      {item.quantity} × {item.name}
                      {item.size && <span className="text-muted-foreground"> · {item.size}</span>}
                    </span>
                    <span className="tabular-nums">{formatMoney(item.quantity * item.price)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>{t("Total with shipping")}</span>
                <span className="tabular-nums">{formatMoney(o.total + o.shippingFee)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function PasswordForm() {
  const { t } = useTranslation();
  const action = useShopAction();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pending, setPending] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return toast.error(t("Password must be at least 8 characters"));
    setPending(true);
    try {
      await action("password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      toast.success(t("Password changed"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Section title={t("Change password")}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2" noValidate>
        <Field>
          <FieldLabel htmlFor="pw-current">{t("Current password")}</FieldLabel>
          <Input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={SHOP_INPUT}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="pw-new">{t("New password")}</FieldLabel>
          <Input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={SHOP_INPUT}
          />
        </Field>
        <Button type="submit" variant="outline" className="rounded-full sm:w-fit" disabled={pending || !current || !next}>
          {pending && <Spinner />}
          {t("Change password")}
        </Button>
      </form>
    </Section>
  );
}
