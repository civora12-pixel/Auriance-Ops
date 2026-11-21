import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ExternalLink, Store } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { SHIPPING_AREA_FEES, SHIPPING_ZONES } from "@shared/shipping-zones.ts";

/** Opening the customer shop to the public, and the WhatsApp number customers message. */
export function ShopCard() {
  const { t } = useTranslation();
  const { formatMoney } = useFormat();
  const settings = useQuery(api.shop.settings, undefined, { refetchInterval: false });
  const save = useMutation(api.shop.updateSettings);
  const [open, setOpen] = useState(false);
  const [whatsapp, setWhatsapp] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!settings) return;
    setOpen(settings.open);
    setWhatsapp(settings.whatsapp ?? "");
  }, [settings]);

  const submit = async () => {
    setPending(true);
    try {
      await save({ open, whatsapp });
      toast.success(t("Shop settings saved"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Store className="size-5" />
          {t("Customer shop")}
        </CardTitle>
        <CardDescription>
          {t("While the shop is closed only your team can open it (signed in). Open it when you're ready to launch.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block font-medium">{t("Open the shop to the public")}</span>
            <span className="block text-sm text-muted-foreground">
              {t("Anyone with the link can browse, sign up and shop.")}
            </span>
          </span>
          <Switch checked={open} onCheckedChange={setOpen} disabled={!settings} />
        </label>
        <Field>
          <FieldLabel htmlFor="shop-whatsapp">{t("Business WhatsApp number")}</FieldLabel>
          <Input
            id="shop-whatsapp"
            type="tel"
            dir="ltr"
            placeholder="01012345678"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            className="max-w-xs"
          />
          <FieldDescription>
            {t("Customers message this number, for example when they forget their password.")}
          </FieldDescription>
        </Field>
        <div className="grid gap-2">
          <span className="font-medium">{t("Website shipping fee by governorate")}</span>
          <ul className="grid gap-1 rounded-lg border p-3 text-sm">
            {SHIPPING_ZONES.map((z) => (
              <li key={z.fee} className="flex justify-between gap-4">
                <span dir="rtl" className="text-muted-foreground">
                  {z.governorates.join("، ")}
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatMoney(z.fee)}</span>
              </li>
            ))}
            {SHIPPING_AREA_FEES.map(([g, area, fee]) => (
              <li key={area} className="flex justify-between gap-4">
                <span dir="rtl" className="text-muted-foreground">
                  {area} ({g})
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatMoney(fee)}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            {t("Added to website orders from the governorate the customer picks. You can change it per order when you confirm it with the customer.")}
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap justify-between gap-2">
        <Button asChild variant="ghost">
          <Link to="/shop" target="_blank">
            <ExternalLink />
            {t("Open the shop")}
          </Link>
        </Button>
        <Button onClick={() => void submit()} disabled={pending || !settings}>
          {pending && <Spinner />}
          {t("Save")}
        </Button>
      </CardFooter>
    </Card>
  );
}
