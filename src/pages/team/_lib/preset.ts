import { PERMISSION_PRESETS, SECTIONS } from "@shared/constants.ts";
import type { PermissionPreset, Permissions } from "@shared/constants.ts";

const PRESETS = Object.keys(PERMISSION_PRESETS) as PermissionPreset[];

/** True when the permissions match a preset exactly. */
export function matchingPreset(p: Permissions): PermissionPreset | undefined {
  return PRESETS.find((key) => {
    const preset: Permissions = PERMISSION_PRESETS[key].permissions;
    return (
      preset.canShipAndReturn === p.canShipAndReturn &&
      SECTIONS.every(
        (s) => (preset.access[s] ?? "none") === (p.access[s] ?? "none"),
      )
    );
  });
}
