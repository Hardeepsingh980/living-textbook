#!/bin/bash
# The background music for the demo video: one 32 s clip from Lyria (lyria-002 on Vertex AI, us-central1).
#   scripts/demo-video/music.sh <out dir> [project]
set -euo pipefail
OUT=${1:?out dir}; PROJECT=${2:-cheerio-app}
mkdir -p "$OUT"
curl -s -m 120 -X POST "https://us-central1-aiplatform.googleapis.com/v1/projects/$PROJECT/locations/us-central1/publishers/google/models/lyria-002:predict" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json" \
  -d '{"instances":[{"prompt":"A gentle, warm and curious acoustic background track for a children'\''s education app demo: soft marimba, light plucked guitar and a calm piano, bright and hopeful, steady medium tempo, no vocals, light and uncluttered so a narrator voice sits clearly on top","negative_prompt":"vocals, singing, heavy drums, distortion, dark, sad"}],"parameters":{"sample_count":1}}' \
  -o "$OUT/lyria.json"
node -e '
const fs = require("fs");
const j = JSON.parse(fs.readFileSync(process.argv[1]));
if (j.error) { console.error("Lyria:", j.error.code, j.error.message); process.exit(1); }
const p = j.predictions?.[0], b = p?.bytesBase64Encoded || p?.audioContent;
if (!b) { console.error("Lyria returned no audio"); process.exit(1); }
fs.writeFileSync(process.argv[2], Buffer.from(b, "base64"));
console.log("music:", process.argv[2]);' "$OUT/lyria.json" "$OUT/music.wav"
