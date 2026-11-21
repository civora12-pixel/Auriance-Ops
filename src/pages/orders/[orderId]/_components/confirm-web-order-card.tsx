import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Globe, MessageCircle } from "lucide-react";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Field, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { parseNumber } from "@/lib/forms.ts";
import { customerWhatsAppMessage, whatsAppChatUrl } from "@/lib/whatsapp.ts";
import type { OrderDetail } from "../_lib/order.ts";

/**
 * A website order waiting for confirmation: message the customer on WhatsApp,
 * then add the shipment number (and change the shipping fee if needed) to
 * send it to packing.
 */
export function ConfirmWebOrderCard({ order, canEdit }: { order: OrderDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const confirm = useMutation(api.orders.confirmWebOrder);
  const [shipment, setShipment] = useState("");
  const [fee, setFee] = useState(String(order.shippingFee));
  const [pending, setPending] = useState(false);

  const message = customerWhatsAppMessage({ ...order, orderNumber: order.displayOrderNumber, confirming: true });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const shippingFee = parseNumber(fee);
    if (!shipment.trim()) return toast.error(t("Enter the shipment number"));
    if (shippingFee === undefined || shippingFee < 0) return toast.error(t("Enter a valid shipping fee"));
    setPending(true);
    try {
      await confirm({ orderId: order._id, shipmentNumber: shipment.trim(), shippingFee });
      toast.success(t("Order confirmed. It's in the packing queue now."));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="border-amber-500/50 bg-amber-500/5 print:hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="size-5 text-amber-600" />
          {t("Website order: needs confirmation")}
        </CardTitle>
        <CardDescription>
          {t("Message the customer to confirm, then add the shipment number. It can't be packed or shipped before that.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {order.customerPhone && (
          <Button asChild variant="outline" className="w-full bg-card">
            <a href={whatsAppChatUrl(order.customerPhone, message)} target="_blank" rel="noreferrer">
              <MessageCircle className="text-emerald-600" />
              {t("Message customer on WhatsApp")}
            </a>
          </Button>
        )}
        {canEdit && (
          <form onSubmit={submit} className="grid gap-3" noValidate>
            <Field>
              <FieldLabel htmlFor="web-shipment">{t("Shipment number")}</FieldLabel>
              <Input id="web-shipment" value={shipment} onChange={(e) => setShipment(e.target.value)} dir="ltr" />
            </Field>
            <Field>
              <FieldLabel htmlFor="web-fee">{t("Shipping fee")}</FieldLabel>
              <MoneyInput id="web-fee" value={fee} onChange={setFee} />
            </Field>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner /> : <CheckCircle2 />}
              {t("Confirm order")}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
