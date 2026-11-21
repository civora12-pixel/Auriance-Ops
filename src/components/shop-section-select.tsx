import { useTranslation } from "react-i18next";
import { SHOP_SECTIONS, SHOP_SECTION_LABELS } from "@shared/constants.ts";
import type { ShopSection } from "@shared/constants.ts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";

const NONE = "none";

/** Which customer shop section a product shows in, or "Not in the shop". */
export function ShopSectionSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  value: ShopSection | null;
  onChange: (value: ShopSection | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : (v as ShopSection))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {SHOP_SECTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {t(SHOP_SECTION_LABELS[s])}
          </SelectItem>
        ))}
        <SelectItem value={NONE}>{t("Not in the shop")}</SelectItem>
      </SelectContent>
    </Select>
  );
}
