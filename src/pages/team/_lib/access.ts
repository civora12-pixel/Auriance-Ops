import i18n from "@/lib/i18n.ts";
import {
  ACCESS_LEVEL_LABELS,
  SECTIONS,
  SECTION_LABELS,
} from "@shared/constants.ts";
import type { Permissions } from "@shared/constants.ts";
import { matchingPreset } from "./preset.ts";
import { PERMISSION_PRESETS } from "@shared/constants.ts";

/** What a member can open, in words, for the team list. */
export function describeAccess(p: Permissions): string {
  const preset = matchingPreset(p);
  if (preset) return i18n.t(PERMISSION_PRESETS[preset].label);
  const parts = SECTIONS.filter((s) => p.access[s]).map(
    (s) =>
      `${i18n.t(SECTION_LABELS[s])} (${i18n.t(ACCESS_LEVEL_LABELS[p.access[s]!])})`,
  );
  if (parts.length === 0) return i18n.t("No access yet");
  return new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(
    parts,
  );
}
