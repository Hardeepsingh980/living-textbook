# Evaluation report

Generated 2026-10-11T13:00:52.443Z against http://localhost:8080; 1 run(s) over 1 page(s). Events in `eval/output/2026-10-11T13-00-07-979Z/`.

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
| Scenes with ≥ 3 moving elements | 0/1 | all |
| Cost per page | $0.062 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 1.7 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 6.7 s / 6.7 s | 5 s | 10 s |
| L-3 narration starts | 9.7 s / 9.7 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 41.0 s / 41.0 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 44.4 s / 44.4 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.6 s / 2.6 s |
| build | 6.7 s / 6.7 s |
| understand | 37.3 s / 37.3 s |
| verify | 40.7 s / 40.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ncert-c7-science-pendulum.jpg | science | en | 0.98 | 4 | 1 | 2/4 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 6.7 s | 41.0 s | $0.062 |  |
