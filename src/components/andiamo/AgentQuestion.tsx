"use client";

import { Button } from "./Button";
import { Icon } from "./Icon";

export interface AgentQuestionProps { question: string; options: string[]; onAnswer?: (option: string) => void }

export function AgentQuestion({ question, options, onAnswer }: AgentQuestionProps) {
  return (
    <div className="an-q" role="group" aria-label={question}>
      <span className="an-q-mark"><Icon name="sparkles" size={20} /></span>
      <div className="an-q-body">
        <p className="an-q-text">{question}</p>
        <div className="an-q-opts">
          {options.map((o) => <Button key={o} size="sm" onClick={() => onAnswer?.(o)}>{o}</Button>)}
        </div>
      </div>
    </div>
  );
}
