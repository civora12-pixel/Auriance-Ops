import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { SHOP_SECTION_LABELS } from "@shared/constants.ts";
import type { ShopSection } from "@shared/constants.ts";
import { matchesSearch } from "@shared/search.ts";
import { AUDIENCES, AUDIENCE_LABELS, PRODUCT_SEASONS, SEASON_LABELS } from "@shared/shop-site.ts";
import type { Audience, Season } from "@shared/shop-site.ts";
import { ShopSectionSelect } from "@/components/shop-section-select.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.tsx";
import { api, getErrorMessage, useMutation, useQuery } from "@/lib/api.ts";

type Show = "unassigned" | "all";

/** Puts many products in a customer shop section at once. */
export default function ShopSectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const products = useQuery(api.products.list, open ? { activeFilter: "active" } : "skip");
  const assign = useMutation(api.products.setShopSection);
  const setSeasonFor = useMutation(api.products.setSeason);
  const [season, setSeason] = useState<Season>("winter");
  const setAudienceFor = useMutation(api.products.setAudience);
  const [audience, setAudience] = useState<Audience>("girls");
  const [section, setSection] = useState<ShopSection | null>("kids_clothes");
  const [show, setShow] = useState<Show>("unassigned");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);

  const visible = useMemo(
    () =>
      (products ?? []).filter(
        (p) =>
          (show === "all" || !p.shopSection) && matchesSearch(`${p.name} ${p.sku} ${p.variantText}`, search),
      ),
    [products, show, search],
  );
  const allPicked = visible.length > 0 && visible.every((p) => picked.has(p._id));

  const toggle = (id: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const apply = async () => {
    setPending(true);
    try {
      const n = await assign({ productIds: [...picked], section });
      toast.success(
        section
          ? t("{{n}} products moved to {{section}}", { n, section: t(SHOP_SECTION_LABELS[section]) })
          : t("{{n}} products taken out of the shop", { n }),
      );
      setPicked(new Set());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const applyAudience = async () => {
    setPending(true);
    try {
      const n = await setAudienceFor({ productIds: [...picked], audience });
      toast.success(t("{{n}} products set to {{audience}}", { n, audience: t(AUDIENCE_LABELS[audience]) }));
      setPicked(new Set());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const applySeason = async () => {
    setPending(true);
    try {
      const n = await setSeasonFor({ productIds: [...picked], season });
      toast.success(t("{{n}} products set to {{season}}", { n, season: t(SEASON_LABELS[season]) }));
      setPicked(new Set());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setPicked(new Set());
      }}
    >
      <DialogContent className="flex max-h-[90svh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Shop sections, seasons and who it’s for")}</DialogTitle>
          <DialogDescription>
            {t("Tick products, choose a section and apply. Products not in the shop stay hidden on the website.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={show}
              onValueChange={(v) => v && setShow(v as Show)}
            >
              <ToggleGroupItem value="unassigned">{t("Not in the shop")}</ToggleGroupItem>
              <ToggleGroupItem value="all">{t("All active")}</ToggleGroupItem>
            </ToggleGroup>
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Search products")}
                aria-label={t("Search products")}
                className="h-8 ps-8"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allPicked}
              disabled={!visible.length}
              onCheckedChange={(c) =>
                setPicked((prev) => {
                  const next = new Set(prev);
                  for (const p of visible) {
                    if (c) next.add(p._id);
                    else next.delete(p._id);
                  }
                  return next;
                })
              }
            />
            {t("Select all shown ({{n}})", { n: visible.length })}
          </label>
        </div>
        <ul className="-mx-1 min-h-32 flex-1 overflow-y-auto rounded-md border">
          {products === undefined ? (
            <li className="flex justify-center p-6">
              <Spinner />
            </li>
          ) : visible.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {show === "unassigned" ? t("Every active product is in a shop section.") : t("No products match your search.")}
            </li>
          ) : (
            visible.map((p) => (
              <li key={p._id} className="border-b last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted/50">
                  <Checkbox checked={picked.has(p._id)} onCheckedChange={(c) => toggle(p._id, !!c)} />
                  <span dir="auto" className="flex-1 text-sm">
                    {p.name}
                    <span className="ms-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                  </span>
                  {p.audience && p.audience !== "both" && <Badge variant="outline">{t(AUDIENCE_LABELS[p.audience])}</Badge>}
                  {p.season && p.season !== "all" && <Badge variant="outline">{t(SEASON_LABELS[p.season])}</Badge>}
                  {p.shopSection && <Badge variant="secondary">{t(SHOP_SECTION_LABELS[p.shopSection])}</Badge>}
                </label>
              </li>
            ))
          )}
        </ul>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-section">{t("Move to")}</Label>
            <ShopSectionSelect id="bulk-section" value={section} onChange={setSection} className="w-56" />
          </div>
          <Button onClick={() => void apply()} disabled={pending || picked.size === 0}>
            {pending && <Spinner />}
            {t("Apply to {{n}} products", { n: picked.size })}
          </Button>
        </DialogFooter>
        {/* The website's season switch lists off-season products last and stops suggesting them */}
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-season">{t("Season")}</Label>
            <Select value={season} onValueChange={(v) => setSeason(v as Season)}>
              <SelectTrigger id="bulk-season" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_SEASONS.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(SEASON_LABELS[x])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void applySeason()} disabled={pending || picked.size === 0}>
            {t("Set season for {{n}} products", { n: picked.size })}
          </Button>
        </div>
        {/* Who it's for: the website's "Picked for your boy / girl / twins" */}
        <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-audience">{t("For")}</Label>
            <Select value={audience} onValueChange={(v) => setAudience(v as Audience)}>
              <SelectTrigger id="bulk-audience" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((x) => (
                  <SelectItem key={x} value={x}>
                    {t(AUDIENCE_LABELS[x])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => void applyAudience()} disabled={pending || picked.size === 0}>
            {t("Set for {{n}} products", { n: picked.size })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
