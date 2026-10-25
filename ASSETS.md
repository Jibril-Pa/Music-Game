# Assets and licenses

Every picture and sound in the game is **original and generated in code**. No image, audio or font files from third parties are bundled. No copyrighted characters or art are used.

## Art (all original, drawn in code)

| What | Where | Source | License |
|---|---|---|---|
| Bard (hero), wolves, goblins, bridge troll, gingerbread witch, the Big Bad Wolf (and his desert and mecha forms), jackals, robo-pups | `frontend/src/game/art.ts` | Drawn with Phaser `Graphics` at startup | Original, part of this project |
| The giant and the beanstalk; scorpions, thieves, mummies, fire djinn, the cave door, the Sphinx; drones, tin soldiers, mechs, laser turrets, the laser gate, the Clockwork Nightingale | `frontend/src/game/art-worlds.ts` | Drawn in code | Original |
| Desert and future scenery (dunes, pyramids, palms, rocks, urns, the cave, the oasis; city skylines by day and night, lamps, holo signs, crates, the pigs' pod houses), the time portal, the Hourglass of Ages, riddles, laser bolts, song notes | `frontend/src/game/art-worlds.ts` | Drawn in code | Original |
| Forest backgrounds (sky, hills, tree silhouettes, trees, pines, bushes, mushrooms, clouds, ground) | `frontend/src/game/art.ts` | Drawn in code | Original |
| Bridge, river, gingerbread house, the three little pigs' houses (straw, sticks, bricks), signpost, campfire | `frontend/src/game/art.ts`, `scenes/Journey.ts`, `scenes/worlds.ts` | Drawn in code | Original |
| Effects: sparkles, magic bolts, wind gust, candy, note orbs, hearts, fairy godmother | `frontend/src/game/art.ts` | Drawn in code | Original |
| Fretboard diagrams (Chord Book, chord helper) | `frontend/src/components/game/Fretboard.tsx` | SVG generated in code | Original |
| The 3D worlds (2.5D stage): terrain and path, trees, pines, bushes, flowers, mushrooms, rocks, hills, mountains, clouds, river and bridge, gingerbread house, beanstalk, the pigs' houses; dunes, pyramids, mesas, palms, urns, the cave, ruins and obelisks, oasis, tent; city blocks with windows, neon signs, lamps, monorail, flying cars, checkpoint gate, clock tower with gears, pod houses; sky, sun, moon, stars, fireflies, sand and neon motes, the time portal, fireworks | `frontend/src/game/stage/` | Built procedurally in code with Three.js geometry and shaders (no models or textures loaded) | Original |

## Sound (all synthesized at runtime)

| What | Where | How | License |
|---|---|---|---|
| Plucked lute / guitar notes and strums | `frontend/src/lib/audio/testSignals.ts`, `lib/game-audio/audio.ts` | Karplus-Strong string synthesis | Original |
| Sound effects (slash, fireball, uppercut, shield, heal, super, hits, parry, wind...) | `frontend/src/lib/game-audio/audio.ts` | Web Audio oscillators + filtered noise | Original |
| Level music and the built-in boss songs ("The Wolf's Waltz", "Dance of the Dunes", "Robo-Wolf Rumble") | `frontend/src/lib/game-audio/music.ts`, `lib/boss/songs.ts` | Procedural E-minor grooves per world: folk (drums, bass, strums), desert (hand drums, drone, oud-like plucks), future (four-on-the-floor, synth arpeggios) | Original |
| Boss fight songs from the pipeline | `backend/data/jobs/*/backing.mp3` | Whatever MP3 *you* upload | Yours. Use music you have the rights to. Not part of the repo. |

## Fonts

| What | Source | License |
|---|---|---|
| Game and UI text | System serif fonts (Georgia / Palatino / Iowan Old Style), not bundled | n/a |
| Bravura music font (only for the alphaTab score on `/preview`) | Copied from the `@coderline/alphatab` npm package at install time | SIL Open Font License 1.1 |

## Story

*The Traveling Bard* is an original story (the wolf steals the Hourglass of Ages and flees through time). Its characters and settings come from **public-domain tales and myths**, retold with original designs: the Three Little Pigs and the Big Bad Wolf ("huff and puff"), Three Billy Goats Gruff (the troll under the bridge), Hansel and Gretel (the gingerbread-house witch), Jack and the Beanstalk (the giant, "Fee-fi-fo-fum"), Perrault's Cinderella (1697: the fairy godmother), *One Thousand and One Nights* (Ali Baba and the Forty Thieves, "Open, Sesame!"; the djinn), the Sphinx and her riddles (Greek myth), and Hans Christian Andersen's *The Steadfast Tin Soldier* (1838, the one-legged tin soldier) and *The Nightingale* (1843, the jeweled mechanical bird). Nothing comes from any film or other modern adaptation.

## Libraries

| Library | Used for | License |
|---|---|---|
| Phaser 3.90 | game engine | MIT |
| Three.js 0.186 | the 3D worlds behind the 2D characters | MIT |
| Next.js 16, React 19 | frontend | MIT |
| Essentia.js 0.1.3 | pitch (PitchYin) and chroma (HPCP) | **AGPL-3.0**: fine for a hackathon demo; check this before shipping a closed product |
| alphaTab 1.8 | tab and sheet-music rendering (`/preview`) | MPL-2.0 |
| Demucs 4.1 (adefossez/demucs) | stem separation | MIT (htdemucs_6s weights: see the Demucs repo) |
| Basic Pitch 0.4 (Spotify) | transcription | Apache-2.0 |
| librosa, music21, FastAPI | beats, MusicXML, API | ISC, BSD-3-Clause, MIT |

## Test audio (not included in the repo)

The pipeline was tested on "Guitar Lessons" by Punk Rock Opera (CC BY 4.0, via Wikimedia Commons / Free Music Archive), plus synthetic clips generated by `backend/tools/make_test_clip.py`. None of it is shipped with the game.
