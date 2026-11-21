import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Copy, PackageCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { cn } from "@/lib/utils.ts";
import { backInStockMessage, whatsAppShareUrl } from "@/lib/whatsapp.ts";

type Pending = Output<typeof api.inventory.backInStock>;

/**
 * For whoever processes returns: sold-out items that came back and haven't
 * been announced to the moderators yet, with one WhatsApp message for the
 * whole batch. Turns red when the batch has waited too long.
 */
export function BackInStockBar() {
  const { canShip } = useCurrentUser();
  if (!canShip) return null;
  return <Bar />;
}

function Bar() {
  const { t } = useTranslation();
  const pending = useQuery(api.inventory.backInStock, undefined);
  const [open, setOpen] = useState(false);
  if (!pending || pending.items.length === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-sm md:px-6 print:hidden",
        pending.overdue
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
      )}
    >
      <span className="flex items-center gap-2 font-medium">
        <PackageCheck className="size-4" aria-hidden />
        {t("Back from zero after returns, not announced yet: {{count}} item(s), {{units}} unit(s)", {
          count: pending.items.length,
          units: pending.units,
        })}
        {pending.overdue && (
          <span className="opacity-80">{t("(waiting {{minutes}} min)", { minutes: pending.minutesSinceLast })}</span>
        )}
      </span>
      <Button size="sm" className="h-7" variant={pending.overdue ? "destructive" : "default"} onClick={() => setOpen(true)}>
        <Send />
        {t("Tell the moderators")}
      </Button>
      {open && <AnnounceDialog pending={pending} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AnnounceDialog({ pending, onClose }: { pending: Pending; onClose: () => void }) {
  const { t } = useTranslation();
  const announce = useMutation(api.inventory.announceBackInStock);
  // Written once when the dialog opens, then hers to edit (emoji, a note, a mention)
  const [text, setText] = useState(() => backInStockMessage(pending.items));
  const [busy, setBusy] = useState(false);

  const clear = async (message: string) => {
    if (!pending.upTo) return onClose();
    setBusy(true);
    try {
      await announce({ upTo: pending.upTo });
      toast.success(message);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const send = () => {
    window.open(whatsAppShareUrl(text), "_blank", "noopener,noreferrer");
    void clear(t("Marked as announced"));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("Message copied"));
    } catch {
      toast.error(t("Couldn't copy. Select the text and copy it yourself."));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("Tell the moderators what's back")}</DialogTitle>
          <DialogDescription>
            {t(
              "Only items that had nothing to sell before these returns, with the units still free now. Edit the message if you like, then choose the group in WhatsApp; you can mention people there.",
            )}
          </DialogDescription>
        </DialogHeader>
        <Textarea
          dir="rtl"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={Math.min(16, pending.items.length + 7)}
          aria-label={t("Message")}
          className="font-sans leading-relaxed"
          disabled={busy}
        />
        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => void clear(t("Cleared without sending"))} disabled={busy}>
            {t("Clear without sending")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => void copy()} disabled={busy}>
              <Copy />
              {t("Copy")}
            </Button>
            <Button type="button" onClick={send} disabled={busy || !text.trim()}>
              <Send />
              {t("Open WhatsApp")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
