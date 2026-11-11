from __future__ import annotations

import argparse
import json
import os
import re
from collections import Counter, defaultdict

import pandas as pd
import pyarrow.parquet as pq
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MAPS = {
    "AmbroseValley": {"scale": 900, "origin_x": -370, "origin_z": -473, "image": "AmbroseValley_Minimap.png"},
    "GrandRift": {"scale": 581, "origin_x": -290, "origin_z": -290, "image": "GrandRift_Minimap.png"},
    "Lockdown": {"scale": 1000, "origin_x": -500, "origin_z": -500, "image": "Lockdown_Minimap.jpg"},
}
MAP_PX = 1024
IMAGE_OUT_PX = 2048

NUMERIC_RE = re.compile(r"^\d+$")

POSITION_EVENTS = {"Position", "BotPosition"}
EVENT_CODES = {
    "Kill": "K",
    "Killed": "D",
    "BotKill": "BK",
    "BotKilled": "BD",
    "KilledByStorm": "S",
    "Loot": "L",
}
DEATH_EVENTS = {"Killed", "BotKilled", "KilledByStorm"}


def world_to_minimap(x: pd.Series, z: pd.Series, cfg: dict) -> tuple[pd.Series, pd.Series]:
    u = (x - cfg["origin_x"]) / cfg["scale"]
    v = (z - cfg["origin_z"]) / cfg["scale"]
    return u * MAP_PX, (1 - v) * MAP_PX


def load_raw(src: str) -> pd.DataFrame:
    frames, skipped = [], []
    for day in sorted(os.listdir(src)):
        day_dir = os.path.join(src, day)
        if not (os.path.isdir(day_dir) and day.startswith("February_")):
            continue
        for fname in sorted(os.listdir(day_dir)):
            if fname.startswith("."):
                continue
            try:
                t = pq.read_table(os.path.join(day_dir, fname)).to_pandas()
            except Exception as exc:
                skipped.append(f"{day}/{fname}: {exc}")
                continue
            t["folder"] = day
            t["file"] = fname
            frames.append(t)
    if skipped:
        print(f"[warn] skipped {len(skipped)} unreadable files", *skipped[:5], sep="\n  ")
    return pd.concat(frames, ignore_index=True)


def clean(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    notes: dict = {"raw_rows": int(len(df))}

    df["event"] = df["event"].map(lambda b: b.decode("utf-8") if isinstance(b, (bytes, bytearray)) else str(b))

    df["t"] = df["ts"].astype("int64")
    df = df.drop(columns=["ts"])

    before = len(df)
    df = df.drop_duplicates(["file", "t", "event", "x", "y", "z"]).copy()
    notes["duplicate_rows_dropped"] = int(before - len(df))

    df["id_is_numeric"] = df["user_id"].str.match(NUMERIC_RE)
    by_file = df.groupby("file")["event"].agg(lambda s: set(s))
    human_telemetry = by_file.map(lambda s: bool(s & {"Position", "Loot", "Kill", "Killed", "KilledByStorm"}))
    bot_telemetry = by_file.map(lambda s: "BotPosition" in s)
    is_bot_file = (~human_telemetry) & bot_telemetry
    neither = (~human_telemetry) & (~bot_telemetry)
    id_numeric_file = df.groupby("file")["id_is_numeric"].first()
    is_bot_file = is_bot_file | (neither & id_numeric_file)
    df["is_bot"] = df["file"].map(is_bot_file)
    anomalous = id_numeric_file & ~is_bot_file
    df["id_anomaly"] = df["file"].map(anomalous)
    notes["numeric_id_files_with_human_telemetry"] = int(anomalous.sum())
    notes["numeric_ids_with_human_telemetry"] = sorted(df.loc[df["id_anomaly"], "user_id"].unique().tolist())
    uuid_bot = (~id_numeric_file) & is_bot_file
    notes["uuid_files_with_bot_telemetry"] = int(uuid_bot.sum())

    match_folder = df.groupby("match_id")["folder"].min()
    notes["matches_split_across_folders"] = int((df.groupby("match_id")["folder"].nunique() > 1).sum())
    df["date"] = df["match_id"].map(match_folder)

    out_of_bounds = 0
    for map_id, cfg in MAPS.items():
        m = df["map_id"] == map_id
        px, py = world_to_minimap(df.loc[m, "x"], df.loc[m, "z"], cfg)
        df.loc[m, "px"] = px
        df.loc[m, "py"] = py
        out_of_bounds += int(((px < 0) | (px > MAP_PX) | (py < 0) | (py > MAP_PX)).sum())
    unknown_maps = sorted(set(df["map_id"]) - set(MAPS))
    if unknown_maps:
        print(f"[warn] dropping rows for unknown maps: {unknown_maps}")
        df = df[df["map_id"].isin(MAPS)]
    notes["points_outside_minimap"] = out_of_bounds
    notes["clean_rows"] = int(len(df))
    return df, notes


def date_label(folder: str) -> str:
    day = int(folder.split("_")[1])
    return f"2026-02-{day:02d}"


def build_map_payload(df_map: pd.DataFrame) -> tuple[list, list]:
    matches, summaries = [], []
    for match_id, g in df_map.groupby("match_id", sort=False):
        start = int(g["t"].min())
        end = int(g["t"].max())
        journeys = []
        for (user_id, file), j in g.groupby(["user_id", "file"], sort=False):
            j = j.sort_values(["t", "event"])
            pos = j[j["event"].isin(POSITION_EVENTS)]
            ev = j[~j["event"].isin(POSITION_EVENTS)]
            pts = []
            for t, px, py in zip(pos["t"], pos["px"], pos["py"]):
                pts.extend([int(t - start), round(float(px), 1), round(float(py), 1)])
            events = [
                [int(t - start), EVENT_CODES.get(e, e), round(float(px), 1), round(float(py), 1)]
                for t, e, px, py in zip(ev["t"], ev["event"], ev["px"], ev["py"])
            ]
            deaths = ev[ev["event"].isin(DEATH_EVENTS)]
            outcome = "alive"
            if len(deaths):
                outcome = {"KilledByStorm": "storm", "Killed": "pvp", "BotKilled": "bot"}[deaths.iloc[0]["event"]]
            journey = {
                "u": user_id,
                "b": 1 if bool(j["is_bot"].iloc[0]) else 0,
                "o": outcome,
                "p": pts,
                "e": events,
            }
            if bool(j["id_anomaly"].iloc[0]):
                journey["f"] = "numeric-id-human-telemetry"
            journeys.append(journey)

        journeys.sort(key=lambda r: (r["b"], r["u"]))
        evc = Counter(g.loc[~g["event"].isin(POSITION_EVENTS), "event"])
        humans = sum(1 for r in journeys if not r["b"])
        bots = len(journeys) - humans
        date = date_label(g["date"].iloc[0])
        matches.append({"id": match_id, "date": date, "start": start, "dur": end - start, "journeys": journeys})
        summaries.append({
            "id": match_id,
            "map": g["map_id"].iloc[0],
            "date": date,
            "start": start,
            "dur": end - start,
            "humans": humans,
            "bots": bots,
            "kills": int(evc["Kill"] + evc["BotKill"]),
            "deaths": int(evc["Killed"] + evc["BotKilled"] + evc["KilledByStorm"]),
            "storm": int(evc["KilledByStorm"]),
            "loot": int(evc["Loot"]),
        })
    matches.sort(key=lambda m: m["start"])
    return matches, summaries


def build_stats(df: pd.DataFrame, summaries: list, notes: dict) -> dict:
    hum = df[~df["is_bot"]]
    files = hum.groupby("file").agg(map_id=("map_id", "first"), ev=("event", lambda s: set(s)))

    def outcome(s: set) -> str:
        if "KilledByStorm" in s:
            return "storm"
        if "Killed" in s:
            return "pvp"
        if "BotKilled" in s:
            return "bot"
        return "alive"

    files["outcome"] = files["ev"].map(outcome)
    per_map = {}
    for map_id, f in files.groupby("map_id"):
        oc = f["outcome"].value_counts().to_dict()
        n = int(len(f))
        per_map[map_id] = {
            "human_journeys": n,
            "matches": sum(1 for s in summaries if s["map"] == map_id),
            "outcomes": {k: int(v) for k, v in oc.items()},
            "outcome_pct": {k: round(100 * v / n, 1) for k, v in oc.items()},
        }
    ev = df[~df["event"].isin(POSITION_EVENTS)]
    return {
        "cleaning": notes,
        "events": {k: int(v) for k, v in ev["event"].value_counts().items()},
        "unique_humans": int(hum["user_id"].nunique()),
        "unique_bot_ids": int(df.loc[df["is_bot"], "user_id"].nunique()),
        "matches": len(summaries),
        "per_map": per_map,
    }


def export_minimaps(src: str, out: str) -> dict:
    os.makedirs(os.path.join(out, "minimaps"), exist_ok=True)
    meta = {}
    for map_id, cfg in MAPS.items():
        im = Image.open(os.path.join(src, "minimaps", cfg["image"]))
        meta[map_id] = {"source_size": list(im.size)}
        im = im.convert("RGB").resize((IMAGE_OUT_PX, IMAGE_OUT_PX), Image.LANCZOS)
        im.save(os.path.join(out, "minimaps", f"{map_id}.jpg"), quality=82, optimize=True, progressive=True)
    return meta


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="raw/player_data")
    ap.add_argument("--out", default="web/public")
    ap.add_argument("--skip-images", action="store_true")
    args = ap.parse_args()

    df = load_raw(args.src)
    df, notes = clean(df)
    data_dir = os.path.join(args.out, "data")
    os.makedirs(data_dir, exist_ok=True)

    all_summaries = []
    for map_id in MAPS:
        matches, summaries = build_map_payload(df[df["map_id"] == map_id])
        all_summaries.extend(summaries)
        with open(os.path.join(data_dir, f"{map_id}.json"), "w") as fh:
            json.dump({"map": map_id, "matches": matches}, fh, separators=(",", ":"))

    image_meta = {} if args.skip_images else export_minimaps(args.src, args.out)
    index = {
        "generated_from": "player_data.zip (Feb 10-14 2026)",
        "map_px": MAP_PX,
        "maps": {
            m: {**{k: v for k, v in cfg.items() if k != "image"}, "image": f"minimaps/{m}.jpg", **image_meta.get(m, {})}
            for m, cfg in MAPS.items()
        },
        "dates": sorted({s["date"] for s in all_summaries}),
        "matches": sorted(all_summaries, key=lambda s: s["start"]),
    }
    with open(os.path.join(data_dir, "index.json"), "w") as fh:
        json.dump(index, fh, separators=(",", ":"))

    stats = build_stats(df, all_summaries, notes)
    with open(os.path.join(data_dir, "stats.json"), "w") as fh:
        json.dump(stats, fh, indent=2)

    print(json.dumps(notes, indent=2))
    for f in sorted(os.listdir(data_dir)):
        print(f"{f:22s} {os.path.getsize(os.path.join(data_dir, f)) / 1024:8.1f} KB")


if __name__ == "__main__":
    main()
