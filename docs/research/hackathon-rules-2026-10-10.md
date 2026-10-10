# Research notes: Google Cloud AI Builder Cup 2026 rules and prior art (verified 2026-10-10)

> Compiled by an automated research agent from the official site, FAQ and terms on 2026-10-10. The terms state they prevail over inconsistent material; re-check the Hack2skill Vision dashboard for the exact submission cutoff. Items marked UNVERIFIED could not be confirmed.

## Identity and eligibility

- Official site: https://aibuildercup.com/ ("AI Builder Cup 2026", organised by Hack2skill, sponsored by Google Cloud, "independently operated by Hack2skill"). `hack2skill.com/event/aibuildercup2026` and `vision.hack2skill.com/event/aibuildercup2026` redirect there. Registration/submission: Hack2skill Vision team dashboard. Terms: https://docs.google.com/document/d/e/2PACX-1vRm7ChZ6Ij9fG7uFDkxzUMpwgVeBmnQ6cMDnAIEEX84AiLBOOQ9cYbl3S5OzFBbcVb8TF55s-eVpiXb/pub. Support: support+aibuildercup@hack2skill.com; Discord https://discord.gg/x5GRzJbKpa.
- Eligibility (https://aibuildercup.com/Faqs.html, terms): legal residents physically based in JAPAC (country list not published, UNVERIFIED for India though a +91 phone and TDS clause imply Indian operations); age 21+; working professionals, entrepreneurs and startups only; full-time or part-time students strictly ineligible and one student disqualifies the whole team; **teams of 2–4 (solo registration allowed, solo submission not)**; cross-country JAPAC teams allowed; one team, one theme; only 2 members travel to the finale.

## Timeline (no timezone published, UNVERIFIED)

| Phase | Dates |
|---|---|
| Registration and team formation | 1 Sep – 11 Oct 2026 ("No team roster changes are allowed after October 11") |
| Prototype building and submission | 7 Sep – 18 Oct 2026 ("Prototype submission deadline Oct 18, 2026") |
| Evaluation | 19 Oct – 6 Nov 2026 |
| Finalists announced | 7 Nov 2026 |
| Grand Finale, Singapore | 4 Dec 2026 |

Earlier aggregator dates (30 Sep / 4 Oct) reflect the pre-extension schedule.

## Submission requirements (https://aibuildercup.com/themes.html, FAQ, terms)

1. A working deployed live URL on Cloud Run / GCP / Firebase.
2. A video demonstration strictly under three minutes: public YouTube, Vimeo or Google Drive link.
3. A public GitHub repository containing the source code.
4. A deck converted to PDF (no page limit): vision and positive impact, alignment with one problem statement, the problem and how it benefits the community, feasibility, potential for scalability; terms add "solution architecture and business case".
5. All materials, including code, documentation and presentations, in English.

Portal form fields are not published (UNVERIFIED).

## Technical rules

- "All submissions must leverage Google AI models (like Gemini or Gemma) or be built using agentic platforms (such as Agent Platform, Antigravity, or AI Studio), and they must be deployed on Google Cloud via Cloud Run or Firebase."
- Terms: built primarily on the Google Cloud tech stack; solutions built primarily on competing cloud infrastructure are ineligible. No explicit ban on non-Google AI APIs, but "primarily" and the 40% Gen AI criterion make them a liability.
- Originality: "Submissions must consist exclusively of fresh code and original assets created during the official hackathon timeline. Pre-existing products, ongoing projects, or code developed prior to the official launch will be disqualified."
- IP: participant is sole author and copyright owner; organiser gets a worldwide, perpetual, irrevocable, non-exclusive marketing licence, a 6-month right of first refusal on any exclusive licence, and may publish submitted ideas. Prizes paid within 60 days less TDS.
- No Google Cloud credits, coupons or "built with Google Cloud" badge requirement found on the site (credits via Discord/dashboard UNVERIFIED).

## Judging and themes

- Weights confirmed: Technical Merit & Gen AI Implementation 40%; Problem Alignment & Impact 25%; Innovation & Creativity 25% ("meaningful differentiation from existing solutions"; Gen AI "beyond a basic or superficial implementation"); User Experience & Solution Design 10%.
- Six themes, same criteria for all; no education track. Theme 4: "Media, Content & Digital Experiences — Build an AI-powered solution that transforms how content is created, discovered, personalized, understood, or experienced. Solutions may address challenges across media, entertainment, publishing, education, communication, or other digital content ecosystems." Fallback: "Sustainability & Social Impact". A stale line on themes.html listing Healthcare/Education/Sustainability/Accessibility/Social Good contradicts the six themes; the terms prevail.
- Prizes (https://aibuildercup.com/rewards.html): $10,000 / $7,000 / $5,000, plus $2,000 each for Best use of Google Cloud AI tools, Most Impactful Solution, Social Choice Award, Best UI/UX.
- No prior "AI Builder Cup 2025"; nearest predecessor is the India-only Gen AI Exchange Hackathon 2025 (winners were sector-specific agentic/RAG/multimodal apps) (https://blog.hack2skill.com/gen-ai-exchange-hackathon-finale).

## Discrepancies with the PRD

1. The event lives at aibuildercup.com plus the Hack2skill Vision dashboard.
2. Oct 18 is right, but team formation closes 11 Oct and solo submission is impossible.
3. JAPAC, 21+, professionals only; any student teammate disqualifies everyone.
4. Weights 40/25/25/10 confirmed.
5. No "AI for learning" track; choose one of six themes (Theme 4 names education).
6. All code and assets must post-date 7 Sep 2026.
7. Video strictly under 3 minutes, public link.
8. Cloud Run/Firebase deployment mandatory.
9. No credits promised.
10. IP: non-exclusive marketing licence plus 6-month ROFR.
11. "Agent Platform" is the renamed Vertex AI; "Antigravity" is an IDE and a managed agent; neither substitutes for Gemini inside the product.

## Judging implications

1. Make Gemini load-bearing and visible: page → structured understanding → scene/simulation generation → self-verification, with an architecture slide naming every Google service; target "Best use of Google Cloud AI tools".
2. Write the alignment section in Theme 4's own words; add accessibility and language inclusion for impact.
3. Fresh-code hygiene: public repo whose first commit is after 7 Sep, no vendored prior code, dated English README.
4. Stable Cloud Run URL judges can open cold, with sample pages preloaded; cap spend.
5. Video ≤2:45, public YouTube, live app not slides, agent pipeline on screen.
6. Differentiation slide against Learn Your Way, Gemini simulations and Bookful: any page, any book, runtime, AR-anchored, self-verifying, page-language voice.
7. UX 10% + Best UI/UX prize: graceful fallback when AR tracking fails, captions, accessibility.
8. Ask Discord for the deadline timezone and credits; submit by the evening of 17 Oct IST.

## Products named in the rules

- **Agent Platform**: on 22 Apr 2026 Google renamed Vertex AI to "Gemini Enterprise Agent Platform" (Agent Engine → Agent Runtime, Vertex AI Studio → Agent Studio, Agent Builder folded in). Pieces: ADK, Agent Studio, Model Garden, RAG Engine, Vector Search, Managed Agents API, Agent Runtime, Sessions, Memory Bank, Code Execution, Agent Registry/Identity/Gateway, evaluation and trace viewer. (https://docs.cloud.google.com/gemini-enterprise-agent-platform/overview)
- **Antigravity**: launched Nov 2025 as an agentic development platform (editor, manager surface, artifacts); now Antigravity 2.0 with CLI, SDK, IDE and extensions, free. Separately, the Gemini API offers an "Antigravity agent" (`antigravity-preview-09-2026`, Interactions API, sandboxed code execution, web search, MCP). (https://antigravity.google/, https://ai.google.dev/gemini-api/docs/antigravity-agent)

## Prior art and the gap Living Book fills

- **Learn Your Way** (Google Research, Sep 2025): textbook PDF → immersive text, narrated slides, audio lesson, mind map, quizzes; RCT with 60 students (+9% immediate, 78% vs 67% retention). Gap: pre-processed PDFs, no camera, no physical page, no AR, no visible verification. (https://research.google/blog/learn-your-way-reimagining-textbooks-with-generative-ai/)
- **Gemini app**: Guided Learning (Aug 2025), generative interfaces (Nov 2025), interactive simulations and 3D models on "show me" prompts (Aug 2026), Storybooks (10-page new stories with narration in 45+ languages), Live camera sharing. Gap: chat-bound and prompt-triggered; not anchored to a printed page; no persistent AR; pipeline hidden.
- **NotebookLM Video Overviews** (Jul 2025): narrated explainer videos from sources. Gap: non-interactive, not page-triggered.
- **Khanmigo**: Socratic tutor over Khan Academy content; no page scanning or AR.
- **Augmented Physics** (UIST 2024): textbook diagrams → embedded interactive simulations via Segment Anything + multimodal LLMs, semi-automatic. Gap: physics only, semi-manual, no camera AR, unvoiced. (https://arxiv.org/abs/2405.18614)
- **Commercial AR books**: Bookful, Wonderscope, Narrator AR, Arloopa. Gap: every title pre-authored; no generative AI; not "any page of any book".
- **Hackathon projects**: EduAR (Unity/Vuforia, hand-made models, no AI); Gemini Live Agent Challenge 2026 winners Sankofa and Relay. Gap: none scan arbitrary printed pages, anchor AR to them, or self-verify.
- **Name collision**: "Living Book" by AI Books (https://aibooks.pl/living-book/?lang=en) and Broderbund's 1990s "Living Books"; trademark status UNVERIFIED.
