import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { MoneyInput } from "@/components/number-input.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { parseNumber } from "@/lib/forms.ts";

export type CostTarget = {
  _id: string;
  movementId: string;
  productName: string;
  variantName: string | null;
  quantityChange: number;
  unitCost: number | null;
};

/** Fixes the unit cost of a restock or opening stock entered wrongly. */
export default function CorrectCostDialog({
  movement,
  onOpenChange,
}: {
  movement: CostTarget | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={!!movement} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {movement && (
          <CorrectCostForm
            movement={movement}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function CorrectCostForm({
  movement,
  onDone,
}: {
  movement: CostTarget;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { formatMoney, formatNumber } = useFormat();
  const correct = useMutation(api.inventory.correctCost);
  const [cost, setCost] = useState(String(movement.unitCost ?? ""));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const item = movement.variantName
    ? `${movement.productName} – ${movement.variantName}`
    : movement.productName;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const unitCost = parseNumber(cost);
    if (unitCost === undefined || unitCost < 0) {
      setError(t("Enter the correct unit cost"));
      return;
    }
    setPending(true);
    try {
      const result = await correct({
        movementId: movement._id,
        unitCost,
        notes: notes.trim() || undefined,
      });
      toast.success(
        result
          ? t("Cost corrected. Average cost is now {{cost}}", {
              cost: formatMoney(result.avgCost),
            })
          : t("The cost is unchanged"),
      );
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>
          {t("Correct cost of {{id}}", { id: movement.movementId })}
        </DialogTitle>
        <DialogDescription>
          {t(
            "{{quantity}} × {{item}}, entered at {{cost}} each. The average cost is fixed for the units still in stock; units already sold keep the cost they left with.",
            {
              quantity: formatNumber(movement.quantityChange),
              item,
              cost: formatMoney(movement.unitCost ?? 0),
            },
          )}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={!!error || undefined}>
        <FieldLabel htmlFor="correct-cost">{t("Correct unit cost")}</FieldLabel>
        <MoneyInput
          id="correct-cost"
          value={cost}
          onChange={(v) => {
            setCost(v);
            setError(undefined);
          }}
          disabled={pending}
          aria-invalid={!!error || undefined}
          autoFocus
        />
        {error ? (
          <FieldError>{error}</FieldError>
        ) : (
          <FieldDescription>
            {t("Recorded in Movements with the old and new cost.")}
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor="correct-notes">
          {t("Reason")}{" "}
          <span className="font-normal text-muted-foreground">
            {t("(optional)")}
          </span>
        </FieldLabel>
        <Input
          id="correct-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          disabled={pending}
          placeholder={t("e.g. supplier invoice was different")}
        />
      </Field>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {t("Correct cost")}
        </Button>
      </DialogFooter>
    </form>
  );
}
