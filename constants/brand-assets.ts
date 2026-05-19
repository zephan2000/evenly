// Hero imagery for the Hero register (design-system §3.5).
//
// `home-hero.jpg` / `settings-hero.jpg` were font-SPECIMEN reference
// images (the "Open Sauce + Peace Sans" / giant "Sans" text is baked
// into the picture) — shipping them made the Home + sign-in hero look
// broken (UX audit 2026-05-19, P0-1/P0-2). All hero surfaces now point
// at the calm pastoral still generated for the Codex asset pass
// (assets/images/brand/hero-pastoral@3x.png). homeHero / settingsHero
// are kept as aliases so existing consumers need no change; the old
// specimen jpgs are no longer referenced anywhere.

const heroPastoral = require('@/assets/images/brand/hero-pastoral@3x.png');

export const BrandAssets = {
  heroPastoral,
  homeHero: heroPastoral,
  settingsHero: heroPastoral,
} as const;
