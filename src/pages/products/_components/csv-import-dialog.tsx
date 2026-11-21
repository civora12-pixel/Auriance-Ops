import { useRef, useState } from "react";
import type { ReactNode } from "react";
import Papa from "papaparse";
import { useTranslation } from "react-i18next";
import { AlertTriangle, CheckCircle2, Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { getErrorMessage } from "@/lib/api.ts";
import { downloadCsv } from "@/lib/csv.ts";
import type { CsvRow } from "@/lib/csv.ts";
import { normalizeHeader } from "./csv-import.ts";
import type { ImportResult, RawRow } from "./csv-import.ts";

/** The server accepts at most this many rows per request. */
export const IMPORT_BATCH_SIZE = 1000;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const SHOWN_MESSAGES = 8;

export type ImportSpec<T extends { row: number }> = {
  title: string;
  description: ReactNode;
  /** Columns that must be in the header row (normalized names) */
  required: string[];
  optional: string[];
  templateName: string;
  templateRows: CsvRow[];
  /** Builds a row for the server, or returns an error for it */
  parseRow: (raw: RawRow, row: number) => { value: T } | { error: string };
  preview: {
    header: string;
    cell: (value: T) => ReactNode;
    className?: string;
  }[];
  /** Rows with the same key are sent in the same request (product + its variants) */
  groupKey?: (value: T) => string;
  submit: (batch: T[]) => Promise<ImportResult>;
  /** "12 products imported" */
  describeResult: (result: ImportResult) => string;
};

type Parsed<T> = { fileName: string; rows: T[]; errors: string[] };

function chunk<T>(rows: T[], groupKey?: (value: T) => string): T[][] {
  const groups: T[][] = [];
  if (groupKey) {
    const byKey = new Map<string, T[]>();
    for (const r of rows) {
      const k = groupKey(r);
      const g = byKey.get(k);
      if (g) g.push(r);
      else {
        const created = [r];
        byKey.set(k, created);
        groups.push(created);
      }
    }
  } else {
    for (const r of rows) groups.push([r]);
  }
  const batches: T[][] = [];
  let current: T[] = [];
  for (const g of groups) {
    if (current.length && current.length + g.length > IMPORT_BATCH_SIZE) {
      batches.push(current);
      current = [];
    }
    current.push(...g);
  }
  if (current.length) batches.push(current);
  return batches;
}

function MessageList({
  messages,
  tone,
}: {
  messages: string[];
  tone: "error" | "warning";
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? messages : messages.slice(0, SHOWN_MESSAGES);
  return (
    <Alert variant={tone === "error" ? "destructive" : "default"}>
      <AlertTriangle />
      <AlertTitle>
        {tone === "error"
          ? t("{{count}} rows skipped", { count: messages.length })
          : t("{{count}} warnings", { count: messages.length })}
      </AlertTitle>
      <AlertDescription>
        <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto ps-4">
          {shown.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
        {messages.length > SHOWN_MESSAGES && (
          <button
            type="button"
            className="mt-1 text-xs font-medium underline underline-offset-2"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded
              ? t("Show fewer")
              : t("…and {{count}} more", {
                  count: messages.length - SHOWN_MESSAGES,
                })}
          </button>
        )}
      </AlertDescription>
    </Alert>
  );
}

/** Upload → preview → import in batches → result. Used for product import and bulk restock. */
export function CsvImportDialog<T extends { row: number }>({
  open,
  onOpenChange,
  spec,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spec: ImportSpec<T>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        {open && (
          <ImportBody
            spec={spec}
            pending={pending}
            setPending={setPending}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportBody<T extends { row: number }>({
  spec,
  pending,
  setPending,
  onDone,
}: {
  spec: ImportSpec<T>;
  pending: boolean;
  setPending: (p: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<Parsed<T> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setParsed(null);
    setFileError(null);
    setResult(null);
    setProgress(null);
  };

  const onFile = (file: File | undefined) => {
    reset();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv"))
      return setFileError(
        t(
          "Choose a .csv file. In Excel or Sheets use File → Save as / Download → CSV.",
        ),
      );
    if (file.size > MAX_FILE_BYTES)
      return setFileError(
        t("That file is larger than 5 MB. Split it into smaller files."),
      );
    Papa.parse<RawRow>(file, {
      header: true,
      skipEmptyLines: false,
      transformHeader: normalizeHeader,
      complete: (res) => {
        const headers = res.meta.fields ?? [];
        const missing = spec.required.filter((c) => !headers.includes(c));
        if (missing.length) {
          setFileError(
            t(
              "Missing columns: {{columns}}. Download the template to see the expected layout.",
              { columns: missing.join(", ") },
            ),
          );
          return;
        }
        const rows: T[] = [];
        const errors: string[] = [];
        res.data.forEach((raw, i) => {
          // Row 1 is the header; keep the spreadsheet's numbering even across blank lines
          const row = i + 2;
          if (
            !Object.values(raw).some((v) => typeof v === "string" && v.trim())
          )
            return;
          const out = spec.parseRow(raw, row);
          if ("error" in out)
            errors.push(
              t("Row {{row}}: {{message}}", { row, message: out.error }),
            );
          else rows.push(out.value);
        });
        if (rows.length + errors.length === 0)
          return setFileError(t("The file has no data rows."));
        if (rows.length + errors.length > MAX_ROWS)
          return setFileError(
            t(
              "The file has more than {{max}} rows. Split it into smaller files.",
              { max: MAX_ROWS.toLocaleString() },
            ),
          );
        setParsed({ fileName: file.name, rows, errors });
      },
      error: (err) =>
        setFileError(
          t("Couldn't read the file: {{message}}", { message: err.message }),
        ),
    });
  };

  const runImport = async () => {
    if (!parsed?.rows.length) return;
    const batches = chunk(parsed.rows, spec.groupKey);
    const total: ImportResult = {
      imported: 0,
      errors: [...parsed.errors],
      warnings: [],
    };
    const extra: ImportResult[] = [];
    setPending(true);
    try {
      for (const [i, batch] of batches.entries()) {
        if (batches.length > 1)
          setProgress(
            t("Importing part {{part}} of {{parts}}…", {
              part: i + 1,
              parts: batches.length,
            }),
          );
        try {
          const res = await spec.submit(batch);
          extra.push(res);
          total.imported += res.imported;
          total.errors.push(...res.errors);
          total.warnings!.push(...(res.warnings ?? []));
        } catch (e) {
          total.errors.push(
            t("Rows {{from}}–{{to}}: {{message}}", {
              from: batch[0].row,
              to: batch[batch.length - 1].row,
              message: getErrorMessage(e),
            }),
          );
        }
      }
      total.errors.sort((a, b) => rowOf(a) - rowOf(b));
      setResult({
        ...total,
        summary: spec.describeResult(mergeResults(extra, total)),
      });
    } finally {
      setPending(false);
      setProgress(null);
    }
  };

  const ready = parsed?.rows.length ?? 0;

  return (
    <div className="grid min-w-0 gap-4">
      <DialogHeader>
        <DialogTitle>{spec.title}</DialogTitle>
        <DialogDescription>{spec.description}</DialogDescription>
      </DialogHeader>

      {result ? (
        <div className="grid gap-3">
          <Alert>
            <CheckCircle2 />
            <AlertTitle>{result.summary}</AlertTitle>
            {result.errors.length > 0 && (
              <AlertDescription>
                {t("Fix the skipped rows and import them again.")}
              </AlertDescription>
            )}
          </Alert>
          {result.errors.length > 0 && (
            <MessageList messages={result.errors} tone="error" />
          )}
          {result.warnings && result.warnings.length > 0 && (
            <MessageList messages={result.warnings} tone="warning" />
          )}
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="rounded-md border border-dashed p-4 text-sm">
            <p>
              <span className="font-medium">{t("Required columns:")}</span>{" "}
              <span dir="ltr">{spec.required.join(", ")}</span>
            </p>
            {spec.optional.length > 0 && (
              <p className="text-muted-foreground">
                <span className="font-medium">{t("Optional:")}</span>{" "}
                <span dir="ltr">{spec.optional.join(", ")}</span>
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={pending}
              >
                <FileUp />
                {parsed ? t("Choose another file") : t("Choose CSV file")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadCsv(spec.templateName, spec.templateRows, [
                    ...spec.required,
                    ...spec.optional,
                  ])
                }
              >
                <Download />
                {t("Download template")}
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              tabIndex={-1}
              aria-label={t("CSV file")}
              onChange={(e) => {
                onFile(e.target.files?.[0]);
                // Choosing the same file again should re-read it
                e.target.value = "";
              }}
            />
          </div>

          {fileError && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>{t("Can't import this file")}</AlertTitle>
              <AlertDescription>{fileError}</AlertDescription>
            </Alert>
          )}

          {parsed && (
            <>
              <p className="text-sm">
                <span className="font-medium">{parsed.fileName}</span>:{" "}
                {parsed.errors.length > 0
                  ? t("{{count}} rows ready, {{problems}} with problems", {
                      count: ready,
                      problems: parsed.errors.length,
                    })
                  : t("{{count}} rows ready", { count: ready })}
              </p>
              {ready > 0 && (
                <div className="max-h-56 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">{t("Row")}</TableHead>
                        {spec.preview.map((c) => (
                          <TableHead key={c.header} className={c.className}>
                            {c.header}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsed.rows.slice(0, 5).map((r) => (
                        <TableRow key={r.row}>
                          <TableCell className="text-muted-foreground tabular-nums">
                            {r.row}
                          </TableCell>
                          {spec.preview.map((c) => (
                            <TableCell key={c.header} className={c.className}>
                              {c.cell(r)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {ready > 5 && (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground">
                      {t("…and {{count}} more rows", { count: ready - 5 })}
                    </p>
                  )}
                </div>
              )}
              {parsed.errors.length > 0 && (
                <MessageList messages={parsed.errors} tone="error" />
              )}
            </>
          )}
        </div>
      )}

      <DialogFooter className="items-center">
        {progress && (
          <span className="me-auto text-sm text-muted-foreground">
            {progress}
          </span>
        )}
        {result ? (
          <>
            <Button type="button" variant="outline" onClick={reset}>
              {t("Import another file")}
            </Button>
            <Button type="button" onClick={onDone}>
              {t("Done")}
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={onDone}
              disabled={pending}
            >
              {t("Cancel")}
            </Button>
            <Button
              type="button"
              onClick={runImport}
              disabled={pending || ready === 0}
            >
              {pending && <Spinner />}
              {ready > 0
                ? t("Import {{count}} rows", { count: ready })
                : t("Import")}
            </Button>
          </>
        )}
      </DialogFooter>
    </div>
  );
}

// Messages start with their row number ("Row 12: …", "Rows 3–9: …") in any language
const rowOf = (message: string) =>
  Number(/\d+/.exec(message)?.[0] ?? Number.MAX_SAFE_INTEGER);

/** Keeps spec-specific counters (variants, units) summed across batches. */
function mergeResults(
  parts: ImportResult[],
  total: ImportResult,
): ImportResult {
  const merged: Record<string, unknown> = { ...total };
  for (const part of parts) {
    for (const [k, v] of Object.entries(part)) {
      if (typeof v === "number" && k !== "imported")
        merged[k] = ((merged[k] as number | undefined) ?? 0) + v;
    }
  }
  return merged as ImportResult;
}
