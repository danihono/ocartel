import type { Metadata } from "next";
import { Cinzel, Spectral, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const spectral = Spectral({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-spectral",
  display: "swap",
});

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "O Cartel — Gestão de Barbearia",
  description: "SaaS de gestão para barbearias. Agenda, clientes, planos e financeiro.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`${cinzel.variable} ${spectral.variable} ${hanken.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
