import { Icon } from "./Icon";

export interface UndoBarProps { message: string; onUndo?: () => void; undoLabel?: string }

export function UndoBar({ message, onUndo, undoLabel = "Undo" }: UndoBarProps) {
  return (
    <div className="an-undo" role="status">
      <Icon name="sparkles" size={20} />
      <span className="an-undo-msg">{message}</span>
      <button type="button" className="an-undo-btn" onClick={onUndo}><Icon name="undo-2" />{undoLabel}</button>
    </div>
  );
}
