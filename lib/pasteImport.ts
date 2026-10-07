// Reads monthly numbers copied from Excel / Google Sheets (tab-separated) or a
// CSV file, and matches each line to a block by name.
//
// Expected columns, in this order (a header row is optional and skipped):
//   Block | Team members | Trucks | Clean inspections | Total inspections | Violation points

import type { Row } from "@/lib/kpi";

export const PASTE_FIELDS = ["teamMembers", "trucks", "cleanInspections", "totalInspections", "violationPoints"] as const;
export type PasteField = (typeof PASTE_FIELDS)[number];

export type PasteLine = {
  line: number;                // 1-based line in the pasted text
  name: string;                // block name as pasted
  blockId: string | null;      // matched block, or null
  values: Partial<Record<PasteField, number>>;
  problem: string | null;      // why this line can't be used (null = OK)
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  // CSV: commas, with "quoted, values" kept together.
  const out: string[] = [];
  let cur = "", quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if ((ch === "," || ch === ";") && !quoted) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function toNumber(cell: string): number | null {
  const t = cell.replace(/[\s,]/g, "").trim();
  if (t === "" || t === "-" || t === "—") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

export function parsePaste(text: string, blocks: Pick<Row, "id" | "name">[]): PasteLine[] {
  const byName = new Map(blocks.map((b) => [norm(b.name), String(b.id)]));
  const lines: PasteLine[] = [];

  text.split(/\r?\n/).forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = splitLine(raw).map((c) => c.trim());
    const name = cells[0] ?? "";
    const numbers = cells.slice(1, 1 + PASTE_FIELDS.length).map(toNumber);

    // Header row: no numbers at all in the number columns.
    if (i === 0 && numbers.every((n) => n === null || Number.isNaN(n))) return;

    const values: Partial<Record<PasteField, number>> = {};
    let problem: string | null = null;
    PASTE_FIELDS.forEach((f, j) => {
      const n = numbers[j];
      if (n === null || n === undefined) return;
      if (Number.isNaN(n) || n < 0) problem = problem ?? `"${cells[j + 1]}" is not a valid number`;
      else values[f] = Math.round(n * 100) / 100;
    });

    const blockId = byName.get(norm(name)) ?? null;
    if (!name) problem = "No block name";
    else if (!blockId) problem = `No block called "${name}"`;
    else if (!Object.keys(values).length && !problem) problem = "No numbers on this line";
    if (!problem && values.cleanInspections !== undefined && values.totalInspections !== undefined
        && values.cleanInspections > values.totalInspections) {
      problem = "Clean inspections are more than total inspections";
    }
    lines.push({ line: i + 1, name, blockId, values, problem });
  });
  return lines;
}
