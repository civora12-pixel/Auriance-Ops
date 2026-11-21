import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { useFormat } from "@/lib/format.ts";

export type SharedLink = {
  name: string;
  email: string;
  kind: "invite" | "reset";
  path: string;
  expiresAt: number;
};

/** Copies text, falling back to selecting the field when the clipboard API is unavailable (http, old browsers). */
async function copyText(
  text: string,
  input: HTMLInputElement | null,
): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    input?.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    }
  }
}

/** One-time link with a copy button. The app sends no email, so the admin shares it themselves. */
export function ShareLink({ link }: { link: SharedLink }) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  const [copied, setCopied] = useState(false);
  const [input, setInput] = useState<HTMLInputElement | null>(null);
  const url = `${window.location.origin}${link.path}`;

  const copy = async () => {
    if (await copyText(url, input)) {
      setCopied(true);
      toast.success(t("Link copied"));
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("Couldn't copy. Select the link and copy it manually."));
    }
  };

  return (
    <div className="space-y-2">
      <InputGroup>
        <InputGroupInput
          ref={setInput}
          readOnly
          value={url}
          aria-label={
            link.kind === "invite" ? t("Invite link") : t("Password reset link")
          }
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={copy}
            aria-label={t("Copy link")}
            size="icon-xs"
          >
            {copied ? <Check /> : <Copy />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <p className="text-xs text-muted-foreground">
        {t(
          "Works once and expires {{date}}. Any older link for {{email}} has stopped working.",
          {
            date: formatDateTime(link.expiresAt),
            email: link.email,
          },
        )}
      </p>
    </div>
  );
}

export function ShareLinkDialog({
  link,
  onClose,
}: {
  link: SharedLink | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={link !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {link && (
          <>
            <DialogHeader>
              <DialogTitle>
                {link.kind === "invite"
                  ? t("Invite link")
                  : t("Password reset link")}
              </DialogTitle>
              <DialogDescription>
                {link.kind === "invite"
                  ? t(
                      "Send this link to {{name}}. They'll choose a password and sign in.",
                      { name: link.name },
                    )
                  : t(
                      "Send this link to {{name}}. They'll choose a new password; their current one keeps working until then.",
                      {
                        name: link.name,
                      },
                    )}
              </DialogDescription>
            </DialogHeader>
            <ShareLink link={link} />
            <DialogFooter>
              <Button onClick={onClose}>{t("Done")}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
