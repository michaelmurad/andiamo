import { Icon, type IconName } from "./Icon";

/** How the traveller gets there. "transit" is whatever local bus or tram serves the city; "boat" is Venice's vaporetto. */
export type LegMode = "walk" | "transit" | "boat" | "train";

export interface TravelLegProps {
  minutes: number;
  mode?: LegMode;
  /** Opens turn-by-turn directions for this leg in Google Maps. */
  directionsUrl?: string;
}

const LEG: Record<LegMode, { icon: IconName; label: string }> = {
  walk: { icon: "footprints", label: "walk" },
  transit: { icon: "bus-front", label: "by transit" },
  boat: { icon: "ship", label: "by vaporetto" },
  train: { icon: "train-front", label: "by train" },
};

/** Times are estimated from straight-line distance (see travel() in src/lib/geo.ts), so they read as approximate. */
export function TravelLeg({ mode = "walk", minutes, directionsUrl }: TravelLegProps) {
  const { icon, label } = LEG[mode];
  return (
    <div className="an-leg">
      <span className="an-leg-line" />
      <Icon name={icon} size={14} />
      <span className="an-leg-text" title="Estimated from distance">
        ~{minutes} min {label}
      </span>
      {directionsUrl && (
        <a className="an-leg-link" href={directionsUrl} target="_blank" rel="noopener noreferrer">
          Directions
        </a>
      )}
    </div>
  );
}
