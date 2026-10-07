"use client";

// "📋 Paste from Excel" on Admin / Edit: paste the month's numbers copied from
// Excel / Google Sheets (or open a CSV file), check the preview, then apply them
// to the edit grid. Nothing is saved until you click Save Draft or Publish.

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Upload } from "lucide-react";
import type { Row } from "@/lib/kpi";
import { parsePaste, PasteField, PASTE_FIELDS } from "@/lib/pasteImport";

const LABEL: Record<PasteField, string> = {
  teamMembers: "Team",
  trucks: "Trucks",
  cleanInspections: "Clean",
  totalInspections: "Total",
  violationPoints: "Viol. pts",
};

const EXAMPLE = "Block\tTeam members\tTrucks\tClean inspections\tTotal inspections\tViolation points\nA BLOCK\t5\t210\t95\t100\t4";

export default function PasteImportDialog({
  open,
  onOpenChange,
  blocks,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blocks: Row[];
  onApply: (updates: Array<{ blockId: string; values: Partial<Record<PasteField, number>> }>) => void;
}) {
  const [text, setText] = useState("");
  const lines = useMemo(() => (text.trim() ? parsePaste(text, blocks) : []), [text, blocks]);
  const good = lines.filter((l) => !l.problem);
  const bad = lines.filter((l) => l.problem);

  function close(o: boolean) {
    if (!o) setText("");
    onOpenChange(o);
  }

  async function openFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
  }

  function apply() {
    onApply(good.map((l) => ({ blockId: l.blockId!, values: l.values })));
    close(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="add-block-panel paste-panel" aria-describedby={undefined}>
          <div className="add-block-header">
            <Dialog.Title className="alox-title">📋 Paste from Excel</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
            </Dialog.Close>
          </div>
          <div className="add-block-body">
            <p className="goals-help">
              In Excel or Google Sheets, select the rows and press <strong>Ctrl + C</strong>, then paste here with <strong>Ctrl + V</strong>.
              Columns in this order: <strong>Block · Team members · Trucks · Clean inspections · Total inspections · Violation points</strong>.
              A header row is fine. Empty cells keep the current number.
            </p>
            <textarea
              className="paste-box"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={EXAMPLE}
              rows={6}
              autoFocus
              spellCheck={false}
            />
            <div className="paste-actions">
              <label className="btn btn-secondary btn-sm paste-file">
                <Upload size={13} /> Open CSV file
                <input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={(e) => openFile(e.target.files?.[0])} hidden />
              </label>
              {lines.length > 0 && (
                <span className="paste-summary">
                  <strong style={{ color: "#047857" }}>{good.length} ready</strong>
                  {bad.length > 0 && <> · <strong style={{ color: "#b91c1c" }}>{bad.length} skipped</strong></>}
                </span>
              )}
            </div>

            {lines.length > 0 && (
              <div className="table-wrap paste-preview">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Block</th>
                      {PASTE_FIELDS.map((f) => <th key={f} className="num">{LABEL[f]}</th>)}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.line} className={l.problem ? "paste-bad" : undefined}>
                        <td><strong>{l.name || "—"}</strong></td>
                        {PASTE_FIELDS.map((f) => <td key={f} className="num">{l.values[f] ?? "—"}</td>)}
                        <td style={{ fontSize: 12 }}>{l.problem ? `✖ ${l.problem}` : "✓"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="add-block-footer">
            <Dialog.Close asChild>
              <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
            </Dialog.Close>
            <button type="button" className="btn btn-primary btn-sm" onClick={apply} disabled={!good.length}>
              Apply {good.length || ""} block{good.length === 1 ? "" : "s"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
