"""
backend/db.py
─────────────
Índice SQLite da biblioteca local de MP3s.

Tabela: tracks (path PK, title, artist, album, duration, has_cover, added_at)
"""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

_DB_PATH: Optional[Path] = None


def init_db(db_path: Path) -> None:
    global _DB_PATH
    _DB_PATH = db_path
    con = sqlite3.connect(str(db_path))
    con.execute("""
        CREATE TABLE IF NOT EXISTS tracks (
            path      TEXT PRIMARY KEY,
            title     TEXT,
            artist    TEXT,
            album     TEXT,
            duration  TEXT,
            has_cover INTEGER DEFAULT 0,
            liked     INTEGER DEFAULT 0,
            added_at  TEXT    DEFAULT (datetime('now'))
        )
    """)
    try:
        con.execute("ALTER TABLE tracks ADD COLUMN liked INTEGER DEFAULT 0")
    except Exception:
        pass
    try:
        con.execute("ALTER TABLE tracks ADD COLUMN play_count INTEGER DEFAULT 0")
    except Exception:
        pass
    con.execute("""
        CREATE TABLE IF NOT EXISTS recent_plays (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            path      TEXT NOT NULL,
            played_at TEXT DEFAULT (datetime('now'))
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS sync_playlists (
            id         TEXT PRIMARY KEY,
            name       TEXT NOT NULL,
            url        TEXT NOT NULL,
            image      TEXT,
            auto_sync  INTEGER DEFAULT 0,
            interval_h INTEGER DEFAULT 24,
            last_sync  TEXT,
            last_count INTEGER DEFAULT 0
        )
    """)
    con.commit()
    con.close()
    log.info("DB inicializado em %s", db_path)


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(str(_DB_PATH))
    con.row_factory = sqlite3.Row
    return con


def upsert_track(
    path: str,
    title: str,
    artist: str,
    album: str,
    duration: str,
    has_cover: bool,
) -> None:
    with _conn() as con:
        con.execute(
            """
            INSERT INTO tracks (path, title, artist, album, duration, has_cover)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(path) DO UPDATE SET
                title     = excluded.title,
                artist    = excluded.artist,
                album     = excluded.album,
                duration  = excluded.duration,
                has_cover = excluded.has_cover
            """,
            (path, title, artist, album, duration, int(has_cover)),
        )


def get_track_keys() -> set[str]:
    """Conjunto de 'título|artista' (lowercase) para lookup rápido de duplicados."""
    with _conn() as con:
        rows = con.execute("SELECT title, artist FROM tracks").fetchall()
    return {f"{r['title'].lower()}|{r['artist'].lower()}" for r in rows}


def get_all_tracks() -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT path, title, artist, album, duration, has_cover, liked, play_count, added_at "
            "FROM tracks ORDER BY artist, album, title"
        ).fetchall()
    return [dict(r) for r in rows]


def set_liked(path: str, liked: bool) -> None:
    with _conn() as con:
        con.execute("UPDATE tracks SET liked=? WHERE path=?", (int(liked), path))


def increment_play(path: str) -> None:
    with _conn() as con:
        con.execute("UPDATE tracks SET play_count = play_count + 1 WHERE path=?", (path,))
        con.execute("INSERT INTO recent_plays (path) VALUES (?)", (path,))
        con.execute("DELETE FROM recent_plays WHERE id NOT IN (SELECT id FROM recent_plays ORDER BY id DESC LIMIT 200)")


def get_recently_played(limit: int = 12) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT t.path, t.title, t.artist, t.album, t.duration, t.has_cover, t.liked,
                   MAX(r.played_at) as last_played
            FROM recent_plays r
            JOIN tracks t ON r.path = t.path
            GROUP BY r.path
            ORDER BY last_played DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_most_played(limit: int = 12) -> list[dict]:
    with _conn() as con:
        rows = con.execute("""
            SELECT path, title, artist, album, duration, has_cover, liked, play_count
            FROM tracks WHERE play_count > 0
            ORDER BY play_count DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_sync_playlists() -> list[dict]:
    with _conn() as con:
        rows = con.execute("SELECT * FROM sync_playlists ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def get_sync_playlist(id: str) -> Optional[dict]:
    with _conn() as con:
        row = con.execute("SELECT * FROM sync_playlists WHERE id=?", (id,)).fetchone()
    return dict(row) if row else None


def upsert_sync_playlist(
    id: str, name: str, url: str, image: Optional[str], auto_sync: int, interval_h: int
) -> dict:
    with _conn() as con:
        con.execute(
            """
            INSERT INTO sync_playlists (id, name, url, image, auto_sync, interval_h)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, url=excluded.url, image=excluded.image,
                auto_sync=excluded.auto_sync, interval_h=excluded.interval_h
            """,
            (id, name, url, image, auto_sync, interval_h),
        )
    return get_sync_playlist(id)


def delete_sync_playlist(id: str) -> None:
    with _conn() as con:
        con.execute("DELETE FROM sync_playlists WHERE id=?", (id,))


def update_sync_result(id: str, new_tracks: int) -> None:
    with _conn() as con:
        con.execute(
            "UPDATE sync_playlists SET last_sync=datetime('now'), last_count=? WHERE id=?",
            (new_tracks, id),
        )


def get_sync_playlists_due() -> list[dict]:
    """Playlists com auto_sync=1 cuja hora de próximo sync já passou."""
    with _conn() as con:
        rows = con.execute("""
            SELECT * FROM sync_playlists
            WHERE auto_sync = 1
              AND (
                last_sync IS NULL
                OR datetime(last_sync, '+' || interval_h || ' hours') <= datetime('now')
              )
        """).fetchall()
    return [dict(r) for r in rows]


def get_stats() -> dict:
    with _conn() as con:
        total = con.execute("SELECT COUNT(*) as c FROM tracks").fetchone()["c"]
        liked = con.execute("SELECT COUNT(*) as c FROM tracks WHERE liked=1").fetchone()["c"]
        total_plays = con.execute("SELECT COALESCE(SUM(play_count), 0) as s FROM tracks").fetchone()["s"]
        artists = con.execute("SELECT COUNT(DISTINCT artist) as c FROM tracks WHERE artist != ''").fetchone()["c"]
        albums = con.execute("SELECT COUNT(DISTINCT album) as c FROM tracks WHERE album != ''").fetchone()["c"]

        durations = con.execute("SELECT duration FROM tracks WHERE duration IS NOT NULL").fetchall()
        total_secs = 0
        for row in durations:
            try:
                parts = str(row["duration"]).split(":")
                if len(parts) == 2:
                    total_secs += int(parts[0]) * 60 + int(parts[1])
            except Exception:
                pass

        top_artists = con.execute("""
            SELECT artist, SUM(play_count) as plays
            FROM tracks WHERE artist != '' AND play_count > 0
            GROUP BY artist ORDER BY plays DESC LIMIT 5
        """).fetchall()

        top_tracks = con.execute("""
            SELECT path, title, artist, has_cover, play_count
            FROM tracks WHERE play_count > 0
            ORDER BY play_count DESC LIMIT 5
        """).fetchall()

    return {
        "total_tracks": total,
        "liked_count": liked,
        "total_plays": total_plays,
        "unique_artists": artists,
        "unique_albums": albums,
        "total_duration_s": total_secs,
        "top_artists": [dict(r) for r in top_artists],
        "top_tracks": [dict(r) for r in top_tracks],
    }


def get_duplicates() -> list[dict]:
    """Grupos de faixas com mesmo título+artista (case-insensitive)."""
    with _conn() as con:
        rows = con.execute("""
            SELECT lower(title) as lt, lower(artist) as la,
                   GROUP_CONCAT(path, '|||') as paths, COUNT(*) as cnt
            FROM tracks GROUP BY lt, la HAVING cnt > 1 ORDER BY cnt DESC, lt
        """).fetchall()
        result = []
        for row in rows:
            paths = row["paths"].split("|||")
            tracks = con.execute(
                f"SELECT path,title,artist,album,duration,has_cover,play_count FROM tracks WHERE path IN ({','.join('?'*len(paths))})",
                paths
            ).fetchall()
            result.append({"count": row["cnt"], "tracks": [dict(t) for t in tracks]})
    return result


def get_wrapped_stats(year: int) -> dict:
    """Estatísticas anuais estilo Wrapped."""
    start, end = f"{year}-01-01", f"{year+1}-01-01"
    MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
    with _conn() as con:
        top_tracks = con.execute("""
            SELECT t.path,t.title,t.artist,t.has_cover, COUNT(r.id) as plays
            FROM recent_plays r JOIN tracks t ON r.path=t.path
            WHERE r.played_at>=? AND r.played_at<? GROUP BY r.path ORDER BY plays DESC LIMIT 10
        """, (start, end)).fetchall()
        top_artists = con.execute("""
            SELECT t.artist, COUNT(r.id) as plays
            FROM recent_plays r JOIN tracks t ON r.path=t.path
            WHERE r.played_at>=? AND r.played_at<? AND t.artist!=''
            GROUP BY t.artist ORDER BY plays DESC LIMIT 5
        """, (start, end)).fetchall()
        total = con.execute("SELECT COUNT(*) as c FROM recent_plays WHERE played_at>=? AND played_at<?", (start,end)).fetchone()["c"]
        best_month_row = con.execute("""
            SELECT strftime('%m',played_at) as m, COUNT(*) as c FROM recent_plays
            WHERE played_at>=? AND played_at<? GROUP BY m ORDER BY c DESC LIMIT 1
        """, (start,end)).fetchone()
        first = con.execute("""
            SELECT t.title,t.artist FROM recent_plays r JOIN tracks t ON r.path=t.path
            WHERE r.played_at>=? AND r.played_at<? ORDER BY r.played_at ASC LIMIT 1
        """, (start,end)).fetchone()
        last = con.execute("""
            SELECT t.title,t.artist FROM recent_plays r JOIN tracks t ON r.path=t.path
            WHERE r.played_at>=? AND r.played_at<? ORDER BY r.played_at DESC LIMIT 1
        """, (start,end)).fetchone()
    return {
        "year": year, "total_plays": total,
        "top_tracks": [dict(t) for t in top_tracks],
        "top_artists": [dict(a) for a in top_artists],
        "best_month": MONTHS[int(best_month_row["m"])-1] if best_month_row else None,
        "first_track": dict(first) if first else None,
        "last_track": dict(last) if last else None,
    }


def update_tags(path: str, title: str, artist: str, album: str) -> None:
    with _conn() as con:
        con.execute("UPDATE tracks SET title=?,artist=?,album=? WHERE path=?", (title, artist, album, path))


def delete_track(path: str) -> None:
    with _conn() as con:
        con.execute("DELETE FROM tracks WHERE path=?", (path,))
        con.execute("DELETE FROM recent_plays WHERE path=?", (path,))


def get_smart_playlists() -> list[dict]:
    """Playlists geradas automaticamente a partir dos dados da biblioteca."""
    from datetime import datetime, timedelta
    with _conn() as con:
        never = con.execute(
            "SELECT path,title,artist,album,duration,has_cover,liked,play_count FROM tracks "
            "WHERE play_count = 0 ORDER BY added_at DESC LIMIT 50"
        ).fetchall()
        favorites = con.execute(
            "SELECT path,title,artist,album,duration,has_cover,liked,play_count FROM tracks "
            "WHERE liked = 1 ORDER BY play_count DESC"
        ).fetchall()
        recent = con.execute(
            "SELECT path,title,artist,album,duration,has_cover,liked,play_count FROM tracks "
            "ORDER BY added_at DESC LIMIT 30"
        ).fetchall()
        week_ago = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%d")
        week_top = con.execute("""
            SELECT t.path, t.title, t.artist, t.album, t.duration, t.has_cover, t.liked,
                   COUNT(r.id) as play_count
            FROM tracks t JOIN recent_plays r ON t.path = r.path
            WHERE r.played_at >= ?
            GROUP BY t.path ORDER BY play_count DESC LIMIT 25
        """, (week_ago,)).fetchall()
        month_ago = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%d")
        forgotten = con.execute(
            "SELECT path,title,artist,album,duration,has_cover,liked,play_count FROM tracks "
            "WHERE added_at < ? AND play_count < 3 ORDER BY RANDOM() LIMIT 25",
            (month_ago,)
        ).fetchall()
    return [
        {"id": "never",        "name": "Nunca Ouvidas",          "desc": "Ainda por descobrir",                 "tracks": [dict(r) for r in never]},
        {"id": "favorites",    "name": "Favoritas",               "desc": "As que marcaste com coração",         "tracks": [dict(r) for r in favorites]},
        {"id": "recent_added", "name": "Adicionadas Recentemente","desc": "As últimas 30 músicas",               "tracks": [dict(r) for r in recent]},
        {"id": "week_top",     "name": "Top da Semana",           "desc": "Mais ouvidas nos últimos 7 dias",     "tracks": [dict(r) for r in week_top]},
        {"id": "forgotten",    "name": "Esquecidas",              "desc": "Pouco ouvidas há mais de 30 dias",    "tracks": [dict(r) for r in forgotten]},
    ]


def scan_and_index(downloads_dir: Path) -> int:
    """Varre downloads_dir, indexa MP3s novos e remove registos de ficheiros apagados."""
    from mutagen.id3 import ID3, ID3NoHeaderError
    from mutagen.mp3 import MP3 as MutMP3

    with _conn() as con:
        existing = {row["path"] for row in con.execute("SELECT path FROM tracks").fetchall()}

    added = 0
    for mp3_file in sorted(downloads_dir.rglob("*.mp3")):
        try:
            rel_path = mp3_file.relative_to(downloads_dir).as_posix()
            if rel_path in existing:
                continue

            duration_s = 0
            try:
                audio = MutMP3(str(mp3_file))
                if audio.info:
                    duration_s = int(audio.info.length)
            except Exception:
                pass

            title = mp3_file.stem
            artist = album = ""
            has_cover = False
            try:
                tags = ID3(str(mp3_file))
                title  = str(tags["TIT2"]) if "TIT2" in tags else title
                artist = str(tags["TPE1"]) if "TPE1" in tags else ""
                album  = str(tags["TALB"]) if "TALB" in tags else ""
                has_cover = any(k.startswith("APIC") for k in tags.keys())
            except ID3NoHeaderError:
                pass

            duration = f"{duration_s // 60}:{duration_s % 60:02d}"
            upsert_track(rel_path, title, artist, album, duration, has_cover)
            added += 1
        except Exception as exc:
            log.warning("Erro ao indexar %s: %s", mp3_file, exc)

    # Remover do DB ficheiros que já não existem em disco
    with _conn() as con:
        rows = con.execute("SELECT path FROM tracks").fetchall()
        removed = 0
        for row in rows:
            if not (downloads_dir / row["path"]).exists():
                con.execute("DELETE FROM tracks WHERE path=?", (row["path"],))
                removed += 1

    log.info("Scan concluído: +%d indexadas, -%d removidas", added, removed)
    return added
