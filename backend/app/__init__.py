"""FastAPI app: the song pipeline, plus the lute's coach (Tiger Data + Gemini)."""

from pathlib import Path

# Secrets (GEMINI_API_KEY, TIGER_DATABASE_URL) live in backend/.env (see .env.example). Loaded before
# any app module reads them. Real environment variables win over the file.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:  # python-dotenv comes with uvicorn[standard]
    pass
