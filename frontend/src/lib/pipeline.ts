// Types + tiny client for the local FastAPI pipeline (backend/app/main.py).

const LOCAL_API = "http://localhost:8000";

/**
 * Where the FastAPI backend is. NEXT_PUBLIC_API_URL wins: a hosted backend (e.g.
 * https://api.thetravelinglute.tech), or "off" for none. Without it, only a page opened on this
 * computer (localhost) uses the local backend. The public site (https://thetravelinglute.tech) then
 * calls nothing: Chrome would ask every visitor to let it reach apps on their device, and nobody else
 * runs our backend. The game still plays: demo boss songs, and the lute's built-in tips.
 */
function apiBase(): string {
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) return env === "off" ? "" : env.replace(/\/+$/, "");
  if (typeof window === "undefined") return LOCAL_API;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".localhost") ? LOCAL_API : "";
}

export const API_BASE = apiBase();
/** false: no backend for this page (the public site without a hosted one). Skip every call. */
export const HAS_BACKEND = API_BASE !== "";

export type Difficulty = "easy" | "medium" | "hard";
export const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
/** Track order inside score.alphatex */
export const SCORE_TRACK_INDEX: Record<Difficulty, number> = { hard: 0, medium: 1, easy: 2 };

export type Source = "guitar" | "other" | "vocals" | "bass" | "piano" | "mix";

export const SOURCE_LABELS: Record<Source, string> = {
  guitar: "guitar stem",
  other: "\u201cother\u201d stem",
  vocals: "vocals stem",
  bass: "bass stem",
  piano: "piano/keys stem",
  mix: "full mix",
};

export interface Warning {
  code: "cut_off" | "weak_stem" | "few_notes" | string;
  message: string;
  suggestSources?: Source[];
}

export interface Note {
  t: number; // seconds
  dur: number; // seconds
  beat: number; // fractional beat index, 0 = first downbeat = beats[0]
  midi: number;
  name: string; // "E4"
  string: number; // 1-6, 1 = high E
  fret: number;
  lane: number; // = string for now
  velocity: number; // 1-127
}

export interface Chart {
  version: 1;
  song: { title: string; durationSec: number; bpm: number; timeSignature: [number, number]; offsetSec: number };
  beats: number[];
  audio: { backing: string; guitarStem: string };
  difficulties: Record<Difficulty, Note[]>;
}

export const OUTPUT_FILES = [
  "chart.json",
  "score.alphatex",
  "score.musicxml",
  "transcription.mid",
  "guitar.wav",
  "backing.mp3",
] as const;
export type OutputFile = (typeof OUTPUT_FILES)[number];

export interface JobStatus {
  jobId: string;
  status: "queued" | "running" | "done" | "error";
  stage: string;
  progress: number;
  error: string | null;
  failedStage?: string;
  title?: string | null;
  source?: Source;
  inputName?: string;
  timings?: Record<string, number>;
  totalSec?: number;
  device?: string;
  durationSec?: number;
  bpm?: number;
  files: OutputFile[];
  cached?: boolean;
  warnings?: Warning[];
  stemLevels?: Record<string, { share: number; active: number }>;
}

export interface Health {
  ok: boolean;
  device: string;
  youtubeEnabled: boolean;
}

export interface JobSummary {
  jobId: string;
  title?: string;
  status: JobStatus["status"];
  source?: Source;
  createdAt?: string;
}

export function fileUrl(jobId: string, name: OutputFile, download = false): string {
  return `${API_BASE}/jobs/${jobId}/files/${name}${download ? "?download=1" : ""}`;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.error ?? j.detail ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export async function getHealth(): Promise<Health> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function listJobs(): Promise<JobSummary[]> {
  const res = await fetch(`${API_BASE}/jobs`);
  if (!res.ok) return [];
  return (await res.json()).jobs;
}

export async function uploadSong(file: File, source: Source, force = false): Promise<JobStatus> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source", source);
  if (force) fd.append("force", "1");
  const res = await fetch(`${API_BASE}/jobs`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function submitYoutube(youtubeUrl: string, source: Source): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ youtubeUrl, source }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** Same song, different stem. Fast: the Demucs stems are cached on the server. */
export async function rerunJob(jobId: string, source: Source, force = false): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/rerun`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source, force }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getJob(jobId: string): Promise<JobStatus> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getChart(jobId: string): Promise<Chart> {
  const res = await fetch(fileUrl(jobId, "chart.json"), { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

export async function getAlphaTex(jobId: string): Promise<string> {
  const res = await fetch(fileUrl(jobId, "score.alphatex"), { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  return res.text();
}
