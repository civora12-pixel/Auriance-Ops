/**
 * Reads the courier's account statement PDF (LYNX "حساب العملاء") into rows.
 * The PDF draws Arabic one glyph at a time in visual order (right to left
 * shown left to right), so glyphs are grouped into words by position, put
 * back in reading order, and assigned to the table's columns by their x
 * position under the header.
 */

export type PdfGlyph = { str: string; x: number; top: number; width: number };
export type PdfPage = { height: number; glyphs: PdfGlyph[] };

export type StatementRow = {
  /** The courier's order number (what the app stores as the shipment number) */
  shipment: string;
  date: string;
  customer: string;
  phone: string;
  status: string;
  total: number | null;
  paid: number | null;
  shipping: number | null;
  /** Net due to us (negative: the courier charged us) */
  due: number;
};

type Word = { text: string; x0: number; x1: number; top: number };

const AR_DIGITS = /[٠-٩۰-۹]/g;
const toLatinDigits = (s: string) =>
  s.replace(AR_DIGITS, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d) >= 0 ? "٠١٢٣٤٥٦٧٨٩".indexOf(d) : "۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** Visual-order presentation forms → logical Arabic; runs of digits keep their order. */
function logical(visual: string): string {
  const w = visual.normalize("NFKC");
  if (!/[؀-ۿ]/.test(w)) return w;
  const parts = w.match(/[0-9٠-٩.,/]+|[^0-9٠-٩.,/]/gu) ?? [];
  return parts.reverse().join("");
}

const clean = (t: string) =>
  t
    .replace(/[-⛟]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Glyphs → words: same line, touching or nearly (bold text drawn twice is merged). */
function wordsOf(glyphs: PdfGlyph[]): Word[] {
  const seen = new Set<string>();
  const list = glyphs
    .filter((g) => g.str.trim())
    .filter((g) => {
      const key = `${g.str}|${Math.round(g.x / 2)}|${Math.round(g.top / 2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.top - b.top || a.x - b.x);
  const lines: PdfGlyph[][] = [];
  for (const g of list) {
    const line = lines.find((l) => Math.abs(l[0].top - g.top) < 2.5);
    if (line) line.push(g);
    else lines.push([g]);
  }
  const words: Word[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let cur: { parts: string[]; x0: number; x1: number; top: number } | null = null;
    for (const g of line) {
      // Spaces inside one item split words too
      for (const [i, piece] of g.str.split(/\s+/).entries()) {
        if (!piece) continue;
        const startsNew = !cur || i > 0 || g.x - cur.x1 > 1.6;
        if (startsNew) {
          if (cur) words.push({ text: logical(cur.parts.join("")), x0: cur.x0, x1: cur.x1, top: cur.top });
          cur = { parts: [piece], x0: g.x, x1: g.x + g.width, top: g.top };
        } else {
          cur!.parts.push(piece);
          cur!.x1 = Math.max(cur!.x1, g.x + g.width);
        }
      }
    }
    if (cur) words.push({ text: logical(cur.parts.join("")), x0: cur.x0, x1: cur.x1, top: cur.top });
  }
  return words;
}

const unify = (s: string) => s.replace(/[إأآ]/g, "ا").replace(/ى/g, "ي");
const LABELS: Record<string, string> = {
  ملحوظة: "note",
  للعميل: "due",
  الشحن: "shipping",
  المدفوع: "paid",
  الحالة: "status",
  المحافظة: "area",
  اليه: "name",
  التاريخ: "date",
  الشحنة: "shipment",
  الطلب: "order",
};

/** A status from its words, whatever order they came out in. */
function statusOf(text: string): string {
  if (text.includes("جزئ")) return "تم التسليم ومرتجع جزئي";
  if (text.includes("مرتجع") && text.includes("ولم")) return "مرتجع ولم يدفع الشحن";
  if (text.includes("مرتجع")) return "مرتجع ودفع الشحن";
  if (text.includes("تهرب")) return "تهرب";
  if (text.includes("تم")) return "تم التسليم ودفع كلي";
  return clean(text);
}

/** The first number in a cell (a stray second number never gets glued onto it). */
function num(text: string): number | null {
  const s = toLatinDigits(text).replace(/,/g, "");
  const m = s.match(/(-?)(\d+(?:\.\d+)?)(-?)/);
  if (!m) return null;
  const n = Number(m[2]);
  return m[1] || m[3] ? -n : n;
}

/** The statement's footer: the totals line ("الإجمالي (27 أوردر)"), signatures, page number. */
const isFooter = (w: Word) => /جما|توقيع|الختم|صفحة/.test(unify(w.text)) || /أوردر|اوردر/.test(w.text);

export function rowsFromStatement(pages: PdfPage[]): StatementRow[] {
  const rows: StatementRow[] = [];
  for (const page of pages) {
    const words = wordsOf(page.glyphs);
    const head = words.find((w) => w.text === "الحالة");
    if (!head) continue;
    const cols: Record<string, number> = {};
    for (const w of words) {
      if (Math.abs(w.top - head.top) > 3) continue;
      const key = LABELS[unify(w.text)] ?? LABELS[w.text] ?? (w.text.includes("جما") ? "total" : undefined);
      if (key && cols[key] === undefined) cols[key] = (w.x0 + w.x1) / 2;
    }
    if (cols.order === undefined || cols.status === undefined || cols.due === undefined) continue;
    const centers = Object.entries(cols);
    const colOf = (x: number) => centers.reduce((best, c) => (Math.abs(c[1] - x) < Math.abs(best[1] - x) ? c : best))[0];
    const numeric = centers.filter(([k]) => ["due", "shipping", "paid", "total"].includes(k));
    const statusLeft = cols.status - 16;
    const noteEdge = cols.note !== undefined ? (cols.note + cols.due) / 2 : -Infinity;
    const body = words.filter((w) => w.top > head.top + 5);
    const anchors = body
      .filter((w) => /^\d{4,7}$/.test(toLatinDigits(w.text)) && Math.abs((w.x0 + w.x1) / 2 - cols.order) < 15)
      .sort((a, b) => a.top - b.top);
    // The last order ends where the totals line (or signatures) start, not at the page's end
    const lastTop = anchors.at(-1)?.top ?? head.top;
    const footerTop = Math.min(
      page.height,
      ...body.filter((w) => w.top > lastTop + 2 && isFooter(w)).map((w) => w.top - 3),
    );
    anchors.forEach((a, i) => {
      const lo = i === 0 ? head.top + 5 : (anchors[i - 1].top + a.top) / 2;
      const hi = i === anchors.length - 1 ? footerTop : (a.top + anchors[i + 1].top) / 2;
      const cell: Record<string, Word[]> = {};
      for (const w of body.filter((w) => w.top >= lo && w.top < hi)) {
        const cx = (w.x0 + w.x1) / 2;
        const isNumber = /^-?[0-9٠-٩.,]+-?$/.test(w.text);
        const key =
          isNumber && cx > noteEdge && cx < statusLeft
            ? numeric.reduce((best, c) => (Math.abs(c[1] - cx) < Math.abs(best[1] - cx) ? c : best))[0]
            : colOf(cx);
        (cell[key] ??= []).push(w);
      }
      // Lines top to bottom, words right to left (Arabic reading order)
      const text = (key: string) =>
        clean(
          (cell[key] ?? [])
            .slice()
            .sort((p, q) => Math.round(p.top / 4) - Math.round(q.top / 4) || q.x1 - p.x1)
            .map((w) => w.text)
            .join(" "),
        );
      const nameText = text("name");
      const phone = (toLatinDigits(nameText).match(/\d{10,12}/g) ?? []).join(" ");
      // The date wraps over two lines ("17-10-" / "2026")
      const date = toLatinDigits(text("date")).replace(/\s+/g, "").match(/\d{2}-\d{2}-\d{4}/)?.[0] ?? "";
      rows.push({
        shipment: toLatinDigits(a.text),
        date,
        customer: clean(nameText.replace(/[0-9٠-٩]{10,12}/g, "")),
        phone,
        status: statusOf((cell.status ?? []).map((w) => w.text).join(" ")),
        total: num(text("total")),
        paid: num(text("paid")),
        shipping: num(text("shipping")),
        due: num(text("due")) ?? 0,
      });
    });
  }
  return mergeRepeats(rows);
}

/**
 * The same shipment listed twice (refused, then delivered on a second try):
 * one row with the net amount; delivered wins over returned.
 */
export function mergeRepeats(rows: StatementRow[]): StatementRow[] {
  const out = new Map<string, StatementRow>();
  for (const r of rows) {
    const prev = out.get(r.shipment);
    if (!prev) {
      out.set(r.shipment, { ...r });
      continue;
    }
    const delivered = [prev.status, r.status].find((s) => s.includes("تم التسليم"));
    prev.status = delivered ?? prev.status;
    prev.paid = (prev.paid ?? 0) + (r.paid ?? 0);
    prev.shipping = (prev.shipping ?? 0) + (r.shipping ?? 0);
    prev.due = Math.round((prev.due + r.due) * 100) / 100;
  }
  return [...out.values()];
}
