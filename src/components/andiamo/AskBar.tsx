"use client";

import { Chip } from "./Chip";
import { Icon } from "./Icon";

export interface AskBarProps {
  suggestions?: string[];
  placeholder?: string;
  value?: string;
  onChange?: (text: string) => void;
  onSubmit?: (text: string) => void;
  /** A suggestion sends at once; it does not fill the input. */
  onSuggestion?: (text: string) => void;
}

export function AskBar({ suggestions = [], placeholder = "Ask for a change", value, onChange, onSubmit, onSuggestion }: AskBarProps) {
  return (
    <div className="an-ask">
      {suggestions.length > 0 && (
        <div className="an-ask-chips">
          {suggestions.map((s) => <Chip key={s} onClick={() => onSuggestion?.(s)}>{s}</Chip>)}
        </div>
      )}
      <form
        className="an-ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          const text = value ?? String(new FormData(e.currentTarget).get("ask") ?? "");
          if (text.trim()) onSubmit?.(text);
        }}
      >
        <Icon name="sparkles" size={20} className="an-ask-spark" />
        <input className="an-ask-input" name="ask" type="text" aria-label={placeholder} placeholder={placeholder} value={value}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined} />
        <button type="submit" className="an-ask-send" aria-label="Send"><Icon name="arrow-up" size={20} /></button>
      </form>
    </div>
  );
}
