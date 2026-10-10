# Tracking spike (day 0)

Capture-seeded page tracking on the phone, built on MindAR's tracker and matcher:

1. Open the page over HTTPS on the phone, tap **Start camera**. While you frame the page, the WebGL kernels are pre-warmed with a dummy target of the same size.
2. Tap **Capture + track**. The current frame becomes the tracking target; tracking templates are extracted on-device (pure JS, in a worker) and the tracker starts from the known capture pose. Nothing waits for the server.
3. In the background the server compiles MindAR's detection data (parallel across CPU cores) and sends it back; from then on the page is re-acquired automatically after tracking is lost. Until then, a loss of more than 2 s switches to **photo mode** (the experience shown on the frozen capture).
4. The full-resolution still is uploaded to `uploads/` for the Gemini latency spike.

Query parameters: `?kf=256` tracking template resolution (min dimension in px; MindAR default 128), `?sim=1` synthetic camera for desktops and CI (`sim=0.01` near-static).

Run locally: `pnpm --filter @living-book/spike-tracking build && pnpm --filter @living-book/spike-tracking serve` (port 8787), then expose it with `cloudflared tunnel --url http://localhost:8787` for phones.
