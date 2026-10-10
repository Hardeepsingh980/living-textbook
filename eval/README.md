# Evaluation set and harness

`eval/pages/*.jpg` are page photos; `eval/truth/<same name>.json` holds ground truth: page kind, language, key numeric values
(`values`), printed worked answers (`worked`), characters and dialogue for stories, and `mustNotClaim` strings that must not
appear in labels, narration or lines. Synthetic pages are drawn programmatically; real photos (Android phone, iPad) are added
as they are captured. Pages under `eval/pages/private/` are ignored by git (books that are not openly licensed).

Run against a server (local or deployed):

```bash
node eval/run.mjs --server http://localhost:8080 --runs 1
```

Writes `eval/output/<timestamp>/` with every event stream and `eval/REPORT.md` with: per-page kind/language accuracy,
key-value recall (Q-1), worked-answer match within 2 % (Q-2), render success (scene validates, Q-3), unsupported claims
(Q-4), verification status, cost, and p50/p90 latency per stage (L-1…L-4).
