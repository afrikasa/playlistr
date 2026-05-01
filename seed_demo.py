"""
seed_demo.py
────────────
Popula o DB com faixas de demonstração para testar a UI sem descarregar nada.
Corre automaticamente no Codespace. Pode ser corrido manualmente:
    python seed_demo.py
"""
import sys
from pathlib import Path

# Adicionar backend ao path
sys.path.insert(0, str(Path(__file__).parent / "backend"))
import db as _db

DOWNLOADS_DIR = Path(__file__).parent / "downloads"
DOWNLOADS_DIR.mkdir(exist_ok=True)
DB_PATH = DOWNLOADS_DIR / "library.db"

DEMO_TRACKS = [
    ("Linkin Park/Meteora/Numb.mp3",          "Numb",              "Linkin Park",   "Meteora",          "4:22", True),
    ("Linkin Park/Meteora/In the End.mp3",    "In the End",        "Linkin Park",   "Meteora",          "3:36", True),
    ("Linkin Park/Hybrid Theory/Crawling.mp3","Crawling",          "Linkin Park",   "Hybrid Theory",    "3:29", True),
    ("Coldplay/A Rush of Blood/The Scientist.mp3","The Scientist",  "Coldplay",      "A Rush of Blood",  "5:09", True),
    ("Coldplay/A Rush of Blood/Clocks.mp3",   "Clocks",            "Coldplay",      "A Rush of Blood",  "5:07", True),
    ("Coldplay/X&Y/Speed of Sound.mp3",       "Speed of Sound",    "Coldplay",      "X&Y",              "4:57", True),
    ("Imagine Dragons/Night Visions/Radioactive.mp3","Radioactive","Imagine Dragons","Night Visions",   "3:07", True),
    ("Imagine Dragons/Night Visions/Demons.mp3","Demons",          "Imagine Dragons","Night Visions",   "2:57", True),
    ("Twenty One Pilots/Blurryface/Stressed Out.mp3","Stressed Out","Twenty One Pilots","Blurryface",    "3:22", True),
    ("Twenty One Pilots/Blurryface/Ride.mp3", "Ride",              "Twenty One Pilots","Blurryface",    "3:34", True),
    ("Paramore/Brand New Eyes/The Only Exception.mp3","The Only Exception","Paramore","Brand New Eyes",  "4:25", True),
    ("Muse/Absolution/Time Is Running Out.mp3","Time Is Running Out","Muse",        "Absolution",       "3:56", True),
]

def main():
    _db.init_db(DB_PATH)
    existing = {r["path"] for r in _db.get_all_tracks()}

    added = 0
    for path, title, artist, album, duration, has_cover in DEMO_TRACKS:
        # Criar ficheiro dummy para o scan não apagar a entrada da DB
        full_path = DOWNLOADS_DIR / path
        full_path.parent.mkdir(parents=True, exist_ok=True)
        if not full_path.exists():
            full_path.touch()

        if path in existing:
            continue
        _db.upsert_track(path, title, artist, album, duration, has_cover)
        added += 1

    if added:
        print(f"✅  Seed: {added} faixas de demonstração adicionadas ao DB.")
    else:
        print("ℹ️   Seed: DB já tem faixas, nada adicionado.")

if __name__ == "__main__":
    main()
