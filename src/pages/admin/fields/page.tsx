import { useState } from "react";
import { Eye, EyeOff, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import AdminModeDialog from "@/components/admin-mode-dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { PageBody, PageHeader } from "@/components/page-header.tsx";
import { PageSkeleton } from "@/components/states.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";
import { useAdminMode } from "@/lib/auth.tsx";
import { cn } from "@/lib/utils.ts";
import { FIELD_SECTIONS } from "@shared/constants.ts";
import type { FieldDef, FieldSection } from "@shared/constants.ts";

const SECTION_KEYS = Object.keys(FIELD_SECTIONS) as FieldSection[];

export default function ManageFieldsPage() {
  const { t } = useTranslation();
  const config = useQuery(api.admin.fields.get, undefined, {
    refetchInterval: false,
  });
  const update = useMutation(api.admin.fields.update);
  const { isAdminMode } = useAdminMode();
  const [adminOpen, setAdminOpen] = useState(false);
  // Switches flip straight away; the saved value takes over once the change lands
  const [pending, setPending] = useState<Record<string, boolean>>({});

  if (config === undefined) return <PageSkeleton rows={6} />;

  const isVisible = (section: FieldSection, field: string) => {
    const key = `${section}.${field}`;
    if (key in pending) return pending[key];
    return config[section]?.[field] !== false;
  };

  const toggle = async (
    section: FieldSection,
    field: FieldDef,
    visible: boolean,
  ) => {
    const key = `${section}.${field.key}`;
    setPending((p) => ({ ...p, [key]: visible }));
    try {
      await update({ section, field: field.key, visible });
    } catch (e) {
      toast.error(
        getErrorMessage(
          e,
          t("Couldn't update {{field}}", { field: t(field.label) }),
        ),
      );
    } finally {
      setPending(({ [key]: _done, ...rest }) => rest);
    }
  };

  return (
    <PageBody className="max-w-3xl">
      <PageHeader
        title={t("Manage fields")}
        description={t(
          "Choose which optional fields appear on lists, forms and exports for everyone. Hiding a field never deletes its data.",
        )}
        breadcrumbs={[
          { label: t("Settings"), to: "/settings" },
          { label: t("Manage fields") },
        ]}
      />

      {!isAdminMode && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center">
          <ShieldAlert
            className="size-5 shrink-0 text-amber-700 dark:text-amber-400"
            aria-hidden
          />
          <p className="flex-1 text-sm text-amber-900 dark:text-amber-200">
            {t(
              "Changing fields needs Admin Mode, because it changes what the whole team sees.",
            )}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdminOpen(true)}
          >
            {t("Turn on Admin Mode")}
          </Button>
        </div>
      )}

      {SECTION_KEYS.map((section) => {
        const def = FIELD_SECTIONS[section];
        const fields: readonly FieldDef[] = def.fields;
        const hidden = fields.filter((f) => !isVisible(section, f.key)).length;
        return (
          <Card key={section}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t(def.title)}
                {hidden > 0 && (
                  <Badge variant="secondary">
                    {t("{{count}} hidden", { count: hidden })}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>{t(def.description)}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {fields.map((field) => {
                  const key = `${section}.${field.key}`;
                  const visible = isVisible(section, field.key);
                  const id = `field-${section}-${field.key}`;
                  return (
                    <li
                      key={field.key}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <label
                        htmlFor={id}
                        className={cn(
                          "flex min-w-0 items-center gap-2 text-sm",
                          field.required ? "cursor-default" : "cursor-pointer",
                        )}
                      >
                        {visible ? (
                          <Eye
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        ) : (
                          <EyeOff
                            className="size-4 shrink-0 text-muted-foreground/60"
                            aria-hidden
                          />
                        )}
                        <span
                          className={cn(
                            "truncate",
                            visible
                              ? "font-medium"
                              : "text-muted-foreground line-through decoration-muted-foreground/40",
                          )}
                        >
                          {t(field.label)}
                        </span>
                        {field.required && (
                          <Badge variant="outline" className="text-[11px]">
                            {t("Required")}
                          </Badge>
                        )}
                      </label>
                      <div className="flex items-center gap-2">
                        {key in pending && (
                          <Spinner className="size-3.5 text-muted-foreground" />
                        )}
                        <Switch
                          id={id}
                          checked={visible}
                          disabled={
                            field.required || !isAdminMode || key in pending
                          }
                          onCheckedChange={(checked) =>
                            void toggle(section, field, checked)
                          }
                          aria-label={
                            visible
                              ? t("Hide {{field}} in {{section}}", {
                                  field: t(field.label),
                                  section: t(def.title),
                                })
                              : t("Show {{field}} in {{section}}", {
                                  field: t(field.label),
                                  section: t(def.title),
                                })
                          }
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}

      <AdminModeDialog open={adminOpen} onOpenChange={setAdminOpen} />
    </PageBody>
  );
}
