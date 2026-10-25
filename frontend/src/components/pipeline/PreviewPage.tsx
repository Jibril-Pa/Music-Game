"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  API_BASE,
  DIFFICULTIES,
  HAS_BACKEND,
  OUTPUT_FILES,
  SCORE_TRACK_INDEX,
  SOURCE_LABELS,
  fileUrl,
  getAlphaTex,
  getChart,
  getHealth,
  getJob,
  listJobs,
  rerunJob,
  submitYoutube,
  uploadSong,
  type Chart,
  type Difficulty,
  type Health,
  type JobStatus,
  type JobSummary,
  type Source,
} from "@/lib/pipeline";
import LaneView from "./LaneView";
import ScoreView from "./ScoreView";

const STAGES = [
  ["ingest", "Decode audio"],
  ["separate", "Separate stems (Demucs)"],
  ["beats", "Tempo & beats"],
  ["transcribe", "Transcribe notes (Basic Pitch)"],
  ["chart", "Build chart"],
  ["notation", "Tab & sheet music"],
] as const;

const FILE_NOTES: Record<string, string> = {
  "chart.json": "game level data",
  "score.alphatex": "tab + notation (alphaTab)",
  "score.musicxml": "MuseScore / Guitar Pro",
  "transcription.mid": "raw transcription",
  "guitar.wav": "isolated guitar part",
  "backing.mp3": "song without guitar",
};

function setJobInUrl(jobId: string | null) {
  const url = new URL(window.location.href);
  if (jobId) url.searchParams.set("job", jobId);
  else url.searchParams.delete("job");
  window.history.replaceState(null, "", url.toString());
}

export default function PreviewPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<Source>("guitar");
  const [force, setForce] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobStatus | null>(null);
  const [chart, setChart] = useState<Chart | null>(null);
  const [tex, setTex] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [rerunSource, setRerunSource] = useState<Source>("other");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const loadedFor = useRef<string | null>(null);

  const refreshJobs = useCallback(() => {
    listJobs().then(setJobs).catch(() => {});
  }, []);

  useEffect(() => {
    // The public site has no backend: say where the workshop runs instead of trying localhost.
    if (!HAS_BACKEND) {
      queueMicrotask(() => setBackendDown(true));
      return;
    }
    getHealth()
      .then((h) => setHealth(h))
      .catch(() => setBackendDown(true));
    refreshJobs();
    const fromUrl = new URL(window.location.href).searchParams.get("job");
    // Deferred so the effect itself doesn't set state synchronously.
    if (fromUrl) queueMicrotask(() => setJobId(fromUrl));
  }, [refreshJobs]);

  // Poll the job until it's done or failed.
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const st = await getJob(jobId);
        if (stop) return;
        setJob(st);
        if (st.status === "done" || st.status === "error") {
          refreshJobs();
          return;
        }
      } catch (e) {
        if (stop) return;
        setSubmitError(String(e instanceof Error ? e.message : e));
        return;
      }
      timer = setTimeout(tick, 800);
    };
    tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, refreshJobs]);

  // Load outputs once a job is done.
  useEffect(() => {
    if (!job || job.status !== "done" || loadedFor.current === job.jobId) return;
    loadedFor.current = job.jobId;
    Promise.all([getChart(job.jobId), getAlphaTex(job.jobId)])
      .then(([c, t]) => {
        setChart(c);
        setTex(t);
      })
      .catch((e) => setSubmitError(String(e instanceof Error ? e.message : e)));
  }, [job]);

  // Elapsed-time ticker while processing.
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "error") return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [job]);

  const openJob = (id: string) => {
    loadedFor.current = null;
    setChart(null);
    setTex(null);
    setJob(null);
    setSubmitError(null);
    setStartedAt(Date.now());
    setJobId(id);
    setJobInUrl(id);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const st = await uploadSong(file, source, force);
      openJob(st.jobId);
      setJob(st);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onRerun = async (src: Source) => {
    if (!job) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const st = await rerunJob(job.jobId, src);
      openJob(st.jobId);
      setJob(st);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onYoutube = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const st = await submitYoutube(ytUrl.trim(), source);
      openJob(st.jobId);
      setJob(st);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const stageIndex = job ? STAGES.findIndex(([s]) => s === job.stage) : -1;
  const currentSource: Source = job?.source ?? "guitar";
  const rerunChoice: Source = rerunSource !== currentSource ? rerunSource : currentSource === "guitar" ? "other" : "guitar";
  const counts = chart ? Object.fromEntries(DIFFICULTIES.map((d) => [d, chart.difficulties[d].length])) : null;

  return (
    <main className="page">
      <header className="page-header">
        <h1>Song → chart + sheet music</h1>
        <div className="muted small">
          {backendDown && !HAS_BACKEND ? (
            <span>
              The Song Workshop runs on your own computer (it splits songs with Demucs): clone the repo and run <code>./dev.sh</code>.
            </span>
          ) : backendDown ? (
            <span className="error">
              Backend not reachable at {API_BASE}. Start it with <code>./dev.sh</code>.
            </span>
          ) : health ? (
            <>
              backend {API_BASE} · Demucs on <b>{health.device}</b> · YouTube links {health.youtubeEnabled ? "on" : "off"}
            </>
          ) : (
            "connecting…"
          )}
        </div>
      </header>

      <section className="card">
        <form
          onSubmit={onSubmit}
          className={`dropzone ${dragOver ? "over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) setFile(f);
          }}
        >
          <label className="file-pick">
            <input type="file" accept="audio/*,.mp3,.wav,.m4a,.flac,.ogg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <span>{file ? file.name : "Drop an MP3/WAV here or click to choose"}</span>
          </label>
          <label>
            transcribe{" "}
            <select value={source} onChange={(e) => setSource(e.target.value as Source)}>
              {(Object.keys(SOURCE_LABELS) as Source[]).map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="small">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> ignore cache
          </label>
          <button type="submit" disabled={!file || submitting}>
            {submitting ? "Uploading…" : "Process song"}
          </button>
        </form>
        {health?.youtubeEnabled && (
          <form onSubmit={onYoutube} className="yt-row">
            <input type="url" placeholder="…or paste a YouTube link" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
            <button type="submit" disabled={!ytUrl || submitting}>
              {submitting ? "Fetching…" : "Fetch"}
            </button>
          </form>
        )}
        {submitError && <p className="error">{submitError}</p>}
        {jobs.length > 0 && (
          <div className="recent">
            <span className="muted small">Recent:</span>
            {jobs.slice(0, 8).map((j) => (
              <button key={j.jobId} className={`chip ${j.jobId === jobId ? "active" : ""}`} aria-pressed={j.jobId === jobId} onClick={() => openJob(j.jobId)}>
                {j.title || j.jobId}
                {j.source && j.source !== "guitar" ? ` (${j.source})` : ""}
                {j.status !== "done" ? ` · ${j.status}` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      {job && job.status !== "done" && (
        <section className="card">
          <h2>{job.title || job.inputName || job.jobId}</h2>
          <div className="progress">
            <div className="progress-bar" style={{ width: `${Math.round((job.progress || 0) * 100)}%` }} />
          </div>
          <ol className="stages">
            {STAGES.map(([key, label], i) => {
              const failed = job.status === "error" && job.failedStage === key;
              const state = failed ? "failed" : job.status === "error" ? (i < stageIndex ? "done" : "") : i < stageIndex ? "done" : i === stageIndex ? "active" : "";
              return (
                <li key={key} className={state}>
                  {state === "done" ? "✓" : failed ? "✗" : state === "active" ? "▶" : "·"} {label}
                </li>
              );
            })}
          </ol>
          <p className="muted small">
            {job.status === "queued" && "Waiting for the worker… "}
            {startedAt && job.status === "running" && `${Math.max(0, Math.round((now - startedAt) / 1000))}s elapsed`}
          </p>
          {job.status === "error" && <p className="error">{job.error}</p>}
        </section>
      )}

      {job?.status === "done" && (
        <>
          <section className="card">
            <div className="song-head">
              <div>
                <h2>{chart?.song.title ?? job.title}</h2>
                <p className="muted small">
                  {job.bpm} BPM · {job.durationSec ? `${Math.floor(job.durationSec / 60)}:${String(Math.round(job.durationSec % 60)).padStart(2, "0")}` : ""} ·
                  source {job.source} · {job.cached ? "cached result" : `processed in ${job.totalSec?.toFixed(1)}s ${job.device === "cached" ? "(reused cached stems)" : `on ${job.device}`}`}
                </p>
                {job.timings && (
                  <p className="muted small">
                    {Object.entries(job.timings)
                      .map(([k, v]) => `${k} ${v.toFixed(1)}s`)
                      .join(" · ")}
                  </p>
                )}
              </div>
              <div className="head-right">
              <div className="tabs">
                {DIFFICULTIES.map((d) => (
                  <button key={d} className={d === difficulty ? "active" : ""} onClick={() => setDifficulty(d)}>
                    {d} {counts ? <span className="muted">({counts[d]})</span> : null}
                  </button>
                ))}
              </div>
              <div className="rerun-row small">
                re-run from{" "}
                <select value={rerunChoice} onChange={(e) => setRerunSource(e.target.value as Source)}>
                  {(Object.keys(SOURCE_LABELS) as Source[])
                    .filter((s) => s !== currentSource)
                    .map((s) => (
                      <option key={s} value={s}>
                        {SOURCE_LABELS[s]}
                      </option>
                    ))}
                </select>{" "}
                <button onClick={() => onRerun(rerunChoice)} disabled={submitting}>
                  Re-run
                </button>
              </div>
              </div>
            </div>
            {job.warnings && job.warnings.length > 0 && (
              <div className="warnings">
                {job.warnings.map((w) => (
                  <div key={w.code} className="warning">
                    <span>⚠ {w.message}</span>
                    {w.suggestSources && w.suggestSources.length > 0 && (
                      <span className="warning-actions">
                        {w.suggestSources.map((s) => (
                          <button key={s} onClick={() => onRerun(s)} disabled={submitting}>
                            Re-run with {SOURCE_LABELS[s]}
                          </button>
                        ))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {job.stemLevels && Object.keys(job.stemLevels).length > 0 && (
              <p className="muted small">
                stem levels:{" "}
                {Object.entries(job.stemLevels)
                  .sort((a, b) => b[1].share * b[1].active - a[1].share * a[1].active)
                  .map(([s, v]) => `${s} ${Math.round(v.share * 100)}%`)
                  .join(" · ")}
              </p>
            )}
            {chart ? (
              <LaneView
                chart={chart}
                difficulty={difficulty}
                backingUrl={fileUrl(job.jobId, "backing.mp3")}
                guitarUrl={fileUrl(job.jobId, "guitar.wav")}
              />
            ) : (
              <p className="muted">Loading chart…</p>
            )}
          </section>

          <section className="card">
            <h3>Downloads</h3>
            <ul className="downloads">
              {OUTPUT_FILES.map((f) => (
                <li key={f}>
                  <a href={fileUrl(job.jobId, f, true)}>{f}</a> <span className="muted small">{FILE_NOTES[f]}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="card score-card">
            <h3>
              Score <span className="muted small">({difficulty} track of score.alphatex)</span>
            </h3>
            {tex ? <ScoreView tex={tex} trackIndex={SCORE_TRACK_INDEX[difficulty]} /> : <p className="muted">Loading score…</p>}
          </section>
        </>
      )}
    </main>
  );
}
