import type { Metadata, Viewport } from "next";
import { Cinzel, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Providers from "./providers";
import { SCRIPT_TEMA } from "@/lib/tema-script";

// Cinzel fica só no wordmark "O CARTEL"; toda a UI é Geist, e os números, Geist Mono.
const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "O Cartel — Gestão de Barbearia",
  description: "SaaS de gestão para barbearias. Agenda, clientes, planos e financeiro.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0b" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // O script de tema mexe em data-theme antes da hidratação, daí o suppressHydrationWarning.
    <html lang="pt-BR" className={`${cinzel.variable} ${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
