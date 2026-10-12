# Evaluation report

Generated 2026-10-12T08:15:05.087Z against http://localhost:8080; 6 run(s) over 6 page(s). Events in `eval/output/2026-10-12T08-13-00-294Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 0/0 | — |
| Language correct | 0/0 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 0/0 | all |
| Scenes rendered (Q-3) | 6/6 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 5/6 | all |
| Scenes with ≥ 3 moving elements | 5/6 | all |
| Cost per page | $0.040 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.5 s / 2.4 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 6.9 s / 8.1 s | 5 s | 10 s |
| L-3 narration starts | 9.6 s / 10.9 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 15.2 s / 19.3 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 20.7 s / 27.9 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.5 s / 4.1 s |
| build | 6.9 s / 8.1 s |
| understand | 10.7 s / 14.8 s |
| verify | 14.8 s / 18.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| gesc103-06.jpg | science | en | 0.98 | 8 | 3 | 5/8 | 9 % / 13 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 8.1 s | 19.3 s | $0.061 |  |
| gesc107-04.jpg | science | en | 0.98 | 7 | 4 | 4/7 | 2 % / 7 % (3) | -/0 | -/0 | 0/0 | faithful | 0 | 7.2 s | 16.1 s | $0.029 |  |
| gesc110-10.jpg | science | en | 1 | 5 | 5 | 4/5 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 6.2 s | 10.5 s | $0.029 |  |
| hesc108-12.jpg | science | en | 0.98 | 6 | 3 | 4/6 | 3 % / 3 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 6.9 s | 12.4 s | $0.026 |  |
| jesc109-08.jpg | science | en | 1 | 7 | 3 | 4/7 | 0 % / 0 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 6.5 s | 14.8 s | $0.069 |  |
| jesc111-12.jpg | science | en | 0.95 | 4 | 1 | 1/4 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 5.9 s | 15.2 s | $0.030 |  |
