"""FastAPI server: http://localhost:8000

POST /jobs                      multipart file=<mp3/wav>  (optional: source, title, force)
                                or JSON {"youtubeUrl": "...", "source"?: "..."}  -> {jobId, status, cached}
GET  /jobs                      recent jobs
GET  /jobs/{id}                 {status, stage, progress, error, warnings, files, timings, ...}
POST /jobs/{id}/rerun           JSON {"source": "other", "force"?: false}: same song, different stem
GET  /jobs/{id}/files/{name}    chart.json | score.alphatex | score.musicxml |
                                transcription.mid | guitar.wav | backing.mp3   (?download=1)
GET  /health

The lute's coach (app/coach_api.py): POST /plays, POST /coach, GET /progress/{playerId}
"""

from __future__ import annotations

import hashlib
import logging
import os
import tempfile
import warnings
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

import pipeline  # noqa: F401  (sets model cache env vars first)
from pipeline import OUTPUT_FILES, SOURCES
from pipeline import youtube
from pipeline.audio import sha256_file
from pipeline.env import DATA_DIR, JOBS_DIR

from . import tiger
from .coach import coach
from .coach_api import router as coach_router
from .jobs import JobStore, public_status

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S")
for noisy in ("numba", "matplotlib", "httpx", "huggingface_hub", "coremltools"):
    logging.getLogger(noisy).setLevel(logging.WARNING)
warnings.filterwarnings("ignore", category=UserWarning)
warnings.filterwarnings("ignore", category=FutureWarning)
log = logging.getLogger("pipeline")

MAX_UPLOAD_BYTES = 200 * 1024 * 1024
ALLOWED_EXT = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac", ".opus", ".webm"}
MEDIA_TYPES = {
    "chart.json": "application/json",
    "score.alphatex": "text/plain; charset=utf-8",
    "score.musicxml": "application/vnd.recordare.musicxml+xml",
    "transcription.mid": "audio/midi",
    "guitar.wav": "audio/wav",
    "backing.mp3": "audio/mpeg",
}
UPLOADS = DATA_DIR / "uploads"
store = JobStore(JOBS_DIR)
DEVICE = "unknown"


@asynccontextmanager
async def lifespan(app: FastAPI):
    global DEVICE
    UPLOADS.mkdir(parents=True, exist_ok=True)
    try:
        from pipeline.separate import describe_device, pick_device

        DEVICE = describe_device(pick_device("auto"))
    except Exception as e:  # torch import problems shouldn't stop the API
        DEVICE = f"unavailable ({e})"
    log.info("Demucs device: %s | YouTube links: %s | data: %s", DEVICE, "on" if youtube.enabled() else "off", DATA_DIR)
    log.info("Coach: Gemini %s (%s) | Tiger Data %s", "on" if coach.configured() else "off", coach.model, "on" if tiger.configured() else "off")
    tiger.warm_up()
    store.start()
    yield
    tiger.close()


app = FastAPI(title="guitar-scroller pipeline", lifespan=lifespan)
# The dev server, the deployed game (thetravelinglute.tech), and any extras in GS_CORS_ORIGINS.
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://thetravelinglute.tech",
    "https://www.thetravelinglute.tech",
    *[o.strip().rstrip("/") for o in os.environ.get("GS_CORS_ORIGINS", "").split(",") if o.strip()],
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(coach_router)


def bad_request(msg: str, code: int = 400) -> JSONResponse:
    return JSONResponse({"error": msg}, status_code=code)


@app.get("/health")
def health():
    return {
        "ok": True,
        "device": DEVICE,
        "youtubeEnabled": youtube.enabled(),
        "queued": store.q.qsize(),
        "coach": {"tiger": tiger.status(), "gemini": coach.status, "model": coach.model},
    }


@app.post("/jobs")
async def create_job(request: Request):
    ctype = request.headers.get("content-type", "")
    if ctype.startswith("multipart/form-data"):
        form = await request.form()
        upload = form.get("file")
        if upload is None or not hasattr(upload, "read"):
            return bad_request("Attach an audio file in the 'file' field.")
        source = str(form.get("source") or "guitar")
        title = (str(form.get("title")).strip() or None) if form.get("title") else None
        force = str(form.get("force") or "").lower() in ("1", "true", "yes")
        name = Path(upload.filename or "upload.mp3").name
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT:
            return bad_request(f"Unsupported file type '{ext}'. Upload an MP3 or WAV.")
        if source not in SOURCES:
            return bad_request(f"source must be one of {', '.join(SOURCES)}")
        UPLOADS.mkdir(parents=True, exist_ok=True)
        tmp = Path(tempfile.mkstemp(dir=UPLOADS, suffix=ext)[1])
        h, size = hashlib.sha256(), 0
        with open(tmp, "wb") as f:
            while chunk := await upload.read(1 << 20):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    f.close()
                    tmp.unlink(missing_ok=True)
                    return bad_request("File is larger than 200 MB.", 413)
                h.update(chunk)
                f.write(chunk)
        if size == 0:
            tmp.unlink(missing_ok=True)
            return bad_request("The uploaded file is empty.")
        st = store.submit(tmp, h.hexdigest(), source, title, name, force=force)
    elif ctype.startswith("application/json"):
        try:
            body = await request.json()
        except Exception:
            return bad_request("Invalid JSON body.")
        url = str(body.get("youtubeUrl") or "").strip()
        source = str(body.get("source") or "guitar")
        if not url:
            return bad_request("Send a file upload or {\"youtubeUrl\": ...}.")
        if source not in SOURCES:
            return bad_request(f"source must be one of {', '.join(SOURCES)}")
        if not youtube.enabled():
            return bad_request("YouTube links are turned off on this server (ENABLE_YOUTUBE=false). Please upload an MP3 instead.")
        tmpdir = Path(tempfile.mkdtemp(dir=UPLOADS))
        try:
            # Runs in a thread so the download never blocks other requests or the worker.
            path, yt_title = await run_in_threadpool(youtube.fetch_audio, url, tmpdir)
        except youtube.YouTubeError as e:
            return bad_request(str(e), 422)
        sha = await run_in_threadpool(sha256_file, path)
        st = store.submit(path, sha, source, body.get("title") or yt_title, f"YouTube: {yt_title}")
    else:
        return bad_request("Use multipart/form-data (file upload) or application/json ({youtubeUrl}).", 415)

    out = public_status(st)
    out["cached"] = bool(st.get("cached"))
    return JSONResponse(out, status_code=200 if out["cached"] else 202)


@app.get("/jobs")
def list_jobs():
    return {"jobs": store.list()}


@app.get("/jobs/{job_id}")
def get_job(job_id: str):
    st = store.get(job_id)
    if not st:
        raise HTTPException(404, f"No job {job_id}")
    return public_status(st)


@app.post("/jobs/{job_id}/rerun")
async def rerun_job(job_id: str, request: Request):
    try:
        body = await request.json()
    except Exception:
        body = {}
    source = str(body.get("source") or "guitar")
    if source not in SOURCES:
        return bad_request(f"source must be one of {', '.join(SOURCES)}")
    try:
        st = store.rerun(job_id, source, force=bool(body.get("force")), uploads_dir=UPLOADS)
    except KeyError:
        raise HTTPException(404, f"No job {job_id}")
    except FileNotFoundError as e:
        return bad_request(str(e), 410)
    out = public_status(st)
    out["cached"] = bool(st.get("cached"))
    return JSONResponse(out, status_code=200 if out["cached"] else 202)


@app.get("/jobs/{job_id}/files/{name}")
def get_file(job_id: str, name: str, download: bool = False):
    if name not in OUTPUT_FILES:
        raise HTTPException(404, f"Unknown file '{name}'. Available: {', '.join(OUTPUT_FILES)}")
    st = store.get(job_id)
    path = JOBS_DIR / job_id / name
    if not st or not path.exists():
        raise HTTPException(404, f"{name} isn't ready for job {job_id}")
    headers = {"Cache-Control": "no-cache"}
    filename = None
    if download:
        stem = "".join(ch if ch.isalnum() or ch in " -_" else "_" for ch in (st.get("title") or job_id)).strip() or job_id
        filename = f"{stem} - {name}"
    return FileResponse(path, media_type=MEDIA_TYPES[name], headers=headers, filename=filename)
