import { Archivo_Black, IBM_Plex_Mono, Inter } from "next/font/google";

/**
 * Swapping a typeface means editing this file and nothing else.
 * The exported class name goes on <html>, the variables are consumed by tokens.css.
 *
 * Archivo Black ships one weight, which is the point: a heading is either set in
 * it or it is not, and there is no lighter cut to drift into. globals.css sets
 * font-synthesis-weight: none, so a font-bold heading renders as the real 400
 * black rather than a smeared fake. Inter carries every line of body copy and
 * stays out of the way underneath it.
 */
const display = Archivo_Black({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display-face",
  weight: ["400"],
});

const body = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body-face",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono-face",
  weight: ["400", "500"],
});

export const fontVariables = `${display.variable} ${body.variable} ${mono.variable}`;
