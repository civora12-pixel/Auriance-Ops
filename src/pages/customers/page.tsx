import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Contact, Copy, KeyRound, MessageCircle, Search } from "lucide-react";
import { Pager, useUrlState } from "@/components/data-table.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { EmptyState, TableSkeleton } from "@/components/states.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useCurrentUser } from "@/lib/auth.tsx";
import { useFormat } from "@/lib/format.ts";
import { whatsAppChatUrl } from "@/lib/whatsapp.ts";

type Link = { url: string; phone: string; name: string; expiresAt: number };

/** Shop customer accounts. Moderators send a password reset link on WhatsApp from here. */
export default function CustomersPage() {
  const { t } = useTranslation();
  const { formatDay, formatNumber } = useFormat();
  const { canEdit } = useCurrentUser();
  const [state, update] = useUrlState({ q: "", page: "1" });
  const page = Math.max(1, Number(state.page) || 1);
  const data = useQuery(api.customers.list, { search: state.q || undefined, page }, { keepPrevious: true });
  const resetLink = useMutation(api.customers.resetLink);
  const [making, setMaking] = useState<string | null>(null);
  const [link, setLink] = useState<Link | null>(null);

  const makeLink = async (customerId: string) => {
    setMaking(customerId);
    try {
      const res = await resetLink({ customerId });
      setLink({ url: `${window.location.origin}${res.path}`, phone: res.phone, name: res.name, expiresAt: res.expiresAt });
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setMaking(null);
    }
  };

  const message = link
    ? t("Hi {{name}}, here's your link to choose a new password for your Auriance account: {{url}}", {
        name: link.name,
        url: link.url,
      })
    : "";

  return (
    <PageBody>
      <PageHeader
        title={t("Customers")}
        description={t("People with a shop account. A customer who forgot their password and has no email can get a reset link from here on WhatsApp.")}
      />
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={state.q}
          onChange={(e) => update({ q: e.target.value, page: "1" })}
          placeholder={t("Search name, phone or email")}
          aria-label={t("Search name, phone or email")}
          className="ps-9"
        />
      </div>
      {data === undefined ? (
        <TableSkeleton />
      ) : data.total === 0 ? (
        <EmptyState
          icon={<Contact />}
          title={state.q ? t("No customers match your search") : t("No customer accounts yet")}
          description={state.q ? undefined : t("Accounts appear here when customers sign up on the shop.")}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-x-auto px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Name")}</TableHead>
                  <TableHead>{t("Phone")}</TableHead>
                  <TableHead>{t("Email")}</TableHead>
                  <TableHead>{t("Address")}</TableHead>
                  <TableHead className="text-end">{t("Orders")}</TableHead>
                  <TableHead>{t("Joined")}</TableHead>
                  {canEdit("orders") && <TableHead className="w-0" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.customers.map((c) => (
                  <TableRow key={c._id}>
                    <TableCell dir="auto" className="font-medium">
                      {c.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs" dir="ltr">
                      {c.phone}
                      {c.phone2 && <span className="block text-muted-foreground">{c.phone2}</span>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {c.email ? (
                        <span className="flex items-center gap-1" dir="ltr">
                          {c.email}
                          {c.emailVerified && (
                            <CheckCircle2 className="size-3.5 text-emerald-600" aria-label={t("Confirmed")} />
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell dir="auto" className="max-w-64 text-sm">
                      {[c.city, c.address].filter(Boolean).join(" · ") || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{formatNumber(c.orders)}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDay(new Date(c.joinedAt).toISOString())}
                      {!c.isActive && (
                        <Badge variant="outline" className="ms-2">
                          {t("Closed")}
                        </Badge>
                      )}
                    </TableCell>
                    {canEdit("orders") && (
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={making === c._id}
                          onClick={() => void makeLink(c._id)}
                          className="whitespace-nowrap"
                        >
                          {making === c._id ? <Spinner /> : <KeyRound />}
                          {t("Password reset link")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      {data && data.total > data.pageSize && (
        <Pager page={page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: String(p) })} />
      )}

      <Dialog open={!!link} onOpenChange={(open) => !open && setLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Reset link for {{name}}", { name: link?.name ?? "" })}</DialogTitle>
            <DialogDescription>
              {t("Send it on WhatsApp. It works once, for 2 days. Making a new link stops the old one.")}
            </DialogDescription>
          </DialogHeader>
          <p className="break-all rounded-md bg-muted p-3 font-mono text-xs" dir="ltr">
            {link?.url}
          </p>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard?.writeText(message).then(
                  () => toast.success(t("Copied")),
                  () => toast.error(t("Couldn't copy. Select the link and copy it.")),
                );
              }}
            >
              <Copy />
              {t("Copy message")}
            </Button>
            {link && (
              <Button asChild>
                <a href={whatsAppChatUrl(link.phone, message)} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  {t("Send on WhatsApp")}
                </a>
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageBody>
  );
}
