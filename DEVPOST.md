## Inspiration

Google's *Magic Cat Academy* doodle has one of the best game loops ever made: a ghost floats toward you with a symbol over its head, you draw the symbol, the ghost pops. We kept asking: **what if the symbol was a chord, and you "drew" it on a real guitar?**

The first weeks of learning guitar are a grind. You memorize Em, G, C and D, then strum them over and over until your fingers stop hurting, and a lot of beginners quit right there. Rhythm games make practice fun, but most of them need a plastic controller or a cable, and they test how fast you read, not whether you can play a real chord. We wanted a game where the only controller is the guitar you already own and the mic on your laptop.

## What it does

Musi-Game is **The Traveling Bard**: the Big Bad Wolf has stolen the Hourglass of Ages and fled through time, and you chase him as a wandering bard across three worlds: a fairy-tale forest, an Arabian Nights desert, and a neon city in the year 3000.

- The bard walks on their own. **Every foe shows a chord over its head. Play it on your guitar and it's slain.** Every foe showing that chord is hit at once.
- Tougher foes need two or three chords. Set pieces block the road until you play them all: the troll under the bridge, Ali Baba's cave ("Open, Sesame!"), the Sphinx and her riddles, the Clockwork Nightingale.
- Each world ends in a boss fight against the wolf, set to **any song you upload**. Musi-Game splits the song into instruments, transcribes it, and turns its real harmony into the howls you parry.
- Everything is in E minor, so whatever you play fits the music, and the backing band follows the chord you play on the next half-beat. Wrong chords just fizzle. Nothing punishes you for trying.
- A chord helper shows fretboard diagrams with finger numbers for exactly the chords you need right now, so you can play before you've memorized a single shape.
- No guitar? The number keys work too. A single-notes mode makes it even easier for day-one players.
- **Your lute coaches you.** The bard's lute hears every chord you play. After each world it tells you the one thing to fix, in plain words: "Twice your C sounded like Am. Press the A string at fret 3 with your ring finger." Then it gives you a short drill, and shows how each chord has improved run by run.

## How we built it

Musi-Game has four parts: an ear that listens to your guitar, a pipeline that turns songs into boss fights, the worlds themselves, and a coach that remembers how you play.

### 1. The ear (in the browser)

Mic audio goes through an **AudioWorklet** into **Essentia.js** (WebAssembly), about every 11 ms. We first look for an **onset**: the high-frequency click of the pick, or a jump in loudness. Then:

- **Single notes:** we run PitchYin only on the audio *after* the onset (earlier audio still holds the last note). Two agreeing, confident readings make a note, about **50 ms after the pluck**.
- **Chords:** a strum confuses a single-pitch tracker, so we compute a 12-bin chroma vector $\mathbf{x}$ (Essentia's HPCP) and match it against chord templates. Plain 0/1 templates kept hearing G as Gmaj7, because real strings ring with overtones. So each template includes the first eight harmonics of every chord tone, each half as strong as the last:

$$
T_c[k] = \sum_{p \in c} \sum_{h=1}^{8} \lambda^{h-1} \cdot \mathbf{1}\big[(p + s_h) \bmod 12 = k\big] \qquad \lambda = 0.5
$$

where $s_h$ is how far harmonic $h$ sits above the note, folded into one octave (0, 0, 7, 0, 4, 7, 10, 0 semitones). The chord we report is the template closest to what we heard:

$$
\text{score}(c) = \frac{\mathbf{x} \cdot T_c}{\lVert \mathbf{x} \rVert \lVert T_c \rVert}
$$

and only if it scores at least 0.8 and is clearly ahead of the runner-up. Chords land about **85 ms after the strum**.

### 2. The song pipeline (Python)

A **FastAPI** backend takes an MP3 and runs it through:

1. **Demucs** (`htdemucs_6s`) to split the song into six stems (guitar, bass, drums, vocals, piano, other)
2. **Spotify's Basic Pitch** to transcribe the guitar stem into notes
3. **librosa** to find the beats and the first downbeat
4. Our own charting: drop ghost notes, snap each difficulty to its grid (quarter notes for easy, eighths for medium, sixteenths for hard), and pick strings and frets that keep your hand close to where it was. A note too far from the grid is dropped, not dragged, so nothing drifts off the audio.

Out come a note chart, tab and sheet music (alphaTab, MusicXML via music21), a MIDI file, the isolated guitar, and a backing track with the guitar removed. A 2:42 song takes about **31 seconds** on an M1 Pro, re-runs are instant (cached by file hash), and it all works offline.

The game then turns the transcription into boss attacks that follow the song's harmony. For each beat from $t_0$ to $t_1$, every note sounding in it adds weight to its pitch class $k$, based on how long it overlaps the beat, how loud it is, and whether it's a bass note:

$$
w_k = \sum_{n \text{ with pitch class } k} \text{overlap}(n) \cdot \frac{v_n}{127} \cdot \beta_n \qquad \beta_n = 1.6 \text{ for bass notes, else } 1
$$

Each playable chord $c$ is scored by how much of the beat it explains, minus what it doesn't:

$$
S(c) = \frac{I_c - 0.7 (W - I_c)}{W} + b_c + 0.3 \bar K_c
$$

where $I_c$ is the weight on the chord's notes, $W$ is the total, $b_c$ is a bonus when the lowest note is the chord's root, and $\bar K_c$ measures how well the chord fits the whole song's key (that breaks ties like E vs Em when a bar has no third). The chord only changes when a new one fits clearly better, so the howls follow the song instead of flickering.

### 3. The worlds

- **Phaser 3** runs the game. Behind its transparent canvas, a **Three.js** stage renders each world in low-poly, cel-shaded 3D with ink outlines, fog, parallax and soft shadows. The 3D camera is computed from Phaser's camera every frame, so the path the bard walks lines up exactly.
- The characters are 2D **paper cut-outs** standing on that 3D path, with a white paper edge and a lifted shadow, like a pop-up book.
- **Every image is drawn in code and every sound is synthesized.** Plucks use Karplus-Strong string synthesis, and each world has its own procedural groove (folk strums, desert hand drums and oud, future synths). There are no image or audio asset files and no copyrighted characters: the story borrows only from public-domain tales like the Three Little Pigs, Jack and the Beanstalk, *One Thousand and One Nights*, and Hans Christian Andersen.
- The frontend is **Next.js, React and TypeScript**, about 19,000 lines across the game, the ear and the pipeline. We used Claude Code as a pair programmer throughout.

### 4. The lute's coach (Tiger Data + Gemini)

Every input the game judges becomes a row in **Tiger Data** (TimescaleDB on Tiger Cloud). The row stores the time of the strum, what the ear heard, what the foe wanted, hit or miss, how far it was from the beat, and the detector's confidence and latency. The game sends them in batches every few seconds while you play.

- `plays` and `runs` are **hypertables**, compressed into the columnstore and segmented by player, so one bard's history reads fast however many bards play.
- `chord_hourly` is a **real-time continuous aggregate**: tries and hits per chord per hour. Tiger refreshes it every 10 minutes, and the run that just ended is included straight away.
- The coach's history is plain SQL: accuracy per chord per day (`time_bucket` over the aggregate) and per run. A `lag()` window finds the chord changes you miss on the first strum (G → C). Grouping the misses shows what the ear heard instead (C heard as Am). There's also your timing against the beat, and every bard's numbers for the last 24 hours.

For a miss, we guess which chord you were going for: the wanted chord that shares the most notes with what you played. That turns a miss into a mix-up like "C heard as Am", and those two shapes differ by one finger.

**Gemini** (`gemini-3.8-flash`, low thinking for speed) gets only measured facts: this run, your history from Tiger Data, and the exact shapes and fingerings the game teaches. It answers in a fixed JSON schema (headline, praise, focus, two tips, a drill, a goal), and the backend checks and trims that answer before the end screen draws it. The instructions forbid inventing numbers, and ask it to explain each mix-up by comparing the two chord shapes.

Both services are optional. With no keys, or no wifi in a crowded hall, the game plays the same, and the lute falls back to built-in tips computed from the same numbers. Players are anonymous: a random id per browser, and no audio ever leaves the laptop.

## Challenges we ran into

**Hearing only the guitar.** The browser's built-in voice processing (noise suppression, auto gain, echo cancellation) makes a guitar sound dull, so we turned it off. Then the mic heard *everything*: talking, keyboard clicks, fans, and worst of all, the game's own music coming out of laptop speakers. We built a guitar-only gate: a note's pitch must hold steady (speech glides), its volume must peak fast and not swell (voices swell), and it must still be ringing when we decide (clicks die instantly).

For the game's own sound, we built an **echo guard**. The game logs every sound it plays and measures how much of it reaches the mic, a "coupling" $\kappa$ that's about 0 with headphones. Sounds add as *power*, not amplitude, so the size of a new sound on top of a level $b$ that jumps to a peak $p$ is

$$
\Delta = \sqrt{p^2 - b^2}
$$

A mic event is ignored as an echo when a game sound started within 45 ms of it and $\Delta_{\text{mic}} \le f \cdot \kappa \cdot \Delta_{\text{game}}$, with $f$ between 1.05 and 1.25 (stricter for uploaded songs, whose notes the game doesn't know). On our laptop-speaker test, fake notes dropped from **17 to 0** at normal volume and **50 to 2** at very loud volume, while the guitar notes still got through.

**Fake guitars lie.** To test the detector offline, we built a synthetic guitar and scored 49 out of 50. Then we ran a real recording and it missed notes: real plucks rise slower than synthetic ones, and our "is this a pluck?" check was too strict. After loosening it, the detector **catches 40 of 42 notes on a real guitar play-along and names 95% of them correctly**.

**The bass lies too.** With music in the background, a B4 played over an E2 bass kept reading as E, because

$$
6 \times 82.41 \text{ Hz} = 494.5 \text{ Hz} \approx \text{B4 } (493.9 \text{ Hz})
$$

B4 is the bass note's 6th harmonic. Now a low reading whose loudest overtone is its 3rd, 5th, 6th or 7th, with a bass-like spectrum, counts as that overtone. Correct notes with the bass left in went from **67% to 80%**.

**Re-strumming.** Strumming a ringing Em again sometimes turned it into G (they share two notes). Now the new sound is only trusted when it names the same chord, or fits its chord clearly better than the plain reading.

**Making it fun for beginners.** Our first version was a fighting game with spell combos ("Dragon's Breath" was E then G). It looked cool, but you had to memorize moves *and* chord shapes. We threw it out and went with "the chord is written on the enemy," plus a helper that shows the shape the moment you need it.

**Sharp art on sharp screens.** Code-drawn art looked blurry on Retina displays. We built a script that renders every texture at 2x in headless Chrome and checks it against the 1x version (mean pixel error under 5.5), so a forgotten scale factor can't slip through.

## What we learned

- **Measure, then measure on real audio.** Every detector fix came with a number from an offline bench (notes, chords, re-strums, noise, echoes). But the bench only told the truth once we checked it against a real guitar recording.
- **A little physics goes a long way.** Overtones explained why G looked like Gmaj7, and why a bass note could pass for a melody note. Powers adding (not amplitudes) made the echo math work.
- **Beginners need the game to say yes.** Keeping everything in one key, never punishing wrong chords, and showing the fingering right when it's needed mattered more than any feature.
- **Latency is a feature.** Hitting about 50 ms for notes and 85 ms for chords is what makes slaying a wolf with a strum feel like *you* did it.

## What's next

- **More chords.** The detector already knows 84 chords (7 kinds on all 12 roots); the game only asks for 7 so far.
- **More songs.** Support songs that aren't in 4/4, and a one-click song library.
- **Teach the hard parts.** The lute already knows which chord changes you miss. Next, it sends more of those foes your way, and turns its drill into a short level you can play.
