"""Disk-backed job store + a single background worker thread (no Redis/Celery).

Each job lives in data/jobs/<id>/ where id = first 16 hex chars of the input's
SHA-256 (plus "-<source>" for non-guitar sources). status.json holds the state,
so jobs survive a server restart and unfinished ones are re-queued on startup.
"""

from __future__ import annotations

import json
import logging
import queue
import shutil
import tempfile
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from pipeline import OUTPUT_FILES
from pipeline.config import PipelineConfig
from pipeline.env import JOBS_DIR
from pipeline.runner import StageError, outputs_complete, run_pipeline

log = logging.getLogger("pipeline")


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def job_id_for(sha: str, source: str) -> str:
    return sha[:16] if source == "guitar" else f"{sha[:16]}-{source}"


class JobStore:
    def __init__(self, root: Path = JOBS_DIR):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        self.q: "queue.Queue[str]" = queue.Queue()
        self.lock = threading.Lock()
        self.mem: dict = {}
        self.thread: Optional[threading.Thread] = None
        self.last_write: dict = {}

    # ------------------------------------------------------------ state
    def dir(self, job_id: str) -> Path:
        return self.root / job_id

    def get(self, job_id: str) -> Optional[dict]:
        with self.lock:
            if job_id in self.mem:
                return dict(self.mem[job_id])
        path = self.dir(job_id) / "status.json"
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text())
        except json.JSONDecodeError:
            return None

    def _save(self, st: dict, flush: bool = True) -> None:
        job_id = st["jobId"]
        st["updatedAt"] = now()
        with self.lock:
            self.mem[job_id] = dict(st)
        t = time.monotonic()
        if flush or t - self.last_write.get(job_id, 0) > 0.5:
            self.last_write[job_id] = t
            path = self.dir(job_id) / "status.json"
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(st, indent=2))
            tmp.replace(path)

    def update(self, job_id: str, flush: bool = True, **fields) -> dict:
        st = self.get(job_id) or {"jobId": job_id}
        st.update(fields)
        self._save(st, flush)
        return st

    def list(self) -> list:
        out = []
        for p in self.root.glob("*/status.json"):
            st = self.get(p.parent.name)
            if st:
                out.append({k: st.get(k) for k in ("jobId", "title", "status", "source", "createdAt", "durationSec", "bpm")})
        return sorted(out, key=lambda s: s.get("createdAt") or "", reverse=True)

    # ------------------------------------------------------------ submit
    def submit(self, upload: Path, sha: str, source: str, title: Optional[str], input_name: str, force: bool = False) -> dict:
        job_id = job_id_for(sha, source)
        d = self.dir(job_id)
        st = self.get(job_id)
        if st and not force:
            if st["status"] == "done" and outputs_complete(d):
                upload.unlink(missing_ok=True)
                return {**st, "cached": True}
            if st["status"] in ("queued", "running"):
                upload.unlink(missing_ok=True)
                return {**st, "cached": False}
        d.mkdir(parents=True, exist_ok=True)
        for old in d.glob("upload.*"):
            old.unlink()
        dest = d / f"upload{upload.suffix.lower() or '.mp3'}"
        upload.replace(dest)
        st = {
            "jobId": job_id, "status": "queued", "stage": "queued", "progress": 0.0, "error": None,
            "title": title, "source": source, "inputName": input_name, "inputSha256": sha,
            "upload": dest.name, "reprocess": force, "createdAt": now(), "timings": {},
        }
        self._save(st)
        self.q.put(job_id)
        log.info("Queued job %s (%s, source=%s)", job_id, input_name, source)
        return {**st, "cached": False}

    def rerun(self, job_id: str, source: str, force: bool = False, uploads_dir: Optional[Path] = None) -> dict:
        """Same song, different source stem. Reuses the stored upload and the cached Demucs stems."""
        st = self.get(job_id)
        if not st:
            raise KeyError(job_id)
        src = self.dir(job_id) / st.get("upload", "")
        if not st.get("upload") or not src.exists():
            raise FileNotFoundError("The original upload for this job is gone; please upload the file again.")
        tmp_dir = uploads_dir or self.root
        tmp_dir.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkstemp(dir=tmp_dir, suffix=src.suffix)[1])
        shutil.copyfile(src, tmp)
        return self.submit(tmp, st["inputSha256"], source, st.get("title"), st.get("inputName") or src.name, force=force)

    # ------------------------------------------------------------ worker
    def start(self) -> None:
        for p in sorted(self.root.glob("*/status.json"), key=lambda p: p.stat().st_mtime):
            st = self.get(p.parent.name)
            if st and st.get("status") in ("queued", "running"):
                log.info("Re-queueing unfinished job %s", st["jobId"])
                self.update(st["jobId"], status="queued", stage="queued", progress=0.0)
                self.q.put(st["jobId"])
        self.thread = threading.Thread(target=self._loop, name="pipeline-worker", daemon=True)
        self.thread.start()

    def _loop(self) -> None:
        while True:
            job_id = self.q.get()
            try:
                self._run(job_id)
            except Exception:  # never let the worker die
                log.exception("Worker crashed on job %s", job_id)
            finally:
                self.q.task_done()

    def _run(self, job_id: str) -> None:
        st = self.get(job_id)
        if not st or st.get("status") == "done":
            return
        d = self.dir(job_id)
        handler = logging.FileHandler(d / "pipeline.log")
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)-7s %(message)s", "%H:%M:%S"))
        log.addHandler(handler)
        self.update(job_id, status="running", stage="ingest", progress=0.0, error=None)
        cfg = PipelineConfig.from_env()
        cfg.source = st.get("source") or "guitar"
        cfg.title = st.get("title")
        sha = st["inputSha256"]
        stems = self.dir(sha[:16]) / "stems"  # shared by every --source variant of this song

        def progress(stage: str, p: float) -> None:
            self.update(job_id, flush=False, stage=stage, progress=round(p, 3))

        try:
            res = run_pipeline(d / st["upload"], d, cfg, stems_dir=stems, progress=progress,
                               force=bool(st.get("reprocess")), input_sha=sha,
                               display_name=st.get("inputName"))
            self.update(job_id, status="done", stage="done", progress=1.0, title=res["title"],
                        timings=res["timings"], totalSec=res["totalSec"], device=res.get("device"),
                        durationSec=res["durationSec"], bpm=res["bpm"], stats=res["stats"], reprocess=False,
                        warnings=res.get("warnings", []), stemLevels=res.get("stemLevels", {}))
        except StageError as e:
            self.update(job_id, status="error", error=str(e), failedStage=e.stage)
        except Exception as e:
            log.exception("Job %s failed", job_id)
            self.update(job_id, status="error", error=f"Unexpected error: {e}")
        finally:
            log.removeHandler(handler)
            handler.close()


def public_status(st: dict) -> dict:
    d = JOBS_DIR / st["jobId"]
    files = [f for f in OUTPUT_FILES if (d / f).exists()] if st.get("status") == "done" else []
    keys = ("jobId", "status", "stage", "progress", "error", "failedStage", "title", "source", "inputName",
            "createdAt", "updatedAt", "timings", "totalSec", "device", "durationSec", "bpm", "stats", "cached",
            "warnings", "stemLevels")
    out = {k: st.get(k) for k in keys if k in st}
    out.setdefault("error", None)
    out.setdefault("warnings", [])
    out["files"] = files
    return out
