"""
classifier.py
──────────────
Classificação automática de faixas por género/mood baseado em Audio Features do Spotify.

Usa a Spotify Web API para obter característica áudio de cada faixa e aplica uma árvore
de decisão baseada em percentis da playlist actual para atribuir categorias mood/genre.
"""

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
import time

log = logging.getLogger(__name__)


def enrich_with_audio_features(tracks: list[dict], sp_client) -> list[dict]:
    """
    Busca audio features do Spotify para cada track em paralelo.
    Adiciona 'audio_features' e 'category' a cada track.

    ⚠️  RISCO CONHECIDO: O endpoint sp_client.audio_features() é da Spotify Web API oficial
        e está sujeito à restrição de "Extended Access" — pode falhar com 403 se as credenciais
        não têm permissões suficientes (Client Credentials / OAuth2 standard). Em caso de falha,
        as tracks ficam com category='unknown' (fallback gracioso implementado no backend/main.py,
        linhas 294-297).

    Args:
        tracks: Lista de tracks com 'title', 'artist', 'album', etc.
                Alguns tracks podem já ter 'track_id' — se não tiverem,
                tenta-se buscar via search (fallback).
        sp_client: Cliente spotipy autenticado.

    Retorna:
        tracks enriquecida com 'audio_features' (dict) e 'category' (string).
        Tracks sem features ou ID válido ficam com category='unknown'.
    """
    if not tracks:
        return tracks

    # Extrair/buscar IDs dos tracks
    track_ids = []
    tracks_with_ids = []

    for track in tracks:
        track_id = track.get("track_id")

        # Se não tem track_id, tenta buscar via Spotify search API
        if not track_id:
            try:
                query = f"{track.get('artist', '')} {track.get('title', '')}"
                results = sp_client.search(q=query, type="track", limit=1)
                if results.get("tracks", {}).get("items"):
                    track_id = results["tracks"]["items"][0]["id"]
            except Exception as exc:
                log.debug("Não foi possível buscar ID para '%s': %s",
                         f"{track.get('artist')} — {track.get('title')}", exc)

        if track_id:
            track_ids.append(track_id)
            tracks_with_ids.append((track, track_id))

    if not track_ids:
        log.warning("Nenhuma faixa com ID — all will be categorized as 'unknown'")
        for track in tracks:
            track["audio_features"] = {}
            track["category"] = "unknown"
        return tracks

    # Buscar audio features em batch (máximo 100 por request, respeitando rate limits)
    all_features = {}
    batch_size = 100

    for i in range(0, len(track_ids), batch_size):
        batch_ids = track_ids[i:i+batch_size]

        # Retry com backoff para 429 (rate limit)
        for attempt in range(3):
            try:
                features_list = sp_client.audio_features(batch_ids)
                for idx, features_dict in enumerate(features_list):
                    if features_dict:
                        all_features[batch_ids[idx]] = features_dict
                break
            except Exception as exc:
                if "429" in str(exc) and attempt < 2:
                    wait = 2 ** attempt
                    log.warning("Rate limit — aguardando %ds… (tentativa %d/3)", wait, attempt + 1)
                    time.sleep(wait)
                else:
                    log.error("Erro ao buscar audio features batch %d: %s", i // batch_size, exc)
                    break

    log.info("Audio features obtidas para %d/%d faixas", len(all_features), len(track_ids))

    # Mapear features de volta aos tracks originais
    for track, track_id in tracks_with_ids:
        track["audio_features"] = all_features.get(track_id, {})

    # Tracks sem features
    for track in tracks:
        if "audio_features" not in track:
            track["audio_features"] = {}

    # Calcular percentis da playlist
    features_list = [t["audio_features"] for t in tracks if t.get("audio_features")]
    percentiles = calculate_percentiles(features_list)

    # Classificar cada track
    for track in tracks:
        features = track.get("audio_features", {})
        category = classify_track(features, percentiles)
        track["category"] = category

    return tracks


def calculate_percentiles(features_list: list[dict]) -> dict:
    """
    Calcula P25/P50/P75 para características áudio.

    Args:
        features_list: Lista de dicts com audio features do Spotify.

    Retorna:
        Dict com percentis:
        {'acousticness': {'p25': x, 'p50': y, 'p75': z}, ...}
    """
    if not features_list:
        return {}

    # Características a calcular
    keys = ["acousticness", "energy", "danceability", "valence", "instrumentalness"]
    percentiles = {}

    for key in keys:
        values = [f.get(key) for f in features_list if f.get(key) is not None]
        if not values:
            percentiles[key] = {"p25": 0, "p50": 0, "p75": 1}
            continue

        values_sorted = sorted(values)
        n = len(values_sorted)

        # Percentile simples
        p25_idx = int(n * 0.25)
        p50_idx = int(n * 0.50)
        p75_idx = int(n * 0.75)

        percentiles[key] = {
            "p25": values_sorted[p25_idx],
            "p50": values_sorted[p50_idx],
            "p75": values_sorted[p75_idx],
        }

    return percentiles


def classify_track(features: dict, percentiles: dict) -> str:
    """
    Árvore de decisão usando percentis da playlist.

    Regras:
        - acousticness > p75 AND energy < p50 → "acoustic"
        - energy > p75 AND valence < p25 → "rock"
        - energy > p75 AND danceability > p50 → "energetic"
        - energy < p25 AND valence > p50 → "calm"
        - danceability > p75 → "dance"
        - instrumentalness > p75 → "instrumental"
        - speechiness > p75 → "podcast_rap"
        - else → "mixed"

    Args:
        features: Dict com audio features (vazio {} se não disponível).
        percentiles: Dict com percentis calculados.

    Retorna:
        Categoria (string lowercase).
    """
    if not features or not percentiles:
        return "unknown"

    # Safeguard contra features vazios
    acousticness = features.get("acousticness")
    energy = features.get("energy")
    danceability = features.get("danceability")
    valence = features.get("valence")
    instrumentalness = features.get("instrumentalness")
    speechiness = features.get("speechiness")

    if acousticness is None and energy is None:
        return "unknown"

    # Árvore de decisão
    if (acousticness is not None and energy is not None and
        acousticness > percentiles.get("acousticness", {}).get("p75", 1) and
        energy < percentiles.get("energy", {}).get("p50", 0)):
        return "acoustic"

    if (energy is not None and valence is not None and
        energy > percentiles.get("energy", {}).get("p75", 1) and
        valence < percentiles.get("valence", {}).get("p25", 0)):
        return "rock"

    if (energy is not None and danceability is not None and
        energy > percentiles.get("energy", {}).get("p75", 1) and
        danceability > percentiles.get("danceability", {}).get("p50", 0)):
        return "energetic"

    if (energy is not None and valence is not None and
        energy < percentiles.get("energy", {}).get("p25", 0) and
        valence > percentiles.get("valence", {}).get("p50", 0)):
        return "calm"

    if (danceability is not None and
        danceability > percentiles.get("danceability", {}).get("p75", 1)):
        return "dance"

    if (instrumentalness is not None and
        instrumentalness > percentiles.get("instrumentalness", {}).get("p75", 1)):
        return "instrumental"

    if (speechiness is not None and
        speechiness > percentiles.get("speechiness", {}).get("p75", 1)):
        return "podcast_rap"

    return "mixed"
