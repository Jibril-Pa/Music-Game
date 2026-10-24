import type { Metadata } from "next";
import "./globals.css";

// System fonts only (no Google Fonts fetch) so the app works offline.
export const metadata: Metadata = {
  title: "guitar-scroller pipeline",
  description: "Song -> note chart, tab and backing track",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
