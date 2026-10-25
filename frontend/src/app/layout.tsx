import type { Metadata } from "next";
import "./globals.css";

// System fonts only (no Google Fonts fetch) so the app works offline.
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
