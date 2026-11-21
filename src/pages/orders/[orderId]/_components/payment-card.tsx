import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import MarkPaidDialog from "@/components/mark-paid-dialog.tsx";
import { PaymentBadge } from "@/components/status-badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { api, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { PAYMENT_METHOD_LABELS } from "@shared/constants.ts";
import type { OrderDetail } from "../_lib/order.ts";

export function PaymentCard({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const { canEdit } = useCurrentUser();
  const canChangeStatus = canEdit("finance");
  const { formatMoney, formatDay } = useFormat();
  const setPayment = useMutation(api.payments.setPayment);
  const accountOptions = useQuery(api.finance.accounts.paymentOptions, order.paidAccountId ? undefined : "skip");
  const receivedIn = order.paidAccountId ? accountOptions?.find((a) => a._id === order.paidAccountId) : undefined;
  const [paidOpen, setPaidOpen] = useState(false);
  const [unpaidOpen, setUnpaidOpen] = useState(false);
  const paid = order.paymentStatus === "paid";
  const cancelled = order.status === "cancelled";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("Payment")}</CardTitle>
        <PaymentBadge paid={paid} />
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <dl className="grid gap-1.5">
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">
              {paid
                ? t("Amount")
                : cancelled
                  ? t("Order total")
                  : t("Amount due")}
            </dt>
            <dd className="font-medium tabular-nums">
              {formatMoney(order.total)}
            </dd>
          </div>
          {paid && (
            <>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("Paid on")}</dt>
                <dd>{formatDay(order.paidAt)}</dd>
              </div>
              {receivedIn && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{t("Received in")}</dt>
                  <dd>{t(receivedIn.name)}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">{t("Method")}</dt>
                <dd>
                  {order.paymentMethod
                    ? t(PAYMENT_METHOD_LABELS[order.paymentMethod])
                    : t("Not specified")}
                </dd>
              </div>
            </>
          )}
        </dl>
        {cancelled && !paid && (
          <p className="text-xs text-muted-foreground">
            {t("Cancelled orders can't be marked as paid.")}
          </p>
        )}
        {canChangeStatus && (
          <div className="flex flex-wrap gap-2 print:hidden">
            {!paid && !cancelled && (
              <Button size="sm" onClick={() => setPaidOpen(true)}>
                <CheckCircle2 />
                {t("Mark as paid")}
              </Button>
            )}
            {paid && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUnpaidOpen(true)}
              >
                <Undo2 />
                {t("Mark unpaid")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      <MarkPaidDialog
        open={paidOpen}
        onOpenChange={setPaidOpen}
        description={t(
          "Record that {{customer}} paid {{amount}} for {{order}}.",
          {
            customer: order.customer,
            amount: formatMoney(order.total),
            order: order.displayOrderNumber,
          },
        )}
        onConfirm={async (paidAt, method, accountId) => {
          await setPayment({
            orderId: order._id,
            status: "paid",
            paidAt,
            method,
            accountId,
          });
          toast.success(t("Marked as paid"));
        }}
      />
      <ConfirmDialog
        open={unpaidOpen}
        onOpenChange={setUnpaidOpen}
        title={t("Mark this order unpaid?")}
        description={t(
          "The payment date and method are cleared, and the order shows as money still owed.",
        )}
        confirmLabel={t("Mark unpaid")}
        onConfirm={() => setPayment({ orderId: order._id, status: "unpaid" })}
        successMessage={t("Marked as unpaid")}
      />
    </Card>
  );
}
