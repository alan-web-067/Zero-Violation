// Small "🎯 ≤ 2.00 ✓ / ✗" chip showing whether a block reached its monthly goal.
import { goalMet, RowWithKpi } from "@/lib/kpi";

export default function GoalChip({ row, target }: { row: RowWithKpi; target: number | null | undefined }) {
  if (target === null || target === undefined) return <span className="goal-chip none">—</span>;
  const goal = target * Number(row.periodMonths || 1);
  const met = goalMet(row, target);
  if (met === null) return <span className="goal-chip none" title="No data yet">🎯 ≤ {goal.toFixed(2)}</span>;
  return (
    <span className={`goal-chip ${met ? "met" : "missed"}`} title={met ? "Goal reached" : `Missed by ${(row.kpi.finalKpi - goal).toFixed(2)}`}>
      {met ? "✓" : "✗"} ≤ {goal.toFixed(2)}
    </span>
  );
}
