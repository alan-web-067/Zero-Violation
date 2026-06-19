 "use client";

import * as Select from "@radix-ui/react-select";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { ChevronDown, Check } from "lucide-react";
import { MONTHS, monthsForQuarter } from "@/lib/kpi";

export type PeriodState = {
  year: number;
  quarter: number;
  month: number;
  view: "month" | "quarter";
};

type Props = {
  period: PeriodState;
  onChange: (next: PeriodState) => void;
  disabled?: boolean;
};

const currentYear = new Date().getFullYear();

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <Select.Item value={value} className="select-item">
      <Select.ItemText>{children}</Select.ItemText>
      <Select.ItemIndicator className="select-item-indicator">
        <Check size={12} />
      </Select.ItemIndicator>
    </Select.Item>
  );
}

export default function PeriodSelector({ period, onChange, disabled }: Props) {
  const visibleMonths = monthsForQuarter(period.quarter);

  return (
    <div className="period-bar">
      {/* Year */}
      <Select.Root
        value={String(period.year)}
        onValueChange={(v) => onChange({ ...period, year: Number(v) })}
        disabled={disabled}
      >
        <Select.Trigger className="select-trigger">
          <Select.Value />
          <Select.Icon><ChevronDown size={13} /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-content" position="popper" sideOffset={4}>
            <Select.Viewport className="select-viewport">
              {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {/* View toggle */}
      <ToggleGroup.Root
        type="single"
        value={period.view}
        onValueChange={(v) => v && !disabled && onChange({ ...period, view: v as "month" | "quarter" })}
        className="toggle-group"
      >
        <ToggleGroup.Item value="month" className="toggle-item" disabled={disabled}>
          Monthly
        </ToggleGroup.Item>
        <ToggleGroup.Item value="quarter" className="toggle-item" disabled={disabled}>
          Quarterly
        </ToggleGroup.Item>
      </ToggleGroup.Root>

      {/* Quarter */}
      <Select.Root
        value={String(period.quarter)}
        onValueChange={(v) => {
          const q = Number(v);
          const months = monthsForQuarter(q);
          onChange({
            ...period,
            quarter: q,
            month: months.includes(period.month) ? period.month : months[0],
          });
        }}
        disabled={disabled}
      >
        <Select.Trigger className="select-trigger">
          <Select.Value />
          <Select.Icon><ChevronDown size={13} /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-content" position="popper" sideOffset={4}>
            <Select.Viewport className="select-viewport">
              {[1, 2, 3, 4].map((q) => (
                <SelectItem key={q} value={String(q)}>Q{q}</SelectItem>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      {/* Month — only in monthly view */}
      {period.view === "month" && (
        <Select.Root
          value={String(period.month)}
          onValueChange={(v) => onChange({ ...period, month: Number(v) })}
          disabled={disabled}
        >
          <Select.Trigger className="select-trigger">
            <Select.Value />
            <Select.Icon><ChevronDown size={13} /></Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content className="select-content" position="popper" sideOffset={4}>
              <Select.Viewport className="select-viewport">
                {visibleMonths.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {MONTHS.find((x) => x.n === m)?.name ?? `Month ${m}`}
                  </SelectItem>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      )}

      {/* Period label */}
      <span className="period-label">
        {period.view === "month"
          ? `${MONTHS.find((x) => x.n === period.month)?.name ?? ""} ${period.year}`
          : `Q${period.quarter} ${period.year}`}
      </span>
    </div>
  );
}
