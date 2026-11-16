"use client";

import { Chip } from "./Chip";
import { cx } from "./cx";
import { Icon } from "./Icon";

export interface AskBarProps {
  suggestions?: string[];
  placeholder?: string;
  value?: string;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  /** A suggestion sends at once; it does not fill the input. */
  onSuggestion?: (text: string) => void;
  /** Takes no input. */
  disabled?: boolean;
  /** The agent is working on a request: the bar shows `pendingLabel` and moves until it's done. Implies disabled. */
  pending?: boolean;
  pendingLabel?: string;
}

export function AskBar({ suggestions = [], placeholder = "Ask for a change", value, onChange, onSubmit, onSuggestion, disabled = false, pending = false, pendingLabel = "Working on it" }: AskBarProps) {
  const off = disabled || pending;
  return (
    <div className="an-ask">
      {suggestions.length > 0 && (
        <div className="an-ask-chips">
          {suggestions.map((s) => <Chip key={s} disabled={off} onClick={() => onSuggestion?.(s)}>{s}</Chip>)}
        </div>
      )}
      <form
        className={cx("an-ask-form", pending && "is-pending")}
        aria-busy={pending}
        onSubmit={(e) => {
          e.preventDefault();
          const text = value ?? String(new FormData(e.currentTarget).get("ask") ?? "");
          if (!off && text.trim()) onSubmit?.(text);
        }}
      >
        <Icon name="sparkles" size={20} className="an-ask-spark" />
        {/* The input stays mounted while pending, so what was typed is still there if the change fails. */}
        <input className={cx("an-ask-input", pending && "sr-only")} name="ask" type="text" aria-label={placeholder} placeholder={placeholder} value={value} disabled={off}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
        {pending && <span className="an-ask-shimmer" role="status">{pendingLabel}</span>}
        <button type="submit" className={cx("an-ask-send", !pending && "disabled:opacity-50")} aria-label={pending ? pendingLabel : "Send"} disabled={off}>
          <Icon name={pending ? "loader-circle" : "arrow-up"} size={20} className={pending ? "animate-spin" : undefined} />
        </button>
        {pending && <span className="an-ask-progress" aria-hidden />}
      </form>
    </div>
  );
}
