"use client";

import type { PlaceKind } from "./art";
import { Icon } from "./Icon";
import { Meta } from "./Meta";
import { Photo } from "./Photo";

export interface SwapOption { title: string; why?: string; photo?: string; kind?: PlaceKind; duration?: string; rating?: string; price?: string }
export interface SwapPopoverProps { replacing: string; options: SwapOption[]; onPick?: (option: SwapOption) => void; onClose?: () => void }

export function SwapPopover({ replacing, options, onPick, onClose }: SwapPopoverProps) {
  return (
    <div className="an-pop" role="dialog" aria-label={`Swap ${replacing}`}>
      <div className="an-pop-head">
        <span className="an-pop-title"><span className="an-overline">Swap</span>{replacing}</span>
        <button type="button" className="an-iconbtn" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
      </div>
      {options.map((o) => (
        <button key={o.title} type="button" className="an-pop-opt" onClick={() => onPick?.(o)}>
          <Photo src={o.photo} kind={o.kind} sizes="64px" className="an-thumb" />
          <span className="an-pop-opt-text">
            <span className="an-pop-opt-title">{o.title}</span>
            {o.why && <span className="an-pop-opt-why">{o.why}</span>}
            <Meta duration={o.duration} rating={o.rating} price={o.price} />
          </span>
        </button>
      ))}
    </div>
  );
}
