# Evaluation report

Generated 2026-10-11T13:45:04.358Z against http://localhost:8080; 1 run(s) over 1 page(s). Events in `eval/output/2026-10-11T13-44-29-724Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 0/0 | — |
| Language correct | 0/0 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 0/0 | all |
| Scenes rendered (Q-3) | 1/1 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 1/1 | all |
| Scenes with ≥ 3 moving elements | 1/1 | all |
| Cost per page | $0.034 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.6 s / 1.6 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 7.4 s / 7.4 s | 5 s | 10 s |
| L-3 narration starts | 9.8 s / 9.8 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 31.6 s / 31.6 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 34.6 s / 34.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.6 s / 2.6 s |
| build | 7.4 s / 7.4 s |
| understand | 28.4 s / 28.4 s |
| verify | 31.2 s / 31.2 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ncert-c10-science-refraction-slab.jpg | science | en | 1 | 8 | 4 | 4/8 | 1 % / 1 % (0) | -/0 | -/0 | 0/0 | checked-independently | 0 | 7.4 s | 31.6 s | $0.034 |  |
