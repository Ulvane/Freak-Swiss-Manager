import type { Metadata } from "next";
import "./globals.css";
import { LanguageProvider } from "./language-provider";
import { LanguageToggle } from "@/components/language-toggle";

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
      <body>
        <LanguageProvider>
          {children}
          <LanguageToggle />
        </LanguageProvider>
      </body>
    </html>
  );
}
