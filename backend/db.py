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
            added_at  TEXT    DEFAULT (datetime('now'))
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
            "SELECT path, title, artist, album, duration, has_cover "
            "FROM tracks ORDER BY artist, album, title"
        ).fetchall()
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
