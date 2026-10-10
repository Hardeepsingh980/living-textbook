# Research notes: web-only AR anchored to a runtime-photographed page (2026-10-10)

> Compiled by an automated research agent from official documentation, library sources and recent bug trackers on 2026-10-10. Treat as notes: the day-0 spike on real pages and real phones decides. Items marked UNVERIFIED could not be confirmed.

## 1. WebXR status

- iOS Safari: no WebXR on iPhone/iPad through iOS 27.2 (https://caniuse.com/webxr). Safari 26.x release notes contain no iOS WebXR items; WebKit states WebXR shipped only in visionOS (https://webkit.org/blog/17640/webkit-features-for-safari-26-2/). WebKit meta-bug 208988 confirms iOS exclusion (https://bugs.webkit.org/show_bug.cgi?id=208988).
- Android Chrome: WebXR partial; AR needs ARCore + Google Play Services for AR; hit-test (Chrome 81) and DOM Overlay (Chrome 83) shipped (https://developers.google.com/ar/develop/webxr/requirements). `image-tracking` still requires `chrome://flags/#webxr-incubations` (https://engine.needle.tools/docs/how-to-guides/xr/image-tracking.html); Meta stated at the May 2026 W3C F2F it would not implement the marker-tracking proposal (https://www.w3.org/2026/05/19-immersive-web-irc).
- Wrappers: Variant Launch (App Clip; $0/3k views, $99, $199 per project/month; marker tracking beta iOS only) (https://launch.variant3d.com/); Needle Go App Clip (free with branding) (https://engine.needle.tools/docs/how-to-guides/xr/ios-webxr-app-clip.md). Whether a runtime-captured image can be the tracked image is UNVERIFIED.
- Conclusion: WebXR cannot be the primary cross-platform path.

## 2. Image-tracking options with a runtime target

| Option | Runtime targets | iOS | Android | Start-up | License/cost | Maturity |
|---|---|---|---|---|---|---|
| MindAR 1.2.5 | Yes: browser `Compiler.compileImageTargets` + `exportData`; Node `OfflineCompiler` | Yes | Yes | ~1.2 s warm compile (desktop); 20–30 s cold per new image size | MIT | Last release 2024-01-16; 102 open issues |
| TraceAR 0.2.1 | Yes: `compileImage` in browser, "0.1 s for 512 px" (vendor) | "iOS Safari 16.4+" (vendor) | Yes | detect ~20 ms (vendor) | MIT | Published 2026-08-27; 1 star; pre-1.0 |
| AR.js NFT / jsartoolkitNFT | marker files via NFT-Marker-Creator (Node preferred) | Yes | Yes | UNVERIFIED | MIT + LGPL-3.0 | AR.js 3.4.8 (2026-03-16) |
| Zappar Universal AR | no in-browser training; `zapworks train` CLI | Safari 11.3+ | Yes | UNVERIFIED | $12.99/mo non-commercial, Pro $315/mo | commercial |
| 8th Wall (open source) | Node CLI; binary-only SLAM chunk | UNVERIFIED | Yes | UNVERIFIED | MIT framework + binary | hosted platform shut 2026-02-28 |
| Needle Engine (WebXR) | images at session start | via App Clip | Chrome flag | n/a | free w/ watermark | flag-gated |
| Custom OpenCV.js | Yes (ORB/AKAZE + RANSAC homography, then LK) | WASM SIMD 16.4+ | Yes | UNVERIFIED | Apache-2.0 | DIY; 3.5 MB gz |

Sources: https://github.com/hiukim/mind-ar-js, https://registry.npmjs.org/mind-ar, https://github.com/CagKebabi/TraceAR, https://registry.npmjs.org/@tracear%2Fsdk, https://github.com/AR-js-org/AR.js/releases, https://github.com/Carnaux/NFT-Marker-Creator, https://docs.zap.works/universal-ar/javascript/tracking/image-tracking/, https://zap.works/pricing/, https://8thwall.org/blog/8th-wall-open-source, https://github.com/EdwardLu2018/wasm-ar

MindAR details (from source): `three` peer `>=0.136.0`, examples pin 0.160 (r186 compatibility UNVERIFIED); tracking runs in a Web Worker, compile's feature detection runs on the main thread via TensorFlow.js WebGL; `.mind` is msgpack; `addImageTargetsFromBuffer(buffer)` accepts a compiled ArrayBuffer; defaults `filterMinCF` 0.001, `filterBeta` 1000, `warmupTolerance`/`missTolerance` 5, `maxTrack` 1; `mindar-image-three.prod.js` 385 KB / 60 KB gz; iOS fixes landed in 1.2.2.

Measured by the agent (MindAR 1.2.5 hosted compiler, Chrome 152 on a Mac, synthetic 1000×1400 pages):

| Page | Compile (warm) | Match points | Tracking points (256 px / 128 px) |
|---|---|---|---|
| Dense body text only | 1.26–1.30 s (cold first run 30.6 s) | 479 | 4 / 2 |
| Text + 760×420 diagram | 1.15 s | 446 | 21 / 21 |
| Diagram crop alone | 20.3 s first run at that size | 285 | 34 / 40 |
| Random illustration | 0.88 s | 398 | 46 / 48 |

Interpretation: cold cost is TF.js shader compilation per input size → resize every photo to one canonical size and pre-warm; tracking templates are 13×13 patches at the 256/128-px levels, so body text smears to nothing → text-only pages detect but do not track; anchor on the figure region. Synthetic images, not photos; phone compile time UNVERIFIED. TraceAR claims 1.9 px vs MindAR 5.5 px median jitter (vendor-reported).

Custom OpenCV.js: default build includes ORB, AKAZE, BFMatcher, findHomography, calcOpticalFlowPyrLK, Laplacian, findContours, getPerspectiveTransform; official 4.x build 10.96 MB raw / 3.54 MB gz; WASM SIMD iOS 16.4+, threads iOS 14.5+ but need COOP/COEP. Stretch option only.

## 3. Camera and browser constraints

| Capability | iOS Safari (iOS 26) | Android Chrome | Source |
|---|---|---|---|
| WebXR immersive-ar | No | Partial; image-tracking flag-only | https://caniuse.com/webxr |
| getUserMedia | Yes, HTTPS/localhost | Yes | https://developers.google.com/ar/develop/webxr/requirements |
| ImageCapture `takePhoto` | No (Safari 26.0 lists `grabFrame` only, UNVERIFIED) | Yes | https://caniuse.com/imagecapture |
| WASM SIMD / threads | 16.4+ / 14.5+ (COOP/COEP) | Yes / Yes | https://caniuse.com/wasm-simd |
| WebGPU | 26.0+ | Chrome 121+, Android 12+ | https://caniuse.com/webgpu |
| Web Speech (STT) | Partial since 14.5; not in home-screen apps | Partial; server-based | https://caniuse.com/speech-recognition |
| Screen Wake Lock | 16.4+ | Yes | https://caniuse.com/wake-lock |
| DeviceOrientation `requestPermission` | Required; HTTPS + tap | Not needed | https://caniuse.com/mdn-api_deviceorientationevent_requestpermission_static |
| requestVideoFrameCallback | 15.4+ | Yes | https://caniuse.com/mdn-api_htmlvideoelement_requestvideoframecallback |
| OffscreenCanvas | 17+ | Yes | https://caniuse.com/offscreencanvas |

Notes:
- Stills on Safari: `drawImage(video)` at `videoWidth×videoHeight`, or `<input type="file" capture>` for a full-sensor photo. Request `ideal` 1920×1080 and read `getSettings()`; iOS 26.6 reports lens switching and orientation disagreements (https://developer.apple.com/forums/thread/844826).
- PWA: iOS 26 home-screen mode has recurring camera bugs (rotated frames on iPadOS 26, https://bugs.webkit.org/show_bug.cgi?id=299591). Prefer a Safari tab.
- Video/audio policy: `playsinline` required; muted video autoplays; audio needs a gesture; unlock AudioContext on touchend/click; iOS can leave contexts "interrupted" after backgrounding → `resume()` on `visibilitychange` (https://bugs.webkit.org/show_bug.cgi?id=276016).
- Memory: no official limit; developer reports put Safari WebGL at ~300–500 MB (UNVERIFIED); getUserMedia→canvas leaks have killed the GPU process (https://bugs.webkit.org/show_bug.cgi?id=256366). Stop tracks when done; avoid `display:none` on the live video.
- Safari 26.4 made DeviceOrientationEvent secure-context-only.

## 4. Rendering

- Three.js r186 (npm 0.186.1); `WebGPURenderer` falls back to WebGL 2; MindAR's wrapper constructs its own WebGL + CSS3D renderers.
- PixiJS 8.22.0 auto-selects WebGPU/WebGL; suited to 2D sprites/particles in a transparent canvas.
- 60 fps: keep the camera `<video>` as a DOM element under a transparent canvas (no per-frame texture upload); batch sprites; avoid `readPixels`/`getError` per frame; drive tracking from `requestVideoFrameCallback` (https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

## 5. Anchoring 2D content

- MindAR/three.js convention: anchor at target centre, 1 unit = target width, +y up. For a bbox (x0,y0,x1,y1) on a W×H target: centre = ((cx−W/2)/W, (H/2−cy)/W, 0), size = (bw/W, bh/W).
- DOM via homography: solve 3×3 H from four corners and write `matrix3d(h0,h3,0,h6, h1,h4,0,h7, 0,0,1,0, h2,h5,0,1)` (column-major) with `transform-origin: 0 0` (https://franklinta.com/2014/09/08/computing-css-matrix3d-transforms/, https://github.com/eric-canas/homography.js). Keep the quad convex and corner order fixed. MindAR compiles at full input size (11 pyramid scales for 1000 px), so oversized photos cost compile time without benefit.

## 6. Photo quality gate

- Blur: variance of a 3×3 Laplacian on a fixed-width downscale (threshold ≈100 is dataset-dependent, https://pyimagesearch.com/2015/09/07/blur-detection-with-opencv/). Darkness: luminance percentiles from the same ImageData.
- Page detection: jscanify 1.4.3 (MIT) needs full OpenCV.js; keep page/figure detection server-side.

## Recommendation (agent)

Primary: MindAR 1.2.5, compiling the captured photo (canonical size, pre-warmed). Compile the figure crop when the full page has too few tracking points. Fallback A: TraceAR (same unit convention). Fallback B: aligned overlay on the frozen capture via `matrix3d`. Fallback C: flat. Not recommended now: WebXR, App-Clip wrappers, Zappar/8th Wall, custom OpenCV.js.

## Half-day spike plan

1. Harness page: getUserMedia (environment, ideal 1920×1080), log settings, canvas still, Laplacian score, compile timing and tracking-point counts for full page / figure crop / text-only page, start tracking from the buffer with stats.
2. Real-book tests: flat page, 30° tilt, 20–50 cm, slow pan, curved page near the spine, lamp glare. Record detection latency, fps, drop-outs per minute, visual offset. Pass: anchored ≤5 s after capture, ≥30 fps, no visible slide in gentle handheld motion.
3. Repeat with TraceAR; compare jitter.
4. Platform checks: audio unlock then narration after background/foreground; wake lock; Safari tab vs home-screen; 10-minute soak watching memory.
5. Decide: MindAR vs TraceAR vs fallback B, and the figure-crop rule.

## Risks

MindAR unmaintained; three r186 compatibility unverified; text-only pages do not track; phone compile time and TF.js warm-up unmeasured; iOS camera quirks and GPU memory kills; TraceAR API churn; curved pages break the planar-homography assumption; no WebXR image tracking on either platform in the hackathon window.
