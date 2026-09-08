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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                let theme = localStorage.getItem('freak-swiss-theme');
                let mode = localStorage.getItem('freak-swiss-mode');
                if (theme === 'turquoise') document.documentElement.setAttribute('data-theme', 'turquoise');
                if (mode === 'dark') document.documentElement.setAttribute('data-mode', 'dark');
              } catch (e) {}
            `
          }}
        />
      </head>
      <body>
        <LanguageProvider>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
