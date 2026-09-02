import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Freak Swiss Manager — Swiss Manager K Edition",
  description:
    "Freak Swiss Manager, also called Swiss Manager K Edition: a free control desk for Swiss chess tournaments.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
