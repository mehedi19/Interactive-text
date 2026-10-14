import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "700", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI — Interactive Argon 4 Hero",
  description:
    "Interactive Argon 4 translucent frosted aerogel typography and WebGL fluid refraction.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-[#020E37] text-white antialiased selection:bg-cyan-400/30">
        {children}
      </body>
    </html>
  );
}
