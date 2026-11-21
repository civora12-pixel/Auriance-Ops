import Papa from "papaparse";
import readXlsxFile from "read-excel-file";

export type SheetRow = { shipment: string; status: string; due: number; customer?: string };

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
const find = (headers: string[], ...needles: string[]) =>
  headers.findIndex((h) => needles.some((n) => h.includes(n)));

/** Turns the courier's sheet (any column order) into rows the server understands. */
export function rowsFromTable(table: unknown[][]): { rows: SheetRow[]; error?: string } {
  const headerAt = table.findIndex((r) => r.some((c) => /رقم|shipment|status|حالة/i.test(String(c ?? ""))));
  if (headerAt < 0) return { rows: [], error: "Couldn't find the header row" };
  const headers = table[headerAt].map(norm);
  const orderCol = find(headers, "رقم الطلب", "order");
  const shipmentCol = find(headers, "رقم الشحنة", "shipment", "awb", "tracking");
  const statusCol = find(headers, "حالة", "status");
  const dueCol = find(headers, "المستحق", "due", "net", "صافي");
  const customerCol = find(headers, "المرسل اليه", "المرسل إليه", "customer", "name", "الاسم");
  if (statusCol < 0 || dueCol < 0 || (orderCol < 0 && shipmentCol < 0)) {
    return { rows: [], error: "The sheet needs the shipment number, status and amount due columns" };
  }
  const rows = table
    .slice(headerAt + 1)
    .map((r) => {
      const shipment = String((shipmentCol >= 0 && r[shipmentCol]) || (orderCol >= 0 ? r[orderCol] : "") || "").trim();
      const due = Number(String(r[dueCol] ?? "").replace(/,/g, ""));
      return {
        shipment,
        status: String(r[statusCol] ?? "").trim(),
        due: Number.isFinite(due) ? due : 0,
        customer: customerCol >= 0 ? String(r[customerCol] ?? "").trim() : undefined,
      };
    })
    .filter((r) => r.shipment || r.status);
  return { rows };
}

export async function readSheet(file: File): Promise<unknown[][]> {
  if (/\.csv$/i.test(file.name)) {
    const text = await file.text();
    return Papa.parse<unknown[]>(text, { skipEmptyLines: true }).data;
  }
  return (await readXlsxFile(file)) as unknown[][];
}


/** The courier's account statement PDF → rows (read in the browser, nothing is uploaded). */
export async function readStatementPdf(file: File) {
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }, { rowsFromStatement }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    import("@shared/courier-pdf.ts"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const { height } = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    pages.push({
      height,
      glyphs: content.items
        .filter((it) => "str" in it)
        .map((it) => {
          const item = it as { str: string; transform: number[]; width: number };
          return { str: item.str, x: item.transform[4], top: height - item.transform[5], width: item.width };
        }),
    });
  }
  return rowsFromStatement(pages);
}
