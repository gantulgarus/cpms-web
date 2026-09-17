import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

import { AuthGate } from "@/components/auth-gate";
import { Providers } from "./providers";

// Монгол кирилл (Ө, Ү, ө, ү) нь Google Fonts-ийн cyrillic-ext subset-д багтдаг тул
// cyrillic болон cyrillic-ext хоёуланг нь ачаална.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CPMS · Planning",
  description: "Construction Project Management — planning & oversight console",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Browser extension-ууд (жишээ нь Scribe recorder) <html> дээр hydration-аас
    // өмнө attribute нэмдэг тул тухайн элемент дээр зөрүүг үл тоомсорлоно.
    <html
      lang="mn"
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background min-h-full">
        <Providers>
          <AuthGate>{children}</AuthGate>
        </Providers>
      </body>
    </html>
  );
}
