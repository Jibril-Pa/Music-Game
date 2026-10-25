import type { Metadata } from "next";
import "./globals.css";

// No Google Fonts fetch, so the app works offline: the game's storybook faces (Fraunces,
// Alegreya; SIL OFL) are self-hosted in public/fonts and declared in globals.css.
export const metadata: Metadata = {
  title: "The Traveling Bard",
  description: "A time-traveling fairy-tale game you play with a real guitar, plus the song pipeline (song -> note chart, tab and backing track)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
