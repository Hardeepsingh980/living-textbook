# Evaluation report

Generated 2026-10-11T11:22:14.791Z against http://localhost:8080; 1 run(s) over 1 page(s). Events in `eval/output/2026-10-11T11-21-50-370Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 1/1 | — |
| Language correct | 1/1 | — |
| Key values recalled (Q-1) | 5/5 (100 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 1/1 | all |
| Page-answer checks passed (Q-2) | 1/1 | all |
| Scenes rendered (Q-3) | 1/1 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 1/1 | all |
| Scenes with ≥ 3 moving elements | 1/1 | all |
| Cost per page | $0.037 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.9 s / 1.9 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 6.7 s / 6.7 s | 5 s | 10 s |
| L-3 narration starts | 9.4 s / 9.4 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 16.5 s / 16.5 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 24.4 s / 24.4 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.9 s / 2.9 s |
| build | 6.7 s / 6.7 s |
| understand | 13.8 s / 13.8 s |
| verify | 16.5 s / 16.5 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-physics-ohms-law.jpg | science | en | 1 | 7 | 3 | 3/7 | 0 % / 0 % (1) | 5/5 | 1/1 | 1/1 | verified-page | 0 | 6.7 s | 16.5 s | $0.037 |  |
