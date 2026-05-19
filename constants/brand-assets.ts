import { Platform } from 'react-native';

// Hero imagery for the Hero register (design-system §3.5).
//
// `home-hero.jpg` / `settings-hero.jpg` were font-SPECIMEN reference
// images (the "Open Sauce + Peace Sans" / giant "Sans" text is baked
// into the picture) — shipping them made the Home + sign-in hero look
// broken (UX audit 2026-05-19, P0-1/P0-2). All hero surfaces now point
// at the calm pastoral still generated for the Codex asset pass.
// homeHero / settingsHero are kept as aliases so existing consumers need
// no change; the old specimen jpgs are no longer referenced anywhere.

// Resolution split (UX feedback 2026-05-19: web hero looked pixelated /
// "too zoomed in"):
//
// - Native: the `hero-pastoral.png` / @2x / @3x density set. Metro picks
//   the right density per device — already crisp on phones.
// - Web: Expo's web export resolves the @1x base (512×341). Upscaled ~2×
//   into the ~990px hero column that reads as pixelated. So web requires a
//   single full-resolution copy (`hero-pastoral-full.png`, 1536×1024 — the
//   same image as @3x, just without a density suffix). The suffix matters:
//   requiring `hero-pastoral@3x.png` literally broke the Vercel build
//   (`7ca6736`, "Unable to resolve module …@3x.png") — a non-suffixed file
//   resolves like any normal asset and sidesteps that Metro landmine.
const heroPastoral = Platform.select({
  web: require('@/assets/images/brand/hero-pastoral-full.png'),
  default: require('@/assets/images/brand/hero-pastoral.png'),
});

export const BrandAssets = {
  heroPastoral,
  homeHero: heroPastoral,
  settingsHero: heroPastoral,
} as const;
