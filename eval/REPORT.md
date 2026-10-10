# Evaluation report

Generated 2026-10-10T14:19:15.796Z against http://localhost:8080; 10 run(s) over 10 page(s). Events in `eval/output/2026-10-10T14-15-54-168Z/`.

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
| Overlays clear of printed ink (worst label < 10 % ink) | 9/10 | all |
| Scenes with ≥ 3 moving elements | 10/10 | all |
| Cost per page | $0.071 | reasonable |

## Latency (p50 / p90, from capture confirm)

| Moment | p50 / p90 | Target | Hard limit |
|---|---|---|---|
| L-1 first understanding | 1.6 s / 2.2 s | 1.5 s | 3 s |
| L-2 first animated scene (awakening is client-side at L-1 + ~0.3 s; this row is the generated scene) | 6.9 s / 8.2 s | 5 s | 10 s |
| L-3 narration starts | 5.0 s / 6.7 s | 6 s | 12 s |
| L-4 complete with verification (scene v1) | 12.0 s / 13.8 s | 15 s | 30 s |
| Richer scene v2 voiced and verified (upgrade at the next loop) | 17.2 s / 32.1 s | — | — |

| Stage done | p50 / p90 |
|---|---|
| read | 2.3 s / 3.3 s |
| build | 6.9 s / 8.2 s |
| understand | 8.7 s / 11.2 s |
| verify | 12.0 s / 13.8 s |

## Per page

| Page | Kind | Lang | Conf | Elements | Steps | Moving | Ink under labels mean/worst (moved) | Values | Worked | Page-answer | Verification | Unsupported | L-2 | L-4 | Cost | Errors |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| synthetic-biology-photosynthesis.jpg | science | en | 1 | 6 | 3 | 4/6 | 0 % / 0 % (0) | 0/0 | 0/0 | 0/0 | faithful | 0 | 7.5 s | 13.7 s | $0.123 |  |
| synthetic-geography-water-cycle.jpg | science ✗ | en | 1 | 7 | 4 | 4/7 | 0 % / 0 % (1) | 1/1 | 0/0 | 0/0 | faithful | 0 | 6.3 s | 9.4 s | $0.128 |  |
| synthetic-hindi-free-fall.jpg | science | hi | 0.98 | 7 | 3 | 3/7 | 0 % / 0 % (0) | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.8 s | 12.0 s | $0.061 |  |
| synthetic-history-timeline.jpg | other-subject | en | 1 | 5 | 6 | 5/5 | 0 % / 0 % (0) | 7/7 | 0/0 | 0/0 | faithful | 0 | 5.9 s | 8.9 s | $0.064 |  |
| synthetic-maths-pythagoras.jpg | maths | en | 1 | 11 | 4 | 4/11 | 0 % / 0 % (1) | 6/6 | 2/2 | 1/1 | verified-page | 0 | 8.2 s | 13.1 s | $0.045 |  |
| synthetic-nonfiction-rainbow.jpg | science ✗ | en | 1 | 11 | 3 | 10/11 | 0 % / 0 % (0) | 0/0 | 0/0 | 0/0 | faithful | 0 | 6.8 s | 9.7 s | $0.059 |  |
| synthetic-physics-free-fall.jpg | science | en | 0.95 | 7 | 3 | 4/7 | 6 % / 11 % (1) | 4/4 | 2/2 | 1/1 | verified-page | 0 | 6.9 s | 13.8 s | $0.063 |  |
| synthetic-physics-ohms-law.jpg | science | en | 1 | 9 | 4 | 4/9 | 0 % / 0 % (0) | 5/5 | 1/1 | 1/1 | verified-page | 0 | 6.7 s | 12.9 s | $0.038 |  |
| synthetic-picture-book-boat.jpg | story ✗ | en | 1 | 5 | 2 | 4/5 | 0 % / 0 % (0) | -/0 | -/0 | 0/0 | faithful | 0 | 7.1 s | 10.9 s | $0.024 |  |
| synthetic-story-fox-crow.jpg | story | en | 1 | 7 | 4 | 4/7 | 0 % / 1 % (1) | -/0 | -/0 | 0/0 | faithful | 0 | 7.6 s | 11.6 s | $0.101 |  |

## Generation quality (visual judge, 2026-10-10T14:22:49.881Z)

Gemini 3.8 Flash rated the page + overlay screenshots + scene JSON on a 1–5 scale.

| Page | Kind | Clarity | Placement | Readability | Liveliness | Correctness | Narration | Overall | Verdict | Most important fix |
|---|---|---|---|---|---|---|---|---|---|---|
| 2.4 Motion under gravity | science | 3 | 3 | 3 | 3 | 4 | 4 | **3** | improve | Adjust the bounding box coordinates so the overlay completely avoids obscuring the paragraph text above and below the illustration. |
| 6.1 Photosynthesis | science | 3 | 3 | 3 | 3 | 4 | 4 | **3** | improve | Increase visibility and motion of directional particles for water, CO2, and O2 flows to make the mechanism clearer. |
| 4.5 The water cycle | science | 3 | 3 | 3 | 3 | 4 | 3 | **3** | improve | Reposition overlay labels and shapes to avoid partially obscuring the existing printed text in the diagram. |
| How does a rainbow form? | science | 3 | 3 | 4 | 3 | 4 | 3 | **3** | improve | Align the sun sparkles and diagram overlay tightly with the printed illustration borders. |
| 2.4 गुरुत्व के अधीन गति | science | 4 | 4 | 4 | 4 | 5 | 5 | **4** | ship | Align the animated falling ball precisely over the printed vertical bar and adjust the figure highlight box bounds to match the diagram borders. |
| 5.2 Ohm's law | science | 4 | 4 | 5 | 4 | 5 | 4 | **4** | ship | Make the animated electron flow particles more distinct and continuous along the wire loop rather than faint blur dots. |
| The Fox and the Crow | story | 3 | 3 | 3 | 3 | 4 | 4 | **3** | ship | Enhance character animations during the dialogue sequences to make the exchange feel more active. |
| 8.3 The Pythagoras theorem | maths | 3 | 2 | 3 | 3 | 4 | 4 | **3** | improve | Adjust the position of the square on side 'a' so it neatly touches the bottom leg without obscuring the figure caption text, and use directional particles that visually flow into the hypotenuse square. |
| 11.2 Steps to independence | other-subject | 3 | 3 | 3 | 3 | 3 | 3 | **3** | improve | Adjust marker positions to snap directly to the non-linearly spaced printed nodes rather than using linear interpolation. |
| The Little Red Boat | story | 3 | 3 | 4 | 3 | 4 | 4 | **3** | improve | Align the overlaid boat sprite more precisely over the printed illustration to eliminate the visual double edge. |
| **Average** | | 3.2 | 3.1 | 3.5 | 3.2 | 4.1 | 3.8 | **3.2** | | |

<details><summary>2.4 Motion under gravity</summary>

- **concept_clarity**: The free-fall animation clarifies the kinematic equation, though the diagram alignment is slightly loose.
- **placement**: The overlay elements sit inside the diagram frame but partially encroach upon surrounding text lines.
- **readability**: Labels are legible and clear, though some text blocks are close to edge boundaries.
- **liveliness**: The simulated falling particle moves smoothly over the trajectory.
- **correctness**: Values and equations accurately reflect Example 2.3 from the text.
- **narration**: The voiceover is coherent, factual, and matches the visual demonstration.

</details>

<details><summary>6.1 Photosynthesis</summary>

- **concept_clarity**: The glowing leaf and status label partially convey activity, though particle dynamics are barely visible in snapshots.
- **placement**: The overlay frames the diagram neatly, though the glow is centered slightly low on the stem.
- **readability**: The status label is clear, legible, and does not obstruct any diagram text.
- **liveliness**: Visual progression across steps seems minimal based on static views, mainly showing a static glow effect.
- **correctness**: The content aligns directly with the basic photosynthesis process described in the text.
- **narration**: The narration is accessible, concise, and matches the textbook explanation well.

</details>

<details><summary>4.5 The water cycle</summary>

- **concept_clarity**: The overlaid labels and animations partially illustrate the stages, though dynamic movement could better convey cycle continuity.
- **placement**: Elements generally align with the diagram, but some overlays slightly overlap printed labels.
- **readability**: Text badges are legible, though placement near existing diagram text creates slight clutter.
- **liveliness**: The animation shows basic cycling elements without extensive visual flow.
- **correctness**: Content aligns faithfully with the diagram and facts presented in the textbook.
- **narration**: Narration scripts are appropriate, clear, and accurately match the sequential stages.

</details>

<details><summary>How does a rainbow form?</summary>

- **concept_clarity**: The animation helps visualize the light path, though internal reflection details are somewhat static in the view.
- **placement**: The highlight box and sparkle effects are slightly misaligned with the sun and diagram boundary.
- **readability**: The step label is legible, clear, and avoids obscuring page text.
- **liveliness**: Particle effects provide motion, but light ray progression could be more dynamic.
- **correctness**: The sequence follows the physical explanation on the page without factual errors.
- **narration**: Voiceover is clear, appropriate for a young audience, and aligns with the steps.

</details>

<details><summary>2.4 गुरुत्व के अधीन गति</summary>

- **concept_clarity**: The simulation visually couples the falling ball motion to the velocity-time graph tracking in real time, making acceleration clear.
- **placement**: The blue highlight box around the figure is slightly misaligned/protruding, and the ball sprite is slightly offset from the vertical path in the diagram.
- **readability**: Telemetry labels at the bottom are clean, legible, and color-coded.
- **liveliness**: Both the falling ball and the dot tracing the linear velocity graph create continuous, synchronized motion.
- **correctness**: Physical values and formulas precisely match the example worked out on the textbook page.
- **narration**: Narration is natural, spoken in accurate Hindi, and properly synchronized with the phases of the drop.

</details>

<details><summary>5.2 Ohm's law</summary>

- **concept_clarity**: Visualizing charge moving along the circuit loop and tying it directly to the V, R, and I values effectively reinforces Ohm's law.
- **placement**: The interactive readouts and formula box are cleanly positioned directly below the circuit diagram without obscuring any printed text.
- **readability**: Badges and labels use strong contrast, crisp rounded backgrounds, and bold readable typography.
- **liveliness**: The moving charge tracers travel along the circuit path while values and ammeter needle deflect appropriately.
- **correctness**: Values (12V, 4Ω, 3A) and formula relations strictly adhere to Example 5.1 on the page.
- **narration**: The narration steps clearly explain the relationship and walk through the example calculations in approachable language.

</details>

<details><summary>The Fox and the Crow</summary>

- **concept_clarity**: The animation shows the cheese dropping to the fox, illustrating the key narrative action well.
- **placement**: The animated sprites align closely with the original illustration without occluding any story text.
- **readability**: No intrusive text overlays are present, maintaining the clarity of the underlying page.
- **liveliness**: The cheese trajectory conveys the main event adequately, though additional character motion is minimal.
- **correctness**: The events follow the fable accurately without noticeable discrepancies.
- **narration**: The voiceover lines are clear, engaging, and faithfully reflect the text.

</details>

<details><summary>8.3 The Pythagoras theorem</summary>

- **concept_clarity**: Visualizing squares attached to triangle legs is a classic Pythagoras concept, but only one square has appeared so far and the random sparkle particles do not communicate area transfer.
- **placement**: The orange square and light-blue box overlap the figure border and collide directly with the bottom caption text 'a = 3 cm' and 'Fig 8.4'.
- **readability**: The label 'a² = 9' is readable, but the underlying text caption is heavily obscured by the tinted square.
- **liveliness**: Floating sparkle particles animate continuously, though they are purely decorative rather than illustrating mathematical flow.
- **correctness**: The math correctly tracks Example 3 (3² = 9), though placement alignment with the base side could be tighter.
- **narration**: The spoken steps clearly guide through building squares and computing the hypotenuse.

</details>

<details><summary>11.2 Steps to independence</summary>

- **concept_clarity**: Moving along the timeline aids chronological understanding, though the underlying page already shows key dates clearly.
- **placement**: The marker sits near the timeline nodes but occasionally collides with existing date labels.
- **readability**: The floating date badge is legible, though text overlap slightly reduces clarity.
- **liveliness**: The continuous scrubber provides basic motion across milestones.
- **correctness**: Linear time interpolation does not strictly match the non-linear spacing of the printed timeline nodes.
- **narration**: Narration covers the key historical events accurately and concisely.

</details>

<details><summary>The Little Red Boat</summary>

- **concept_clarity**: The motion illustrates the boat rocking gently, though it mainly serves as visual decoration.
- **placement**: Sprites are aligned over the illustration, but the overlaid boat creates a slight double-edge effect with the original drawing.
- **readability**: Visual accents and text styling remain clear and legible.
- **liveliness**: Gentle rocking and subtle particle effects add mild continuous motion.
- **correctness**: The dialogue and characters accurately reflect the printed text.
- **narration**: The audio matches the story tone and lines nicely.

</details>

