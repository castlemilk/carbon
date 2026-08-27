import type { Metadata } from "next";
import { headers } from "next/headers";
import { JetBrains_Mono, Space_Grotesk, Hanken_Grotesk } from "next/font/google";

import { Suspense } from "react";

import { AppSidebar } from "@/components/app-sidebar";
import { EmbedNav } from "@/components/embed-nav";
import EmbedFrame from "@/components/embed-frame";
import { ThemeProvider } from "@/components/theme/theme-provider";

import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Carbon Capture Research",
  description: "Research workspace for carbon removal pathways",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const embed = (await headers()).get("x-carbon-embed") === "1";
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${mono.variable} ${display.variable} ${sans.variable} h-full antialiased`}
    >
      <body className={`min-h-full font-sans antialiased ${embed ? "bg-transparent" : ""}`}>
        <ThemeProvider>
          {embed ? (
            <>
              <div className="mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8">
                <Suspense fallback={null}>
                  <EmbedNav />
                </Suspense>
                <main className="mt-8">{children}</main>
              </div>
              <EmbedFrame />
            </>
          ) : (
            <>
              <AppSidebar />
              <main className="pl-[220px]">{children}</main>
            </>
          )}
        </ThemeProvider>
      </body>
    </html>
  );
}
