"use client";

import React from "react";

type KPI = { name: string; value: number };

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

function colorStops(v: number) {
  if (v === 0) return ["#d1d5db", "#e5e7eb", "#9ca3af"]; // gray for zero
  if (v <= 2) return ["#22c55e", "#a3e635", "#16a34a"];
  if (v <= 4) return ["#f59e0b", "#facc15", "#d97706"];
  if (v <= 6) return ["#fb923c", "#f59e0b", "#ea580c"];
  return ["#ef4444", "#fb7185", "#dc2626"];
}

export default function BlocksKPIChartPro({
  data,
  max = 10,
  onClose,
  title = "Blocks KPI Chart",
}: {
  data: KPI[];
  max?: number;
  onClose?: () => void;
  title?: string;
}) {
  const LABEL_W = 110; // a bit wider so labels don't break (FIRST B BLOCK)
  const ROW_H = 16;

  const ticks = [0, 2, 4, 6, 8, 10];

  return (
    <div className="w-full max-w-[760px] rounded-xl bg-white border border-black/5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-[13px] font-semibold text-black/85">{title}</div>
        {onClose && (
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-full border border-black/10 hover:bg-black/5"
          >
            ✕
          </button>
        )}
      </div>

      {/* Rows */}
      <div className="px-3 pb-3">
        <div className="rounded-lg border border-black/5 p-2">
          {data.map((r, idx) => {
            const v = clamp(r.value, 0, max);
            const pct = (v / max) * 100;
            const [c1, c2, pillBorder] = colorStops(v);

            // pill position: 0 => exactly at start, max => stays inside end
            const pillLeft = `clamp(0px, calc(${pct}% - 26px), calc(100% - 56px))`;

            return (
              <div
                key={r.name}
                className={[
                  "rounded-xl",
                  idx % 2 === 0 ? "bg-black/[0.03]" : "bg-white",
                  idx !== data.length - 1 ? "mb-2" : "",
                ].join(" ")}
              >
                {/* GRID: label column + track column (axis will use same grid) */}
                <div
                  className="grid items-center gap-3 px-3 py-2"
                  style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}
                >
                  {/* Label */}
                  <div className="text-[12px] font-extrabold text-black leading-tight">
                    {r.name}
                  </div>

                  {/* Track */}
                  <div
                    className="relative overflow-hidden bg-black/10"
                    style={{
                      height: ROW_H,
                      borderRadius: 999,
                      border: "1px solid rgba(0,0,0,0.15)",
                    }}
                  >
                    {/* Fill */}
                    <div
                      className="absolute left-0 top-0 h-full"
                      style={{
                        width: `${pct}%`,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${c1}, ${c2})`,
                      }}
                    />

                    {/* Value pill */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 text-[11px] font-semibold px-2 py-[1px] rounded-full bg-white"
                      style={{
                        left: pillLeft,
                        border: `2px solid ${pillBorder}`,
                        color: v === 0 ? "#6b7280" : "#111827",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {v.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ✅ AXIS (perfectly aligned because it's the SAME GRID) */}
        <div
          className="grid items-start gap-3 px-3 mt-3"
          style={{ gridTemplateColumns: `${LABEL_W}px 1fr` }}
        >
          {/* empty label column */}
          <div />

          {/* track column */}
          <div>
            <div className="h-px bg-black/20" />

            <div className="relative h-6 mt-2 text-[12px] text-black/70 select-none">
              {ticks.map((t) => {
                const left = (t / max) * 100;

                // 0 => no translate, middle => -50%, max => -100% (so it stays inside)
                const transform =
                  t === 0 ? "translateX(0)" : t === max ? "translateX(-100%)" : "translateX(-50%)";

                return (
                  <span
                    key={t}
                    className="absolute"
                    style={{ left: `${left}%`, transform }}
                  >
                    {t}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
