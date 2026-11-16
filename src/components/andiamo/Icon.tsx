import {
  ArrowLeftRight, ArrowUp, CalendarDays, Check, ChevronRight, Clock, Coffee, Footprints, Landmark, Map, MapPin, Moon, Palette, Plus,
  BusFront, Search, Ship, SlidersHorizontal, Sparkles, Star, Sun, TrainFront, TramFront, Trees, TriangleAlert, Undo2, Utensils, Wine, X, type LucideProps,
} from "lucide-react";
import { cx } from "./cx";

const ICONS = {
  "triangle-alert": TriangleAlert, check: Check, "arrow-left-right": ArrowLeftRight, plus: Plus, "undo-2": Undo2, x: X, clock: Clock,
  "map-pin": MapPin, search: Search, sparkles: Sparkles, "arrow-up": ArrowUp, "calendar-days": CalendarDays, utensils: Utensils,
  landmark: Landmark, palette: Palette, trees: Trees, footprints: Footprints, star: Star, moon: Moon, sun: Sun, coffee: Coffee,
  wine: Wine, "tram-front": TramFront, map: Map, "sliders-horizontal": SlidersHorizontal, "chevron-right": ChevronRight,
  "bus-front": BusFront, ship: Ship, "train-front": TrainFront,
} as const;

export type IconName = keyof typeof ICONS;
export interface IconProps extends Omit<LucideProps, "ref"> { name: IconName; size?: number; label?: string }

export function Icon({ name, size = 16, label, className, ...rest }: IconProps) {
  const Glyph = ICONS[name];
  return <Glyph {...rest} size={size} className={cx("an-icon", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />;
}
