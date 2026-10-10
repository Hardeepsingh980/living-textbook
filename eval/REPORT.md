# Evaluation report

Generated 2026-10-10T12:48:34.919Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T12-45-15-005Z/`.

## Summary

| Metric | Result | Target |
|---|---|---|
| Page kind correct | 7/10 | — |
| Language correct | 10/10 | — |
| Key values recalled (Q-1) | 27/27 (100 %) | ≥ 95 % |
| Worked answers extracted within 2 % (Q-2) | 7/7 | all |
| Page-answer checks passed (Q-2) | 2/2 | all |
| Scenes rendered (Q-3) | 10/10 | ≥ 95 % |
| Unsupported claims found (Q-4) | 0 | 0 |
| Story dialogue preserved | 5/5 | — |
| Cost per page | $0.090 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.9 s / 2.9 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 9.1 s / 13.3 s | 5 s | 10 s |
| L-3 narration starts | 5.5 s / 6.8 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 15.3 s / 18.2 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 20.5 s / 23.4 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.7 s / 3.7 s |
| build | 9.1 s / 13.3 s |
| understand | 9.0 s / 13.0 s |
| verify | 15.3 s / 18.2 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 1 | 4 | 0/0 | 0/0 | 0/0 | faithful | 0 | 9.0 s | 15.3 s | $0.129 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 4 | 3 | 1/1 | 0/0 | 0/0 | faithful | 0 | 11.7 s | 17.6 s | $0.097 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 0.98 | 7 | 3 | 4/4 | 2/2 | 0/0 | checked-independently | 0 | 6.9 s | 12.7 s | $0.097 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 6 | 6 | 7/7 | 0/0 | 0/0 | faithful | 0 | 8.5 s | 11.2 s | $0.100 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 9 | 4 | 6/6 | 2/2 | 0/0 | failed | 0 | 12.3 s | 18.2 s | $0.030 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 4 | 2 | 0/0 | 0/0 | 0/0 | faithful | 0 | 13.3 s | 17.0 s | $0.058 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 7 | 4 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 9.1 s | 17.2 s | $0.100 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 6 | 4 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 8.7 s | 12.2 s | $0.028 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 7 | 3 | -/0 | -/0 | 0/0 | faithful | 0 | 7.0 s | 10.6 s | $0.127 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 9.2 s | 11.9 s | $0.134 |  |

## Generation quality (visual judge, 2026-10-10T12:52:11.088Z)

Gemini 3.8 Flash rated the page + overlay screenshots + scene JSON on a 1–5 scale.

| Page | Kind | Clarity | Placement | Readability | Liveliness | Correctness | Narration | Overall | Verdict | Most important fix |
|---|---|---|---|---|---|---|---|---|---|---|
| How does a rainbow form? | science | 3 | 2 | 2 | 3 | 3 | 3 | **2** | improve | Reposition the 'Refraction bends light' label away from the body text into an open margin area. |
| The Little Red Boat | story | 3 | 2 | 3 | 3 | 2 | 3 | **2** | improve | Align the animated boat sprite directly over the original drawing and remove the unprompted extra dialogue. |
| The Fox and the Crow | story | 3 | 2 | 3 | 3 | 3 | 4 | **3** | improve | Align sprites directly over the original illustration elements rather than duplicating a second fox and crow beside them. |
| 5.2 Ohm's law | science | 4 | 4 | 4 | 3 | 5 | 4 | **4** | improve | Ensure electron flow particle animation is clearly visible traveling through the circuit wire loop. |
| 2.4 Motion under gravity | science | 3 | 2 | 3 | 3 | 4 | 3 | **3** | improve | Move the graph plot down onto the document surface and increase contrast for the velocity readout text. |
| 8.3 The Pythagoras theorem | maths | 2 | 2 | 3 | 1 | 4 | 4 | **2** | redo | Render visible geometric squares along each side of the triangle to visually demonstrate the sum of squares formula rather than just highlighting the hypotenuse. |
| 4.5 The water cycle | science | 3 | 2 | 3 | 3 | 4 | 4 | **3** | improve | Realign the sun glow directly onto the printed sun and move the cloud overlay slightly upward to avoid obscuring the printed label 'condensation'. |
| 11.2 Steps to independence | other-subject | 3 | 3 | 3 | 3 | 4 | 4 | **3** | improve | Adjust the placement of the info box so it stays entirely clear of the figure frame borders. |
| 6.1 Photosynthesis | science | 3 | 3 | 4 | 2 | 4 | 3 | **3** | improve | Add animated visual arrows or particles showing water intake and gas exchange around the plant. |
| 2.4 गुरुत्व के अधीन गति | science | 4 | 2 | 2 | 3 | 5 | 4 | **2** | improve | Relocate the readout panel beneath the diagram box or shrink it to the empty bottom margin so it doesn't cover the problem text. |
| **Average** | | 3.1 | 2.4 | 3.0 | 2.7 | 3.8 | 3.6 | **2.7** | | |

<details><summary>How does a rainbow form?</summary>

- **concept_clarity**: The path highlights the light trajectory, but refraction inside the droplet is slightly imprecise.
- **placement**: The text label directly overlaps the printed paragraph text instead of remaining in empty space.
- **readability**: The overlaid text box cuts through the underlying sentences, making both difficult to read.
- **liveliness**: The beam progression gives an adequate sense of motion across the diagram.
- **correctness**: The basic path traces the light ray, though the angle through the droplet is somewhat misaligned.
- **narration**: The script is clear, child-friendly, and accurately reflects the phenomenon described.

</details>

<details><summary>The Little Red Boat</summary>

- **concept_clarity**: The animation shows basic boat rocking but adds little pedagogical depth.
- **placement**: The duplicated boat sprite is misaligned and collides badly with the underlying illustration.
- **readability**: The speech bubble tail awkwardly pierces the text frame and sprite backgrounds are harsh white boxes.
- **liveliness**: Continuous bobbing is present though visual glitches distract from the motion.
- **correctness**: The overlay invents extraneous dialogue not present in the original story text.
- **narration**: The narration fits the tone of the book generally well but includes unverified lines.

</details>

<details><summary>The Fox and the Crow</summary>

- **concept_clarity**: The animation illustrates the story events at a basic level but adds limited conceptual depth beyond the text.
- **placement**: The added sprites duplicate characters already printed in the illustration and speech bubbles clash with existing artwork.
- **readability**: Text elements are mostly legible though dialogue pointers and labels crowd the existing visual frame.
- **liveliness**: Characters move and speech bubbles toggle across steps, providing modest visual dynamics.
- **correctness**: The narrative sequence matches the fable, with minor unwritten embellishments like the crow's cawing.
- **narration**: The voiceover is clear, appropriate in tone, and directly aligns with the story events.

</details>

<details><summary>5.2 Ohm's law</summary>

- **concept_clarity**: The formula badge and ammeter readout clearly connect the calculation to the schematic diagram.
- **placement**: The callouts fit well around the circuit without obscuring the main diagram lines or key text.
- **readability**: Clean badges with high-contrast text make the equation and current readout easy to read.
- **liveliness**: Although particles are defined in JSON, static screenshots show minimal visual motion feedback for the electron current.
- **correctness**: Values of 12 V, 4 ohms, and 3.0 A perfectly match Example 5.1 on the page.
- **narration**: Narration is clear, educational, and aligns directly with the circuit example.

</details>

<details><summary>2.4 Motion under gravity</summary>

- **concept_clarity**: The motion clarifies free fall kinematics, though overlaying it on an unrelated geometric drawing reduces contextual clarity.
- **placement**: The plot is positioned outside the main page area in the top margin, and overlays slightly clip the text box boundaries.
- **readability**: Readout boxes have clear contrast, but white text inside the red velocity badge suffers from legibility issues.
- **liveliness**: Numerical values and the plotted path demonstrate continuous updating during playback.
- **correctness**: Formulas and calculated values closely match the numerical values in Example 2.3.
- **narration**: The spoken explanations are clear, age-appropriate, and directly correspond to the physics concept.

</details>

<details><summary>8.3 The Pythagoras theorem</summary>

- **concept_clarity**: The overlay merely highlights the hypotenuse with a green line and frames the diagram, without visually displaying the squares on the sides described in the script.
- **placement**: The blue bounding card extends awkwardly outside the original diagram boundary box at the bottom, overlapping caption text.
- **readability**: The thin green overlay line is visible, but the intended labels and equations defined in the JSON do not actually appear in the rendered screenshots.
- **liveliness**: Across all three screenshots there is virtually no perceptible movement or stage progression visible on screen.
- **correctness**: The underlying mathematical formula and values match the textbook example accurately.
- **narration**: The voiceover text is educational, clear, and well-matched to the textbook lesson.

</details>

<details><summary>4.5 The water cycle</summary>

- **concept_clarity**: The visual concept attempts to illustrate water cycle stages, but misplaced elements reduce pedagogical impact.
- **placement**: The yellow sun glow is shifted below the original sun illustration, the cloud overlay obscures the original text label 'condensation', and the container boundary extends awkwardly outside the figure box.
- **readability**: The added cloud graphic directly overlaps and blurs the printed 'condensation' label, hurting legibility.
- **liveliness**: There is animated state progression with sun glow, highlights, and particles, though visual alignment is weak.
- **correctness**: The facts align accurately with the text, including the 97% ocean water statistic.
- **narration**: Narration lines clearly explain evaporation, condensation, and precipitation in age-appropriate language.

</details>

<details><summary>11.2 Steps to independence</summary>

- **concept_clarity**: The timeline tracker helps illustrate chronological milestones simply.
- **placement**: The info box clips slightly over the figure boundary, though text remains legible.
- **readability**: Labels and badge text are legible with moderate contrast against background elements.
- **liveliness**: The glow indicator and particles provide modest dynamic feedback across timeline steps.
- **correctness**: Dates and historic events faithfully mirror the text content.
- **narration**: Voiceover provides clear and age-appropriate explanations aligned with the dates.

</details>

<details><summary>6.1 Photosynthesis</summary>

- **concept_clarity**: The rate badge adds minimal conceptual understanding beyond the static text.
- **placement**: The percentage label sits right above the figure border without obstructing key diagrams.
- **readability**: Text within the badge is crisp, well-contrasted, and easy to read.
- **liveliness**: There is virtually no visual animation displayed across the screenshots.
- **correctness**: Content aligns with the page's explanation of light-dependent photosynthesis.
- **narration**: Narration scripts are appropriate and directly describe the process steps.

</details>

<details><summary>2.4 गुरुत्व के अधीन गति</summary>

- **concept_clarity**: The motion along the graph and fall dynamics clearly reinforce velocity-time and distance concepts.
- **placement**: The readout box is placed directly over the Hindi body text above the diagram, obscuring essential problem statements.
- **readability**: The dark translucent overlay box severely clashes with and blurs the underlying page text.
- **liveliness**: There is dynamic readout tracking and dot movement along the graph, though animating the falling ball itself in the diagram would be more intuitive.
- **correctness**: All physics formulas, variables, Hindi terms, and numerical solutions exactly match the page example.
- **narration**: The narration is accurate, concise, and recorded in natural Hindi matching the lesson.

</details>

