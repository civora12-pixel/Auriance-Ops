import { useState } from "react";
import {
  KeyRound,
  Link2,
  MoreHorizontal,
  PencilLine,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import { ConfirmDialog } from "@/components/confirm-dialog.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import type { Output } from "@/lib/api.ts";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";
import AccessDialog from "./_components/access-dialog.tsx";
import { NameDialog } from "@/components/name-dialog.tsx";
import type { AccessTarget } from "./_components/access-dialog.tsx";
import InviteDialog from "./_components/invite-dialog.tsx";
import { matchingPreset } from "./_lib/preset.ts";
import { describeAccess } from "./_lib/access.ts";
import { ShareLinkDialog } from "./_components/share-link.tsx";
import type { SharedLink } from "./_components/share-link.tsx";

type RawMember = Output<typeof api.users.listTeam>[number];
/** Names are optional on the server (set when the invite is accepted); fall back to the email. */
type Member = Omit<RawMember, "name"> & { name: string };
type Confirm = { kind: "role" | "active"; member: Member } | null;

export default function TeamPage() {
  const { t } = useTranslation();
  const raw = useQuery(api.users.listTeam);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [access, setAccess] = useState<AccessTarget | null>(null);
  const [link, setLink] = useState<SharedLink | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const createLink = useMutation(api.users.createLink);
  const setRole = useMutation(api.users.setRole);
  const setActive = useMutation(api.users.setActive);
  const setName = useMutation(api.users.setName);
  const [renaming, setRenaming] = useState<Member | null>(null);

  if (raw === undefined) return <PageSkeleton rows={4} />;
  const team: Member[] = raw.map((m) => ({ ...m, name: m.name || m.email }));

  const actions: MemberActions = {
    rename: (m) => setRenaming(m),
    editAccess: (m) =>
      setAccess({
        _id: m._id,
        name: m.name,
        permissions: m.effectivePermissions,
      }),
    newLink: async (m) => {
      try {
        const res = await createLink({ userId: m._id });
        setLink({
          name: m.name,
          email: m.email,
          kind: res.kind === "reset" ? "reset" : "invite",
          path: res.path,
          expiresAt: res.expiresAt,
        });
      } catch (e) {
        toast.error(getErrorMessage(e));
      }
    },
    changeRole: (m) => setConfirm({ kind: "role", member: m }),
    toggleActive: (m) => setConfirm({ kind: "active", member: m }),
  };

  const admins = team.filter((m) => m.role === "admin" && m.isActive).length;

  return (
    <PageBody className="max-w-5xl">
      <PageHeader
        title={t("Team")}
        description={t(
          "Add teammates, choose what they can open, and send sign-in links.",
        )}
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus />
            {t("Add teammate")}
          </Button>
        }
      />

      <div className="grid gap-3 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground sm:grid-cols-2">
        <p>
          <Trans
            i18nKey="<b>Admins</b> can open everything, including finance, team and settings. Deleting records and downloading backups also needs Admin Mode."
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        </p>
        <p>
          <Trans
            i18nKey="<b>Members</b> open only the sections you tick. “Can change order status” lets them ship, cancel, return and swap orders."
            components={{ b: <span className="font-medium text-foreground" /> }}
          />
        </p>
      </div>

      {/* Phones: cards */}
      <ul className="space-y-3 md:hidden" aria-label={t("Team members")}>
        {team.map((m) => (
          <li
            key={m._id}
            className={cn(
              "rounded-xl border bg-card p-4",
              !m.isActive && "opacity-70",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <MemberIdentity member={m} />
              <MemberMenu
                member={m}
                actions={actions}
                lastAdmin={m.role === "admin" && admins <= 1}
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <RoleBadge member={m} />
              <MemberStatus member={m} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              <AccessSummary member={m} />
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              <LastSignIn member={m} />
            </p>
          </li>
        ))}
      </ul>

      {/* Tablets and up: table */}
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Name")}</TableHead>
              <TableHead>{t("Role")}</TableHead>
              <TableHead>{t("Access")}</TableHead>
              <TableHead>{t("Status")}</TableHead>
              <TableHead>{t("Last sign-in")}</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">{t("Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((m) => (
              <TableRow key={m._id} className={cn(!m.isActive && "opacity-70")}>
                <TableCell>
                  <MemberIdentity member={m} />
                </TableCell>
                <TableCell>
                  <RoleBadge member={m} />
                </TableCell>
                <TableCell className="max-w-64 text-sm whitespace-normal text-muted-foreground">
                  <AccessSummary member={m} />
                </TableCell>
                <TableCell>
                  <MemberStatus member={m} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <LastSignIn member={m} />
                </TableCell>
                <TableCell className="text-end">
                  <MemberMenu
                    member={m}
                    actions={actions}
                    lastAdmin={m.role === "admin" && admins <= 1}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      <AccessDialog member={access} onClose={() => setAccess(null)} />
      <ShareLinkDialog link={link} onClose={() => setLink(null)} />
      <NameDialog
        open={!!renaming}
        onOpenChange={(open) => !open && setRenaming(null)}
        title={t("Edit name")}
        initial={
          renaming?.name === renaming?.email ? "" : (renaming?.name ?? "")
        }
        onSave={(name) => setName({ userId: renaming!._id, name })}
      />
      <MemberConfirm
        confirm={confirm}
        onClose={() => setConfirm(null)}
        setRole={setRole}
        setActive={setActive}
      />
    </PageBody>
  );
}

type MemberActions = {
  rename: (m: Member) => void;
  editAccess: (m: Member) => void;
  newLink: (m: Member) => Promise<void>;
  changeRole: (m: Member) => void;
  toggleActive: (m: Member) => void;
};

function MemberIdentity({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium"
        aria-hidden
      >
        {initials(m.name)}
      </div>
      <div className="min-w-0">
        <p className="truncate font-medium">
          {m.name}
          {m.isSelf && (
            <Badge variant="secondary" className="ms-2 align-middle">
              {t("You")}
            </Badge>
          )}
        </p>
        <p className="truncate text-sm text-muted-foreground">{m.email}</p>
      </div>
    </div>
  );
}

function RoleBadge({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  return m.role === "admin" ? (
    <Badge variant="default">
      <ShieldCheck />
      {t("Admin")}
    </Badge>
  ) : (
    <Badge variant="outline">
      <UserRound />
      {t("Member")}
    </Badge>
  );
}

function AccessSummary({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  if (m.role === "admin") return <>{t("Everything")}</>;
  const sections = describeAccess(m.effectivePermissions);
  return (
    <>
      {sections}
      {m.effectivePermissions.canShipAndReturn &&
        !matchingPreset(m.effectivePermissions) &&
        ` · ${t("can ship and record returns")}`}
    </>
  );
}

function MemberStatus({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  const { formatDateTime } = useFormat();
  if (!m.isActive) return <Badge variant="secondary">{t("Deactivated")}</Badge>;
  if (!m.hasPassword) {
    return m.pendingLinkKind === "invite" ? (
      <Badge
        variant="outline"
        className="border-amber-500/50 text-amber-700 dark:text-amber-400"
        title={t("Link expires {{date}}", {
          date: formatDateTime(m.pendingLinkExpiresAt),
        })}
      >
        {t("Invite pending")}
      </Badge>
    ) : (
      <Badge
        variant="outline"
        className="border-destructive/50 text-destructive"
      >
        {t("Invite expired")}
      </Badge>
    );
  }
  if (m.pendingLinkKind === "reset") {
    return (
      <Badge
        variant="outline"
        title={t("Link expires {{date}}", {
          date: formatDateTime(m.pendingLinkExpiresAt),
        })}
      >
        {t("Reset link sent")}
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-emerald-500/50 text-emerald-700 dark:text-emerald-400"
    >
      {t("Active")}
    </Badge>
  );
}

function LastSignIn({ member: m }: { member: Member }) {
  const { t } = useTranslation();
  const { formatRelative, formatDateTime } = useFormat();
  if (!m.lastLoginAt) return <>{t("Never signed in")}</>;
  return (
    <time title={formatDateTime(m.lastLoginAt)}>
      {formatRelative(m.lastLoginAt)}
    </time>
  );
}

function MemberMenu({
  member: m,
  actions,
  lastAdmin,
}: {
  member: Member;
  actions: MemberActions;
  lastAdmin: boolean;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("Actions for {{name}}", { name: m.name })}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">{m.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => actions.rename(m)}>
          <PencilLine />
          {t("Edit name")}
        </DropdownMenuItem>
        {m.role === "member" && (
          <DropdownMenuItem onSelect={() => actions.editAccess(m)}>
            <SlidersHorizontal />
            {t("Edit access")}
          </DropdownMenuItem>
        )}
        {m.isActive && (
          <DropdownMenuItem onSelect={() => void actions.newLink(m)}>
            {m.hasPassword ? <KeyRound /> : <Link2 />}
            {m.hasPassword ? t("Password reset link") : t("New invite link")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onSelect={() => actions.changeRole(m)}
          disabled={lastAdmin && m.isActive}
        >
          <ShieldCheck />
          {m.role === "admin" ? t("Make member") : t("Make admin")}
        </DropdownMenuItem>
        {!m.isSelf && (
          <>
            <DropdownMenuSeparator />
            {m.isActive ? (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => actions.toggleActive(m)}
                disabled={lastAdmin}
              >
                <UserMinus />
                {t("Deactivate")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => actions.toggleActive(m)}>
                <UserCheck />
                {t("Reactivate")}
              </DropdownMenuItem>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MemberConfirm({
  confirm,
  onClose,
  setRole,
  setActive,
}: {
  confirm: Confirm;
  onClose: () => void;
  setRole: (input: {
    userId: string;
    role: "admin" | "member";
  }) => Promise<unknown>;
  setActive: (input: { userId: string; isActive: boolean }) => Promise<unknown>;
}) {
  const { t } = useTranslation();
  // Keep the last target while the dialog animates closed
  const [last, setLast] = useState<NonNullable<Confirm> | null>(null);
  if (confirm && confirm !== last) setLast(confirm);
  const current = confirm ?? last;
  if (!current) return null;
  const m = current.member;

  if (current.kind === "role") {
    const toAdmin = m.role === "member";
    return (
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && onClose()}
        title={
          toAdmin
            ? t("Make {{name}} an admin?", { name: m.name })
            : t("Make {{name}} a member?", { name: m.name })
        }
        description={
          toAdmin
            ? t(
                "Admins can open everything, including finance, team and settings, and can turn on Admin Mode to delete records.",
              )
            : m.isSelf
              ? t(
                  "You'll lose admin access straight away, including this page. Another admin will have to promote you again.",
                )
              : t(
                  "They'll keep access to the operational sections and lose finance, team and settings. You can narrow their access afterwards.",
                )
        }
        confirmLabel={toAdmin ? t("Make admin") : t("Make member")}
        destructive={!toAdmin && m.isSelf}
        onConfirm={() =>
          setRole({ userId: m._id, role: toAdmin ? "admin" : "member" })
        }
        successMessage={
          toAdmin
            ? t("{{name}} is now an admin", { name: m.name })
            : t("{{name}} is now a member", { name: m.name })
        }
      />
    );
  }

  return m.isActive ? (
    <ConfirmDialog
      open={confirm !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("Deactivate {{name}}?", { name: m.name })}
      description={t(
        "They're signed out on every device right away and can't sign in until you reactivate them. Their orders and history stay as they are.",
      )}
      confirmLabel={t("Deactivate")}
      destructive
      onConfirm={() => setActive({ userId: m._id, isActive: false })}
      successMessage={t("{{name}} was deactivated", { name: m.name })}
    />
  ) : (
    <ConfirmDialog
      open={confirm !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("Reactivate {{name}}?", { name: m.name })}
      description={
        m.hasPassword
          ? t(
              "They can sign in again with their existing password, with the same access as before.",
            )
          : t(
              "They haven't set a password yet. After reactivating, send them a new invite link from the actions menu.",
            )
      }
      confirmLabel={t("Reactivate")}
      onConfirm={() => setActive({ userId: m._id, isActive: true })}
      successMessage={t("{{name}} was reactivated", { name: m.name })}
    />
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0][0] ?? "") +
    (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")
  ).toUpperCase();
}
