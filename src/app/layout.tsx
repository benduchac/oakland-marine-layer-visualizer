import type { Metadata } from "next";
import { IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// IBM Plex Sans + JetBrains Mono, not Geist — both were designed explicitly
// for technical/data contexts (Plex for IBM's engineering docs and product
// UI, JetBrains Mono for code and figures), which fits an instrument-panel
// tool better than the ambient "every Vercel app looks like this" default.
const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Oakland Marine Layer Visualizer",
  description: "See whether the Oakland/Berkeley hills are above or below the marine layer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexSans.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
