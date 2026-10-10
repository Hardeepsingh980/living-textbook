// Runtime configuration. Model ids live here so a deprecation is a one-line change; every model has a fallback.
export const config = {
  project: process.env.GCP_PROJECT || 'cheerio-app',
  location: process.env.GEMINI_LOCATION || 'global',
  liveLocation: process.env.LIVE_LOCATION || 'us-central1', // gemini-3.8-live is served only from us-central1 for this project (measured 2026-10-10)
  port: Number(process.env.PORT || 8080),
  dataDir: process.env.DATA_DIR || '.data',
  publicBase: process.env.PUBLIC_BASE || '',
  useGcloudToken: process.env.LB_USE_GCLOUD_TOKEN === '1',
  pageWidth: 1000,
  models: {
    quick: { id: 'gemini-3.1-flash-lite', fallback: 'gemini-3.5-flash-lite' },
    scene: { id: process.env.SCENE_MODEL || 'gemini-3.1-flash-lite', fallback: 'gemini-3.5-flash-lite' },      // scene v1: fast
    sceneRich: { id: process.env.SCENE_RICH_MODEL || 'gemini-3.6-flash', fallback: 'gemini-3.8-flash' },   // scene v2: richer, swapped in at the next loop
    extract: { id: 'gemini-3.6-flash', fallback: 'gemini-3.8-flash' },
    verify: { id: 'gemini-3.8-flash', fallback: 'gemini-3.6-flash' },
    image: { id: 'gemini-3.1-flash-lite-image', fallback: 'gemini-nano-banana-2.1' },
    imageRef: { id: 'gemini-nano-banana-2.1', fallback: 'gemini-3.1-flash-lite-image' },
    tts: { id: 'gemini-3.8-flash-lite-tts', fallback: 'gemini-3.8-flash-tts' },
    live: { id: 'gemini-3.8-live', fallback: 'gemini-3.8-live' },
  },
  // USD per 1M tokens (standard tier, Oct 2026); images per image; used for the per-experience cost line
  prices: {
    'gemini-3.1-flash-lite': { in: 0.25, out: 1.5 },
    'gemini-3.5-flash-lite': { in: 0.3, out: 2.5 },
    'gemini-3.6-flash': { in: 0.75, out: 3.75 },
    'gemini-3.8-flash': { in: 0.75, out: 3.75 },
    'gemini-3.8-flash-lite-tts': { in: 0.5, out: 6 },
    'gemini-3.8-flash-tts': { in: 0.5, out: 9 },
    'gemini-3.1-flash-lite-image': { in: 0.25, out: 30 },
    'gemini-nano-banana-2.1': { in: 0.25, out: 30 },
  } as Record<string, { in: number; out: number }>,
  voices: {
    narrator: { en: 'Kore', hi: 'Kore' },
    pool: ['Puck', 'Charon', 'Fenrir', 'Aoede', 'Leda', 'Orus', 'Zephyr', 'Kore'],
  },
};
export type ModelKey = keyof typeof config.models;
