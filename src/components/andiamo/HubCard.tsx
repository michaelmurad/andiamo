import type { ButtonHTMLAttributes } from "react";
import type { PlaceKind } from "./art";
import { cx } from "./cx";
import { Icon } from "./Icon";
import { Photo } from "./Photo";

export interface HubCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name: string;
  blurb?: string;
  photo?: string;
  kind?: PlaceKind;
  selected?: boolean;
  /** The "Pick for me" card: solid brand, no photo. */
  auto?: boolean;
}

export function HubCard({ name, blurb, photo, kind = "city", selected = false, auto = false, className, ...rest }: HubCardProps) {
  return (
    <button type="button" aria-pressed={selected} {...rest} className={cx("an-hub", selected && "is-selected", auto && "is-auto", className)}>
      {!auto && <Photo src={photo} kind={kind} sizes="176px" className="an-hub-photo" />}
      {!auto && <span className="an-hub-scrim" />}
      {auto && <Icon name="sparkles" size={24} className="an-hub-spark" />}
      {selected && <span className="an-hub-check"><Icon name="check" /></span>}
      <span className="an-hub-text">
        <span className="an-hub-name">{name}</span>
        {blurb && <span className="an-hub-blurb">{blurb}</span>}
      </span>
    </button>
  );
}
