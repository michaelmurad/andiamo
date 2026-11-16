import type { ReactNode } from "react";
import type { PlaceKind } from "./art";
import { Photo } from "./Photo";

export interface TripHeaderProps { eyebrow?: string; title: string; meta?: string[]; photo?: string; kind?: PlaceKind; children?: ReactNode }

export function TripHeader({ eyebrow, title, meta = [], photo, kind = "city", children }: TripHeaderProps) {
  return (
    <header className="an-trip">
      <Photo src={photo} kind={kind} sizes="100vw" priority className="an-trip-photo" />
      <span className="an-trip-scrim" />
      <div className="an-trip-text">
        {eyebrow && <div className="an-overline an-on-photo">{eyebrow}</div>}
        <h1 className="an-trip-title">{title}</h1>
        {meta.length > 0 && <div className="an-trip-meta">{meta.map((m) => <span key={m}>{m}</span>)}</div>}
      </div>
      {children && <div className="an-trip-actions">{children}</div>}
    </header>
  );
}
