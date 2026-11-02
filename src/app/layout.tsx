import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Velvet Vault — Private Media Inventory",
  description: "Local-only inventory and media library manager for a private adult collection (18+). No cloud, no tracking.",
  robots: { index: false, follow: false },
};

const themeScript = `(function(){try{var t=localStorage.getItem("vv-theme");if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";if(t==="dark")document.documentElement.classList.add("dark");}catch(e){document.documentElement.classList.add("dark");}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
