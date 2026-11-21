import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AtSign, BadgePercent, ExternalLink, Gift, MessageCircle, Search, Sun, X } from "lucide-react";
import { SEASONS, SEASON_LABELS, MAX_CHECKOUT_EXTRAS } from "@shared/shop-site.ts";
import type { Season, SiteSettings } from "@shared/shop-site.ts";
import { matchesSearch } from "@shared/search.ts";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { ShopCard } from "../settings/_components/shop-card.tsx";

/**
 * Website controls: switches that change what visitors of the customer shop
 * can do and see, without touching the code.
 */
export default function WebsiteControls() {
  const { t } = useTranslation();
  const site = useQuery(api.shop.site, undefined, { refetchInterval: false });
  if (site === undefined) return <PageSkeleton rows={4} />;
  return (
    <PageBody className="max-w-3xl">
      <PageHeader
        title={t("Website controls")}
        description={t("Switches for the customer website. Changes reach visitors within a minute.")}
        actions={
          <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/website/promos">
              <BadgePercent />
              {t("Promo codes")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/shop" target="_blank">
              <ExternalLink />
              {t("Open the shop")}
            </Link>
          </Button>
          </div>
        }
      />
      <SiteForm initial={site} />
      <ShopCard />
    </PageBody>
  );
}

function Toggle({ title, hint, checked, onChange, warn }: { title: string; hint: string; checked: boolean; onChange: (v: boolean) => void; warn?: boolean }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-lg p-3 ${checked && warn ? "bg-amber-50 dark:bg-amber-950/40" : ""}`}>
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <h3 className="flex items-center gap-2 font-semibold [&_svg]:size-4">
        {icon}
        {title}
      </h3>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {children}
    </div>
  );
}

function SiteForm({ initial }: { initial: SiteSettings }) {
  const { t } = useTranslation();
  const save = useMutation(api.shop.updateSite);
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  useEffect(() => setForm(initial), [initial]);
  const set = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const changed = JSON.stringify(form) !== JSON.stringify(initial);

  const submit = async () => {
    setPending(true);
    try {
      const saved = await save(form);
      setForm(saved);
      toast.success(t("Website controls saved"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Visitors")}</CardTitle>
        <CardDescription>{t("Your team, signed in, can always use the shop, so you can check changes before switching back.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid gap-1">
          <Toggle
            warn
            title={t("Maintenance mode")}
            hint={t("Closes the website with a 'back shortly' page, for example during a big update.")}
            checked={form.maintenance}
            onChange={(v) => set("maintenance", v)}
          />
          <Toggle
            warn
            title={t("Pause orders")}
            hint={t("Visitors can browse, but can't place orders, for example during a stock count or a holiday.")}
            checked={form.ordersPaused}
            onChange={(v) => set("ordersPaused", v)}
          />
          <Toggle
            warn
            title={t("Pause new accounts")}
            hint={t("Nobody can create an account; guests can still order.")}
            checked={form.signupsPaused}
            onChange={(v) => set("signupsPaused", v)}
          />
          <Toggle
            title={t("Hide sold-out products")}
            hint={t("Off: sold-out products stay on the website marked 'Sold out'.")}
            checked={form.hideSoldOut}
            onChange={(v) => set("hideSoldOut", v)}
          />
        </div>

        <Field>
          <FieldLabel htmlFor="site-announcement">{t("Announcement bar")}</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="site-announcement"
              dir="auto"
              maxLength={200}
              value={form.announcement}
              onChange={(e) => set("announcement", e.target.value)}
              placeholder={t("e.g. Delivery takes 3–5 days during Eid")}
            />
            {form.announcement && (
              <Button type="button" variant="ghost" size="icon" onClick={() => set("announcement", "")} aria-label={t("Clear")}>
                <X />
              </Button>
            )}
          </div>
          <FieldDescription>{t("A line at the top of every page. Leave empty for none.")}</FieldDescription>
        </Field>

        <Section
          icon={<Sun />}
          title={t("Season")}
          description={t(
            "Switch it when the weather turns, not on a date. Off-season products move to the end of the website and aren't suggested. Tag products in Products → Shop sections, seasons and who it’s for.",
          )}
        >
          <ToggleGroup type="single" variant="outline" value={form.season} onValueChange={(v) => v && set("season", v as Season)} className="w-fit">
            {SEASONS.map((s) => (
              <ToggleGroupItem key={s} value={s} className="px-4">
                {s === "all" ? t("No season") : t(SEASON_LABELS[s])}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Section>

        <Section icon={<MessageCircle />} title={t("Help button (Messenger)")}>
          <Input
            id="site-messenger"
            dir="ltr"
            value={form.messenger}
            onChange={(e) => set("messenger", e.target.value)}
            placeholder="m.me/auriance"
            aria-label={t("Facebook page name or link")}
          />
          <p className="text-sm text-muted-foreground">
            {t("Paste your Facebook page's link or name. A 'Need help?' button then opens a Messenger chat with the page on every website page. Leave empty for no button.")}
          </p>
        </Section>

        <Section
          icon={<AtSign />}
          title={t("Where to find us")}
          description={t("Shown on the Contact us page and in the footer of every page. Leave a field empty to hide it.")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["facebook", t("Facebook username"), "yourpage"],
                ["instagram", t("Instagram username"), "yourpage"],
                ["tiktok", t("TikTok username"), "yourpage"],
                ["phone", t("Phone"), "010xxxxxxxx"],
                ["email", t("Email"), "name@gmail.com"],
              ] as const
            ).map(([key, label, example]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`site-${key}`}>{label}</FieldLabel>
                <Input id={`site-${key}`} dir="ltr" value={form[key]} onChange={(e) => set(key, e.target.value)} placeholder={example} />
              </Field>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">{t("WhatsApp uses the number in Shop settings below.")}</p>
        </Section>

        <Section
          icon={<Gift />}
          title={t("Checkout extra")}
          description={t(
            "One small, useful item offered just before Place order. Choose up to 3 in order of preference; the first in stock and in season is shown. None chosen: the cheapest kids accessory.",
          )}
        >
          <ExtrasPicker value={form.checkoutExtras} onChange={(v) => set("checkoutExtras", v)} />
        </Section>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={() => void submit()} disabled={pending || !changed}>
          {pending && <Spinner />}
          {t("Save")}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ExtrasPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const products = useQuery(api.products.list, { activeFilter: "active" });
  const [search, setSearch] = useState("");
  const onSite = useMemo(() => (products ?? []).filter((p) => p.shopSection), [products]);
  const byId = new Map(onSite.map((p) => [p._id, p]));
  const found = search.trim()
    ? onSite.filter((p) => !value.includes(p._id) && matchesSearch(`${p.name} ${p.sku}`, search)).slice(0, 6)
    : [];
  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ol className="grid gap-1">
          {value.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span dir="auto">
                <span className="me-2 text-muted-foreground tabular-nums">{i + 1}.</span>
                {byId.get(id)?.name ?? t("Product not found")}
              </span>
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => onChange(value.filter((x) => x !== id))} aria-label={t("Remove")}>
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      {value.length < MAX_CHECKOUT_EXTRAS && (
        <div className="relative">
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Search website products to add")} className="ps-8" />
          {found.length > 0 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 rounded-lg border bg-popover p-1 shadow-md">
              {found.map((p) => (
                <li key={p._id}>
                  <button
                    type="button"
                    className="w-full rounded-md px-2 py-1.5 text-start text-sm hover:bg-accent"
                    onClick={() => {
                      onChange([...value, p._id]);
                      setSearch("");
                    }}
                  >
                    <span dir="auto">{p.name}</span>
                    <span className="ms-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
