# Evaluation report

Generated 2026-10-11T14:28:27.417Z against http://localhost:8080; 3 run(s) over 3 page(s). Events in `eval/output/2026-10-11T14-26-41-309Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 0/0 | — |
| Language correct | 0/0 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 1/1 | all |
| Scenes rendered (Q-3) | 3/3 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 3/3 | all |
| Scenes with ≥ 3 moving elements | 3/3 | all |
| Cost per page | $0.054 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.8 s / 2.2 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 7.5 s / 7.6 s | 5 s | 10 s |
| L-3 narration starts | 10.1 s / 10.4 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 21.3 s / 26.2 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 33.0 s / 44.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 3.2 s / 3.2 s |
| build | 7.5 s / 7.6 s |
| understand | 18.6 s / 22.9 s |
| verify | 20.9 s / 25.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ncert-c10-science-refraction-slab.jpg | science | en | 1 | 7 | 3 | 5/7 | 0 % / 0 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 7.5 s | 26.2 s | $0.025 |  |
| ncert-c10-science-resistors-series.jpg | science | en | 1 | 9 | 3 | 4/9 | 0 % / 0 % (4) | -/0 | -/0 | 1/1 | verified-page | 0 | 7.6 s | 18.8 s | $0.078 |  |
| ncert-c7-science-pendulum.jpg | science | en | 1 | 5 | 3 | 3/5 | 1 % / 1 % (2) | -/0 | -/0 | 0/0 | checked-independently | 0 | 7.1 s | 21.3 s | $0.058 |  |
