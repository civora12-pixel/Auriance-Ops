import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { tk } from "@/lib/i18n.ts";
import type { DeletionEntityType } from "@shared/constants.ts";

const ENTITY_LABELS: Record<DeletionEntityType, string> = {
  order: tk("Order"),
  movement: tk("Movement"),
  product: tk("Product"),
  variant: tk("Variant"),
  expense: tk("Expense"),
  journal_entry: tk("Journal entry"),
};

/** Audit trail of records permanently deleted in Admin Mode. */
export function DeletionLog() {
  const { t } = useTranslation();
  const logs = useQuery(
    api.admin.destructive.listDeletionLogs,
    { limit: 100 },
    { refetchInterval: false },
  );
  const { formatDateTime, formatRelative } = useFormat();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="size-5 text-muted-foreground" />
          {t("Deletion log")}
        </CardTitle>
        <CardDescription>
          {t(
            "Records permanently deleted in Admin Mode, newest first (last 100).",
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs === undefined ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : logs.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {t("Nothing has been deleted.")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("What")}</TableHead>
                  <TableHead>{t("Details")}</TableHead>
                  <TableHead>{t("Stock effect")}</TableHead>
                  <TableHead>{t("By")}</TableHead>
                  <TableHead>{t("When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow key={log._id}>
                    <TableCell>
                      <Badge variant="secondary">
                        {ENTITY_LABELS[log.entityType]
                          ? t(ENTITY_LABELS[log.entityType])
                          : log.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-80 min-w-48 text-sm whitespace-normal">
                      {log.entitySummary}
                    </TableCell>
                    <TableCell className="max-w-64 min-w-40 text-sm whitespace-normal text-muted-foreground">
                      {log.stockEffect || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {log.deletedByName}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap text-muted-foreground">
                      <time
                        dateTime={log.deletedAt}
                        title={formatDateTime(log.deletedAt)}
                      >
                        {formatRelative(log.deletedAt)}
                      </time>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
