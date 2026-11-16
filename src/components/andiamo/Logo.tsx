import { cx } from "./cx";

export interface LogoProps {
  markOnly?: boolean;
  className?: string;
}

/** Andiamo's archway A. A brand signature, separate from interface icons. */
export function Logo({ markOnly = false, className }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Andiamo"
      className={cx("inline-flex w-fit items-center gap-3 text-brand", className)}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 48 48"
        fill="none"
        className="h-10 w-10 shrink-0"
      >
        <path
          d="M7 41 20.5 9.5Q24 1.5 27.5 9.5L41 41H34L24 16 14 41Z"
          fill="currentColor"
        />
        <path
          d="M10 33C18 23 29 36 39 25"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {!markOnly && (
        <span aria-hidden="true" className="font-display text-day-title font-normal">
          Andiamo
        </span>
      )}
    </span>
  );
}
