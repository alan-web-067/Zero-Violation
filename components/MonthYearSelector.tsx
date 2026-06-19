"use client";

import * as Select from "@radix-ui/react-select";
import { ChevronDown, Check } from "lucide-react";
import { MONTHS } from "@/lib/kpi";

export type MonthYear = { year: number; month: number };

type Props = {
  value: MonthYear;
  onChange: (next: MonthYear) => void;
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

// RBAC FEATURE — simple Year + Month picker for the HR/Accounting role
// dashboards. Unlike PeriodSelector, there is no Quarterly view here: every
// HR/Accounting stat is framed as "this month vs. last month", so a quarter
// toggle would be misleading.
export default function MonthYearSelector({ value, onChange, disabled }: Props) {
  return (
    <div className="period-bar">
      <Select.Root
        value={String(value.year)}
        onValueChange={(v) => onChange({ ...value, year: Number(v) })}
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

      <Select.Root
        value={String(value.month)}
        onValueChange={(v) => onChange({ ...value, month: Number(v) })}
        disabled={disabled}
      >
        <Select.Trigger className="select-trigger">
          <Select.Value />
          <Select.Icon><ChevronDown size={13} /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-content" position="popper" sideOffset={4}>
            <Select.Viewport className="select-viewport">
              {MONTHS.map((m) => (
                <SelectItem key={m.n} value={String(m.n)}>{m.name}</SelectItem>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>

      <span className="period-label">
        {MONTHS.find((x) => x.n === value.month)?.name ?? ""} {value.year}
      </span>
    </div>
  );
}
