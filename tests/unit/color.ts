import { readFileSync } from "node:fs";

export type Rgb = readonly [number, number, number];

/** oklch to linear light sRGB, clamped into gamut. */
export function oklchToLinear(L: number, C: number, H: number): Rgb {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.min(1, Math.max(0, v))) as unknown as Rgb;
}

export function linearToHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((c) => {
        const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        return Math.round(encoded * 255)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

export const relativeLuminance = (rgb: Rgb): number => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = relativeLuminance(a) >= relativeLuminance(b)
    ? [relativeLuminance(a), relativeLuminance(b)]
    : [relativeLuminance(b), relativeLuminance(a)];
  return (hi + 0.05) / (lo + 0.05);
}

/** src composited over dst at the given alpha, in linear light. */
export function over(src: Rgb, dst: Rgb, alpha: number): Rgb {
  return src.map((v, i) => v * alpha + dst[i]! * (1 - alpha)) as unknown as Rgb;
}

export type Tokens = Record<string, Rgb>;

/**
 * Reads one theme block out of lib/theme/tokens.css. Parsing the real file rather
 * than a copy is the point: a token nobody updated fails here.
 */
export function readTheme(theme: "dark" | "light"): Tokens {
  const css = readFileSync(`${process.cwd()}/lib/theme/tokens.css`, "utf8");
  const lightAt = css.indexOf('[data-theme="light"]');
  const block =
    theme === "dark"
      ? css.slice(css.indexOf("color-scheme: dark"), lightAt)
      : css.slice(lightAt, css.indexOf("--radius-sm"));

  const out: Tokens = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^\s*(--[\w-]+):\s*oklch\(([\d.]+) ([\d.]+) ([\d.]+)\);\s*$/);
    if (match) out[match[1]!] = oklchToLinear(Number(match[2]), Number(match[3]), Number(match[4]));
  }
  return out;
}
