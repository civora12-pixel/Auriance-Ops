import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { MAX_CHILDREN } from "@shared/little-ones.ts";
import type { Child, ChildGender, Twins } from "@shared/little-ones.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { cn } from "@/lib/utils.ts";
import { useBabyAge } from "../_lib/baby-age.ts";
import { updateGuest, useGuest } from "../_lib/guest.ts";
import { ageLabel, newChildId, useLittleOnes } from "../_lib/little-ones.ts";
import { BabyKindChoice } from "./baby-kind-choice.tsx";
import { GrowingBaby } from "./growing-baby.tsx";
import { babiesOf, babyTier } from "@shared/little-ones.ts";

type Draft = { id: string; name: string; birthday: string; gender: ChildGender | null; twins: Twins | null };

/**
 * "My little ones": each child's birthday, boy or girl and an optional name.
 * The shop works out their age every visit, marks the sizes that fit, fills in
 * boy or girl, and the baby on the page grows with them. Several children can
 * be added (twins too); tap one to shop for them.
 */
export function BabyAgeCard() {
  const { t } = useTranslation();
  const guest = useGuest();
  const { ready, children, active, save, setActive, today } = useLittleOnes();
  const { ageMonths } = useBabyAge();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [managing, setManaging] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!ready) return null;
  const empty = children.length === 0;
  if (empty && !editing && guest.hideAgeAsk) return null;

  const plain = (list: typeof children): Child[] =>
    list.map(({ id, name, birthday, gender, twins }) => ({ id, name, birthday, gender, twins: twins ?? null }));

  const commit = async (next: Child[], selectId?: string) => {
    setSaving(true);
    try {
      await save(next);
      if (selectId) setActive(selectId);
      setEditing(null);
      return true;
    } catch (err) {
      toast.error(getErrorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.birthday || editing.birthday > today) {
      toast.error(t("Choose the birthday"));
      return;
    }
    const child: Child = {
      id: editing.id,
      name: editing.name.trim() || null,
      birthday: editing.birthday,
      gender: editing.gender,
      twins: editing.twins,
    };
    const exists = children.some((c) => c.id === child.id);
    const next = exists ? plain(children).map((c) => (c.id === child.id ? child : c)) : [...plain(children), child];
    await commit(next, child.id);
  };

  const remove = async (id: string) => {
    await commit(plain(children).filter((c) => c.id !== id));
  };

  const startNew = () => setEditing({ id: newChildId(), name: "", birthday: "", gender: null, twins: null });
  const form = editing ? (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-medium">
          {t("Birthday")}
          <Input
            type="date"
            required
            max={today}
            value={editing.birthday}
            onChange={(e) => setEditing({ ...editing, birthday: e.target.value })}
            className="h-11 rounded-xl bg-background text-base"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          <span>
            {t("Name")} <span className="font-normal text-muted-foreground">({t("optional")})</span>
          </span>
          <Input
            value={editing.name}
            maxLength={30}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            className="h-11 rounded-xl bg-background text-base"
            dir="auto"
          />
        </label>
      </div>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium">{t("Boy, girl or twins?")}</span>
        <BabyKindChoice value={editing} onChange={(k) => setEditing({ ...editing, ...k })} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="rounded-full" disabled={saving}>
          {t("Save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="rounded-full text-muted-foreground"
          onClick={() => {
            if (empty && !children.some((c) => c.id === editing.id)) updateGuest({ hideAgeAsk: true });
            setEditing(null);
          }}
        >
          {empty ? t("Not now") : t("Cancel")}
        </Button>
      </div>
    </form>
  ) : null;

  return (
    <section
      aria-label={t("My little ones")}
      className="flex items-start gap-3 rounded-3xl border border-border bg-card p-4 sm:gap-5 sm:p-5"
    >
      {/* One baby, or both twins side by side */}
      <div className="flex shrink-0 -space-x-5 rtl:space-x-reverse">
        {babiesOf(active ?? { gender: null, twins: null }).map((g, i) => (
          <GrowingBaby
            key={i}
            tier={active ? active.tier : babyTier(ageMonths ?? 8)}
            gender={g}
            className={active?.twins ? "h-14 w-14 sm:h-16 sm:w-16" : "h-16 w-16 sm:h-20 sm:w-20"}
          />
        ))}
      </div>
      <div className="grid min-w-0 flex-1 gap-3">
        {empty ? (
          <>
            <div>
              <h2 className="font-display text-lg font-semibold text-shop-deep">{t("Who are you shopping for?")}</h2>
              <p className="text-sm text-muted-foreground">
                {ageMonths !== null
                  ? t("Your baby is about {{n}} months old. Add the birthday so the sizes stay right as they grow.", {
                      n: Math.max(0, Math.round(ageMonths)),
                    })
                  : t("Add your baby's birthday: we'll mark the sizes that fit now and the next size up.")}
              </p>
            </div>
            {form ?? (
              <div className="flex flex-wrap gap-2">
                <Button type="button" className="rounded-full" onClick={startNew}>
                  <Plus />
                  {t("Add birthday")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  onClick={() => updateGuest({ hideAgeAsk: true })}
                >
                  {t("Not now")}
                </Button>
              </div>
            )}
          </>
        ) : form ? (
          form
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-shop-deep">{t("Shopping for:")}</span>
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={active?.id === c.id}
                  onClick={() => setActive(c.id)}
                  className={cn(
                    "min-h-10 rounded-full border px-3 text-sm transition-colors",
                    active?.id === c.id
                      ? c.twins === "mixed"
                        ? "border-violet-500 bg-gradient-to-r from-sky-500 to-pink-500 text-white"
                        : c.gender === "boys"
                        ? "border-sky-500 bg-sky-500 text-white"
                        : c.gender === "girls"
                          ? "border-pink-500 bg-pink-500 text-white"
                          : "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background hover:border-primary",
                  )}
                >
                  <span dir="auto" className="font-semibold">
                    {c.name ??
                      (c.twins ? t("Twins") : c.gender === "boys" ? t("Boy") : c.gender === "girls" ? t("Girl") : t("Baby"))}
                  </span>
                  <span className="opacity-80"> · {ageLabel(t, c.ageMonths)}</span>
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{t("Sizes that fit now and the next size up are marked for you.")}</p>
            {managing ? (
              <ul className="grid gap-2">
                {children.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border px-3 py-2 text-sm">
                    <span dir="auto">
                      {c.name ?? t("Baby")} · {c.birthday}
                    </span>
                    <span className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full"
                        aria-label={t("Edit")}
                        onClick={() =>
                          setEditing({ id: c.id, name: c.name ?? "", birthday: c.birthday, gender: c.gender, twins: c.twins ?? null })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 rounded-full text-muted-foreground"
                        aria-label={t("Remove")}
                        disabled={saving}
                        onClick={() => void remove(c.id)}
                      >
                        <Trash2 />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {children.length < MAX_CHILDREN && (
                <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={startNew}>
                  <Plus />
                  {t("Add a child")}
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" className="rounded-full" onClick={() => setManaging((m) => !m)}>
                {managing ? t("Done") : t("Edit")}
              </Button>
              {guest.hideBaby && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="rounded-full text-muted-foreground"
                  onClick={() => updateGuest({ hideBaby: false })}
                >
                  {t("Show the baby on the page again")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
