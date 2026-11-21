import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeft, Copy, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { SHOP_SECTIONS, SHOP_SECTION_LABELS } from "@shared/constants.ts";
import type { ShopSection } from "@shared/constants.ts";
import { localTimeOf, zonedTime } from "@shared/dates.ts";
import { PROMO_KINDS, PROMO_KIND_LABELS, normalizeCode, promoParts } from "@shared/promo.ts";
import type { PromoKind } from "@shared/promo.ts";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useAuth } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";

type Raw = Output<typeof api.promos.list>[number];
/** Missing values come back as undefined: make them null, as the rule expects. */
const normalize = (p: Raw) => ({
  ...p,
  maxDiscount: p.maxDiscount ?? null,
  minOrder: p.minOrder ?? null,
  startsAt: p.startsAt ?? null,
  endsAt: p.endsAt ?? null,
  maxUses: p.maxUses ?? null,
  section: p.section ?? null,
  batch: p.batch ?? null,
});
type Promo = ReturnType<typeof normalize>;
type Rule = {
  name: string;
  kind: PromoKind;
  value: number;
  maxDiscount: number | null;
  minOrder: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  maxUses: number | null;
  oncePerCustomer: boolean;
  section: ShopSection | null;
};

const EMPTY_RULE: Rule = {
  name: "",
  kind: "percent",
  value: 10,
  maxDiscount: null,
  minOrder: null,
  startsAt: null,
  endsAt: null,
  active: true,
  maxUses: null,
  oncePerCustomer: true,
  section: null,
};

/** Live, scheduled, ended or switched off, from its dates. */
function statusOf(p: Pick<Promo, "active" | "startsAt" | "endsAt" | "maxUses" | "uses">, now: number) {
  if (!p.active) return { label: "Off", tone: "outline" as const };
  if (p.maxUses !== null && p.uses >= p.maxUses) return { label: "Used up", tone: "secondary" as const };
  if (p.endsAt && now > Date.parse(p.endsAt)) return { label: "Ended", tone: "secondary" as const };
  if (p.startsAt && now < Date.parse(p.startsAt)) return { label: "Scheduled", tone: "outline" as const };
  return { label: "Live", tone: "default" as const };
}

function useDescribe() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  return (r: Pick<Rule, "kind" | "value" | "maxDiscount" | "minOrder" | "section">) =>
    [
      ...promoParts(r).map((p) =>
        t(p.key, {
          ...p.vars,
          ...(p.vars?.max !== undefined ? { max: formatMoney(Number(p.vars.max)) } : {}),
          ...(p.vars?.amount !== undefined ? { amount: formatMoney(Number(p.vars.amount)) } : {}),
        }),
      ),
      ...(r.section ? [t("{{section}} only", { section: t(SHOP_SECTION_LABELS[r.section]) })] : []),
    ].join(" · ");
}

export default function PromoCodesPage() {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  const describe = useDescribe();
  const raw = useQuery(api.promos.list);
  const list = useMemo(() => raw?.map(normalize), [raw]);
  const remove = useMutation(api.promos.remove);
  const setBatchActive = useMutation(api.promos.setBatchActive);
  const [editing, setEditing] = useState<Promo | "new" | null>(null);
  const [generating, setGenerating] = useState(false);
  const now = Date.now();

  const { singles, batches } = useMemo(() => {
    const singles: Promo[] = [];
    const batches = new Map<string, Promo[]>();
    for (const p of list ?? []) {
      if (p.batch) batches.set(p.batch, [...(batches.get(p.batch) ?? []), p]);
      else singles.push(p);
    }
    return { singles, batches: [...batches.entries()] };
  }, [list]);

  if (list === undefined) return <PageSkeleton rows={4} />;

  const when = (p: Promo) =>
    p.startsAt || p.endsAt
      ? [p.startsAt ? t("From {{date}}", { date: formatDateTime(p.startsAt) }) : null, p.endsAt ? t("until {{date}}", { date: formatDateTime(p.endsAt) }) : null]
          .filter(Boolean)
          .join(" ")
      : t("No end date");

  return (
    <PageBody className="max-w-4xl">
      <PageHeader
        title={t("Promo codes")}
        description={t("Codes customers type at checkout. Set what each one gives, when it works, and how often.")}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/website">
                <ArrowLeft />
                {t("Website controls")}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setGenerating(true)}>
              <Sparkles />
              {t("Generate private codes")}
            </Button>
            <Button onClick={() => setEditing("new")}>
              <Plus />
              {t("New code")}
            </Button>
          </div>
        }
      />

      {singles.length === 0 && batches.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t("No promo codes yet. Create one for an occasion (Eid, back to school, the website launch) or generate private codes to send to customers.")}
          </CardContent>
        </Card>
      )}

      {singles.length > 0 && (
        <div className="grid gap-2">
          {singles.map((p) => {
            const st = statusOf(p, now);
            return (
              <Card key={p._id} className="py-3">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-semibold">{p.code}</span>
                      <Badge variant={st.tone}>{t(st.label)}</Badge>
                      <span className="text-sm text-muted-foreground">{p.name}</span>
                    </div>
                    <p className="text-sm">{describe(p)}</p>
                    <p className="text-xs text-muted-foreground">
                      {when(p)} ·{" "}
                      {p.maxUses !== null
                        ? t("{{uses}} of {{max}} used", { uses: p.uses, max: p.maxUses })
                        : t("{{uses}} used", { uses: p.uses })}
                      {p.oncePerCustomer && ` · ${t("once per customer")}`}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={t("Edit")}>
                      <Pencil />
                    </Button>
                    {p.uses === 0 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("Delete")}
                        onClick={() =>
                          void remove({ promoId: p._id })
                            .then(() => toast.success(t("Code deleted")))
                            .catch((e) => toast.error(getErrorMessage(e)))
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {batches.length > 0 && (
        <div className="grid gap-2">
          <h2 className="mt-2 font-semibold">{t("Private codes")}</h2>
          {batches.map(([batch, codes]) => {
            const used = codes.filter((c) => c.uses > 0).length;
            const on = codes.some((c) => c.active);
            return (
              <Card key={batch} className="py-3">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 px-4">
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium">{batch}</span>
                    <p className="text-sm">{describe(codes[0])}</p>
                    <p className="text-xs text-muted-foreground">
                      {when(codes[0])} · {t("{{used}} of {{count}} codes used", { used, count: codes.length })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(codes.filter((c) => c.uses === 0).map((c) => c.code).join("\n"))
                          .then(() => toast.success(t("Unused codes copied")));
                      }}
                    >
                      <Copy />
                      {t("Copy unused")}
                    </Button>
                    <Switch
                      checked={on}
                      onCheckedChange={(v) => void setBatchActive({ batch, active: v }).catch((e) => toast.error(getErrorMessage(e)))}
                      aria-label={t("Codes on")}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editing && <PromoDialog promo={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {generating && <GenerateDialog onClose={() => setGenerating(false)} />}
    </PageBody>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

/** The rule fields shared by one code and a batch of private codes. */
function RuleFields({ rule, set, batch = false }: { rule: Rule; set: (r: Partial<Rule>) => void; batch?: boolean }) {
  const { t } = useTranslation();
  const { settings } = useAuth();
  const tz = settings.timezone;
  const describe = useDescribe();
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="promo-name">{t("What it's for")}</FieldLabel>
        <Input id="promo-name" value={rule.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("e.g. Eid 2026, Back to school, Website launch")} />
      </Field>
      <Field>
        <FieldLabel>{t("The offer")}</FieldLabel>
        <ToggleGroup type="single" variant="outline" value={rule.kind} onValueChange={(v) => v && set({ kind: v as PromoKind })} className="w-fit flex-wrap">
          {PROMO_KINDS.map((k) => (
            <ToggleGroupItem key={k} value={k} className="px-3">
              {t(PROMO_KIND_LABELS[k])}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      {rule.kind !== "free_shipping" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="promo-value">{rule.kind === "percent" ? t("% off") : t("Amount off (EGP)")}</FieldLabel>
            <Input id="promo-value" type="number" inputMode="decimal" min={0} value={rule.value} onChange={(e) => set({ value: Number(e.target.value) })} />
          </Field>
          {rule.kind === "percent" && (
            <Field>
              <FieldLabel htmlFor="promo-max">{t("Up to (EGP)")}</FieldLabel>
              <Input id="promo-max" type="number" inputMode="decimal" min={0} value={rule.maxDiscount ?? ""} onChange={(e) => set({ maxDiscount: numOrNull(e.target.value) })} placeholder={t("No cap")} />
              <FieldDescription>{t("The most it takes off one order")}</FieldDescription>
            </Field>
          )}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="promo-min">{t("Minimum order (EGP)")}</FieldLabel>
          <Input id="promo-min" type="number" inputMode="decimal" min={0} value={rule.minOrder ?? ""} onChange={(e) => set({ minOrder: numOrNull(e.target.value) })} placeholder={t("Any order")} />
          <FieldDescription>{t("Goods only, before shipping")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>{t("Applies to")}</FieldLabel>
          <Select value={rule.section ?? "all"} onValueChange={(v) => set({ section: v === "all" ? null : (v as ShopSection) })}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("The whole order")}</SelectItem>
              {SHOP_SECTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {t("{{section}} only", { section: t(SHOP_SECTION_LABELS[s]) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="promo-start">{t("Starts")}</FieldLabel>
          <Input
            id="promo-start"
            type="datetime-local"
            value={rule.startsAt ? localTimeOf(rule.startsAt, tz) : ""}
            onChange={(e) => set({ startsAt: e.target.value ? zonedTime(e.target.value, tz).toISOString() : null })}
          />
          <FieldDescription>{t("Empty: right away")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="promo-end">{t("Ends")}</FieldLabel>
          <Input
            id="promo-end"
            type="datetime-local"
            value={rule.endsAt ? localTimeOf(rule.endsAt, tz) : ""}
            onChange={(e) => set({ endsAt: e.target.value ? zonedTime(e.target.value, tz).toISOString() : null })}
          />
          <FieldDescription>{t("Empty: until you switch it off")}</FieldDescription>
        </Field>
      </div>
      {!batch && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="promo-uses">{t("Uses in total")}</FieldLabel>
            <Input id="promo-uses" type="number" inputMode="numeric" min={1} value={rule.maxUses ?? ""} onChange={(e) => set({ maxUses: numOrNull(e.target.value) })} placeholder={t("No limit")} />
            <FieldDescription>{t("e.g. 100: the first 100 orders")}</FieldDescription>
          </Field>
          <label className="flex items-center justify-between gap-3 self-start rounded-lg border p-3">
            <span className="text-sm font-medium">{t("Once per customer (by phone number)")}</span>
            <Switch checked={rule.oncePerCustomer} onCheckedChange={(v) => set({ oncePerCustomer: v })} />
          </label>
        </div>
      )}
      <label className="flex items-center justify-between gap-3 rounded-lg border p-3">
        <span className="text-sm font-medium">{t("On")}</span>
        <Switch checked={rule.active} onCheckedChange={(v) => set({ active: v })} />
      </label>
      <p className="rounded-lg bg-muted p-3 text-sm">
        <span className="font-medium">{t("Customers get:")}</span> {describe(rule)}
      </p>
    </div>
  );
}

function PromoDialog({ promo, onClose }: { promo: Promo | null; onClose: () => void }) {
  const { t } = useTranslation();
  const create = useMutation(api.promos.create);
  const update = useMutation(api.promos.update);
  const [code, setCode] = useState(promo?.code ?? "");
  const [rule, setRule] = useState<Rule>(
    promo
      ? {
          name: promo.name,
          kind: promo.kind,
          value: promo.value,
          maxDiscount: promo.maxDiscount,
          minOrder: promo.minOrder,
          startsAt: promo.startsAt,
          endsAt: promo.endsAt,
          active: promo.active,
          maxUses: promo.maxUses,
          oncePerCustomer: promo.oncePerCustomer,
          section: promo.section,
        }
      : EMPTY_RULE,
  );
  const [pending, setPending] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      if (promo) await update({ promoId: promo._id, code, rule });
      else await create({ code, rule });
      toast.success(t("Promo code saved"));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{promo ? t("Edit promo code") : t("New promo code")}</DialogTitle>
            <DialogDescription>{t("Letters and numbers; capitals don't matter for customers.")}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="promo-code">{t("Code")}</FieldLabel>
            <Input
              id="promo-code"
              dir="ltr"
              className="font-mono uppercase"
              value={code}
              onChange={(e) => setCode(normalizeCode(e.target.value))}
              placeholder="EID2026"
              disabled={!!promo && promo.uses > 0}
            />
            {promo && promo.uses > 0 && <FieldDescription>{t("Used on orders, so the code itself stays")}</FieldDescription>}
          </Field>
          <RuleFields rule={rule} set={(r) => setRule((x) => ({ ...x, ...r }))} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Spinner />}
              {t("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GenerateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const generate = useMutation(api.promos.generate);
  const [count, setCount] = useState(20);
  const [prefix, setPrefix] = useState("VIP");
  const [rule, setRule] = useState<Rule>({ ...EMPTY_RULE, name: "", oncePerCustomer: true, maxUses: 1 });
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string[] | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const r = await generate({ count, prefix, rule: { ...rule, maxUses: 1, oncePerCustomer: true } });
      setResult(r.codes);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        {result ? (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("{{n}} codes ready", { n: result.length })}</DialogTitle>
              <DialogDescription>{t("Each works once. Copy them and send one to each customer.")}</DialogDescription>
            </DialogHeader>
            <Textarea readOnly value={result.join("\n")} rows={10} className="font-mono" dir="ltr" />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => void navigator.clipboard?.writeText(result.join("\n")).then(() => toast.success(t("Codes copied")))}
              >
                <Copy />
                {t("Copy all")}
              </Button>
              <Button type="button" onClick={onClose}>
                {t("Done")}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>{t("Generate private codes")}</DialogTitle>
              <DialogDescription>{t("Random codes, one use each, to send to chosen customers.")}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="gen-count">{t("How many")}</FieldLabel>
                <Input id="gen-count" type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="gen-prefix">{t("Start of each code")}</FieldLabel>
                <Input id="gen-prefix" dir="ltr" className="font-mono uppercase" value={prefix} onChange={(e) => setPrefix(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} placeholder="VIP" />
                <FieldDescription>{t("e.g. VIP → VIP-7F3KQ2")}</FieldDescription>
              </Field>
            </div>
            <RuleFields batch rule={rule} set={(r) => setRule((x) => ({ ...x, ...r }))} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />}
                {t("Generate")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
