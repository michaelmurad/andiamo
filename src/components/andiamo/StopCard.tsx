"use client";

import type { KeyboardEvent } from "react";
import type { PlaceKind } from "./art";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { Meta } from "./Meta";
import { Photo } from "./Photo";

const KIND_ICON: Record<PlaceKind, IconName> = { art: "palette", history: "landmark", food: "utensils", outdoors: "trees", evening: "moon", city: "map-pin" };

export interface StopCardProps {
  time?: string;
  title: string;
  why?: string;
  photo?: string;
  kind?: PlaceKind;
  category?: string;
  duration?: string;
  rating?: string;
  price?: string;
  warning?: string;
  /** The AI just altered this card. Clear on the next edit or on undo. */
  changed?: boolean;
  /** Makes the whole card the swap control. */
  onSwap?: () => void;
  className?: string;
}

export function StopCard({ time, title, why, photo, kind = "city", category, duration, rating, price, warning, changed = false, onSwap, className }: StopCardProps) {
  const action = onSwap
    ? {
        role: "button",
        tabIndex: 0,
        onClick: onSwap,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSwap();
          }
        },
        "aria-label": `${title}${time ? `, ${time}` : ""}. Swap`,
      }
    : {};
  return (
    <article {...action} className={cx("an-stop", changed && "is-changed", onSwap && "is-action", className)}>
      <div className="an-stop-main">
        <Photo src={photo} kind={kind} sizes="84px" className="an-stop-photo" />
        <div className="an-stop-body">
          <div className="an-stop-head">
            {time && <span className="an-stop-time">{time}</span>}
            {category && <span className="an-stop-cat"><Icon name={KIND_ICON[kind]} size={14} />{category}</span>}
            {changed && <span className="an-badge-changed"><Icon name="sparkles" size={12} />Changed</span>}
          </div>
          <h3 className="an-stop-title">{title}</h3>
          {why && <p className="an-stop-why">{why}</p>}
          <Meta duration={duration} rating={rating} price={price} />
        </div>
        {onSwap && <span className="an-stop-swap"><Icon name="arrow-left-right" /></span>}
      </div>
      {warning && <p className="an-warning"><Icon name="triangle-alert" /><span>{warning}</span></p>}
    </article>
  );
}
