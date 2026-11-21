import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ImageOff, ImageUp, Package, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { uploadPhoto } from "@/lib/photos.ts";
import { cn } from "@/lib/utils.ts";

const SIZES = {
  sm: "size-10",
  md: "size-16",
  lg: "size-20",
  xl: "size-24",
} as const;
export type PhotoSize = keyof typeof SIZES;

/**
 * A product or variant photo. Tapping it opens a large view, so moderators and
 * the warehouse can check colour and details. Shows a placeholder when empty.
 */
export function Photo({
  url,
  label,
  size = "md",
  className,
}: {
  url?: string | null;
  label: string;
  size?: PhotoSize;
  className?: string;
}) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const box = cn(
    SIZES[size],
    "shrink-0 overflow-hidden rounded-md border bg-muted",
    className,
  );
  if (!url || failed) {
    return (
      <span
        className={cn(
          box,
          "flex items-center justify-center text-muted-foreground",
        )}
        title={url ? t("The photo couldn't be loaded") : undefined}
      >
        {url ? (
          <ImageOff className="size-1/3" />
        ) : (
          <Package className="size-1/3" />
        )}
      </span>
    );
  }
  return (
    <>
      <button
        type="button"
        className={cn(
          box,
          "cursor-zoom-in focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        )}
        onClick={() => setOpen(true)}
        aria-label={t("Enlarge photo of {{item}}", { item: label })}
      >
        <img
          src={url}
          alt=""
          className="size-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[min(90vw,48rem)] p-3 sm:p-4">
          <DialogTitle className="pe-8 text-base">{label}</DialogTitle>
          <DialogDescription className="sr-only">
            {t("Large photo")}
          </DialogDescription>
          <img
            src={url}
            alt={label}
            className="max-h-[75vh] w-full rounded-md object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Photo with Upload / Replace / Remove controls for admins. */
export function PhotoEditor({
  productId,
  variantId,
  url,
  label,
  size = "md",
  fallbackHint,
}: {
  productId: string;
  variantId?: string | null;
  url?: string | null;
  label: string;
  size?: PhotoSize;
  /** Shown when empty, e.g. "Uses the product photo". */
  fallbackHint?: string;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const setPhoto = useMutation(api.products.setPhoto);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const imageUrl = await uploadPhoto(file);
      await setPhoto({ productId, variantId: variantId ?? null, imageUrl });
      toast.success(t("Photo saved"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await setPhoto({
        productId,
        variantId: variantId ?? null,
        imageUrl: null,
      });
      toast.success(t("Photo removed"));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Photo url={url} label={label} size={size} />
      <div className="grid justify-items-start gap-0.5">
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={() => input.current?.click()}
          disabled={busy}
        >
          {busy ? <Spinner /> : <ImageUp />}
          {url ? t("Replace") : t("Add photo")}
        </Button>
        {url ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => void remove()}
            disabled={busy}
          >
            <Trash2 />
            {t("Remove")}
          </Button>
        ) : (
          fallbackHint && (
            <span className="px-2 text-xs text-muted-foreground">
              {fallbackHint}
            </span>
          )
        )}
      </div>
    </div>
  );
}

/** Photo field for forms: uploads straight away and hands back the photo link. */
export function PhotoPicker({
  value,
  onChange,
  label,
  id,
  disabled,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await uploadPhoto(file));
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Photo url={value} label={label} size="lg" />
      <div className="grid justify-items-start gap-0.5">
        <input
          ref={input}
          id={id}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => input.current?.click()}
          disabled={busy || disabled}
        >
          {busy ? <Spinner /> : <ImageUp />}
          {value ? t("Replace") : t("Add photo")}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => onChange(null)}
            disabled={busy || disabled}
          >
            <Trash2 />
            {t("Remove")}
          </Button>
        )}
      </div>
    </div>
  );
}
