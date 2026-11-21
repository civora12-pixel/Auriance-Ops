import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, ImageUp, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useApiClient, useMutation } from "@/lib/api.ts";
import { skuFromFileName, uploadPhoto } from "@/lib/photos.ts";

type Match = {
  productId: string;
  variantId?: string | null;
  label: string;
  hasPhoto: boolean;
};
type Row = {
  file: File;
  sku: string;
  match: Match | null;
  state: "waiting" | "done" | "failed";
  error?: string;
};

/**
 * Uploads many photos at once. Each file is named after the SKU it belongs to
 * ("TEE-RED.jpg" → the variant or product with SKU TEE-RED).
 */
export default function BulkPhotosDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const client = useApiClient();
  const setPhoto = useMutation(api.products.setPhoto);
  const [rows, setRows] = useState<Row[]>([]);
  const [phase, setPhase] = useState<
    "pick" | "matching" | "review" | "uploading" | "done"
  >("pick");
  const [error, setError] = useState<string>();

  const reset = () => {
    setRows([]);
    setPhase("pick");
    setError(undefined);
  };

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(undefined);
    setPhase("matching");
    const list = [...files].slice(0, 500);
    try {
      const matches = await client.query(api.products.matchPhotoSkus, {
        skus: list.map((f) => skuFromFileName(f.name) || f.name),
      });
      setRows(
        list.map((file, i) => ({
          file,
          sku: matches[i].sku,
          match: matches[i].match ?? null,
          state: "waiting",
        })),
      );
      setPhase("review");
    } catch (err) {
      setError(getErrorMessage(err));
      setPhase("pick");
    }
  };

  const matched = rows.filter((r) => r.match);
  const finished = rows.filter((r) => r.state !== "waiting" && r.match).length;

  const upload = async () => {
    setPhase("uploading");
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.match) continue;
      let next: Row;
      try {
        const imageUrl = await uploadPhoto(row.file);
        await setPhoto({
          productId: row.match.productId,
          variantId: row.match.variantId ?? null,
          imageUrl,
        });
        next = { ...row, state: "done" };
      } catch (err) {
        next = { ...row, state: "failed", error: getErrorMessage(err) };
      }
      setRows((prev) => prev.map((r, j) => (j === i ? next : r)));
    }
    setPhase("done");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (phase === "uploading") return;
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Upload photos")}</DialogTitle>
          <DialogDescription>
            {t(
              "Name each photo after its SKU, for example TEE-RED.jpg. Each photo goes to the variant or product with that SKU and replaces any photo it had.",
            )}
          </DialogDescription>
        </DialogHeader>

        {phase === "pick" || phase === "matching" ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center text-sm hover:bg-muted/50">
            {phase === "matching" ? (
              <Spinner />
            ) : (
              <ImageUp className="size-6 text-muted-foreground" />
            )}
            <span className="font-medium">{t("Choose photos")}</span>
            <span className="text-muted-foreground">
              {t(
                "JPG, PNG or WebP, up to 15 MB each. They're resized automatically.",
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              disabled={phase === "matching"}
              onChange={(e) => void pick(e.target.files)}
            />
          </label>
        ) : (
          <div className="grid gap-3">
            {phase !== "review" && (
              <Progress
                value={matched.length ? (finished / matched.length) * 100 : 0}
              />
            )}
            <p className="text-sm">
              {t("{{matched}} of {{total}} photos match a SKU.", {
                matched: matched.length,
                total: rows.length,
              })}
            </p>
            <ul className="grid max-h-80 gap-1 overflow-y-auto text-sm">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md px-2 py-1 odd:bg-muted/40"
                >
                  {r.state === "done" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  ) : r.state === "failed" || !r.match ? (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                  ) : phase === "uploading" ? (
                    <Spinner className="mt-0.5 size-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">
                      {r.file.name}
                    </span>
                    <span className="block text-muted-foreground">
                      {r.error ??
                        (r.match
                          ? r.match.hasPhoto
                            ? t("{{item}} (replaces its photo)", {
                                item: r.match.label,
                              })
                            : r.match.label
                          : t("No product or variant with SKU {{sku}}", {
                              sku: r.sku,
                            }))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          {phase === "review" && (
            <>
              <Button variant="outline" onClick={reset}>
                {t("Choose other photos")}
              </Button>
              <Button onClick={() => void upload()} disabled={!matched.length}>
                {t("Upload {{count}} photos", { count: matched.length })}
              </Button>
            </>
          )}
          {phase === "uploading" && (
            <Button disabled>
              <Spinner />
              {t("Uploading {{done}} of {{total}}…", {
                done: finished,
                total: matched.length,
              })}
            </Button>
          )}
          {phase === "done" && (
            <Button
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              {t("Done")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
