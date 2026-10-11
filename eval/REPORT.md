# Evaluation report

Generated 2026-10-11T11:53:41.139Z against http://localhost:8080; 14 run(s) over 14 page(s). Events in `eval/output/2026-10-11T11-48-18-174Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 0/0 | — |
| Language correct | 0/0 | — |
| Key values recalled (Q-1) | 0/0 (0 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 0/0 | all |
| Page-answer checks passed (Q-2) | 1/1 | all |
| Scenes rendered (Q-3) | 13/14 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 0/0 | — |
| Overlays clear of printed ink (worst label < 10 % ink) | 11/13 | all |
| Scenes with ≥ 3 moving elements | 13/14 | all |
| Cost per page | $0.039 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 2.1 s | 1.5 s | 3 s |
| L-2 first generated scene (held until verified; the reveal is at L-4 plus clip and picture loading) | 7.3 s / 8.8 s | 5 s | 10 s |
| L-3 narration starts | 9.5 s / 10.9 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 14.2 s / 21.8 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 23.2 s / 30.8 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.6 s / 3.6 s |
| build | 7.3 s / 8.8 s |
| understand | 11.4 s / 19.1 s |
| verify | 14.2 s / 21.8 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ncert-c1-english-two-little-hands.jpg | picture-book | en | 0.95 | 7 | 3 | 5/7 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 8.8 s | 13.0 s | $0.026 |  |
| ncert-c1-hindi-chanda-mama.jpg | - | - | - | 0 | 0 | -/- | - | -/0 | -/0 | 0/0 | none | 0 | – | – | $0.000 | Expected ',' or ']' after array element in JSON at position 1485 (line 60 column |
| ncert-c1-hindi-meena-family.jpg | story | hi | 1 | 8 | 4 | 4/8 | 2 % / 4 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 7.8 s | 14.3 s | $0.027 |  |
| ncert-c10-english-letter-to-god.jpg | story | en | 0.95 | 7 | 3 | 5/7 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | failed | 0 | 7.8 s | 17.3 s | $0.097 |  |
| ncert-c10-maths-lamppost-shadow.jpg | maths | en | 0.98 | 7 | 3 | 5/7 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | checked-independently | 0 | 14.1 s | 16.6 s | $0.027 |  |
| ncert-c10-maths-proportionality.jpg | maths | en | 1 | 9 | 4 | 5/9 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | failed | 0 | 6.6 s | 15.8 s | $0.030 |  |
| ncert-c10-science-ohms-law.jpg | science | en | 0.98 | 8 | 3 | 5/8 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | failed | 0 | 6.9 s | 14.2 s | $0.027 |  |
| ncert-c10-science-refraction-slab.jpg | science | en | 1 | 9 | 3 | 6/9 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | failed | 0 | 7.2 s | 28.3 s | $0.062 |  |
| ncert-c10-science-resistors-series.jpg | science | en | 1 | 8 | 4 | 3/8 | 0 % / 1 % (0) | -/0 | -/0 | 1/1 | verified-page | 0 | 6.8 s | 12.3 s | $0.047 |  |
| ncert-c3-english-picture-story-1.jpg | picture-book | en | 1 | 6 | 2 | 4/6 | 26 % / 49 % (1) | -/0 | -/0 | 0/0 | faithful | 0 | 8.0 s | 11.4 s | $0.024 |  |
| ncert-c3-english-picture-story-2.jpg | story | en | 0.95 | 9 | 4 | 5/9 | 18 % / 52 % (2) | -/0 | -/0 | 0/0 | faithful | 0 | 8.1 s | 12.6 s | $0.031 |  |
| ncert-c3-hindi-seekho-poem.jpg | story | hi | 0.98 | 7 | 3 | 5/7 | 1 % / 2 % (1) | -/0 | -/0 | 0/0 | faithful | 0 | 7.3 s | 9.9 s | $0.094 |  |
| ncert-c7-science-distance-time-graph.jpg | science | en | 1 | 7 | 3 | 5/7 | 0 % / 0 % (1) | -/0 | -/0 | 0/0 | failed | 0 | 6.3 s | 14.0 s | $0.059 |  |
| ncert-c7-science-pendulum.jpg | science | en | 0.98 | 5 | 3 | 4/5 | 0 % / 0 % (1) | -/0 | -/0 | 0/0 | failed | 0 | 6.5 s | 21.8 s | $0.000 | 16 UNAUTHENTICATED: Request had invalid authentication credentials. Expected OAu |
