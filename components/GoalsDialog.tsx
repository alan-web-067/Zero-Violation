"use client";

// "🎯 Goals" dialog on Admin / Edit — a monthly target Final KPI for each block.
// Empty = no goal. Goals show on the Dashboard, Leaderboard and block profiles.

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { fetchBlockDefs, invalidateBlockDefsCache, BlockDef } from "@/lib/useKpiData";

export default function GoalsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (changed: number) => void | Promise<void>;
}) {
  const [blocks, setBlocks] = useState<BlockDef[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    invalidateBlockDefsCache();
    fetchBlockDefs().then((defs) => {
      const active = defs.filter((d) => d.status === "active");
      setBlocks(active);
      setValues(Object.fromEntries(active.map((d) => [d.id, d.targetKpi == null ? "" : String(d.targetKpi)])));
    });
  }, [open]);

  function setAll(v: string) {
    setValues(Object.fromEntries(blocks.map((b) => [b.id, v])));
  }

  async function save(e: { preventDefault(): void }) {
    e.preventDefault();
    setError("");
    const changes = blocks.filter((b) => (values[b.id] ?? "").trim() !== (b.targetKpi == null ? "" : String(b.targetKpi)));
    for (const b of changes) {
      const v = values[b.id].trim();
      if (v !== "" && (Number.isNaN(Number(v)) || Number(v) < 0)) {
        setError(`${b.name}: the goal must be a number of 0 or more (or empty for no goal).`);
        return;
      }
    }
    setSaving(true);
    try {
      for (const b of changes) {
        const v = values[b.id].trim();
        await apiClient(`/api/blocks/${b.id}`, { method: "PATCH", body: JSON.stringify({ targetKpi: v === "" ? null : Number(v) }) });
      }
      invalidateBlockDefsCache();
      onOpenChange(false);
      await onSaved(changes.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save goals");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="add-block-panel goals-panel" aria-describedby={undefined}>
          <form onSubmit={save}>
            <div className="add-block-header">
              <Dialog.Title className="alox-title">🎯 Monthly goals</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close"><X size={15} /></button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              <p className="goals-help">
                Target <strong>Final KPI</strong> per month — a block meets its goal when its Final KPI is at or below
                the number (lower is better). Leave empty for no goal. Quarters use three times the goal.
              </p>
              <div className="goals-presets">
                <span>Set all to:</span>
                {["2", "4", "6"].map((v) => (
                  <button key={v} type="button" className="btn btn-secondary btn-sm" onClick={() => setAll(v)}>≤ {v}</button>
                ))}
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll("")}>Clear all</button>
              </div>
              {error && <div className="add-block-error">{error}</div>}
              <div className="goals-list">
                {blocks.map((b) => (
                  <label key={b.id} className="goals-row">
                    <span className="goals-name">{b.name}</span>
                    <span className="goals-input">
                      <span>≤</span>
                      <input
                        inputMode="decimal"
                        placeholder="no goal"
                        value={values[b.id] ?? ""}
                        onChange={(e) => setValues((p) => ({ ...p, [b.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? "Saving…" : "Save goals"}</button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
