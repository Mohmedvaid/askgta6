/** Generated avatars so the seed needs no external images. */
const PALETTE = ["#f0a04b", "#8bd3c7", "#e2725b", "#a78bfa", "#f2c14e", "#6ea8fe"];

function hash(value: string): number {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    total = (total * 31 + value.charCodeAt(index)) % 100000;
  }
  return total;
}

export function avatarSvg(username: string): string {
  const seed = hash(username);
  const background = PALETTE[seed % PALETTE.length];
  const foreground = PALETTE[(seed + 3) % PALETTE.length];
  const initial = username.slice(0, 1).toUpperCase();

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">',
    `<rect width="96" height="96" rx="20" fill="${background}"/>`,
    `<circle cx="${28 + (seed % 40)}" cy="${24 + (seed % 20)}" r="30" fill="${foreground}" opacity="0.55"/>`,
    `<text x="48" y="62" text-anchor="middle" font-family="sans-serif" font-size="42" font-weight="700" fill="#16181d">${initial}</text>`,
    "</svg>",
  ].join("");
}
