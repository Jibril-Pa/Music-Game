/**
 * The storybook typefaces: SIL OFL, self-hosted in public/fonts, declared in globals.css.
 * false = Georgia everywhere (DOM through GameApp's data-type, canvas through fx.ts FONT). One-line revert.
 */
export const STORYBOOK_TYPE = true;
export const SERIF_STACK = 'Georgia, "Iowan Old Style", "Palatino Linotype", serif';
/** Titles, chord names, badges: every canvas text. */
export const DISPLAY_FONT = STORYBOOK_TYPE ? `"Fraunces", ${SERIF_STACK}` : SERIF_STACK;
/** CSS font shorthands Boot waits for (document.fonts.load) before drawing any canvas text. */
export const CANVAS_FONTS: readonly string[] = STORYBOOK_TYPE ? ['700 30px "Fraunces"', 'italic 700 30px "Fraunces"'] : [];
