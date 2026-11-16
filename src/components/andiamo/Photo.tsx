import Image from "next/image";
import type { HTMLAttributes } from "react";
import { ART, type PlaceKind } from "./art";
import { cx } from "./cx";

export interface PhotoProps extends HTMLAttributes<HTMLSpanElement> {
  /** Photo URL. Remote hosts must be allowed under images.remotePatterns in next.config.ts. */
  src?: string;
  /** The place name; leave empty when the name is printed beside the photo. */
  alt?: string;
  /** Which stand-in scene to draw when there is no photo. */
  kind?: PlaceKind;
  /** Rendered width hint for next/image, e.g. "84px". */
  sizes?: string;
  priority?: boolean;
}

export function Photo({ src, alt = "", kind = "city", sizes = "200px", priority, className, ...rest }: PhotoProps) {
  return (
    <span {...rest} className={cx("an-photo", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} />
      ) : (
        <svg viewBox="0 0 160 120" preserveAspectRatio="xMidYMid slice" role={alt ? "img" : undefined} aria-label={alt || undefined}
          aria-hidden={alt ? undefined : true} dangerouslySetInnerHTML={{ __html: ART[kind] ?? ART.city }} />
      )}
    </span>
  );
}
