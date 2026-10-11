# Living Textbook — Design Language & System Specification

**Version:** 1.0
**Product:** Living Textbook (code name in this repository: Living Book)
**Audience:** Coding agents, frontend engineers, product designers
**Primary goal:** Make static educational content feel alive while keeping the interface calm, premium, intuitive, and trustworthy.

This file is the authoritative design-language specification for the app. It was written by Hardeep on 2026-10-11 and is kept in the repository so that every UI change can be checked against it.

---

## 1. Product Design North Star

### Core idea

> **Don't make AI explain the textbook. Make AI make the textbook interactive.**

Living Textbook transforms physical or uploaded educational content into interactive, spatial, conversational experiences.

The product has three experience pillars:

- **LEARN** — turn textbook concepts into interactive AR lessons.
- **EXPLORE** — manipulate concepts with real-time "What if?" interactions.
- **IMAGINE** — transform storybook pages into living visual stories.

These are not three separate products. They are three modes powered by the same underlying interaction model, visual language, AI reasoning layer, and rendering engine.

### Experience principles

1. **Content is the interface.** The educational content should occupy most of the visual attention. Avoid dashboard-like chrome around the experience.
2. **Magic before complexity.** The first interaction should feel effortless: point, understand, transform.
3. **Calm intelligence.** Gemini should feel like an invisible expert collaborator, not a chatbot pasted onto an AR application.
4. **Spatial continuity.** Elements should appear to grow from, return to, or remain anchored to their source material.
5. **Progressive disclosure.** Show only controls relevant to the current moment.
6. **Trust over spectacle.** Scientific or educational claims must feel deliberate and verifiable. Never use animation purely for visual noise.
7. **Every motion communicates meaning.** Animation should explain relationships, state changes, causality, or focus.

---

## 2. Brand Personality

The product should feel: intelligent, curious, warm, premium, playful but not childish, scientific but not clinical, futuristic but not cyberpunk, educational but not institutional.

Avoid: neon cyberpunk, excessive gradients, gamer aesthetics, generic AI robot imagery, huge glowing "AI" labels, dense enterprise dashboards, excessive glassmorphism, excessive floating cards, cartoonish children's-app styling for the entire product.

### Visual metaphor

> **A page becoming a window into another world.**

The physical textbook is the origin. Digital content grows naturally from it.

---

## 3. Design Language

### 3.1 The "Paper → Light → World" visual progression

- **Layer A — Paper** (the source material): warm off-white surfaces, subtle paper-like neutrals, editorial typography, minimal UI, strong relationship to page content.
- **Layer B — Light** (AI understanding): small spark / intelligence indicator, soft accent highlights, focus rings, subtle scanning states, gentle particle or line effects only when meaningful.
- **Layer C — World** (generated interactive content): objects, depth, spatial lighting, dynamic motion, interactive highlights, contextual labels.

The transition between these layers should be one of the product's signature moments.

---

## 4. Color System

Use a restrained palette.

```css
--color-paper: #F7F4EE;
--color-paper-deep: #EEE9DF;
--color-ink: #18212B;
--color-ink-soft: #44505C;
--color-muted: #78828C;
--color-border: rgba(24, 33, 43, 0.12);
--color-surface: rgba(255, 255, 255, 0.72);

--color-accent: #4C8DFF;
--color-accent-soft: #EAF2FF;
--color-accent-strong: #2F6FE8;

--color-success: #2F8F68;
--color-warning: #B97924;
--color-error: #C94B4B;
```

The accent represents interaction, AI focus, selection, and active state. Do NOT use the accent as the default background of large areas. Semantic colors communicate state, not decoration. The AR visualization may use a broader palette than the UI; the two palettes stay visually distinct so users can tell controls from educational content.

---

## 5. Typography

One highly readable modern sans-serif for the application UI (never more than two families).

```text
Display: 36–48px   H1: 28–34px   H2: 22–26px   H3: 17–20px
Body: 15–17px      Secondary: 13–14px          Caption: 12px
Weights: 400 body · 500 labels · 600 emphasis · 700 headings
```

Generous line height. Use weight for hierarchy rather than many font sizes. No all-caps except tiny mode labels. Educational content is always highly readable.

---

## 6. Spacing System — 8-point base

```text
4px micro · 8px icon/text · 12px compact control · 16px standard · 24px component · 32px section · 48px major section · 64px+ hero
```

---

## 7. Corner Radius

```text
6px small controls · 10px inputs/buttons · 14px cards · 20px floating panels · 28px major contextual surfaces · 999px pills
```

Avoid putting every element inside a rounded card.

---

## 8. Shadows and Depth

Subtle: `box-shadow: 0 8px 30px rgba(24, 33, 43, 0.08);`. No strong black shadows, neon glows everywhere, nested shadows or heavy skeuomorphism. Depth belongs to the educational visualization, not the UI.

---

## 9. Layout Principles

The camera/AR experience is almost full-screen. Educational content is the primary visual focus; contextual controls sit around the edges; no permanent navigation bar.

```text
┌─────────────────────────────┐
│  ←     Chapter / Concept   ✦│
│                             │
│       AR / 3D CONTENT       │
│                             │
│   [Ask] [What if?] [Audio]  │
└─────────────────────────────┘
```

Controls disappear or become less prominent when not needed.

---

## 10. Primary Navigation

Minimal (Home · Explore · My Textbook · Profile, or Learn · Explore · Imagine). No separate navigation trees per mode.

---

## 11. Core Component System

- **Primary button** — the single most important action (Start lesson, Bring it to life, Continue). Strong contrast, 44px+ touch target, one per major surface.
- **Secondary button** — supporting actions (Preview, Save, Replay), lower visual weight.
- **Contextual action pill** — inside the AR experience (Ask Gemini, What if?, Replay, Explain). Lightweight; disappears when not relevant.

---

## 12. Gemini Intelligence Indicator

No large chatbot avatar. A small spark (✦) that becomes a recognizable product signature.

States: **Idle** small static spark · **Thinking** soft pulsing opacity/scale · **Speaking** gentle rhythm synchronized to speech · **Acting** spark moves toward the object being manipulated · **Error / uncertainty** spark becomes neutral and shows a concise explanation.

---

## 13. Camera / Scan Experience

Initial state shows almost nothing: "Point at a textbook page", the spark, "I'll bring it to life."

Detecting: a subtle scanning treatment around the detected region (no aggressive beams). Recognized: highlight the relevant diagram and show the concept name with "Ready to explore". Transition: the diagram visually transforms into the AR scene. No hard cuts, no long-lived spinners, no full-screen "Generating…" modals. Prefer `Detect → Understand → Bloom → Explore`.

---

## 14. Signature "Bring to Life" Animation

1. Camera identifies the diagram. 2. Diagram edges subtly illuminate. 3. Relevant elements separate from the page. 4. Key objects gain depth. 5. Objects expand into the scene. 6. Camera transitions smoothly. 7. Narration begins. 8. The first interactive control appears.

Timing targets: recognition feedback 150–300ms · micro transitions 180–280ms · major transformation 500–900ms · scene settle 200–400ms. Never make a device wait for animation when content is ready.

---

## 15–16. Motion System and Principles

Micro interactions 150–220ms ease-out · standard transitions 220–350ms ease-out · major spatial transformations 500–900ms ease-in-out · subtle springs for pills, selection, focus and panels; no exaggerated bouncing.

Principles: **Continuity** (objects move from where they came from), **Focus** (the explained object becomes prominent), **Causality** (a change animates its consequences: parameter → object → simulation → explanation), **Restraint** (if everything moves, nothing is important).

---

## 17. What-If Interaction

Gemini outputs a structured action, never UI code: `{"action":"change_parameter","parameter":"gravity","value":2,"unit":"multiplier","explanation":"…"}`. The renderer performs the change. **Gemini = reasoning. Renderer = deterministic execution.**

---

## 18. Interactive Tutor

Scene-aware: current lesson, object, scene state, animation timestamp, selection. Responses can trigger visual actions (`{"response":"…","actions":[{"type":"highlight","target":"pulmonary_artery"}]}`). The UI never makes the student find the discussed object by hand.

---

## 19. Audio / Narration

Narration begins only after the visual state is ready; the discussed object is highlighted; pause/replay provided; transcript available; UI labels are not spoken. The spark reacts subtly while narration plays; no large waveform.

---

## 20. Story Mode / Imagine

Same visual language and renderer. Point → identify → understand characters + scene → scene graph → characters emerge → narration → interaction.

---

## 21–23. Upload, Teacher Studio, Learning Gaps

Upload feels like preparing a book for magic; technical states are translated into user language ("9 concepts found, 7 lessons ready, 2 need review"). Teacher Studio is intentionally smaller than the student experience (upload → analysis → review → preview → publish; dashboard of most explored, most difficult, learning gaps, completion). Not a full LMS. Learning gaps use a simple hierarchy with a "Generate intervention" action.

---

## 24. Loading States

Never a generic spinner when meaningful progress can be shown:

```text
✦ Understanding the diagram
✓ Concept identified
✓ Scene prepared
→ Bringing it to life
```

---

## 25. Error States

Preserve the sense of intelligence. Recognition failure: "I couldn't confidently identify this diagram. Try moving closer or pointing at the main illustration." Generation failure: "I couldn't build this lesson safely yet. You can retry, or explore the detected concept instead." Unsupported content: "I understand this page, but I don't have a reliable interactive model for this concept yet." Never expose stack traces or API errors.

---

## 26. Confidence and Trust

Track concept, content, animation and source confidence internally; expose only when useful. For low confidence prefer "I'm not fully confident about this interpretation." over confidently presenting potentially incorrect content.

---

## 27. AI Output Architecture

`Gemini → Structured JSON → Schema validation → Safety / educational validation → Deterministic renderer`. Strict schemas for scene, objects, animations, camera, narration, interactions, parameters, quiz questions, story actions. Gemini never controls arbitrary UI or executes generated JavaScript.

---

## 28. Design Tokens

```css
:root {
  --color-paper: #F7F4EE; --color-paper-deep: #EEE9DF;
  --color-ink: #18212B; --color-ink-soft: #44505C; --color-muted: #78828C;
  --color-accent: #4C8DFF; --color-accent-soft: #EAF2FF;
  --color-success: #2F8F68; --color-warning: #B97924; --color-error: #C94B4B;
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 14px; --radius-xl: 20px; --radius-2xl: 28px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;
  --duration-fast: 180ms; --duration-standard: 280ms; --duration-slow: 700ms;
}
```

If the application has an established theme, adapt these values rather than blindly replacing it.

---

## 29. Component States

Every interactive component defines default, hover, pressed, focus, disabled, loading, success, error. AR components also define detecting, recognized, generating, ready, speaking, interacting, uncertain. Not only the happy path.

---

## 30. Accessibility

44px touch targets, strong contrast, keyboard navigation on web, visible focus, reduced-motion support (reduce camera transitions, particles, pulsing, large transformations while keeping functional state changes), captions/transcripts, no colour-only meaning, non-voice alternatives for voice actions, device font scaling.

---

## 31–32. Responsive Design and Teacher Studio Layout

Mobile: full-screen content, bottom contextual actions, minimal chrome, large targets. Tablet: more contextual controls, optional side panel. Desktop (Teacher Studio): chapters / preview / inspector with the preview dominant. Never force the desktop layout onto the student AR experience.

---

## 33–34. Empty States and Microcopy

Empty states invite action ("Your textbook is waiting to come alive." → **Upload a chapter**). Microcopy is short and human: "Bring it to life", "Explore this", "What are you curious about?", "Try a what-if", "Let's look closer", "Explain this", "Show me", "Test me". Never "Execute", "Generate pipeline", "Invoke model", "Run inference".

---

## 35. Animation Anti-Patterns

Never animate everything on load, bounce everywhere, add meaningless particles, animate text unnecessarily, use long transitions for simple actions, make users wait for decoration, replace content abruptly, or let the UI compete with the scene. **Alive, not busy.**

---

## 36. Performance Requirements

Fast first meaningful state, stable AR anchoring, smooth rendering, low input latency, graceful degradation. Lazy loading, asset caching, level of detail, texture optimization, animation throttling, pre-generation for uploaded chapters. Choose intelligently between live generation, cached lessons and fallback verified lessons.

---

## 37. Design QA Checklist

Visual: hierarchy obvious in one second; content more prominent than UI; restrained colours; no unnecessary cards; readable type. Interaction: feedback for every action; large controls; smooth transitions; recoverable errors. Motion: movement explains something; spatial continuity; fast transitions; reduced-motion works. AI: meaningful reasoning; structured output; uncertainty handled; generated content validated. Accessibility: non-voice path; captions; focus states; reduced motion.

---

## 38. Implementation Rules for Coding Agents

1. Inspect the existing component system first. 2. Reuse primitives. 3. No new component library without strong reason. 4. Centralize tokens. 5. No one-off colours. 6. No arbitrary spacing. 7. Composable components. 8. Business logic separate from presentation. 9. Gemini parsing separate from rendering. 10. Typed schemas for AI scene instructions. 11. Never execute Gemini-generated JavaScript. 12. Centralized motion timing. 13. Respect reduced motion. 14. Design every loading/error state. 15. Mobile first for students. 16. Teacher Studio responsive. 17. Preserve existing functionality. 18. No redesign of working flows for novelty. 19. Subtle polish over more UI. 20. Question any feature that does not strengthen Learn, Explore or Imagine.

---

## 39. Component Naming Convention

Semantic names: LivingTextbookShell, ScanExperience, ConceptOverlay, LessonScene, GeminiSpark, ContextualActions, WhatIfControl, TutorPanel, NarrationControl, ConceptCard, LessonPreview, LessonStudio, ConceptMap, LearningGapPanel, ValidationStatus, SceneInspector. Never BlueBox, NewCard2, TempModal, GeminiThing, ThreeJSPanel.

---

## 40–41. Experience Flow and the Winning Demo

Student: OPEN → POINT → UNDERSTAND → BRING TO LIFE → EXPLAIN → INTERACT → ASK → WHAT IF? → TEST ME → REMEMBER. Teacher: UPLOAD → UNDERSTAND → GENERATE → VALIDATE → PREVIEW → PUBLISH → MEASURE → INTERVENE.

The demo begins with a physical textbook: static page → camera → recognition → AR transformation → narration → student interruption → what-if interaction → learning question. Only then the architecture and Teacher Studio.

---

## 42. Final Design Directive

> **Does this make the content feel more alive without making the experience more complicated?**

If yes, keep it. If it adds visual complexity without improving understanding, interaction, accessibility, trust or delight, remove it. The product should feel like **a textbook discovering that it can become a world.**
