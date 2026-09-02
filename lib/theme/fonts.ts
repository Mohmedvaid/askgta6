import { Bricolage_Grotesque, JetBrains_Mono, Source_Sans_3 } from "next/font/google";

/**
 * Swapping a typeface means editing this file and nothing else.
 * The exported class name goes on <html>, the variables are consumed by tokens.css.
 */
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
  weight: ["500", "600", "700", "800"],
});

const body = Source_Sans_3({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body-face",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-face",
  weight: ["400", "500"],
});

export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;
