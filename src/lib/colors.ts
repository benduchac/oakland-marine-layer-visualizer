// Single source of truth for the marine-layer overlay's fill. Both confirmed
// and uncertain-cap readings use the same pale gray — a light, near-opaque
// wash reads as actual fog sitting on the terrain, which a darker gray or a
// second hue (blue-gray, amber) didn't. Confidence is carried by opacity
// alone, kept close between the two states (fully transparent washes lose
// edge contrast against terrain, which made the uncertain-cap boundary hard
// to see). SoundingProfileModal keeps its own separate two-tone treatment
// (deliberately, per design review) since it renders opaque, labeled blocks
// rather than a translucent wash — hue alone is legible there in a way it
// isn't here. There's no legend for this anymore — a flat swatch color
// doesn't represent a translucent wash over varying terrain any better than
// just showing it on the map does.
export const LAYER_COLOR = "#c9ced2";
export const LAYER_OVERLAY_ALPHA = 210; // confirmed
export const UNCERTAIN_OVERLAY_ALPHA = 153; // uncertain cap — same color, ~60% opacity

/** For canvas ImageData writes, which need an integer 0-255 alpha channel. */
export function hexToRgba255(hex: string, alpha255: number): { r: number; g: number; b: number; a: number } {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: alpha255 };
}
