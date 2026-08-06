import type { Metadata } from "next";
import { Poppins, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/*
  Poppins here is the APP CHROME font only — the sidebar, forms, and buttons of
  Synera Content Studio itself.

  It is NOT the mechanism by which brand fonts reach templates. Those are
  per-client, resolved from the database, self-hosted in Supabase Storage, and
  injected as @font-face + CSS custom properties at render time. Keeping the two
  systems separate is what lets a template render in a client's typeface while
  the surrounding UI stays in ours.
*/
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // The template gives every route a "<page> · Synera Content Studio" title
  // without each page repeating the suffix. `default` covers routes that set
  // none — the login screen and the API surface.
  title: {
    default: "Synera Content Studio",
    template: "%s · Synera Content Studio",
  },
  description:
    "Producción de contenido social para marcas: guion, copy e imágenes con tipografía renderizada por código.",
  // Internal agency tooling: nothing here should be indexed, and every page is
  // behind auth anyway. Declaring it stops a stray public URL from being
  // crawled if one is ever exposed.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${poppins.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
