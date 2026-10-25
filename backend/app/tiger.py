"""Tiger Data (TimescaleDB on Tiger Cloud): every chord the ear judges, kept as a time series.

Tables:
  plays  one row per input the game judged (hypertable, columnstore segmented by player)
  runs   one row per finished run (hypertable)
  chord_hourly  continuous aggregate: tries and hits per chord per hour, per player. Tiger keeps it
                up to date (real-time, so the run that just ended is in it too).

What the lute reads back (history()):
  - accuracy per chord per day and per run (is your C getting better?)
  - chord changes you miss on the first strum after switching (G -> C), via window functions
  - mix-ups: what the ear heard when you missed (C heard as Am: a finger isn't pressing)
  - timing on the beat (early or late), practice totals, and every bard's numbers for the last 24 h

Optional: without TIGER_DATABASE_URL, or when the service can't be reached (no wifi at the demo),
nothing is stored and the game carries on. After a failure the module waits RETRY_SEC before trying
again, so an offline room never waits on connect timeouts.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable, Optional, TypeVar

log = logging.getLogger("tiger")

T = TypeVar("T")

RETRY_SEC = 30.0
CONNECT_TIMEOUT_SEC = 6
HISTORY_DAYS = 30
RECENT_RUNS = 8

PLAY_COLUMNS = (
    "ts",
    "player_id",
    "run_id",
    "level_id",
    "world",
    "scene",
    "play_mode",
    "input",
    "practice",
    "played",
    "target",
    "wanted",
    "hit",
    "grade",
    "beat_offset_ms",
    "confidence",
    "latency_ms",
)
RUN_COLUMNS = (
    "ts",
    "player_id",
    "run_id",
    "first_level",
    "last_level",
    "world",
    "play_mode",
    "input",
    "practice",
    "victory",
    "seconds",
    "tries",
    "hits",
    "perfects",
    "slain",
    "max_combo",
)

PLAYS_BODY = """
    ts             timestamptz NOT NULL,
    player_id      text        NOT NULL,
    run_id         text        NOT NULL,
    level_id       text        NOT NULL,
    world          text        NOT NULL,
    scene          text        NOT NULL,
    play_mode      text        NOT NULL,
    input          text        NOT NULL,
    practice       boolean     NOT NULL DEFAULT false,
    played         text        NOT NULL,
    target         text,
    wanted         text[]      NOT NULL DEFAULT '{}',
    hit            boolean     NOT NULL,
    grade          text,
    beat_offset_ms real,
    confidence     real,
    latency_ms     real
"""
RUNS_BODY = """
    ts          timestamptz NOT NULL,
    player_id   text        NOT NULL,
    run_id      text        NOT NULL,
    first_level text        NOT NULL,
    last_level  text        NOT NULL,
    world       text        NOT NULL,
    play_mode   text        NOT NULL,
    input       text        NOT NULL,
    practice    boolean     NOT NULL DEFAULT false,
    victory     boolean     NOT NULL,
    seconds     real        NOT NULL,
    tries       integer     NOT NULL,
    hits        integer     NOT NULL,
    perfects    integer     NOT NULL,
    slain       integer     NOT NULL,
    max_combo   integer     NOT NULL
"""

# Hypertables in one statement (TimescaleDB 2.20+, what Tiger Cloud runs): partitioned by time,
# rows turn columnar after a while, segmented by player so one bard's history reads fast.
SCHEMA_MODERN = [
    f"""CREATE TABLE IF NOT EXISTS plays ({PLAYS_BODY}) WITH (
        tsdb.hypertable, tsdb.partition_column = 'ts', tsdb.segmentby = 'player_id', tsdb.orderby = 'ts DESC')""",
    f"""CREATE TABLE IF NOT EXISTS runs ({RUNS_BODY}) WITH (
        tsdb.hypertable, tsdb.partition_column = 'ts', tsdb.segmentby = 'player_id', tsdb.orderby = 'ts DESC')""",
]
# Older TimescaleDB: plain tables, then create_hypertable().
SCHEMA_LEGACY = [
    f"CREATE TABLE IF NOT EXISTS plays ({PLAYS_BODY})",
    "SELECT create_hypertable('plays', by_range('ts'), if_not_exists => TRUE)",
    f"CREATE TABLE IF NOT EXISTS runs ({RUNS_BODY})",
    "SELECT create_hypertable('runs', by_range('ts'), if_not_exists => TRUE)",
]
INDEXES = [
    "CREATE INDEX IF NOT EXISTS plays_player_ts ON plays (player_id, ts DESC)",
    "CREATE INDEX IF NOT EXISTS plays_run_ts ON plays (run_id, ts)",
    "CREATE INDEX IF NOT EXISTS runs_player_ts ON runs (player_id, ts DESC)",
]
# Real-time (materialized_only = false): the hours not yet materialized are read from plays, so
# the aggregate is right even before (or without) its refresh policy.
CAGG = """CREATE MATERIALIZED VIEW IF NOT EXISTS chord_hourly
       WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
       SELECT time_bucket(INTERVAL '1 hour', ts) AS bucket,
              player_id,
              play_mode,
              target,
              count(*) AS tries,
              sum(CASE WHEN hit THEN 1 ELSE 0 END) AS hits,
              sum(CASE WHEN grade = 'perfect' THEN 1 ELSE 0 END) AS perfects
       FROM plays
       WHERE target IS NOT NULL
       GROUP BY bucket, player_id, play_mode, target
       WITH NO DATA"""
CAGG_POLICY = """SELECT add_continuous_aggregate_policy('chord_hourly',
         start_offset => INTERVAL '3 days',
         end_offset => INTERVAL '1 hour',
         schedule_interval => INTERVAL '10 minutes',
         if_not_exists => TRUE)"""

_lock = threading.Lock()
_pool = None
_schema_ready = False
# False if this service wouldn't create the continuous aggregate: the queries then read plays directly.
_has_cagg = True
_down_until = 0.0
_status = "unknown"  # off | unknown | ok | error: <reason>


def dsn() -> str:
    return (os.environ.get("TIGER_DATABASE_URL") or os.environ.get("DATABASE_URL") or "").strip()


def configured() -> bool:
    return bool(dsn())


def status() -> str:
    """For /health: off (no URL), unknown (not tried yet), ok, or error: <why>."""
    return "off" if not configured() else _status


class TigerUnavailable(RuntimeError):
    """Not configured, or the service failed recently (see RETRY_SEC)."""


def _get_pool():
    global _pool
    with _lock:
        if _pool is None:
            from psycopg_pool import ConnectionPool

            _pool = ConnectionPool(
                dsn(),
                min_size=0,
                max_size=4,
                open=True,
                timeout=CONNECT_TIMEOUT_SEC + 2,
                max_idle=120,
                name="tiger",
                check=ConnectionPool.check_connection,
                kwargs={"autocommit": True, "connect_timeout": CONNECT_TIMEOUT_SEC, "application_name": "traveling-bard"},
            )
        return _pool


def _ensure_schema(conn) -> None:
    global _schema_ready, _has_cagg
    if _schema_ready:
        return
    import psycopg

    with conn.cursor() as cur:
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
        except psycopg.Error:
            pass  # Tiger Cloud has it already; a plain role may not be allowed to create it
        try:
            for sql in SCHEMA_MODERN:
                cur.execute(sql)
        except psycopg.errors.InvalidParameterValue:
            log.info("Tiger: this TimescaleDB predates CREATE TABLE ... WITH (tsdb.hypertable); using create_hypertable()")
            for sql in SCHEMA_LEGACY:
                cur.execute(sql)
        for sql in INDEXES:
            cur.execute(sql)
        # Optional extras: storing plays must keep working without them.
        try:
            cur.execute(CAGG)
            _has_cagg = True
        except psycopg.Error as e:
            _has_cagg = False
            log.warning("Tiger: no continuous aggregate (%s); reading plays directly", str(e).strip().splitlines()[0][:120])
        if _has_cagg:
            try:
                cur.execute(CAGG_POLICY)
            except psycopg.Error as e:
                log.warning("Tiger: no refresh policy for chord_hourly (%s); real-time reads still work", str(e).strip().splitlines()[0][:120])
    _schema_ready = True
    log.info("Tiger: schema ready (plays, runs%s)", ", chord_hourly" if _has_cagg else "")


def _run(fn: Callable[[Any], T]) -> T:
    """Run fn(conn) on a pooled connection (schema made on first use). Raises TigerUnavailable."""
    global _down_until, _status
    if not configured():
        raise TigerUnavailable("TIGER_DATABASE_URL is not set")
    if time.monotonic() < _down_until:
        raise TigerUnavailable(_status)
    import psycopg
    from psycopg_pool import PoolTimeout

    try:
        with _get_pool().connection() as conn:
            _ensure_schema(conn)
            out = fn(conn)
        _status = "ok"
        return out
    except (psycopg.OperationalError, PoolTimeout) as e:
        _down_until = time.monotonic() + RETRY_SEC
        _status = f"error: {str(e).strip().splitlines()[0][:160] if str(e).strip() else type(e).__name__}"
        log.warning("Tiger unreachable (%s); retrying in %ds", _status, RETRY_SEC)
        raise TigerUnavailable(_status) from e
    except psycopg.Error as e:
        _status = f"error: {type(e).__name__}: {str(e).strip().splitlines()[0][:160] if str(e).strip() else ''}"
        log.exception("Tiger query failed")
        raise TigerUnavailable(_status) from e


def warm_up() -> None:
    """Connect and create the schema in the background at startup (never blocks or raises)."""
    if not configured():
        log.info("Tiger: off (set TIGER_DATABASE_URL in backend/.env to store plays)")
        return

    def go():
        try:
            _run(lambda conn: None)
        except TigerUnavailable:
            pass

    threading.Thread(target=go, name="tiger-warmup", daemon=True).start()


def close() -> None:
    global _pool
    with _lock:
        if _pool is not None:
            _pool.close()
            _pool = None


# ------------------------------------------------------------------ writes


def insert(plays: list[tuple], run: Optional[tuple] = None) -> int:
    """plays: tuples in PLAY_COLUMNS order; run: one tuple in RUN_COLUMNS order. Returns rows stored."""
    if not plays and run is None:
        return 0
    play_sql = f"INSERT INTO plays ({', '.join(PLAY_COLUMNS)}) VALUES ({', '.join(['%s'] * len(PLAY_COLUMNS))})"
    run_sql = f"INSERT INTO runs ({', '.join(RUN_COLUMNS)}) VALUES ({', '.join(['%s'] * len(RUN_COLUMNS))})"

    def go(conn) -> int:
        with conn.transaction(), conn.cursor() as cur:
            if plays:
                cur.executemany(play_sql, plays)
            if run is not None:
                cur.execute(run_sql, run)
        return len(plays) + (1 if run is not None else 0)

    return _run(go)


# ------------------------------------------------------------------ reads

Q_TOTALS = """
SELECT count(*) AS plays,
       count(*) FILTER (WHERE target IS NOT NULL) AS tries,
       count(*) FILTER (WHERE hit) AS hits,
       count(DISTINCT run_id) AS runs,
       count(DISTINCT time_bucket(INTERVAL '1 day', ts)) AS days,
       min(ts) AS since
FROM plays
WHERE player_id = %(player)s AND play_mode = %(mode)s
"""

Q_RUN_TOTALS = """
SELECT coalesce(sum(seconds), 0) AS seconds, count(*) FILTER (WHERE victory) AS victories
FROM runs
WHERE player_id = %(player)s AND play_mode = %(mode)s
"""

# The continuous aggregate, re-bucketed from hours into days.
Q_DAYS = """
SELECT time_bucket(INTERVAL '1 day', bucket) AS day, target, sum(tries)::int AS tries, sum(hits)::int AS hits
FROM chord_hourly
WHERE player_id = %(player)s AND play_mode = %(mode)s AND bucket > now() - make_interval(days => %(days)s)
GROUP BY day, target
ORDER BY day, target
"""

Q_DAYS_RAW = """
SELECT time_bucket(INTERVAL '1 day', ts) AS day, target, count(*)::int AS tries, sum(hit::int)::int AS hits
FROM plays
WHERE player_id = %(player)s AND play_mode = %(mode)s AND target IS NOT NULL AND ts > now() - make_interval(days => %(days)s)
GROUP BY day, target
ORDER BY day, target
"""

Q_RUNS = """
WITH recent AS (
    SELECT run_id, min(ts) AS started, max(ts) AS ended
    FROM plays
    WHERE player_id = %(player)s AND play_mode = %(mode)s AND ts > now() - make_interval(days => %(days)s)
    GROUP BY run_id
    ORDER BY started DESC
    LIMIT %(runs)s
)
SELECT r.run_id, r.started, r.ended, p.target, count(*)::int AS tries, sum(p.hit::int)::int AS hits
FROM plays p
JOIN recent r USING (run_id)
WHERE p.player_id = %(player)s AND p.target IS NOT NULL AND p.ts > now() - make_interval(days => %(days)s)
GROUP BY r.run_id, r.started, r.ended, p.target
ORDER BY r.started, p.target
"""

# Right after you land one chord, the next needs another: did the first strum land it?
Q_CHANGES = """
WITH seq AS (
    SELECT target, hit,
           lag(target) OVER w AS prev_target,
           lag(hit) OVER w AS prev_hit
    FROM plays
    WHERE player_id = %(player)s AND play_mode = %(mode)s AND target IS NOT NULL
      AND ts > now() - make_interval(days => %(days)s)
    WINDOW w AS (PARTITION BY run_id ORDER BY ts)
)
SELECT prev_target AS from_chord, target AS to_chord, count(*)::int AS changes, sum(hit::int)::int AS first_try
FROM seq
WHERE prev_hit AND prev_target <> target
GROUP BY prev_target, target
HAVING count(*) >= 2
ORDER BY sum(hit::int)::float / count(*), count(*) DESC
LIMIT 6
"""

# Only real strums: a wrong key on the keyboard says nothing about your fingers.
Q_MIXUPS = """
SELECT target, played AS heard, count(*)::int AS n
FROM plays
WHERE player_id = %(player)s AND play_mode = %(mode)s AND input = 'mic' AND NOT hit
  AND target IS NOT NULL AND played <> target AND ts > now() - make_interval(days => %(days)s)
GROUP BY target, played
ORDER BY n DESC
LIMIT 6
"""

Q_TIMING = """
SELECT count(*)::int AS n,
       avg(beat_offset_ms) AS mean_ms,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY beat_offset_ms) AS median_ms,
       avg(abs(beat_offset_ms)) AS mean_abs_ms
FROM plays
WHERE player_id = %(player)s AND play_mode = %(mode)s AND hit AND beat_offset_ms IS NOT NULL
  AND ts > now() - make_interval(days => %(days)s)
"""

Q_COMMUNITY_CHORDS_RAW = """
SELECT target, count(*)::int AS tries, sum(hit::int)::int AS hits
FROM plays
WHERE play_mode = %(mode)s AND target IS NOT NULL AND ts > now() - INTERVAL '24 hours'
GROUP BY target
ORDER BY target
"""

# Every bard, last 24 hours (the hackathon floor).
Q_COMMUNITY = """
SELECT count(DISTINCT player_id)::int AS bards, count(*)::int AS plays, count(*) FILTER (WHERE hit)::int AS hits
FROM plays
WHERE ts > now() - INTERVAL '24 hours'
"""
Q_COMMUNITY_CHORDS = """
SELECT target, sum(tries)::int AS tries, sum(hits)::int AS hits
FROM chord_hourly
WHERE play_mode = %(mode)s AND bucket > now() - INTERVAL '24 hours'
GROUP BY target
ORDER BY target
"""


def _iso(v: Any) -> Any:
    return v.astimezone(timezone.utc).isoformat().replace("+00:00", "Z") if isinstance(v, datetime) else v


def _num(v: Any, digits: int = 1) -> Optional[float]:
    return None if v is None else round(float(v), digits)


def history(player: str, mode: str) -> dict:
    """Everything the lute and the progress chart need about one bard. Raises TigerUnavailable."""
    from psycopg.rows import dict_row

    args = {"player": player, "mode": mode, "days": HISTORY_DAYS, "runs": RECENT_RUNS}

    def go(conn) -> dict:
        with conn.cursor(row_factory=dict_row) as cur:

            def all_rows(sql: str) -> list[dict]:
                cur.execute(sql, args)
                return cur.fetchall()

            totals = all_rows(Q_TOTALS)[0]
            run_totals = all_rows(Q_RUN_TOTALS)[0]
            days: dict[str, dict] = {}
            for r in all_rows(Q_DAYS if _has_cagg else Q_DAYS_RAW):
                d = days.setdefault(_iso(r["day"])[:10], {"day": _iso(r["day"])[:10], "chords": {}})
                d["chords"][r["target"]] = [r["hits"], r["tries"]]
            runs: dict[str, dict] = {}
            for r in all_rows(Q_RUNS):
                run = runs.setdefault(
                    r["run_id"],
                    {"runId": r["run_id"], "started": _iso(r["started"]), "ended": _iso(r["ended"]), "tries": 0, "hits": 0, "chords": {}},
                )
                run["tries"] += r["tries"]
                run["hits"] += r["hits"]
                run["chords"][r["target"]] = [r["hits"], r["tries"]]
            changes = [{"from": r["from_chord"], "to": r["to_chord"], "changes": r["changes"], "firstTry": r["first_try"]} for r in all_rows(Q_CHANGES)]
            mixups = [{"target": r["target"], "heard": r["heard"], "n": r["n"]} for r in all_rows(Q_MIXUPS)]
            t = all_rows(Q_TIMING)[0]
            community = all_rows(Q_COMMUNITY)[0]
            community["chords"] = {r["target"]: [r["hits"], r["tries"]] for r in all_rows(Q_COMMUNITY_CHORDS if _has_cagg else Q_COMMUNITY_CHORDS_RAW)}
        return {
            "totals": {
                "plays": totals["plays"],
                "tries": totals["tries"],
                "hits": totals["hits"],
                "runs": totals["runs"],
                "days": totals["days"],
                "since": _iso(totals["since"]),
                "minutes": _num(float(run_totals["seconds"]) / 60),
                "victories": run_totals["victories"],
            },
            "days": list(days.values()),
            "runs": list(runs.values()),
            "changes": changes,
            "mixups": mixups,
            "timing": {"n": t["n"], "meanMs": _num(t["mean_ms"]), "medianMs": _num(t["median_ms"]), "meanAbsMs": _num(t["mean_abs_ms"])},
            "community": community,
        }

    return _run(go)
