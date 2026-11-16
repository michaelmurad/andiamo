"use client";

import { cx } from "./cx";

export interface PaceToggleProps { options?: string[]; value?: string; onChange?: (value: string) => void; label?: string }

export function PaceToggle({ options = ["Relaxed", "Balanced", "Packed"], value, onChange, label = "Pace" }: PaceToggleProps) {
  return (
    <div className="an-pace" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} className={cx("an-pace-opt", o === value && "is-selected")} onClick={() => onChange?.(o)}>
          {o}
        </button>
      ))}
    </div>
  );
}
