import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> { selected?: boolean; icon?: IconName }

export function Chip({ selected = false, icon, className, children, ...rest }: ChipProps) {
  return (
    <button type="button" aria-pressed={selected} {...rest} className={cx("an-chip", selected && "is-selected", className)}>
      {selected ? <Icon name="check" /> : icon ? <Icon name={icon} /> : null}
      {children}
    </button>
  );
}
