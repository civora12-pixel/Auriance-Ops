import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Unlock } from "lucide-react";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { api, useMutation } from "@/lib/api.ts";
import { ME_KEY, useAdminMode } from "@/lib/auth.tsx";

/** Admin Mode: undo the latest closing (or the opening) so its figures can change. */
export default function ReopenButton({ period }: { period: string }) {
  const { t } = useTranslation();
  const { isAdminMode } = useAdminMode();
  const queryClient = useQueryClient();
  const reopen = useMutation(api.finance.closing.reopen);
  const [want, setWant] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setWant(true);
          if (!isAdminMode) setAdminOpen(true);
        }}
      >
        <Unlock />
        {t("Reopen")}
      </Button>
      <AdminModeDialog
        open={adminOpen}
        onOpenChange={(open) => {
          setAdminOpen(open);
          if (open) return;
          const until = queryClient.getQueryData<{ adminModeUntil?: number | null }>(ME_KEY)
            ?.adminModeUntil;
          if (!until || until <= Date.now()) setWant(false);
        }}
      />
      <ConfirmDialog
        open={want && isAdminMode && !adminOpen}
        onOpenChange={(open) => !open && setWant(false)}
        title={t("Reopen this period?")}
        description={t(
          "Its closing entries are removed and the figures can be changed again. Close it again when you're done.",
        )}
        confirmLabel={t("Reopen")}
        destructive
        onConfirm={() => reopen({ period: period as "opening" })}
        successMessage={t("Period reopened")}
      />
    </>
  );
}
