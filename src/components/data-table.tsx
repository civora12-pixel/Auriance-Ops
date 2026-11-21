import { useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { TableHead, TableRow } from "@/components/ui/table.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import { useFormat } from "@/lib/format.ts";
import { cn } from "@/lib/utils.ts";

export type SortDir = "asc" | "desc";

/**
 * List state (filters, tab, page, sort) kept in the URL, so it survives reloads,
 * back/forward and shared links. Values equal to their default are left out of the URL.
 */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [params, setParams] = useSearchParams();
  // Defaults are a literal at the call site; key on their content
  const defaultsKey = JSON.stringify(defaults);
  const state = useMemo(() => {
    const d = JSON.parse(defaultsKey) as T;
    const out = { ...d };
    for (const key of Object.keys(d) as (keyof T)[]) {
      const v = params.get(key as string);
      if (v !== null) out[key] = v as T[keyof T];
    }
    return out;
  }, [params, defaultsKey]);

  const update = useCallback(
    (
      patch: Partial<T>,
      options: { resetPage?: boolean } = { resetPage: true },
    ) => {
      const d = JSON.parse(defaultsKey) as T;
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === d[key]) next.delete(key);
            else next.set(key, value as string);
          }
          if (options.resetPage && !("page" in patch)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams, defaultsKey],
  );

  return [state, update] as const;
}

/** A sortable column header (button with an arrow showing the current direction). "right" aligns to the end side. */
export function SortableHead({
  column,
  sort,
  dir,
  onSort,
  children,
  className,
  align = "left",
}: {
  column: string;
  sort: string;
  dir: SortDir;
  onSort: (column: string, dir: SortDir) => void;
  children: ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sort === column;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={cn(align === "right" && "text-end", className)}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() =>
          onSort(column, active && dir === "desc" ? "asc" : "desc")
        }
        className={cn(
          "-mx-2 inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          active && "text-foreground",
        )}
      >
        {children}
        <Icon className={cn("size-3.5", !active && "opacity-40")} aria-hidden />
      </button>
    </TableHead>
  );
}

/** "Showing 26–50 of 312", page size, and previous/next. */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes = [25, 50, 100],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
  pageSizes?: number[];
  className?: string;
}) {
  const { t } = useTranslation();
  const { formatNumber } = useFormat();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground",
        className,
      )}
    >
      <p aria-live="polite">
        {total === 0
          ? t("No results")
          : t("Showing {{from}}–{{to}} of {{total}}", {
              from: formatNumber(from),
              to: formatNumber(to),
              total: formatNumber(total),
            })}
      </p>
      <div className="flex items-center gap-2">
        {onPageSize && (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSize(Number(v))}
          >
            <SelectTrigger
              size="sm"
              className="w-[110px]"
              aria-label={t("Rows per page")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizes.map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {t("{{size}} / page", { size: s })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={t("Previous page")}
        >
          <ChevronLeft className="rtl:rotate-180" />
        </Button>
        <span className="min-w-16 text-center tabular-nums">
          {page} / {pages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label={t("Next page")}
        >
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
    </div>
  );
}

/**
 * A table row that opens `to` on click or Enter, with a single tab stop
 * (instead of a link in every cell). Inner buttons and checkboxes keep working.
 */
export function LinkRow({
  to,
  label,
  className,
  children,
}: {
  to: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const isInteractive = (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    !!target.closest(
      "button, a, input, label, [role=checkbox], [role=menuitem]",
    );
  return (
    <TableRow
      tabIndex={0}
      role="link"
      aria-label={label}
      className={cn(
        "cursor-pointer focus-visible:bg-muted focus-visible:outline-none",
        className,
      )}
      onClick={(e) => {
        if (isInteractive(e.target) && e.target !== e.currentTarget) return;
        if (e.metaKey || e.ctrlKey) window.open(to, "_blank");
        else navigate(to);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) navigate(to);
      }}
    >
      {children}
    </TableRow>
  );
}
