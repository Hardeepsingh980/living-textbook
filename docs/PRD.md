# Living Book — Product Requirements Document

> For Claude Code: this document defines **what** to build and **how good** it must be. It deliberately does not prescribe architecture, stack, models, libraries or a build plan. Research current tools, decide the approach, write your own plan, and confirm it with me before building.

---

## 1. Summary

Living Book turns **any page of any book** into a living, animated, AR experience with audio. A user points their phone at a page and, within seconds, the page comes alive on top of the paper: concepts become interactive, stories become scenes, characters speak, diagrams move.

There are no pre-built demos, templates or hard-coded pages in the product. Every experience is generated from the page the user captures.

---

## 2. Problem

- Most printed content is static. Readers, especially students, memorize what they could understand by seeing and playing with it.
- Many students lack labs, visual aids or good teachers; many children disengage from text-only reading.
- Existing "AI tutor" and "read aloud" tools explain or narrate; they don't make the page itself come alive, and they don't check their own correctness.

---

## 3. Users

| User | Need |
|---|---|
| School and college students | Understand concepts from their textbook by interacting with them |
| Children and parents | Turn bedtime and picture books into engaging, voiced scenes |
| Teachers | Show any page come alive on a projector in class |
| General readers | Experience non-fiction, history, travel or how-to pages visually |
| Readers in Indian and other non-English languages | Same experience in the language of the book |

---

## 4. Product principles

1. **Any book, any page.** The system must generalize. Never hard-code content, page-specific logic or canned experiences.
2. **Fast and good, both.** Latency and quality are equal first-class requirements. A slow wow loses; a fast mess loses.
3. **Faithful to the page.** The experience reflects what the page actually says. No invented facts, values or plot.
4. **Correct when it matters.** Anything factual or numerical is checked, and the user can see that it was checked.
5. **Magical, then deep.** The first seconds should feel like magic; depth (interaction, Q&A) follows.
6. **Never a blank wait.** Progress is always visible and interesting.

---

## 5. Scope: what "any book" must cover

The system classifies each page and produces the most fitting kind of experience. At minimum it must handle:

| Page type | Expected experience (examples, not templates) |
|---|---|
| Science and maths textbooks | Interactive simulation of the concept with adjustable variables, values taken from the page, results checked against the page's worked answers |
| Other school subjects (geography, biology, history, economics) | Animated explainer of the process, map, timeline, system or event described |
| Fiction and storybooks | Animated scene of the page's moment: setting, characters, actions, dialogue, mood |
| Children's picture books | Existing illustrations brought to life with motion and voices, in a style consistent with the book |
| Non-fiction and general reading | Visual, animated summary of the page's key idea |
| Pages with mixed content | Combine the above sensibly, prioritising the page's main purpose |
| Pages in other languages (Hindi first) | Same quality, with text, labels and audio in the page's language |
| Unsupported or unclear pages | A clear, graceful message and the best partial experience possible; never a broken screen |

Continuity across pages: when a user scans several pages of the same book, characters, art style, voices and terminology stay consistent.

---

## 6. Functional requirements

### 6.1 Capture
- **FR-1** Capture a page from the phone camera; also allow uploading a photo or a PDF page.
- **FR-2** Handle real-world photos: angled, curved pages, uneven lighting, partial shadows, two-page spreads (user picks a page), small text.
- **FR-3** Give live guidance when a capture is unusable (too blurry, too dark, page cut off) before processing.

### 6.2 Understanding
- **FR-4** Read all text, diagrams, figures, equations, tables and illustrations on the page.
- **FR-5** Detect page type, subject and language.
- **FR-6** Extract the structured facts the experience depends on: values and units, worked answers, entities, characters, setting, dialogue, steps, relationships.
- **FR-7** Locate key visual elements on the page so the experience can be anchored to them (for example, an animated object rising from the exact spot of its printed counterpart).
- **FR-8** Report confidence; when low, ask the user one quick confirming question or flag uncertainty instead of guessing silently.

### 6.3 Experience generation
- **FR-9** Generate an experience suited to the page type (section 5), entirely from the page's content.
- **FR-10** Experiences are animated, visually rich and coherent: a clear focal point, smooth motion, readable labels.
- **FR-11** Interactive where the content allows: adjustable variables, tappable elements, replay, step-through.
- **FR-12** Visual style adapts to the book (textbook clarity vs storybook warmth; consistent with existing illustrations where present).
- **FR-13** Generated visuals are original works inspired by the page; they must not attempt to replicate copyrighted artwork exactly.

### 6.4 Correctness and verification
- **FR-14** For factual and numerical content, the system verifies its output: against worked answers on the page where available, and against independent calculation or reasoning otherwise.
- **FR-15** When verification fails, the system attempts to correct itself before showing a final result.
- **FR-16** The user sees verification status plainly (verified against the page, checked independently, or unverified), and can open a short log of what was checked.
- **FR-17** Story and non-fiction experiences stay faithful to the page: no added plot events, facts or characters not supported by the page.

### 6.5 AR presentation
- **FR-18** The experience appears anchored on the physical page and stays aligned as the phone moves.
- **FR-19** Graceful fallbacks when tracking is unavailable or weak: an aligned camera overlay, then a flat full-screen view.
- **FR-20** A flat, camera-free mode for projectors, desktops and shared links.
- **FR-21** Works on mainstream Android phones and iPhones in current browsers; any device-specific limitation degrades gracefully.

### 6.6 Audio
- **FR-22** Every experience has audio: narration of the page or explanation, and distinct character voices for stories.
- **FR-23** Audio is natural and expressive, in the page's language, with pronunciation suitable for the region.
- **FR-24** Captions synced to speech, on by default.
- **FR-25** Sound design that fits the content (ambience, effects), mixed so speech stays clear.
- **FR-26** Global mute, replay, and per-element replay (tap a character to hear their line again).

### 6.7 Conversation
- **FR-27** The user can ask questions about the page by voice or text and get spoken and written answers grounded in the page and in the current state of the experience (for example, current slider values).
- **FR-28** Answers stay within what the page supports, and say so when a question goes beyond it.

### 6.8 Library and sharing
- **FR-29** Save experiences; revisit recent ones instantly without regenerating.
- **FR-30** Group pages by book to maintain continuity (section 5).
- **FR-31** Share an experience by link; it opens in flat mode on any device.

### 6.9 Transparency ("agent theatre")
- **FR-32** While generating, show what the system is doing in real time, in plain language, with timings: reading, understanding, building, verifying, voicing.
- **FR-33** This view doubles as a demonstration of the AI pipeline for judges and should be visually engaging.

---

## 7. Quality requirements

| ID | Requirement | Target |
|---|---|---|
| Q-1 | Text and value extraction accuracy on clean and moderately difficult photos | ≥ 95% of key values correct |
| Q-2 | Numerical simulations match page worked answers when present | Within 2% |
| Q-3 | Experiences that run without errors on first render | ≥ 95% |
| Q-4 | Faithfulness: no unsupported facts or plot additions | Zero in evaluation set |
| Q-5 | Visual consistency of characters and style across pages of one book | Recognizably the same in a side-by-side review |
| Q-6 | Animation smoothness on a mid-range phone | 60 fps target, never below 30 fps |
| Q-7 | Audio naturalness and language correctness, including Hindi | Rated "natural" by native speakers in review |
| Q-8 | Anchoring: animated elements align with their printed counterparts | Visibly aligned in normal handheld use |
| Q-9 | Accessibility | Captions default on, reduced-motion respected, readable contrast |

Quality must be measured, not assumed: maintain an evaluation set of real page photos across all page types in section 5, including difficult captures and Hindi pages, with a repeatable way to score accuracy, faithfulness, render success and latency.

---

## 8. Latency requirements

Latency is a primary requirement. Measure from the moment the user confirms a capture.

| ID | Moment | Target | Hard limit |
|---|---|---|---|
| L-1 | First meaningful feedback (page understood, progress visible) | ≤ 1.5 s | 3 s |
| L-2 | First visible, animated, anchored experience | ≤ 5 s | 10 s |
| L-3 | Narration starts | ≤ 6 s | 12 s |
| L-4 | Full experience complete (all elements, verification status final) | ≤ 15 s | 30 s |
| L-5 | Reopening a saved or previously scanned page | ≤ 1 s | 2 s |
| L-6 | Interaction response (slider, tap) | ≤ 50 ms | 100 ms |
| L-7 | Answer to a spoken question starts playing | ≤ 2 s | 4 s |

Expectations:
- The experience should build **progressively**: show something good early and enrich it, rather than wait for everything.
- Quality must not be traded away silently for speed; if a faster path produces a lesser result, the system upgrades it in place when the better result is ready.
- Report p50 and p90 latency per stage in the evaluation.

---

## 9. Non-functional requirements

- **NFR-1 Reliability:** no crashes or blank screens; every failure has a friendly message and a recovery action.
- **NFR-2 Mobile first:** designed for one-handed portrait use; works on desktop too.
- **NFR-3 Privacy:** page photos are used only to generate the experience; strip location metadata; no data shared with third parties beyond the required AI services; user can delete their library.
- **NFR-4 Security:** no credentials in the client or repository; generated code (if any) is isolated and cannot access the network or user data.
- **NFR-5 Safety:** child-friendly output by default; filter unsafe generated content.
- **NFR-6 Copyright:** users process their own books; generated media is original; the public demo, video and repo examples use public-domain or openly licensed books only.
- **NFR-7 Cost awareness:** track the cost per generated experience and keep it reasonable for a free consumer app; cache aggressively.
- **NFR-8 Observability:** per-stage timing, success/failure and verification outcomes are logged.

---

## 10. Hard constraints (hackathon rules)

This is an entry for the **Google Cloud AI Builder Cup 2026**.

- Must use Google AI models (such as Gemini or Gemma) or Google agentic platforms (such as Agent Platform, Antigravity or AI Studio).
- Must be deployed on Google Cloud via **Cloud Run or Firebase**.
- Must be a working, functional prototype, not a mockup.
- Public GitHub repository.
- All code, documentation and presentation materials in English (the app processes other languages).
- Prototype due **October 18, 2026** (confirm on the official Hack2skill page). Today is October 10.

Judging weights, which should inform every trade-off:

| Criterion | Weight |
|---|---|
| Technical Merit & Gen AI Implementation | 40% |
| Problem Alignment & Impact | 25% |
| Innovation & Creativity | 25% |
| User Experience & Solution Design | 10% |

Submission also requires: a deck (PDF), a 3-minute public demo video, and the public repo.

---

## 11. Success criteria

The prototype is successful when, using real books that were never seen during development:

1. A science textbook page becomes an interactive, verified simulation anchored on the page, within the latency targets.
2. A storybook page becomes a voiced, animated scene anchored on the page, within the latency targets.
3. A page from a third, different category (for example, geography or history) produces a fitting, coherent experience.
4. A Hindi page produces the same quality of experience in Hindi.
5. A deliberately hard page produces either a good experience or a graceful, honest fallback.
6. Three consecutive live runs of the above complete without failure.
7. The evaluation report shows quality (section 7) and latency (section 8) results against targets.

---

## 12. Out of scope (for this prototype)

- Native mobile apps (web only).
- Full-book processing in one go (page-by-page is enough; continuity across scanned pages is in scope).
- User accounts beyond what is needed for a personal library and sharing.
- Offline mode.
- Editing generated experiences by hand.

---

## 13. Open questions for Claude Code to research and decide

Research current options and recommend, with reasoning, before building:

1. Which current Google models and APIs best meet the quality and latency targets for each capability (reading pages, generating experiences, images, speech, real-time voice)?
2. How to generate experiences for *any* page without hard-coded templates while still meeting reliability (Q-3) and correctness (Q-2) targets.
3. How to achieve page-anchored AR on both Android and iPhone browsers, for arbitrary pages captured at runtime.
4. How to hit L-2 (first anchored experience in ≤ 5 s) given generation times, including progressive rendering strategies.
5. How to keep characters, art style and voices consistent across pages of the same book.
6. How to verify correctness for subjects where there is no worked answer on the page.
7. How to build the evaluation set and scoring so quality and latency are measured honestly.
8. What the riskiest assumptions are, and how to test them in the first day.

---

## 14. What I want from you first

1. Research the open questions in section 13 using current official documentation.
2. Propose the approach, architecture and stack, with the trade-offs you considered.
3. Identify the top risks to quality and latency, and how you will de-risk them early.
4. Propose your build plan to meet the October 18 deadline.
5. Wait for my go-ahead before writing application code.
