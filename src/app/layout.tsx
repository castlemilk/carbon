import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";

import { AppSidebar } from "@/components/app-sidebar";
import EmbedFrame from "@/components/embed-frame";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className={`min-h-full ${embed ? "bg-transparent" : ""}`}>
        {embed ? (
          <>
            <main>{children}</main>
            <EmbedFrame />
          </>
        ) : (
          <>
            <AppSidebar />
            <main className="pl-[220px]">{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
