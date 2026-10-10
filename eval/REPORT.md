# Evaluation report

Generated 2026-10-10T09:16:00.759Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T09-11-29-448Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 7/10 | — |
| Language correct | 10/10 | — |
| Key values recalled (Q-1) | 27/27 (100 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 7/7 | all |
| Page-answer checks passed (Q-2) | 4/4 | all |
| Scenes rendered (Q-3) | 10/10 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 2/5 | — |
| Cost per page | $0.102 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.8 s / 2.3 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 8.9 s / 14.0 s | 5 s | 10 s |
| L-3 narration starts | 5.1 s / 6.7 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 16.2 s / 19.4 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 21.9 s / 43.9 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.6 s / 3.1 s |
| build | 8.9 s / 14.0 s |
| understand | 10.0 s / 14.5 s |
| verify | 16.2 s / 19.4 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 3 | 4 | 0/0 | 0/0 | 0/0 | faithful | 0 | 8.1 s | 13.5 s | $0.194 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 10 | 4 | 1/1 | 0/0 | 0/0 | faithful | 0 | 12.8 s | 16.2 s | $0.096 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 1 | 4 | 1 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 7.0 s | 19.4 s | $0.046 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 10 | 5 | 7/7 | 0/0 | 0/0 | faithful | 0 | 8.3 s | 12.0 s | $0.033 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 5 | 1 | 6/6 | 2/2 | 1/1 | verified-page | 0 | 11.6 s | 16.3 s | $0.134 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 5 | 3 | 0/0 | 0/0 | 0/0 | faithful | 0 | 14.0 s | 16.5 s | $0.080 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 4 | 2 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 13.4 s | 18.7 s | $0.103 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 5 | 3 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 7.5 s | 15.2 s | $0.060 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 6 | 2 | -/0 | -/0 | 0/0 | faithful | 0 | 7.2 s | 14.0 s | $0.158 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 4 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 8.9 s | 12.1 s | $0.113 |  |

## Generation quality (visual judge, 2026-10-10T09:21:54.293Z)

Gemini 3.8 Flash rated the page + overlay screenshots + scene JSON on a 1–5 scale.

| Page | Kind | Clarity | Placement | Readability | Liveliness | Correctness | Narration | Overall | Verdict | Most important fix |
|---|---|---|---|---|---|---|---|---|---|---|
| The Fox and the Crow | story | 2 | 1 | 2 | 2 | 3 | 4 | **2** | redo | Reposition all character sprites and speech bubbles strictly within the bottom illustration panel rather than overlapping the story text above. |
| 5.2 Ohm's law | science | 3 | 2 | 3 | 2 | 4 | 4 | **3** | improve | Reposition badges away from the ammeter icon to avoid clipping/overlap, and animate current flow or dynamic slider changes between steps. |
| 6.1 Photosynthesis | science | 3 | 2 | 3 | 2 | 4 | 3 | **3** | improve | Reposition the green equation banner below the main diagram or inside a dedicated blank area so it does not cover the paragraph text. |
| The Pythagoras theorem | maths | 2 | 2 | 2 | 2 | 4 | 4 | **2** | redo | Draw actual geometric squares (3x3 and 4x4 grids) on the triangle legs and show them reassembling or filling the 5x5 square on the hypotenuse, properly positioned within the figure box. |
| 2.4 Motion under gravity | science | 4 | 3 | 3 | 4 | 5 | 4 | **3** | improve | Shift and resize the plot and telemetry badge so they do not overlap text or completely cover the book's original illustration. |
| 4.5 The water cycle | science | 3 | 3 | 3 | 3 | 4 | 4 | **3** | improve | Reposition the bottom text label so it does not collide with the diagram caption. |
| The Little Red Boat | story | 2 | 2 | 3 | 3 | 2 | 4 | **2** | redo | Replace the broken white placeholder boat graphic with a properly rendered, transparent red sailboat asset aligned with the original drawing. |
| 11.2 Steps to independence | other-subject | 3 | 3 | 3 | 3 | 4 | 3 | **3** | improve | Adjust label positioning and cursor height to avoid obscuring existing printed text. |
| 2.4 गुरुत्व के अधीन गति | science | 4 | 3 | 4 | 4 | 4 | 4 | **3.8** | improve | Shift the x-coordinate of the animated falling rock leftward so it aligns directly with the grey vertical tower track shown in the textbook illustration. |
| How does a rainbow form? | science | 2 | 2 | 4 | 2 | 2 | 4 | **2** | redo | Align the animated light beam precisely with the diagram's incoming line and trace internally reflecting and dispersing rays rather than drawing misaligned extra strokes. |
| **Average** | | 2.8 | 2.3 | 3.0 | 2.7 | 3.6 | 3.8 | **2.7** | | |

<details><summary>The Fox and the Crow</summary>

- **concept_clarity**: The animation fails to clearly enact the fable's action since sprites are misplaced into the text and dialogue pointer points awkwardly.
- **placement**: Sprites like the cartoon fox and crow are scattered directly across the printed body text, and the speech bubble covers the illustration awkwardly.
- **readability**: The speech bubble has an erratic pointer line slicing across it and text readability on the page is heavily impaired by rogue sprites.
- **liveliness**: There is minimal meaningful movement shown across the frames aside from static sprites appearing over text.
- **correctness**: The story beats and dialogue reflect the fable, but the visual execution is broken.
- **narration**: The narration is clear, expressive, child-safe, and accurately recounts the fable.

</details>

<details><summary>5.2 Ohm's law</summary>

- **concept_clarity**: The formula and I-V plot convey the concept, but there is no continuous dynamic motion showing charge flow or interactive parameter variation across the screenshots.
- **placement**: The current label overlaps directly with the ammeter symbol, and the formula label clutters the interior of the circuit diagram.
- **readability**: The red badge text 'Current I = 3.00 A' is cut off or truncated against other elements, and badge sizing clashes with existing line art.
- **liveliness**: The overlay appears completely static across screenshots 1, 2, and 3 without visual indication of flow or changing states.
- **correctness**: The numerical values match the worked example accurately, though formatting precision '{V:0.0f}' evaluated to decimals like '12.00' in the rendered badge.
- **narration**: Narration is educational, clear, and directly connected to Ohm's law and the example on the page.

</details>

<details><summary>6.1 Photosynthesis</summary>

- **concept_clarity**: The rate readouts illustrate production moderately well, though visual animation of the chemical inputs is minimal.
- **placement**: The top equation label partially occludes the original printed paragraph text.
- **readability**: The labels are legible and clearly styled, though some text collisions occur with the page content.
- **liveliness**: Only static light rays and counter numbers change, offering limited continuous visual movement.
- **correctness**: The chemical representation and photosynthetic relationship align well with the page text.
- **narration**: The script is clear and directly reflects the core stages of photosynthesis.

</details>

<details><summary>The Pythagoras theorem</summary>

- **concept_clarity**: The overlay merely places generic glowing rectangles and sparkle particles over the triangle rather than illustrating squares built on the sides or geometric proof.
- **placement**: The large rounded box is placed awkwardly over the illustration and spills across the boundary box, while the text labels defined in the JSON do not even appear visibly in the screenshots.
- **readability**: Key mathematical labels (lbl_a2, lbl_b2, lbl_c) are missing or cut off, and the blurry glowing rectangle obscures the caption 'Fig 8.4'.
- **liveliness**: Only floating sparkle particles animate, with no meaningful dynamic geometry illustrating the theorem.
- **correctness**: The mathematical formulas and numbers in the JSON match the textbook example accurately.
- **narration**: The narration is clear, step-by-step, and age-appropriate for learning the theorem.

</details>

<details><summary>2.4 Motion under gravity</summary>

- **concept_clarity**: The free fall trajectory coupled with the real-time height-time plot clearly explains quadratic displacement over time.
- **placement**: The entire overlay and graph are rendered squarely on top of the original diagram and overlap surrounding text, creating visual clutter.
- **readability**: The telemetry badge overlaps the text paragraph above, and the plot obscures the original artwork.
- **liveliness**: The falling ball animation with simultaneous graph tracing provides clear, dynamic motion.
- **correctness**: Calculations, variables, and formulas exactly mirror the worked example on the page.
- **narration**: The narration is clear, engaging, and faithfully matches the on-screen physics simulation.

</details>

<details><summary>4.5 The water cycle</summary>

- **concept_clarity**: The stages are marked, but the motion feels static across frames.
- **placement**: The overlay boundary extends below the diagram, slightly misaligned with the original box.
- **readability**: The ocean stat label partially overlaps the caption below it.
- **liveliness**: Only subtle vapour and glow effects appear active across the sequence.
- **correctness**: The content accurately mirrors the water cycle steps and data on the page.
- **narration**: The voiceover is clear, age-appropriate, and aligned with the diagram.

</details>

<details><summary>The Little Red Boat</summary>

- **concept_clarity**: The boat sprite appears as an untextured, broken white cutout shape that obscures the original illustration rather than clarifying the sailing action.
- **placement**: The animated boat sprite severely misaligns with and awkwardly partially conceals the original red boat illustration.
- **readability**: The speech bubble tail awkwardly crosses another visual element, though the text itself is readable.
- **liveliness**: There is rocking and bobbing motion, but the visual quality of the boat asset is severely compromised.
- **correctness**: Instead of enhancing the red boat, a large blank white polygon blocks Bobo's red hull and sail.
- **narration**: The narration fits the story text nicely with clear, expressive pacing.

</details>

<details><summary>11.2 Steps to independence</summary>

- **concept_clarity**: The animated marker moves along the timeline to demonstrate chronological progression clearly.
- **placement**: The overlay elements align directly over the printed timeline graphic.
- **readability**: The year counter is clear, though text overlaps slightly on timeline labels.
- **liveliness**: Continuous motion from the pulsing points and moving cursor keeps the view active.
- **correctness**: Dates and historical events match the page faithfully.
- **narration**: The audio scripts are suitable and align with the visual steps.

</details>

<details><summary>2.4 गुरुत्व के अधीन गति</summary>

- **concept_clarity**: The animated falling stone coupled with dynamic readouts of time and velocity nicely clarifies accelerated motion under gravity.
- **placement**: The animated stone is offset onto the line next to the diagram's vertical pillar rather than falling directly through or along the drawn pillar column.
- **readability**: The falling sprite and updating live numbers provide active motion that illustrates the physics equation.
- **correctness**: The calculations (t ≈ 2.02 s, v ≈ 19.8 m/s) match the text and physics laws accurately.
- **narration**: The Hindi narration is natural, concise, and closely matches the topic.
- **liveliness**: The falling sprite and updating live numbers provide active motion that illustrates the physics equation.

</details>

<details><summary>How does a rainbow form?</summary>

- **concept_clarity**: The overlaid beams do not properly align with the existing diagram's rays and add confusing, misdirected lines across the raindrop.
- **placement**: The sun sprite awkwardly overlaps the drawn sun, and the animated rays miss the diagram's optical paths.
- **readability**: The text label 'Sunlight refracts!' is legible and clean, though slightly plain.
- **liveliness**: Movement is sparse, consisting only of static lines popping on or jumping positions clumsily.
- **correctness**: The drawn red ray exits the raindrop in an incorrect direction that conflicts with the diagram's existing refraction paths.
- **narration**: The narration script is well-written, clear, and age-appropriate.

</details>

