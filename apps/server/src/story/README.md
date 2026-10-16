# Stories made alive

This folder turns the pages of a fiction story (a picture book, a story in a school reader, a comic or a fable) into a short interactive film. The reader watches the book's own pictures move, hears the book's sentences and each character's dialogue in their own voice, chooses what a character does at the turning point, and can then talk to the characters.

## How a story is made

1. `plan.ts` reads the page photos with Gemini 4 Argon and plans the film in one answer: the story text, the cast with a voice and an acting style for each, the pictures printed on the pages, 5 to 8 shots, one choice, the characters a reader can talk to, a quiz and a music brief. Narrator lines are the book's own sentences and dialogue lines are the book's own dialogue. If a page that holds the story is left out, the plan is made again.
2. `art.ts` crops the printed pictures, draws a cast sheet in the book's style with Nano Banana, and draws the opening frame of every shot. A shot whose moment is printed on the page starts from the printed picture, extended to 16:9.
3. `media.ts` films each shot with Gemini Omni Flash (`gemini-omni-1.1-flash-preview`, 10 s at 720p, one continuous shot from the frame), records every line with Gemini 3.8 TTS (the acting style is sent as `speechMetadata.style`, so it is not read aloud), and writes music with Lyria. Gemini listens to each clip's own sound; a clip with speech in it plays without its sound.
4. `film.ts` puts the linear film together with ffmpeg: each clip with its lines in order and captions, the choice as a card, the imagined path once, music under everything.
5. `review.ts` gives the film, the pages and a timeline of every shot and line to Gemini 4 Argon. It scores eleven qualities, lists the problems in each shot with their times, and gives one fix per shot: edit the clip, film it again from a new plan, act lines again, or add a pause.
6. `make.ts` applies the fixes (at most four clips per round) and reviews the next version, up to three rounds or until the score is good.

`job.ts` runs a story as a background job for the app (`POST /api/stories`); `scripts/story-make.mts` runs one from the command line and keeps every round's film and review.

## Costs and limits

A 10-second clip costs about $1 (Omni Flash bills about $0.10 per second of 720p video), so a story with 7 shots, one imagined shot and two rounds of fixes costs about $10 to $15. A reader can make two stories a day, and all readers together twenty.
