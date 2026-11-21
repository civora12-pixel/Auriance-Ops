import { useCallback } from "react";
import { api, useQuery } from "@/lib/api.ts";
import type { FieldSection } from "@shared/constants.ts";

/**
 * `isFieldVisible(section, field)`: fields are visible unless an admin hid them
 * (and while the settings load).
 */
export function useFieldVisibility() {
  const config = useQuery(api.admin.fields.get, undefined, { refetchInterval: false });
  const isFieldVisible = useCallback(
    (section: FieldSection, field: string): boolean => config?.[section]?.[field] !== false,
    [config],
  );
  return { isFieldVisible, isLoading: config === undefined };
}
