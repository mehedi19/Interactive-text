import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "600", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Argon 4 AI — Interactive WebGL Fluid Hero",
  description:
    "Interactive Argon 4 style frosted aerogel typography and WebGL fluid refraction built with Next.js 14.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#010926] text-white antialiased selection:bg-cyan-400/30">
        {children}
      </body>
    </html>
  );
}
