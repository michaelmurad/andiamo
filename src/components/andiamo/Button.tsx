import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon, type IconName } from "./Icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "photo";
  size?: "lg" | "md" | "sm";
  icon?: IconName;
}

export function Button({ variant = "secondary", size = "md", icon, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} className={cx("an-btn", `an-btn-${variant}`, `an-btn-${size}`, className)}>
      {icon && <Icon name={icon} size={size === "lg" ? 20 : 16} />}
      {children}
    </button>
  );
}
