import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useAuth } from "@/lib/auth.tsx";
import type { BusinessSettings } from "@/lib/auth.tsx";
import { localeFor, makeFormatters } from "@/lib/format.ts";
import i18n from "@/lib/i18n.ts";
import { TimezonePicker } from "./timezone-picker.tsx";
import { CurrencyPicker } from "./currency-picker.tsx";
import { supportedCurrencies } from "@/lib/currencies.ts";

type Errors = Partial<Record<keyof BusinessSettings | "form", string>>;

const COMMON_LOCALES = [
  "en-US",
  "en-GB",
  "en-EG",
  "ar-EG",
  "fr-FR",
  "de-DE",
  "es-ES",
  "en-AE",
  "ar-SA",
  "en-IN",
];

function validate(draft: BusinessSettings, currencies: string[]): Errors {
  const errors: Errors = {};
  if (!draft.businessName.trim())
    errors.businessName = i18n.t("Enter your business name");
  const currency = draft.currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency))
    errors.currency = i18n.t("Use a 3-letter ISO code, like USD or EGP");
  else if (!currencies.includes(currency))
    errors.currency = i18n.t("“{{currency}}” isn't a known currency code", {
      currency,
    });
  try {
    if (
      !draft.locale.trim() ||
      Intl.NumberFormat.supportedLocalesOf([draft.locale.trim()]).length === 0
    ) {
      errors.locale = i18n.t("This browser doesn't know that locale");
    }
  } catch {
    errors.locale = i18n.t("Use a locale tag like en-US or ar-EG");
  }
  if (!draft.timezone.trim()) errors.timezone = i18n.t("Choose a timezone");
  else {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: draft.timezone.trim() });
    } catch {
      errors.timezone = i18n.t("That isn't a known timezone");
    }
  }
  return errors;
}

/** Business name, currency, locale and timezone, with a live preview of how values will look. */
export function BusinessForm({ initial }: { initial: BusinessSettings }) {
  const {
    t,
    i18n: { language },
  } = useTranslation();
  const { refresh } = useAuth();
  const update = useMutation(api.settings.update);
  const currencies = useMemo(supportedCurrencies, []);
  const [draft, setDraft] = useState<BusinessSettings>(initial);
  const [saved, setSaved] = useState<BusinessSettings>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  const set = <K extends keyof BusinessSettings>(
    key: K,
    value: BusinessSettings[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };

  const dirty = (Object.keys(draft) as (keyof BusinessSettings)[]).some(
    (k) => draft[k].trim() !== saved[k],
  );
  const currencyChanged =
    draft.currency.trim().toUpperCase() !== saved.currency;

  const preview = useMemo(() => {
    try {
      const f = makeFormatters({
        currency: draft.currency.trim().toUpperCase(),
        locale: localeFor(language, draft.locale.trim()),
        timezone: draft.timezone.trim(),
      });
      return {
        money: f.formatMoney(1234.5),
        negative: f.formatMoney(-42),
        day: f.formatDay(f.today()),
        now: f.formatDateTime(Date.now()),
      };
    } catch {
      return null;
    }
  }, [draft.currency, draft.locale, draft.timezone, language]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate(draft, currencies);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const next = {
      businessName: draft.businessName.trim(),
      currency: draft.currency.trim().toUpperCase(),
      locale: draft.locale.trim(),
      timezone: draft.timezone.trim(),
    };
    setPending(true);
    try {
      await update(next);
      await refresh();
      setDraft(next);
      setSaved(next);
      toast.success(t("Settings saved"));
    } catch (err) {
      setErrors({ form: getErrorMessage(err) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <form onSubmit={submit} noValidate>
        <CardHeader>
          <CardTitle>{t("Business")}</CardTitle>
          <CardDescription>
            {t("Used on every screen, export and printed order.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-6 grid gap-6 lg:grid-cols-[1fr_16rem]">
          <FieldGroup className="gap-5">
            <Field data-invalid={!!errors.businessName || undefined}>
              <FieldLabel htmlFor="settings-name">
                {t("Business name")}
              </FieldLabel>
              <Input
                id="settings-name"
                value={draft.businessName}
                onChange={(e) => set("businessName", e.target.value)}
                maxLength={100}
                disabled={pending}
                aria-invalid={!!errors.businessName || undefined}
              />
              {errors.businessName ? (
                <FieldError>{errors.businessName}</FieldError>
              ) : (
                <FieldDescription>
                  {t(
                    "Shown in the sidebar, sign-in page and backup file names.",
                  )}
                </FieldDescription>
              )}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={!!errors.currency || undefined}>
                <FieldLabel htmlFor="settings-currency">
                  {t("Currency")}
                </FieldLabel>
                <CurrencyPicker
                  id="settings-currency"
                  value={draft.currency}
                  onChange={(code) => set("currency", code)}
                  disabled={pending}
                  invalid={!!errors.currency}
                />
                {errors.currency ? (
                  <FieldError>{errors.currency}</FieldError>
                ) : (
                  <FieldDescription>
                    {t(
                      "Egyptian pound (EGP) and the region's common currencies are listed first.",
                    )}
                  </FieldDescription>
                )}
              </Field>
              <Field data-invalid={!!errors.locale || undefined}>
                <FieldLabel htmlFor="settings-locale">
                  {t("Number and date format")}
                </FieldLabel>
                <Input
                  id="settings-locale"
                  value={draft.locale}
                  onChange={(e) => set("locale", e.target.value)}
                  list="settings-locale-list"
                  autoComplete="off"
                  spellCheck={false}
                  disabled={pending}
                  aria-invalid={!!errors.locale || undefined}
                />
                <datalist id="settings-locale-list">
                  {COMMON_LOCALES.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
                {errors.locale ? (
                  <FieldError>{errors.locale}</FieldError>
                ) : (
                  <FieldDescription>
                    {t("A locale tag, like en-US or ar-EG.")}
                  </FieldDescription>
                )}
              </Field>
            </div>
            <Field data-invalid={!!errors.timezone || undefined}>
              <FieldLabel htmlFor="settings-timezone">
                {t("Timezone")}
              </FieldLabel>
              <TimezonePicker
                id="settings-timezone"
                value={draft.timezone}
                onChange={(z) => set("timezone", z)}
                disabled={pending}
                invalid={!!errors.timezone}
              />
              {errors.timezone ? (
                <FieldError>{errors.timezone}</FieldError>
              ) : (
                <FieldDescription>
                  {t(
                    "Decides when a business day starts and ends, for “today”, reports and order dates.",
                  )}
                </FieldDescription>
              )}
            </Field>
            {currencyChanged && !errors.currency && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
                {t(
                  "Changing the currency only changes how amounts are shown. Existing prices, costs and totals aren't converted.",
                )}
              </p>
            )}
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
          </FieldGroup>

          <aside
            aria-label={t("Preview")}
            className="h-fit space-y-3 rounded-lg border bg-muted/30 p-4 text-sm"
          >
            <p className="font-medium">{t("Preview")}</p>
            {preview ? (
              <dl className="space-y-2">
                <PreviewRow label={t("Amount")} value={preview.money} />
                <PreviewRow label={t("Refund")} value={preview.negative} />
                <PreviewRow label={t("Today")} value={preview.day} />
                <PreviewRow label={t("Now")} value={preview.now} />
              </dl>
            ) : (
              <p className="text-muted-foreground">
                {t("Fix the fields to see a preview.")}
              </p>
            )}
          </aside>
        </CardContent>
        <CardFooter className="mt-6 justify-end gap-2 border-t pt-6">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setDraft(saved);
              setErrors({});
            }}
          >
            {t("Discard changes")}
          </Button>
          <Button type="submit" disabled={!dirty || pending}>
            {pending && <Spinner />}
            {t("Save settings")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium tabular-nums">{value}</dd>
    </div>
  );
}
