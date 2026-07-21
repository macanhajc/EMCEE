import type { Metadata } from "next";
import { Geist, Geist_Mono, Bungee, Plus_Jakarta_Sans, IBM_Plex_Mono } from "next/font/google";
import { RoutePointerEventsReset } from "@/components/route-pointer-events-reset";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-bungee",
  weight: "400",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BotMarket — hosted Highrise bots, bring your own token",
  description:
    "Rent a professional Highrise bot for your room in two minutes. Pick a bot, paste your token, configure it in a dashboard — we keep it online 24/7.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} ${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <RoutePointerEventsReset />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
