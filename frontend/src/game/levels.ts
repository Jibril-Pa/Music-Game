/**
 * The Traveling Bard's journey through time.
 *
 * The Big Bad Wolf has stolen the Hourglass of Ages and fled through time.
 * The bard follows him across three worlds (eras), each with two walking
 * levels and a boss fight against the wolf. Every level is harder than the
 * last: faster foes that hit harder, more foes that need several chords,
 * faster music.
 *
 * Plain data (no Phaser), shared by the scenes and the React menus.
 */

import type { EnemyKind } from "./entities/Enemy";

export type WorldId = "forest" | "desert" | "future";

export interface WorldDef {
  id: WorldId;
  /** The era, fairy-tale style. */
  era: string;
  place: string;
  /** One line when you arrive. */
  arrival: string;
  emoji: string;
}

export const WORLDS: Record<WorldId, WorldDef> = {
  forest: {
    id: "forest",
    era: "Once Upon a Time",
    place: "The Enchanted Forest",
    arrival: "The wolf has stolen the Hourglass of Ages!",
    emoji: "🌲",
  },
  desert: {
    id: "desert",
    era: "A Thousand and One Nights",
    place: "The Shifting Sands",
    arrival: "The portal spits you out among the dunes...",
    emoji: "🏜️",
  },
  future: {
    id: "future",
    era: "Ever After, Year 3000",
    place: "The Clockwork City",
    arrival: "Far, far in the future, the wolf has been busy...",
    emoji: "🌃",
  },
};

/** Big moments that block the path until you've played them away. */
export type SetPiece = "troll-bridge" | "witch-house" | "beanstalk" | "wolf-pack" | "sesame-cave" | "sphinx" | "laser-gate" | "nightingale";

export interface Spawn {
  /** Fires when the bard reaches this x. */
  at: number;
  kind: EnemyKind | "fairy" | SetPiece;
  /** Chord pool stage: 0 = two chords (Em G) ... 3 = all five. */
  stage: number;
}

export interface Difficulty {
  /** The bard's walking speed (px/s). */
  walkSpeed: number;
  /** Foe speed and damage multipliers. */
  foeSpeed: number;
  foeDamage: number;
  /** Multiplies the chance that a foe needs extra chords. */
  toughness: number;
  bpm: number;
}

export interface JourneyLevel {
  kind: "journey";
  /** "1-2" = world 1, level 2. */
  id: string;
  world: WorldId;
  name: string;
  /** Night (or dusk) palette. */
  night: boolean;
  /** The level ends at this x. */
  length: number;
  spawns: Spawn[];
  /** Where each set piece stands. */
  landmarks: Partial<Record<SetPiece, number>>;
  difficulty: Difficulty;
  /** The signpost at the end and the icon at the end of the HUD's path. */
  goal: { sign: string; icon: string };
  /** Said as you walk out of the level. */
  outro: string;
}

export interface BossDef {
  name: string;
  /** Texture prefix: `${texture}`, `${texture}_huff`, `${texture}_hurt`. */
  texture: "bigwolf" | "sandwolf" | "mechawolf";
  hp: number;
  /** The pack he calls in. */
  pup: EnemyKind;
  /** The gust he blows (tint of the wind) and what he says. */
  gustTint: number;
  gustLines: [string, string];
  /** A howl is visible this long before its beat (shorter = harder). */
  leadMs: number;
  /** Damage when a howl gets through. */
  missDamage: number;
  /** A new pup every [min, max] ms in pack phases. */
  pupEveryMs: [number, number];
  /** Huff-and-puff gusts per pack phase. */
  huffs: number;
  /** The built-in song for this fight. */
  demo: { title: string; bpm: number };
  /** Said when he goes down. */
  defeat: string;
  /** What the picker calls his song. */
  songOf: string;
}

export interface BossLevel {
  kind: "boss";
  id: string;
  world: WorldId;
  name: string;
  boss: BossDef;
}

export type LevelDef = JourneyLevel | BossLevel;

const s = (at: number, kind: Spawn["kind"], stage = 3): Spawn => ({ at, kind, stage });

export const BOSSES: Record<WorldId, BossDef> = {
  forest: {
    name: "The Big Bad Wolf",
    texture: "bigwolf",
    hp: 1500,
    pup: "pup",
    gustTint: 0xe8f4ff,
    gustLines: ["I'll huff... and I'll puff...", "...and blow you away!"],
    leadMs: 1900,
    missDamage: 4,
    pupEveryMs: [2600, 3800],
    huffs: 1,
    demo: { title: "The Wolf's Waltz", bpm: 104 },
    defeat: "The wolf grabs the Hourglass of Ages and leaps into a time portal!",
    songOf: "the Wolf's song",
  },
  desert: {
    name: "The Wolf of the Dunes",
    texture: "sandwolf",
    hp: 1800,
    pup: "jackal",
    gustTint: 0xf3c77e,
    gustLines: ["I'll huff... and I'll puff...", "...and bury you in sand!"],
    leadMs: 1750,
    missDamage: 5,
    pupEveryMs: [2300, 3400],
    huffs: 1,
    demo: { title: "Dance of the Dunes", bpm: 110 },
    defeat: "He's slipping away through time again!",
    songOf: "the Wolf's desert song",
  },
  future: {
    name: "MECHA-WOLF 3000",
    texture: "mechawolf",
    hp: 2100,
    pup: "robopup",
    gustTint: 0x8ff6ff,
    gustLines: ["TURBO HUFF... TURBO PUFF...", "...MAXIMUM BLOW-AWAY!"],
    leadMs: 1600,
    missDamage: 6,
    pupEveryMs: [2000, 3000],
    huffs: 2,
    demo: { title: "Robo-Wolf Rumble", bpm: 118 },
    defeat: "The Hourglass of Ages is whole again!",
    songOf: "MECHA-WOLF's song",
  },
};

export const LEVELS: LevelDef[] = [
  // ------------------------------------------------------------ Once Upon a Time
  {
    kind: "journey",
    id: "1-1",
    world: "forest",
    name: "The Enchanted Forest",
    night: false,
    length: 9400,
    landmarks: { "troll-bridge": 4300, "witch-house": 7300 },
    difficulty: { walkSpeed: 150, foeSpeed: 1, foeDamage: 1, toughness: 1, bpm: 100 },
    goal: { sign: "Moonlit Wood →", icon: "🌙" },
    outro: "Night falls over the forest...",
    spawns: [
      s(450, "wolf", 0), s(850, "wolf", 0), s(1250, "goblin", 0), s(1550, "wolf", 0),
      s(2050, "wolf", 1), s(2110, "wolf", 1), s(2600, "goblin", 1), s(2950, "goblin", 1), s(3010, "wolf", 1),
      s(3250, "troll-bridge", 2),
      s(4450, "goblin", 2), s(4520, "goblin", 2), s(4950, "fairy", 2),
      s(5300, "wolf", 2), s(5550, "wolf", 3), s(5800, "goblin", 3), s(6100, "wolf", 3), s(6160, "wolf", 3),
      s(6150, "witch-house", 3),
      s(7550, "fairy", 3), s(7750, "goblin", 3), s(8100, "wolf", 3), s(8160, "wolf", 3), s(8550, "goblin", 3), s(8610, "wolf", 3),
    ],
  },
  {
    kind: "journey",
    id: "1-2",
    world: "forest",
    name: "The Moonlit Wood",
    night: true,
    length: 9200,
    landmarks: { beanstalk: 4300 },
    difficulty: { walkSpeed: 155, foeSpeed: 1.08, foeDamage: 1.1, toughness: 1.2, bpm: 104 },
    goal: { sign: "Three Little Pigs →", icon: "🐺" },
    outro: "The Big Bad Wolf awaits...",
    spawns: [
      s(400, "wolf", 2), s(700, "goblin", 2), s(760, "wolf", 2), s(1150, "pup", 2), s(1200, "pup", 2),
      s(1600, "goblin"), s(1900, "wolf"), s(1960, "wolf"), s(2400, "goblin"), s(2700, "wolf"), s(2750, "pup"), s(3000, "goblin"),
      s(3250, "beanstalk"),
      s(4450, "fairy"),
      s(4750, "wolf"), s(4810, "goblin"), s(5250, "pup"), s(5290, "pup"), s(5330, "pup"), s(5750, "goblin"), s(5810, "wolf"),
      s(6100, "wolf-pack"),
      s(7000, "fairy"),
      s(7300, "goblin"), s(7360, "wolf"), s(7800, "wolf"), s(7840, "wolf"), s(7880, "pup"), s(8300, "goblin"), s(8360, "goblin"), s(8700, "wolf"),
    ],
  },
  { kind: "boss", id: "1-3", world: "forest", name: "The Three Little Pigs' Meadow", boss: BOSSES.forest },

  // ------------------------------------------------------------ A Thousand and One Nights
  {
    kind: "journey",
    id: "2-1",
    world: "desert",
    name: "The Singing Dunes",
    night: false,
    length: 9400,
    landmarks: { "sesame-cave": 4600 },
    difficulty: { walkSpeed: 160, foeSpeed: 1.12, foeDamage: 1.2, toughness: 1.35, bpm: 106 },
    goal: { sign: "The Sphinx's Road →", icon: "🐪" },
    outro: "The road to the Sphinx...",
    spawns: [
      s(400, "scorpion"), s(800, "thief"), s(1100, "scorpion"), s(1160, "scorpion"), s(1600, "mummy"), s(2000, "thief"), s(2060, "thief"),
      s(2500, "scorpion"), s(2900, "mummy"), s(2960, "scorpion"), s(3300, "thief"),
      s(3550, "sesame-cave"),
      s(5000, "fairy"),
      s(5300, "scorpion"), s(5360, "scorpion"), s(5700, "mummy"), s(5760, "thief"), s(6200, "thief"), s(6260, "thief"), s(6700, "scorpion"),
      s(7100, "mummy"), s(7160, "mummy"), s(7500, "fairy"), s(7800, "scorpion"), s(7840, "thief"), s(7880, "scorpion"), s(8300, "mummy"), s(8700, "thief"), s(8760, "scorpion"),
    ],
  },
  {
    kind: "journey",
    id: "2-2",
    world: "desert",
    name: "The Sphinx's Road",
    night: true,
    length: 9600,
    landmarks: { sphinx: 5200 },
    difficulty: { walkSpeed: 165, foeSpeed: 1.18, foeDamage: 1.3, toughness: 1.5, bpm: 110 },
    goal: { sign: "The Wolf's Oasis →", icon: "🐺" },
    outro: "The Wolf of the Dunes awaits...",
    spawns: [
      s(400, "thief"), s(700, "djinn"), s(1000, "scorpion"), s(1060, "scorpion"), s(1500, "mummy"), s(1560, "thief"), s(2000, "djinn"),
      s(2400, "scorpion"), s(2440, "scorpion"), s(2480, "scorpion"), s(2900, "mummy"), s(3300, "thief"), s(3360, "thief"), s(3700, "scorpion"),
      s(4100, "sphinx"),
      s(5600, "fairy"),
      s(5900, "djinn"), s(6200, "scorpion"), s(6260, "thief"), s(6700, "mummy"), s(6760, "mummy"), s(7200, "djinn"), s(7600, "scorpion"), s(7640, "scorpion"),
      s(8000, "fairy"), s(8300, "thief"), s(8360, "mummy"), s(8800, "scorpion"), s(8860, "thief"), s(9100, "djinn"),
    ],
  },
  { kind: "boss", id: "2-3", world: "desert", name: "The Wolf's Oasis", boss: BOSSES.desert },

  // ------------------------------------------------------------ Ever After, Year 3000
  {
    kind: "journey",
    id: "3-1",
    world: "future",
    name: "Gearworks City",
    night: false,
    length: 9400,
    landmarks: { "laser-gate": 4600 },
    difficulty: { walkSpeed: 170, foeSpeed: 1.24, foeDamage: 1.4, toughness: 1.65, bpm: 114 },
    goal: { sign: "Neon Skyway →", icon: "🌃" },
    outro: "Up to the Neon Skyway...",
    spawns: [
      s(400, "drone"), s(800, "tinsoldier"), s(1100, "drone"), s(1160, "drone"), s(1600, "tinsoldier"), s(1660, "tinsoldier"), s(2100, "mech"),
      s(2600, "drone"), s(2640, "drone"), s(3000, "tinsoldier"), s(3300, "drone"),
      s(3550, "laser-gate"),
      s(5000, "fairy"),
      s(5200, "mech"), s(5600, "drone"), s(5640, "drone"), s(5680, "drone"), s(6100, "tinsoldier"), s(6160, "tinsoldier"), s(6600, "mech"),
      s(7100, "drone"), s(7160, "tinsoldier"), s(7500, "fairy"), s(7800, "mech"), s(7860, "drone"), s(8300, "tinsoldier"), s(8340, "tinsoldier"), s(8380, "tinsoldier"), s(8800, "drone"),
    ],
  },
  {
    kind: "journey",
    id: "3-2",
    world: "future",
    name: "The Neon Skyway",
    night: true,
    length: 9600,
    landmarks: { nightingale: 5200 },
    difficulty: { walkSpeed: 175, foeSpeed: 1.3, foeDamage: 1.5, toughness: 1.8, bpm: 118 },
    goal: { sign: "Hourglass Tower →", icon: "⏳" },
    outro: "MECHA-WOLF 3000 awaits...",
    spawns: [
      s(400, "drone"), s(460, "drone"), s(800, "turret"), s(1200, "tinsoldier"), s(1260, "tinsoldier"), s(1700, "mech"), s(1760, "drone"),
      s(2200, "turret"), s(2600, "drone"), s(2640, "drone"), s(2680, "drone"), s(3100, "mech"), s(3160, "tinsoldier"), s(3600, "robopup"), s(3640, "robopup"),
      s(4100, "nightingale"),
      s(5600, "fairy"),
      s(5900, "turret"), s(6200, "mech"), s(6260, "drone"), s(6700, "tinsoldier"), s(6740, "tinsoldier"), s(6780, "robopup"), s(7200, "turret"),
      s(7600, "drone"), s(7640, "drone"), s(7680, "mech"), s(8000, "fairy"), s(8300, "robopup"), s(8340, "robopup"), s(8380, "tinsoldier"), s(8800, "mech"), s(8860, "drone"), s(9100, "turret"),
    ],
  },
  { kind: "boss", id: "3-3", world: "future", name: "The Hourglass Tower", boss: BOSSES.future },
];

export function levelAt(index: number): LevelDef {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, index))];
}

/** The Phaser scene that plays a level. */
export function sceneFor(index: number): "Journey" | "Boss" {
  return levelAt(index).kind === "boss" ? "Boss" : "Journey";
}

export function isFinalLevel(index: number): boolean {
  return index >= LEVELS.length - 1;
}

export function worldNumber(world: WorldId): number {
  return (["forest", "desert", "future"] as WorldId[]).indexOf(world) + 1;
}

// ------------------------------------------------------------ saved progress

const PROGRESS_KEY = "traveling-bard:unlocked";

/** Index of the furthest level you can pick (0 = only the first). */
export function unlockedUpTo(): number {
  try {
    const v = Number(window.localStorage.getItem(PROGRESS_KEY));
    return Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), LEVELS.length - 1) : 0;
  } catch {
    return 0;
  }
}

/** Beat a level: the next one can be picked from the title from now on. */
export function unlockLevel(index: number): void {
  try {
    if (index > unlockedUpTo()) window.localStorage.setItem(PROGRESS_KEY, String(Math.min(index, LEVELS.length - 1)));
  } catch {
    /* private mode: progress just isn't remembered */
  }
}
