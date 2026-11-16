import { Icon } from "./Icon";

export interface TravelLegProps { minutes: number; mode?: "walk" | "transit"; note?: string }

export function TravelLeg({ mode = "walk", minutes, note }: TravelLegProps) {
  return (
    <div className="an-leg">
      <span className="an-leg-line" />
      <Icon name={mode === "transit" ? "tram-front" : "footprints"} size={14} />
      <span>{minutes} min {mode === "transit" ? "by tram" : "walk"}{note ? ` · ${note}` : ""}</span>
    </div>
  );
}
