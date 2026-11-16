"use client";

import { Fragment } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";
import { StopCard, type StopCardProps } from "./StopCard";
import { TravelLeg, type TravelLegProps } from "./TravelLeg";

export type SlotLabel = "Morning" | "Lunch" | "Afternoon" | "Dinner" | "Evening";
const SLOT_ICON: Record<SlotLabel, IconName> = { Morning: "coffee", Lunch: "utensils", Afternoon: "sun", Dinner: "wine", Evening: "moon" };

export interface DayStop extends Omit<StopCardProps, "onSwap"> { leg?: TravelLegProps }
export interface DaySlot { label: SlotLabel; stops: DayStop[] }
export interface DayColumnProps { eyebrow?: string; title: string; summary?: string; slots: DaySlot[]; onSwap?: (stop: DayStop) => void; className?: string }

export function DayColumn({ eyebrow, title, summary, slots, onSwap, className }: DayColumnProps) {
  return (
    <section className={cx("an-day", className)}>
      <header className="an-day-head">
        {eyebrow && <div className="an-overline">{eyebrow}</div>}
        <h2 className="an-day-title">{title}</h2>
        {summary && <div className="an-day-sum">{summary}</div>}
      </header>
      {slots.map((slot) => (
        <div key={slot.label} className="an-slot">
          <div className="an-slot-label"><Icon name={SLOT_ICON[slot.label]} size={14} />{slot.label}</div>
          {slot.stops.map((s) => {
            const { leg, ...stop } = s;
            return (
              <Fragment key={s.title}>
                {leg && <TravelLeg {...leg} />}
                <StopCard {...stop} onSwap={onSwap ? () => onSwap(s) : undefined} />
              </Fragment>
            );
          })}
        </div>
      ))}
    </section>
  );
}
