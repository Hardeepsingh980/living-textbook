# Pending: round-three server changes (not yet applied)

Apply in order **while no evaluation run is in progress** (each edit restarts the dev server):

```bash
python3 eval/pending/patch-round3.py && python3 eval/pending/patch-round3b.py
cd apps/server && pnpm exec tsc --noEmit
```

What they do: the quick read also returns body-text boxes; free regions (margins and gaps) are computed and given to the scene
builder for labels/plots; rule "never re-print labels, explain with motion, animate on the printed structure"; the tracking
compile starts only after the scene requests are sent; deterministic numeric-faithfulness check (numbers in labels and slider
initial values must appear on the page, offending labels are stripped and reported); number formats for years/counts; richer
scene budget 3200 tokens / 60 s timeout (3 of 10 timed out at 40 s).

Then: `node eval/run.mjs --server http://localhost:8080` → `node eval/shoot.mjs --server http://localhost:8080 --from eval/output/<stamp>`
→ `node eval/judge.mjs --server http://localhost:8080 --shots eval/output/<stamp>/shots` → `node eval/compare.mjs <A judgements> <B judgements>`
→ redeploy (`gcloud run deploy living-book --source . --region asia-south1 ...`, see docs/PROGRESS.md).
