"use client";

// Shared "+ Add Block" dialog — used on the Reports and Admin / Edit pages.
// Creates the block in the registry (/api/blocks); the caller reloads its rows
// in `onAdded` (after invalidating the block-defs cache).

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { invalidateBlockDefsCache } from "@/lib/useKpiData";

function emptyToNumber(s: string) {
  const t = s.trim();
  return t === "" || Number.isNaN(Number(t)) ? null : Number(t);
}

export default function AddBlockDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (name: string) => void | Promise<void>;
}) {
  const [blockName,   setBlockName]   = useState("");
  const [blockTeam,   setBlockTeam]   = useState("");
  const [blockTrucks, setBlockTrucks] = useState("");
  const [blockKpi,    setBlockKpi]    = useState("");
  const [blockNotes,  setBlockNotes]  = useState("");
  const [formError,   setFormError]   = useState("");
  const [formSaving,  setFormSaving]  = useState(false);

  // Start with a clean form every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setBlockName("");
    setBlockTeam("");
    setBlockTrucks("");
    setBlockKpi("");
    setBlockNotes("");
    setFormError("");
  }, [open]);

  async function handleAddBlock(e: { preventDefault(): void }) {
    e.preventDefault();
    setFormError("");

    const name = blockName.trim();
    if (!name) { setFormError("Block Name is required."); return; }

    const team = emptyToNumber(blockTeam);
    if (team === null) { setFormError("Number of Team Members must be a number."); return; }

    const trucks = emptyToNumber(blockTrucks);
    if (trucks === null) { setFormError("Number of Trucks must be a number."); return; }

    const kpi = emptyToNumber(blockKpi);
    if (kpi === null) { setFormError("Starting KPI Score must be a number."); return; }

    setFormSaving(true);
    try {
      await apiClient("/api/blocks", {
        method: "POST",
        body: JSON.stringify({ name, teamMembers: team, trucks, startingKpi: kpi, notes: blockNotes.trim() }),
      });
      invalidateBlockDefsCache();
      onOpenChange(false);
      await onAdded(name);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to add block");
    } finally {
      setFormSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
          <form onSubmit={handleAddBlock}>
            <div className="add-block-header">
              <Dialog.Title className="alox-title">+ Add Block</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close">
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              {formError && <div className="add-block-error">{formError}</div>}
              <div className="add-block-field">
                <label className="form-label">Block Name</label>
                <input
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                  placeholder="e.g. E BLOCK"
                  autoFocus
                  required
                />
              </div>
              <div className="add-block-field">
                <label className="form-label">Number of Team Members</label>
                <input
                  inputMode="numeric"
                  value={blockTeam}
                  onChange={(e) => setBlockTeam(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                />
              </div>
              <div className="add-block-field">
                <label className="form-label">Number of Trucks</label>
                <input
                  inputMode="numeric"
                  value={blockTrucks}
                  onChange={(e) => setBlockTrucks(e.target.value.replace(/[^\d]/g, ""))}
                  placeholder="0"
                />
              </div>
              <div className="add-block-field">
                <label className="form-label">Starting KPI Score</label>
                <input
                  inputMode="decimal"
                  value={blockKpi}
                  onChange={(e) => setBlockKpi(e.target.value.replace(/[^\d.]/g, ""))}
                  placeholder="e.g. 85.5"
                />
              </div>
              <div className="add-block-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Notes / Description (optional)</label>
                <textarea
                  value={blockNotes}
                  onChange={(e) => setBlockNotes(e.target.value)}
                  placeholder="Optional notes…"
                  rows={3}
                />
              </div>
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="btn btn-primary btn-sm" disabled={formSaving}>
                {formSaving ? "Saving…" : "Save Block"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
