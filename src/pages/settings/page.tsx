import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronRight, Globe, SlidersHorizontal, Users } from "lucide-react";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { api, useQuery } from "@/lib/api.ts";
import { BackupCard } from "./_components/backup-card.tsx";
import { BusinessForm } from "./_components/business-form.tsx";
import { DeletionLog } from "./_components/deletion-log.tsx";

export default function SettingsPage() {
  const { t } = useTranslation();
  const settings = useQuery(api.settings.get, undefined, {
    refetchInterval: false,
  });
  if (settings === undefined) return <PageSkeleton rows={4} />;

  return (
    <PageBody className="max-w-4xl">
      <PageHeader
        title={t("Settings")}
        description={t(
          "Business details, formatting, the customer shop, backups and the deletion audit trail.",
        )}
      />
      <BusinessForm initial={settings} />
      <div className="grid gap-3 sm:grid-cols-3">
        <ShortcutLink
          to="/team"
          icon={<Users />}
          title={t("Team")}
          description={t("Add teammates and choose their access")}
        />
        <ShortcutLink
          to="/website"
          icon={<Globe />}
          title={t("Website controls")}
          description={t("Open the shop, maintenance, seasons and more")}
        />
        <ShortcutLink
          to="/admin/fields"
          icon={<SlidersHorizontal />}
          title={t("Manage fields")}
          description={t("Show or hide optional fields")}
        />
      </div>
      <BackupCard />
      <DeletionLog />
    </PageBody>
  );
}

function ShortcutLink({
  to,
  icon,
  title,
  description,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4"
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight
        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
