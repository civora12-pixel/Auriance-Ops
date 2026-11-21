import { useState } from "react";
import { DatabaseBackup, Download, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { useAdminMode, useAuth } from "@/lib/auth.tsx";
import i18n from "@/lib/i18n.ts";

/** File name from `Content-Disposition: attachment; filename="..."`. */
function fileName(header: string | null): string {
  const match = header?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `backup-${new Date().toISOString().slice(0, 10)}.db`;
}

async function downloadBackup(): Promise<void> {
  const res = await fetch("/api/admin/backup", { credentials: "same-origin" });
  if (!res.ok) {
    let message = i18n.t("The server responded with {{status}}. Try again.", {
      status: res.status,
    });
    try {
      const data = (await res.json()) as { message?: string };
      if (data.message) message = data.message;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName(res.headers.get("content-disposition"));
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BackupCard() {
  const { t } = useTranslation();
  const { isAdminMode } = useAdminMode();
  const { refresh } = useAuth();
  const [pending, setPending] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      await downloadBackup();
      toast.success(t("Backup downloaded"));
    } catch (e) {
      toast.error(getErrorMessage(e));
      // Admin Mode may have run out on the server
      void refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="size-5 text-muted-foreground" />
          {t("Backups")}
        </CardTitle>
        <CardDescription>
          {t("A full copy of your data as a single SQLite file.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-muted-foreground">
        <p>
          {t(
            "When backups are set up on the server, it saves one copy a day and keeps the last week on its storage volume. Those copies live on the same server as the app, so download one regularly (weekly is a good habit) and keep it somewhere safe.",
          )}
        </p>
        <p>
          {t(
            "To restore, stop the app and replace the database file on the volume with a backup. The deployment guide (DEPLOY.md) has the steps.",
          )}
        </p>
        {!isAdminMode && (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-300">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" />
            {t(
              "Downloading a backup needs Admin Mode, because the file contains all of your business data.",
            )}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        {isAdminMode ? (
          <Button onClick={download} disabled={pending}>
            {pending ? <Spinner /> : <Download />}
            {t("Download backup")}
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setAdminOpen(true)}>
            <ShieldAlert />
            {t("Turn on Admin Mode")}
          </Button>
        )}
      </CardFooter>
      <AdminModeDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </Card>
  );
}
