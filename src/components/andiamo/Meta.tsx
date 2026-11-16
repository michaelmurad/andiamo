import { Icon } from "./Icon";

export interface MetaProps { duration?: string; rating?: string; price?: string }

export function Meta({ duration, rating, price }: MetaProps) {
  if (!duration && !rating && !price) return null;
  return (
    <span className="an-meta">
      {duration && <span className="an-meta-item"><Icon name="clock" size={14} />{duration}</span>}
      {rating && <span className="an-meta-item"><Icon name="star" size={14} className="an-star" />{rating}</span>}
      {price && <span className="an-meta-item">{price}</span>}
    </span>
  );
}
