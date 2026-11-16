import type { PlaceKind } from "./art";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

export interface BrowseRowProps { name: string; type?: string; photo?: string; kind?: PlaceKind; rating?: string; reason?: string; added?: boolean; onAdd?: () => void }

export function BrowseRow({ name, type, photo, kind = "city", rating, reason, added = false, onAdd }: BrowseRowProps) {
  return (
    <div className="an-row">
      <Photo src={photo} kind={kind} sizes="56px" className="an-thumb" />
      <div className="an-row-text">
        <span className="an-row-name">{name}</span>
        <span className="an-row-type">
          {type}
          {rating && <span className="an-meta-item"><Icon name="star" size={14} className="an-star" />{rating}</span>}
        </span>
      </div>
      {reason ? (
        <span className="an-row-reason"><Icon name="triangle-alert" size={14} />{reason}</span>
      ) : added ? (
        <span className="an-row-added"><Icon name="check" />Added</span>
      ) : (
        <Button size="sm" icon="plus" onClick={onAdd} aria-label={`Add ${name}`}>Add</Button>
      )}
    </div>
  );
}
