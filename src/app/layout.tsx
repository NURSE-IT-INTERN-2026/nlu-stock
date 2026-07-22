import type { Metadata } from "next";
import { Sarabun } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sarabun = Sarabun({
  variable: "--font-sarabun",
  subsets: ["thai", "latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "NLU Stock",
  description: "Stock Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      suppressHydrationWarning
      className={`${sarabun.variable} antialiased`}
    >
      {/* ponytail: no h-full on <html> — height:100% on the root element kills the viewport
          scrollbar on mobile (content overflows a fixed-height html with no scroll), so every
          non-app-shell page couldn't scroll. body uses min-h-dvh (viewport unit) instead of
          min-h-full so it still fills the screen without depending on html's height. */}
      <body className="min-h-dvh flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
