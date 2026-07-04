// ponytail: demo-only placeholder images via Lorem Picsum. Swap/blank in prod.
export const pic = (seed: string, w = 400, h = 400) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
