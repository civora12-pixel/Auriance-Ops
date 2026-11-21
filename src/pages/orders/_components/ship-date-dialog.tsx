import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";

/** Sets, moves or removes the day the customer wants a New / On hold order shipped. */
export function ShipDateDialog({
  orderId,
  orderNumber,
  current,
  open,
  onOpenChange,
}: {
  orderId: string;
  orderNumber: string;
  current?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const format = useFormat();
  const tomorrow = format.addDays(format.today(), 1);
  const setShipOn = useMutation(api.orders.setShipOn);
  const [day, setDay] = useState(current && current >= tomorrow ? current : "");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const save = async (shipOn: string | null) => {
    setPending(true);
    try {
      await setShipOn({ orderId, shipOn });
      toast.success(shipOn ? t("Ship date set to {{day}}", { day: format.formatDay(shipOn) }) : t("No longer delayed"));
      onOpenChange(false);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!day) return setError(t("Choose the day to ship"));
    if (day < tomorrow) return setError(t("The ship date must be after today"));
    void save(day);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-sm">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{current ? t("Change ship date") : t("Delay shipping")}</DialogTitle>
            <DialogDescription>
              {t("{{order}} stays in the packing queue with a big Delayed label and this date.", { order: orderNumber })}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={!!error}>
            <FieldLabel htmlFor="ship-on-day">{t("Ship on")}</FieldLabel>
            <Input
              id="ship-on-day"
              type="date"
              min={tomorrow}
              value={day}
              onChange={(e) => {
                setDay(e.target.value);
                setError(undefined);
              }}
              aria-invalid={!!error}
              disabled={pending}
              autoFocus
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              current && <FieldDescription>{t("Now: {{day}}", { day: format.formatDay(current) })}</FieldDescription>
            )}
          </Field>
          <DialogFooter className="sm:justify-between">
            {current ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void save(null)} disabled={pending}>
                {t("Not delayed anymore")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                {t("Cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Spinner />}
                {t("Save date")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
