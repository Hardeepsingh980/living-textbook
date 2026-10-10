# Evaluation report

Generated 2026-10-10T12:57:25.949Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T12-54-09-146Z/`.

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
| Story dialogue preserved | 5/5 | — |
| Cost per page | $0.097 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.7 s / 2.1 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 7.9 s / 14.3 s | 5 s | 10 s |
| L-3 narration starts | 5.3 s / 6.5 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 12.6 s / 18.7 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 18.8 s / 28.6 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.7 s / 3.5 s |
| build | 7.9 s / 14.3 s |
| understand | 7.9 s / 11.7 s |
| verify | 12.6 s / 18.7 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 0.98 | 9 | 3 | 0/0 | 0/0 | 0/0 | failed | 0 | 9.3 s | 16.0 s | $0.193 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 7 | 4 | 1/1 | 0/0 | 0/0 | failed | 0 | 7.9 s | 11.4 s | $0.127 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 0.98 | 6 | 4 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.9 s | 10.2 s | $0.064 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 7 | 6 | 7/7 | 0/0 | 0/0 | faithful | 0 | 7.1 s | 10.0 s | $0.100 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 10 | 3 | 6/6 | 2/2 | 1/1 | verified-page | 0 | 12.0 s | 15.5 s | $0.035 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 12 | 3 | 0/0 | 0/0 | 0/0 | faithful | 0 | 14.3 s | 18.7 s | $0.100 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 7 | 3 | 4/4 | 2/2 | 1/1 | verified-page | 0 | 7.9 s | 15.3 s | $0.064 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 7 | 4 | 5/5 | 1/1 | 1/1 | verified-page | 0 | 7.2 s | 12.2 s | $0.030 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 6 | 3 | -/0 | -/0 | 0/0 | faithful | 0 | 6.8 s | 9.9 s | $0.124 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | -/0 | -/0 | 0/0 | faithful | 0 | 8.5 s | 12.6 s | $0.134 |  |

## Generation quality (visual judge, 2026-10-10T13:01:21.958Z)

Gemini 3.8 Flash rated the page + overlay screenshots + scene JSON on a 1–5 scale.

| Page | Kind | Clarity | Placement | Readability | Liveliness | Correctness | Narration | Overall | Verdict | Most important fix |
|---|---|---|---|---|---|---|---|---|---|---|
| The Fox and the Crow | story | 3 | 2 | 3 | 3 | 4 | 4 | **3** | improve | Remove the fox sticker overlapping the body text and align the crow animations directly onto the original illustration. |
| 5.2 Ohm's law | science | 5 | 4 | 4 | 4 | 5 | 4 | **4.3** | ship | Slightly increase vertical spacing between the top calculation badge and the text above to avoid crowding the paragraph. |
| 6.1 Photosynthesis | science | 3 | 3 | 3 | 3 | 4 | 3 | **3** | improve | Confine all particle effects strictly within the diagram boundary to prevent text occlusion. |
| 4.5 The water cycle | science | 3 | 3 | 3 | 3 | 4 | 4 | **3** | improve | Enhance animated particle flows between steps and adjust sprite positions to align neatly with diagram features. |
| The Little Red Boat | story | 3 | 2 | 3 | 3 | 4 | 4 | **3** | improve | Remove the opaque background rectangle around the boat sprite so it blends seamlessly with the page illustration. |
| 8.3 The Pythagoras theorem | maths | 3 | 3 | 3 | 2 | 4 | 3 | **3** | improve | Adjust badge coordinates to sit neatly adjacent to the triangle sides without occluding the printed measurements. |
| 11.2 Steps to independence | other-subject | 3 | 3 | 3 | 2 | 4 | 4 | **3** | improve | Increase the visual prominence and dynamic movement of the milestone highlights as each year is narrated. |
| 2.4 गुरुत्व के अधीन गति | science | 4 | 3 | 4 | 4 | 4 | 4 | **4** | ship | Adjust the position and background opacity of the plot container so it does not awkwardly intersect the original diagram's sloped line. |
| How does a rainbow form? | science | 3 | 2 | 3 | 3 | 4 | 3 | **3** | improve | Realign the raindrop highlight precisely over the page's raindrop and animate the ray's internal reflection. |
| 2.4 Motion under gravity | science | 2 | 1 | 2 | 2 | 3 | 4 | **2** | redo | Reposition all readouts and the velocity plot into clear page margins with solid background cards, and align the falling object animation with a proper vertical tower or clear diagram rather than stamping it over unrelated text and shapes. |
| **Average** | | 3.2 | 2.6 | 3.1 | 2.9 | 4.0 | 3.7 | **3.1** | | |

<details><summary>The Fox and the Crow</summary>

- **concept_clarity**: The visual dramatization conveys the basic moral, though particle effects distract slightly.
- **placement**: An stray icon overlaps the paragraph text, and the tree sprite misaligns with the existing artwork.
- **readability**: Text in the illustration remains readable, but the overlay icon intrudes on the story body.
- **liveliness**: Sparkles and character animations provide moderate ongoing movement.
- **correctness**: The narrative and character actions follow the fable accurately.
- **narration**: Voiceover lines are clear, engaging, and match the text faithfully.

</details>

<details><summary>5.2 Ohm's law</summary>

- **concept_clarity**: The combination of the live circuit readout and dual I-V / I-R characteristic curves immediately conveys both direct and inverse proportionality to a student.
- **placement**: Elements are placed cleanly around the circuit diagram and bottom margin, though the upper calculation card sits fairly close to the text above the figure.
- **readability**: Text labels, ammeter readout, and graph axes are crisp, legible, and maintain consistent styling.
- **liveliness**: Visual current flow simulation and interactive plots tracking parameter changes provide meaningful visual movement.
- **narration**: Clear, child-safe, and closely synchronized with the steps shown on screen.
- **correctness**: Formulas, numerical values (12 V / 4 Ω = 3 A), and inverse/linear relations perfectly match the text.

</details>

<details><summary>6.1 Photosynthesis</summary>

- **concept_clarity**: The visual glow and particle flows convey input and output moderately well.
- **placement**: Several stray particles overlap text paragraphs, and the rate label overflows the diagram border.
- **readability**: Text labels are generally legible, but stray particle glyphs interfere with standard reading.
- **liveliness**: Pulsing sun shapes and moving particles provide mild continuous motion.
- **correctness**: The biochemical reaction and component inputs correctly mirror the page description.
- **narration**: The audio scripts are accessible, clear, and relevant to the diagram.

</details>

<details><summary>4.5 The water cycle</summary>

- **concept_clarity**: The visuals illustrate the basic water cycle components reasonably well for learners.
- **placement**: Sprites overlap existing diagram elements slightly awkwardly, though text remains mostly unobstructed.
- **readability**: Labels are legible and clear, though their contrasting pill styles create visual clutter.
- **liveliness**: Basic sequential steps and sprites appear, but dynamic continuous motion is limited.
- **correctness**: The content aligns directly with the page diagram and explanatory text.
- **narration**: The voiceover is suitable, instructional, and well synchronized with the content.

</details>

<details><summary>The Little Red Boat</summary>

- **concept_clarity**: The motion illustrates the boat sailing, though it adds modest conceptual depth.
- **placement**: The overlay graphic has an opaque white box that partially obscures the original illustration's background.
- **readability**: Text labels are generally readable and appropriately scaled.
- **liveliness**: The rocking and bobbing animations provide a clear sense of movement.
- **correctness**: Content aligns faithfully with the story text and characters.
- **narration**: Voiceover is clear, child-friendly, and mirrors the text.

</details>

<details><summary>8.3 The Pythagoras theorem</summary>

- **concept_clarity**: The overlays attempt to show squared side values directly, but the geometric representation is static.
- **placement**: The badges overlap the existing diagram text and partially obscure the original dimensions.
- **readability**: Text in badges is readable, though the underlying text remains partially visible beneath them.
- **liveliness**: Visual elements show little continuous movement across the sequence.
- **correctness**: Math values accurately reflect the example given on the page.
- **narration**: The audio explanation is straightforward and directly covers the steps shown.

</details>

<details><summary>11.2 Steps to independence</summary>

- **concept_clarity**: The timeline progression reinforces the sequence of historical events but offers minimal added visual explanation.
- **placement**: The overlay elements align with the timeline graphic, though visible indicator overlays appear very subtle in the rendered frames.
- **readability**: Labels and markings remain legible against the clean page background.
- **liveliness**: Animation across steps shows little noticeable dynamic movement in the screenshots.
- **correctness**: Milestones and historical facts correspond accurately to the text.
- **narration**: The voiceover is clear, appropriate for students, and directly follows the timeline.

</details>

<details><summary>2.4 गुरुत्व के अधीन गति</summary>

- **concept_clarity**: The falling motion alongside the time-distance plot clarifies how gravitational acceleration increases speed.
- **placement**: The overlay elements fit well within the diagram frame, though the plot overlaps the original illustration line slightly.
- **readability**: Metrics in the bottom readout and axes on the graph are clear and legible.
- **liveliness**: The continuous fall and synchronized curve plot demonstrate dynamic motion.
- **correctness**: Formulas and calculated values accurately reflect the textbook example.
- **narration**: The narration explains the physics clearly in appropriate Hindi.

</details>

<details><summary>How does a rainbow form?</summary>

- **concept_clarity**: The animation indicates refraction concepts adequately, though the visual path remains static across frames.
- **placement**: The overlay droplet circle is misaligned with the diagram's raindrop and creates redundant clutter.
- **readability**: Text labels are legible, but the lower step pill sits awkwardly on top of the bottom border.
- **liveliness**: Motion is minimal across screenshots, giving a mostly static appearance.
- **correctness**: The scientific steps accurately reflect the printed text and diagram explanation.
- **narration**: The script clearly describes internal reflection and refraction in accessible terms.

</details>

<details><summary>2.4 Motion under gravity</summary>

- **concept_clarity**: The animation attempts to simulate falling motion and velocity, but dropping a small rock sprite right over an unrelated geometric figure creates confusion rather than clarity.
- **placement**: The elements severely cover key textbook paragraphs, the labels bleed over text on the left, and the blue bounding box and graph obscure the illustration and margins awkwardly.
- **readability**: Readout labels are placed directly across paragraph lines with no background card, causing terrible text collisions and poor contrast.
- **liveliness**: The simulation technically animates time, stone fall, and the velocity graph, but the visual execution is cluttered and static-feeling.
- **correctness**: The formulas and numerical values match Example 2.3 accurately, though tying the demonstration to this particular abstract figure is incorrect.
- **narration**: The narration lines are clear, age-appropriate, and directly match the physics concepts discussed in the text.

</details>

