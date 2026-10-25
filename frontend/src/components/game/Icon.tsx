/**
 * The storybook's ink icons: 24×24, drawn in code like the rest of the art.
 * Ink outline (currentColor, round caps), one flat paper-palette fill, a slight
 * hand-drawn wobble. Fills come from CSS classes (.icon .f-*) so they follow
 * the --sb-* tokens. Decorative unless given a title.
 */

import type { ReactNode } from "react";

export type IconName =
  | "lute"
  | "keys"
  | "mic"
  | "book"
  | "lock"
  | "wolf"
  | "portal"
  | "pine"
  | "dune"
  | "city"
  | "moon"
  | "camel"
  | "hourglass"
  | "bard"
  | "heart"
  | "star"
  | "check"
  | "cross"
  | "note"
  | "pause"
  | "headphones"
  | "speaker";

const ICONS: Record<IconName, ReactNode> = {
  lute: (
    <g transform="translate(1.2 0.4) rotate(38 12 12)">
      <path className="f-wood" d="M11 10.1 L11.2 3.7 L12.9 3.6 L13.1 10.1 Z" />
      <path className="f-wood" d="M11.2 3.7 L12.1 1.6 L14 2.2 L12.9 3.6 Z" />
      <path
        className="f-wood"
        d="M12 9.3 C14.7 9.2 15.6 11.8 16.8 14.1 C18.1 16.8 16.7 21.6 12.1 21.6 C7.3 21.7 6 16.9 7.3 14.2 C8.4 11.9 9.3 9.4 12 9.3 Z"
      />
      <circle className="f-ink ns" cx="12" cy="15.4" r="1.7" />
      <path className="thin" d="M10.1 19.1 L13.9 19" />
    </g>
  ),
  keys: (
    <>
      <path
        className="f-paper"
        d="M4.8 3.3 C9.6 3.1 14.4 3.4 19.3 3.4 C20.4 3.4 20.9 4 20.9 5 L20.7 12.1 L20.6 19.2 C20.6 20.3 20 20.8 19 20.8 L11.8 20.6 L5 20.7 C3.9 20.7 3.4 20.1 3.4 19 L3.3 11.9 L3.4 4.8 C3.4 3.8 3.9 3.3 4.8 3.3 Z"
      />
      <path className="thin" d="M5.8 17.3 L11.6 17.5 L17.4 17.2 L17.6 11.4 L17.4 5.7" />
      <path d="M9.7 9.2 L11.8 7.7 L11.9 14.1" />
    </>
  ),
  mic: (
    <>
      <path
        className="f-paper"
        d="M12 2.8 C13.9 2.8 15.1 4 15.1 5.9 L15.2 11.2 C15.2 13.1 13.9 14.3 12 14.3 C10.1 14.3 8.9 13.1 8.9 11.2 L8.8 5.9 C8.8 4 10.1 2.8 12 2.8 Z"
      />
      <path d="M5.8 10.6 C5.9 14.6 8.6 17.4 12 17.4 C15.4 17.4 18.1 14.6 18.2 10.6" />
      <path d="M12 17.4 L12.1 20.8 M8.6 21 L12 20.7 L15.4 20.9" />
    </>
  ),
  book: (
    <>
      <path className="f-parch" d="M12 6.4 C9.6 4.6 6.4 4.3 3.2 5.1 L3.4 11.8 L3.3 18.4 C6.5 17.6 9.6 17.9 12 19.7 Z" />
      <path className="f-parch" d="M12 6.4 C14.4 4.6 17.6 4.3 20.8 5.1 L20.6 11.8 L20.7 18.4 C17.5 17.6 14.4 17.9 12 19.7 Z" />
      <path className="f-rose thin" d="M15.4 4.9 L15.6 12.8 L16.8 11.5 L18.1 12.7 L17.9 4.6 Z" />
    </>
  ),
  lock: (
    <>
      <path d="M8.2 10.6 L8.1 7.6 C8.1 5 9.8 3.3 12 3.3 C14.3 3.3 15.9 5 15.9 7.6 L15.9 10.6" />
      <path
        className="f-gold-deep"
        d="M6.2 10.4 L12.1 10.6 L17.8 10.5 C18.7 10.5 19.2 11 19.2 11.9 L19 19.5 C19 20.4 18.5 20.9 17.6 20.9 L11.9 20.7 L6.4 20.8 C5.5 20.8 5 20.3 5 19.4 L4.9 11.8 C4.9 10.9 5.4 10.4 6.2 10.4 Z"
      />
      <path d="M12 14.2 L12.1 17.1" />
    </>
  ),
  wolf: (
    <>
      <path
        className="f-wolf"
        d="M4.3 9.6 L5.4 3.2 L9.4 6.8 C11.1 6.2 12.9 6.2 14.6 6.8 L18.6 3.2 L19.7 9.6 C20.9 12.1 20.1 15.1 17.7 16.6 L13.9 20.3 C12.8 21.3 11.2 21.3 10.1 20.3 L6.3 16.6 C3.9 15.1 3.1 12.1 4.3 9.6 Z"
      />
      <path d="M8.3 11.5 L10.3 12.6 M15.7 11.5 L13.7 12.6" />
      <path className="f-ink thin" d="M10.6 16.1 L13.4 16.2 L12 17.8 Z" />
    </>
  ),
  portal: (
    <>
      <path
        className="f-portal"
        d="M12 2.6 C16.8 2.5 20.1 6.8 20 12.1 C19.9 17.5 16.5 21.5 12 21.4 C7.3 21.5 4 17.3 4 12 C4 6.7 7.4 2.6 12 2.6 Z"
      />
      <path d="M12.1 12.2 C13 11.4 14.2 12.2 13.9 13.4 C13.5 15 11 15.4 9.9 13.9 C8.6 12.1 9.6 9.3 12.1 8.9 C14.9 8.5 16.9 10.7 16.5 13.6" />
    </>
  ),
  pine: (
    <>
      <path
        className="f-pine"
        d="M12 2.4 L16.2 8.1 L14.3 8.2 L18.2 13.3 L16 13.4 L20.1 18.6 L12 18.3 L3.9 18.7 L8 13.4 L5.8 13.3 L9.7 8.2 L7.8 8.1 Z"
      />
      <path d="M12 18.8 L12.1 21.6" />
    </>
  ),
  dune: (
    <>
      <path
        className="f-gold-soft"
        d="M9.2 2.9 C6.6 3.5 5.1 6.1 5.8 8.7 C6.5 11 8.9 12.2 11.2 11.4 C9.1 10.4 7.9 8.2 8.3 5.9 C8.5 4.8 8.8 3.8 9.2 2.9 Z"
      />
      <path className="f-sand" d="M7.6 20.4 C10.4 13.6 15.4 12.4 21 17.1 L21.1 20.5 L14.3 20.2 Z" />
      <path className="f-sand" d="M2.8 20.6 C4.6 15.6 9 14.8 13.6 20.6 L8.2 20.3 Z" />
    </>
  ),
  city: (
    <>
      <path className="f-night" d="M3 21 L3.1 10.4 L7.8 10.2 L7.9 4.2 L14 3.9 L14.1 11.6 L20.9 11.4 L21 21 L12 20.7 Z" />
      <path
        className="f-gold ns"
        d="M9.8 6.4 h1.8 v1.8 h-1.8 Z M9.8 10 h1.8 v1.8 h-1.8 Z M9.9 13.6 h1.8 v1.8 h-1.8 Z M4.9 13 h1.8 v1.8 h-1.8 Z M16.4 14.2 h1.8 v1.8 h-1.8 Z M16.5 17.4 h1.8 v1.6 h-1.8 Z"
      />
    </>
  ),
  moon: (
    <path
      className="f-gold-soft"
      d="M15.3 3 C10.3 3.2 6.5 7.3 6.6 12.3 C6.7 17.4 10.9 21.3 15.9 21 C17.6 20.9 19.2 20.3 20.5 19.4 C15.8 18.9 12.5 15 12.7 10.4 C12.9 7.2 14.8 4.5 17.6 3.3 C16.9 3.1 16.1 3 15.3 3 Z"
    />
  ),
  camel: (
    <>
      <path
        className="f-sand"
        d="M3.8 13.2 C3.9 10.6 5.7 9.3 7.7 9.5 C9 6.3 12.4 6 13.9 9 C14.6 10.3 15.4 10.7 16.2 10 L16.9 6.4 C17.2 5 18.3 4.4 19.6 4.8 L21 5.7 L20.8 7 L19.3 7.1 L18.7 11.3 C18.3 13.6 16.7 14.8 14.7 15 L10.4 14.8 L6.2 15 C4.8 15 3.8 14.2 3.8 13.2 Z"
      />
      <path d="M6.6 15 L6.4 20.6 M9.1 15 L9.3 20.6 M13.3 15 L13.1 20.6 M15.8 14.8 L16 20.6" />
    </>
  ),
  hourglass: (
    <>
      <path className="f-gold thin" d="M9 7.2 L15 7.2 C14.4 8.7 12.9 9.8 12 10.6 C11.1 9.8 9.6 8.7 9 7.2 Z" />
      <path className="f-gold thin" d="M8.4 19 C9.3 16.6 10.9 15.7 12 15.7 C13.1 15.7 14.7 16.6 15.6 19 Z" />
      <path d="M7.2 5 C7.1 9.2 10.6 10.3 10.6 12 C10.6 13.7 7.1 14.8 7.2 19 M16.8 5 C16.9 9.2 13.4 10.3 13.4 12 C13.4 13.7 16.9 14.8 16.8 19" />
      <path className="f-wood" d="M4.2 2.3 L12 2.6 L19.8 2.5 L19.7 4.9 L12 4.7 L4.3 4.8 Z" />
      <path className="f-wood" d="M4.3 19.2 L12 19.4 L19.7 19.1 L19.8 21.6 L12 21.3 L4.2 21.5 Z" />
    </>
  ),
  bard: (
    <>
      <path className="f-gold" d="M13.2 8.4 C14.6 4.8 17.6 2.8 21 2.4 C20.5 5.6 18.1 8.4 14.4 9.2 Z" />
      <path className="thin" d="M14.4 8.6 C16.5 6.6 18.5 4.6 20.6 2.7" />
      <path
        className="f-rose"
        d="M3.4 14.6 C3.3 10.2 7.8 7.6 12.4 7.6 C17.4 7.6 21 10.1 20.6 13.5 C20.3 15.6 17.6 16.3 12.4 16.3 C7.4 16.4 3.5 16.5 3.4 14.6 Z"
      />
      <path d="M5.4 16.4 C9.3 18 15.9 18 19.4 16" />
    </>
  ),
  heart: (
    <path
      className="f-heart"
      d="M12 20.6 C9.4 18.7 3.2 14.7 3.2 9.2 C3.2 6.2 5.4 4 8 4 C9.8 4 11.2 5 12 6.6 C12.8 5 14.2 4 16 4 C18.6 4 20.8 6.2 20.8 9.2 C20.8 14.7 14.6 18.7 12 20.6 Z"
    />
  ),
  star: <path className="f-gold" d="M12 2.5 C12.7 8 14.6 10.8 21.5 12 C14.6 13.3 12.8 16 12 21.5 C11.3 16 9.4 13.2 2.5 12 C9.4 10.7 11.2 8 12 2.5 Z" />,
  check: <path className="thick" d="M4.6 12.6 C6.4 14.4 8 16.1 9.6 17.9 C12.6 14 15.9 10.1 19.5 6.3" />,
  cross: <path className="thick" d="M6.2 6 C9.9 9.7 14.1 14 17.9 18.1 M17.9 6 C14.1 9.8 10 14.1 6.1 17.9" />,
  note: (
    <>
      <path
        className="f-ink"
        d="M5.2 17.9 C5 16.2 6.6 14.6 8.6 14.4 C10.3 14.2 11.6 15.1 11.7 16.5 C11.9 18.2 10.3 19.8 8.3 20 C6.6 20.2 5.3 19.3 5.2 17.9 Z"
      />
      <path d="M11.6 16.4 L11.7 10 L11.8 3.6 C13.6 6.2 17.5 6.8 17.1 11.6" />
    </>
  ),
  pause: (
    <path
      className="f-ink"
      d="M7.4 4.6 L8.9 4.6 C9.8 4.6 10.2 5.1 10.2 6 L10.3 12 L10.2 18 C10.2 18.9 9.8 19.4 8.9 19.4 L7.5 19.4 C6.6 19.4 6.1 18.9 6.1 18 L6.2 12 L6.1 6 C6.1 5.1 6.6 4.6 7.4 4.6 Z M15.2 4.6 L16.6 4.6 C17.5 4.6 18 5.1 18 6 L17.9 12 L18 18 C18 18.9 17.5 19.4 16.6 19.4 L15.1 19.4 C14.2 19.4 13.8 18.9 13.8 18 L13.9 12 L13.8 6 C13.8 5.1 14.3 4.6 15.2 4.6 Z"
    />
  ),
  headphones: (
    <>
      <path d="M4.6 14.2 L4.5 12 C4.5 7.2 7.8 3.8 12 3.8 C16.3 3.8 19.5 7.2 19.5 12 L19.4 14.2" />
      <path
        className="f-paper"
        d="M4.4 12.9 L6.6 12.9 C7.5 12.9 8 13.4 8 14.3 L8.1 19.2 C8.1 20.1 7.6 20.6 6.7 20.6 L4.5 20.6 C3.6 20.6 3.1 20.1 3.1 19.2 L3 14.3 C3 13.4 3.5 12.9 4.4 12.9 Z M17.4 12.9 L19.6 12.9 C20.5 12.9 21 13.4 21 14.3 L20.9 19.2 C20.9 20.1 20.4 20.6 19.5 20.6 L17.3 20.6 C16.4 20.6 15.9 20.1 15.9 19.2 L16 14.3 C16 13.4 16.5 12.9 17.4 12.9 Z"
      />
    </>
  ),
  speaker: (
    <>
      <path className="f-paper" d="M3.4 9.1 L7.2 9.2 L12.5 4.6 L12.3 12 L12.4 19.4 L7.2 14.9 L3.5 14.9 Z" />
      <path d="M15.5 9 C16.7 10.6 16.7 13.4 15.5 15 M18.2 6.3 C20.8 9.6 20.8 14.4 18.2 17.7" />
    </>
  ),
};

export function Icon({ name, size = "1.2em", title, className }: { name: IconName; size?: string; title?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className ? `icon icon-${name} ${className}` : `icon icon-${name}`}
      aria-hidden={title ? undefined : true}
      focusable="false"
      role={title ? "img" : undefined}
    >
      {title && <title>{title}</title>}
      {ICONS[name]}
    </svg>
  );
}

/** The emoji the game data uses (levels.ts: WORLDS[w].emoji, goal.icon) drawn as ink icons instead. */
export const EMOJI_ICON: Record<string, IconName> = {
  "🌲": "pine",
  "🏜️": "dune",
  "🏜": "dune",
  "🌃": "city",
  "🌙": "moon",
  "🐺": "wolf",
  "🐪": "camel",
  "⏳": "hourglass",
};

/** Icon for a data emoji (variation selectors ignored), or `fallback`. */
export function iconFor(emoji: string | undefined, fallback: IconName = "wolf"): IconName {
  if (!emoji) return fallback;
  return EMOJI_ICON[emoji] ?? EMOJI_ICON[emoji.replace(/\uFE0F/g, "")] ?? fallback;
}
