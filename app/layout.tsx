import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

/*
  These three are the APP CHROME fonts only — the sidebar, forms, and buttons of
  Synera Content Studio itself.

  They are NOT the mechanism by which brand fonts reach templates. Those are
  per-client, resolved from the database, self-hosted in Supabase Storage, and
  injected as @font-face + CSS custom properties at render time. Keeping the two
  systems separate is what lets a template render in a client's typeface while
  the surrounding UI stays in ours.

  The AuthKit reference specifies Untitled Sans, aeonikPro and dotDigital, all
  three of which are licensed commercial faces. It names a free substitute for
  each, and those are what load here — a licence this project does not hold is
  not a dependency it can ship.
*/

/** Body, UI, buttons, inputs, badges. Substitute for Untitled Sans. */
const inter = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Display headings only. Substitute for aeonikPro. */
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

/** All-caps eyebrow labels, and the code/hex readouts. Substitute for
    dotDigital, whose tabular figures the palette editor's hex fields rely on. */
const jetBrainsMono = JetBrains_Mono({
  variable: "--font-eyebrow",
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
      className={`dark ${inter.variable} ${spaceGrotesk.variable} ${jetBrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
