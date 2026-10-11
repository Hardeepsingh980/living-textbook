# Evaluation report

Generated 2026-10-11T15:41:36.162Z against http://localhost:8080; 3 run(s) over 1 page(s). Events in `eval/output/2026-10-11T15-39-43-707Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 0/0 | — |
| Language correct | 0/0 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 3/3 | all |
| Scenes rendered (Q-3) | 3/3 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 3/3 | all |
| Scenes with ≥ 3 moving elements | 0/3 | all |
| Cost per page | $0.061 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 2.0 s / 2.7 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 7.8 s / 8.8 s | 5 s | 10 s |
| L-3 narration starts | 10.5 s / 11.5 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 15.8 s / 50.1 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 29.4 s / 54.5 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 3.0 s / 3.9 s |
| build | 7.8 s / 8.8 s |
| understand | 10.4 s / 12.2 s |
| verify | 15.0 s / 54.1 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ncert-c10-science-resistors-series.jpg | science | en | 1 | 6 | 3 | 1/6 | 0 % / 0 % (3) | -/0 | -/0 | 1/1 | verified-page | 0 | 8.8 s | 15.8 s | $0.064 |  |
| ncert-c10-science-resistors-series.jpg | science | en | 1 | 8 | 3 | 2/8 | 0 % / 0 % (7) | -/0 | -/0 | 1/1 | verified-page | 0 | 7.0 s | 13.5 s | $0.044 |  |
| ncert-c10-science-resistors-series.jpg | science | en | 1 | 5 | 3 | 2/5 | 0 % / 0 % (0) | -/0 | -/0 | 1/1 | verified-page | 0 | 7.8 s | 50.1 s | $0.075 |  |
