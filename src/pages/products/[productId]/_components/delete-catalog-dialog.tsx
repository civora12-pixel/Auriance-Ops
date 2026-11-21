import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";

export type DeleteTarget =
  | { kind: "product"; productId: string; name: string }
  | { kind: "variant"; variantId: string; name: string };

/**
 * Permanently deletes a product or variant (Admin Mode). Shows what goes and
 * what is kept; order lines keep their saved names.
 */
export default function DeleteCatalogDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  /** Called before the dialog closes (navigate away from a deleted product here) */
  onDeleted?: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog
      open={!!target}
      onOpenChange={(next) => !next && !pending && onClose()}
    >
      <AlertDialogContent>
        {target && (
          <DeleteBody
            target={target}
            pending={pending}
            setPending={setPending}
            onClose={onClose}
            onDeleted={onDeleted}
          />
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteBody({
  target,
  pending,
  setPending,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  pending: boolean;
  setPending: (p: boolean) => void;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const preview = useQuery(
    api.admin.catalog.deletionPreview,
    {
      target:
        target.kind === "product"
          ? { kind: "product", productId: target.productId }
          : { kind: "variant", variantId: target.variantId },
    },
    { refetchInterval: false },
  );
  const deleteProduct = useMutation(api.admin.catalog.deleteProduct);
  const deleteVariant = useMutation(api.admin.catalog.deleteVariant);
  const used = preview?.hasActivity ?? false;
  const blocked = used || (preview?.blockingOrders.length ?? 0) > 0;

  const confirm = async () => {
    setPending(true);
    try {
      if (target.kind === "product")
        await deleteProduct({ productId: target.productId });
      else await deleteVariant({ variantId: target.variantId });
      toast.success(t("{{name}} deleted", { name: target.name }));
      onDeleted?.();
      onClose();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPending(false);
    }
  };

  const removed: string[] = [];
  const kept: string[] = [];
  if (preview) {
    if (preview.variants)
      removed.push(t("{{count}} variants", { count: preview.variants }));
    if (preview.stockRows) {
      removed.push(
        preview.notSellable
          ? t(
              "Stock records ({{onHand}} on hand, {{notSellable}} not sellable)",
              {
                onHand: formatNumber(preview.onHand),
                notSellable: formatNumber(preview.notSellable),
              },
            )
          : t("Stock records ({{onHand}} on hand)", {
              onHand: formatNumber(preview.onHand),
            }),
      );
    }
    if (preview.movements)
      removed.push(
        t("{{count}} stock movements", { count: preview.movements }),
      );
    if (preview.orderLines)
      kept.push(
        t("{{count}} order lines (with their saved names)", {
          count: preview.orderLines,
        }),
      );
    if (preview.orderMovements)
      kept.push(
        t("{{count}} order-linked stock movements", {
          count: preview.orderMovements,
        }),
      );
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>
          {t("Delete {{name}}?", { name: target.name })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t("This can't be undone.")}{" "}
          {target.kind === "product"
            ? t(
                "To hide a product but keep its history, mark it inactive instead.",
              )
            : t(
                "To hide a variant but keep its history, deactivate it instead.",
              )}
        </AlertDialogDescription>
      </AlertDialogHeader>

      {preview === undefined ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : used ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("This item has history")}</AlertTitle>
          <AlertDescription>
            {t(
              "It has stock, movements or orders, so it can't be deleted. Mark it inactive instead: it disappears from new orders and keeps all its records.",
            )}
          </AlertDescription>
        </Alert>
      ) : blocked ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>{t("It's on open orders")}</AlertTitle>
          <AlertDescription>
            {t("Ship or cancel these orders first: {{orders}}", {
              orders: preview?.blockingOrders.join(", "),
            })}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3 text-sm">
          <div>
            <p className="font-medium">{t("Deleted")}</p>
            <ul className="list-disc ps-5 text-muted-foreground">
              <li>
                {target.kind === "product"
                  ? t("The product")
                  : t("The variant")}
              </li>
              {removed.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          {kept.length > 0 && (
            <div>
              <p className="font-medium">{t("Kept")}</p>
              <ul className="list-disc ps-5 text-muted-foreground">
                {kept.map((k) => (
                  <li key={k}>{k}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AlertDialogFooter>
        <AlertDialogCancel disabled={pending}>{t("Cancel")}</AlertDialogCancel>
        <Button
          variant="destructive"
          onClick={confirm}
          disabled={pending || preview === undefined || blocked}
        >
          {pending && <Spinner />}
          {target.kind === "product"
            ? t("Delete product")
            : t("Delete variant")}
        </Button>
      </AlertDialogFooter>
    </>
  );
}
