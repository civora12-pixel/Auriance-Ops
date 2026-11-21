import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { MoneyInput } from "@/components/number-input.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { useDebounce } from "@/hooks/use-debounce.ts";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Input as ApiInput, Output } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { moneyOrNull } from "../_lib.ts";
import ReopenButton from "../_components/reopen-button.tsx";
import { AllocationTable, Line } from "../_components/summary.tsx";

type Draft = ApiInput<typeof api.finance.closing.saveOpening>;
type Texts = Record<string, string>;

const toTexts = (r: Record<string, number | null | undefined>): Texts =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v == null ? "" : String(v)]));
const toNumbers = (t: Texts) =>
  Object.fromEntries(Object.entries(t).map(([k, v]) => [k, moneyOrNull(v)]));

/** Opening balances: one-time starting point of the books. */
export default function OpeningPage() {
  const data = useQuery(api.finance.closing.opening);
  if (data === undefined) return <PageSkeleton />;
  return <OpeningForm key={data.status} data={data} />;
}

function OpeningForm({ data }: { data: Output<typeof api.finance.closing.opening> }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { formatMoney, formatDay } = useFormat();
  const { isAdmin, canEdit } = useCurrentUser();
  const locked = data.status === "locked";
  const save = useMutation(api.finance.closing.saveOpening);
  const post = useMutation(api.finance.closing.postOpening);

  const [asOf, setAsOf] = useState(data.draft.asOf);
  const [balances, setBalances] = useState<Texts>(toTexts(data.draft.balances));
  const [capitals, setCapitals] = useState<Texts>(toTexts(data.draft.capitals));
  const [extra, setExtra] = useState(String(data.draft.extraReceivable || ""));
  const [mode, setMode] = useState<"split" | "normal">(data.draft.resultMode);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);

  const draft: Draft = {
    asOf,
    balances: toNumbers(balances),
    capitals: toNumbers(capitals),
    extraReceivable: moneyOrNull(extra) ?? 0,
    resultMode: mode,
  };
  const [debounced] = useDebounce(JSON.stringify(draft), 300);
  const live = useQuery(
    api.finance.closing.previewOpening,
    locked ? "skip" : (JSON.parse(debounced) as Draft),
    { keepPrevious: true },
  );
  const p = locked ? data.preview : (live ?? data.preview);

  // Keep typed figures safe: save the draft a moment after each change
  const initial = useRef(JSON.stringify(draft));
  const [autosave] = useDebounce(JSON.stringify(draft), 1500);
  useEffect(() => {
    if (locked || !canEdit("finance") || autosave === initial.current) return;
    initial.current = autosave;
    void save(JSON.parse(autosave) as Draft).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave]);

  const assets = p.rows.filter((r) => r.account.type === "asset");
  const liabilities = p.rows.filter((r) => r.account.type === "liability");
  const editable = !locked && canEdit("finance");

  const row = (r: (typeof p.rows)[number]) => (
    <div key={r.account._id} className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-3 py-1.5">
      <Label htmlFor={`ob-${r.account.code}`} className="font-normal">
        <span className="font-mono text-xs text-muted-foreground">{r.account.code}</span> {r.account.name}
        {r.fromApp && (
          <Badge variant="secondary" className="ms-2">
            {t("from the app")}
          </Badge>
        )}
        {r.account.code === 16002 && !r.fromApp && (
          <span className="block text-xs text-muted-foreground">{t("Enter as a negative amount")}</span>
        )}
      </Label>
      {r.fromApp || !editable ? (
        <span className="text-end tabular-nums">{formatMoney(r.balance)}</span>
      ) : (
        <MoneyInput
          id={`ob-${r.account.code}`}
          value={balances[r.account.code] ?? ""}
          onChange={(v) => setBalances((b) => ({ ...b, [r.account.code]: v }))}
          aria-invalid={p.missing.includes(r.account.code) || undefined}
        />
      )}
    </div>
  );

  return (
    <PageBody>
      <PageHeader
        breadcrumbs={[{ label: t("Monthly closing"), to: "/finance/closing" }, { label: t("Opening balances") }]}
        title={t("Opening balances")}
        description={t(
          "Where the books start. Stock, returns on their way and courier money come from the app; type the rest from your statements.",
        )}
        actions={
          locked ? (
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                <Lock className="size-3" />
                {t("Posted")}
              </Badge>
              {isAdmin && <ReopenButton period="opening" />}
            </div>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Date")}</CardTitle>
              <CardDescription>{t("The books start the day after.")}</CardDescription>
            </CardHeader>
            <CardContent>
              {editable ? (
                <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-48" />
              ) : (
                <p>{formatDay(asOf)}</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Assets")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {assets.map(row)}
              <div className="grid grid-cols-[minmax(0,1fr)_11rem] items-center gap-3 py-1.5">
                <Label htmlFor="ob-extra" className="font-normal">
                  {t("Courier money for orders shipped before the app")}
                  <span className="block text-xs text-muted-foreground">
                    {t("Added to Accounts Receivable")}
                  </span>
                </Label>
                {editable ? (
                  <MoneyInput id="ob-extra" value={extra} onChange={setExtra} />
                ) : (
                  <span className="text-end tabular-nums">{formatMoney(draft.extraReceivable)}</span>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Liabilities")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">{liabilities.map(row)}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{t("Partners' contributed capital")}</CardTitle>
            </CardHeader>
            <CardContent className="divide-y">
              {p.shares.map((s) => (
                <div key={s.code} className="grid grid-cols-[minmax(0,1fr)_6rem_11rem] items-center gap-3 py-1.5">
                  <Label htmlFor={`ob-${s.code}`} className="font-normal">
                    {s.name}
                  </Label>
                  <span className="text-end text-sm tabular-nums text-muted-foreground">
                    {s.sharePct.toFixed(2)}%
                  </span>
                  {editable ? (
                    <MoneyInput
                      id={`ob-${s.code}`}
                      value={capitals[s.code] ?? ""}
                      onChange={(v) => setCapitals((c) => ({ ...c, [s.code]: v }))}
                    />
                  ) : (
                    <span className="text-end tabular-nums">{formatMoney(s.capital)}</span>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 lg:sticky lg:top-6">
          <Card>
            <CardHeader>
              <CardTitle>{t("Check")}</CardTitle>
              <CardDescription>
                {t("Assets minus liabilities should equal the partners' capital. Any difference is the result of the months that weren't tracked.")}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <Line label={t("Assets")} value={formatMoney(p.assets)} />
              <Line label={t("− Liabilities")} value={formatMoney(p.liabilities)} />
              <Line label={t("− Partners' capital")} value={formatMoney(p.capital)} />
              <Line
                label={p.difference >= 0 ? t("= Profit not yet shared") : t("= Loss not yet shared")}
                value={formatMoney(p.difference)}
                strong
                tone={p.difference >= 0 ? "good" : "bad"}
              />
              {editable && (
                <div className="mt-2 grid gap-2 rounded-md bg-muted/50 p-3">
                  <p className="font-medium">{t("How should it be shared?")}</p>
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={mode === "split"} onChange={() => setMode("split")} className="mt-1" />
                    <span>{t("All of it between the partners, by capital")}</span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input type="radio" checked={mode === "normal"} onChange={() => setMode("normal")} className="mt-1" />
                    <span>{t("Like a normal month: 3% charity and compensation first, if it's a profit")}</span>
                  </label>
                </div>
              )}
              <AllocationTable allocation={p.allocation} />
            </CardContent>
          </Card>
          {editable && (
            <div className="grid gap-2">
              {p.missing.length > 0 && (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  {t("Still to fill in: {{codes}}", { codes: p.missing.join(", ") })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await save(draft);
                      toast.success(t("Draft saved"));
                    } catch (err) {
                      toast.error(getErrorMessage(err));
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving && <Spinner />}
                  {t("Save draft")}
                </Button>
                {isAdmin && (
                  <Button disabled={p.missing.length > 0} onClick={() => setConfirm(true)}>
                    <Lock />
                    {t("Post opening balances")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={t("Post the opening balances?")}
        description={t(
          "The books start on the day after {{date}}, and every partner's capital is set. You can reopen it later in Admin Mode while no month is closed.",
          { date: formatDay(asOf) },
        )}
        confirmLabel={t("Post opening balances")}
        onConfirm={async () => {
          await post(draft);
          navigate("/finance/closing");
        }}
        successMessage={t("Opening balances posted")}
      />
    </PageBody>
  );
}

