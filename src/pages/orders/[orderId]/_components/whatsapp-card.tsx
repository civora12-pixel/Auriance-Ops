import { useTranslation } from "react-i18next";
import { CheckCircle2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { api, getErrorMessage, useMutation } from "@/lib/api.ts";
import { useAuth } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { orderWhatsAppMessage, whatsAppShareUrl } from "@/lib/whatsapp.ts";
import type { MessageOrder } from "@/lib/whatsapp.ts";
import { toast } from "sonner";
import type { OrderDetail } from "../_lib/order.ts";

/** The fields the WhatsApp message needs. */
export type PostableOrder = MessageOrder & { _id: string };

function useWhatsAppPost(order: PostableOrder) {
  const { settings } = useAuth();
  const markPosted = useMutation(api.orders.markWhatsAppPosted);
  const text = orderWhatsAppMessage(order, settings.businessName);
  const onPost = () => {
    // The link opens WhatsApp in a new tab; record the post alongside it
    markPosted({ orderId: order._id }).catch((err: unknown) =>
      toast.error(getErrorMessage(err)),
    );
  };
  return { text, href: whatsAppShareUrl(text), onPost };
}

function PostButton({
  href,
  onPost,
  label,
  variant = "default",
}: {
  href: string;
  onPost: () => void;
  label: string;
  variant?: "default" | "outline";
}) {
  return (
    <Button asChild variant={variant}>
      <a href={href} target="_blank" rel="noreferrer" onClick={onPost}>
        <MessageCircle />
        {label}
      </a>
    </Button>
  );
}

function MessagePreview({ text }: { text: string }) {
  return (
    <pre
      dir="auto"
      className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-sans text-sm whitespace-pre-wrap"
    >
      {text}
    </pre>
  );
}

/** Side card on every order that isn't cancelled: post (or re-post) it to the WhatsApp group. */
export function WhatsAppCard({ order }: { order: OrderDetail }) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  const { text, href, onPost } = useWhatsAppPost(order);
  const posted = order.whatsappPostedAt;
  return (
    <Card className="print:hidden">
      <CardHeader>
        <CardTitle>{t("WhatsApp")}</CardTitle>
        <CardDescription>
          {posted ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              {t("Posted {{when}}", { when: formatDateTime(posted) })}
            </span>
          ) : (
            t("Not posted to WhatsApp")
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <MessagePreview text={text} />
        <PostButton
          href={href}
          onPost={onPost}
          label={posted ? t("Post again") : t("Post to WhatsApp")}
          variant={posted ? "outline" : "default"}
        />
      </CardContent>
    </Card>
  );
}

/** Shown right after an order is created, so posting is one tap away. */
export function WhatsAppPrompt({
  order,
  open,
  onOpenChange,
}: {
  order: PostableOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { text, href, onPost } = useWhatsAppPost(order);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Post this order to WhatsApp?")}</DialogTitle>
          <DialogDescription>
            {t(
              "WhatsApp opens with the message ready. Choose the group and tap Send.",
            )}
          </DialogDescription>
        </DialogHeader>
        <MessagePreview text={text} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("Later")}
          </Button>
          <PostButton
            href={href}
            onPost={() => {
              onPost();
              onOpenChange(false);
            }}
            label={t("Post to WhatsApp")}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
