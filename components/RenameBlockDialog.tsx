"use client";

// Shared "Rename Block" dialog — used on the Reports and Admin / Edit pages.
// Saved month data is matched by block id, so renaming keeps all history.

import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { apiClient } from "@/lib/apiClient";
import { invalidateBlockDefsCache } from "@/lib/useKpiData";

export default function RenameBlockDialog({
  target,
  onClose,
  onRenamed,
}: {
  target: { id: string; name: string } | null;
  onClose: () => void;
  onRenamed: (name: string) => void | Promise<void>;
}) {
  const [name,   setName]   = useState("");
  const [error,  setError]  = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setName(target.name);
    setError("");
  }, [target]);

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!target) return;
    setError("");

    const next = name.trim();
    if (!next) { setError("Block Name is required."); return; }

    setSaving(true);
    try {
      await apiClient(`/api/blocks/${target.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: next }),
      });
      invalidateBlockDefsCache();
      onClose();
      await onRenamed(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename block");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={!!target} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="add-block-panel" aria-describedby={undefined}>
          <form onSubmit={handleSubmit}>
            <div className="add-block-header">
              <Dialog.Title className="alox-title">Rename Block</Dialog.Title>
              <Dialog.Close asChild>
                <button type="button" className="btn btn-ghost btn-icon" aria-label="Close">
                  <X size={15} />
                </button>
              </Dialog.Close>
            </div>
            <div className="add-block-body">
              {error && <div className="add-block-error">{error}</div>}
              <div className="add-block-field" style={{ marginBottom: 0 }}>
                <label className="form-label">Block Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
              </div>
            </div>
            <div className="add-block-footer">
              <Dialog.Close asChild>
                <button type="button" className="btn btn-secondary btn-sm">Cancel</button>
              </Dialog.Close>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
