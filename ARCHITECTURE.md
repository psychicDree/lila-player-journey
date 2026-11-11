# Architecture

## Stack and why

| Layer | Choice | Why |
|---|---|---|
| Data pipeline | Python 3 + pyarrow/pandas (`pipeline/build_data.py`) | Parquet is native to pyarrow. The dataset is small (~89k rows), so one offline pass beats running a live backend. |
| Frontend | Vite + React 18 + TypeScript, HTML Canvas 2D | React handles UI state (filters, selection, playback). Canvas draws tens of thousands of path points per frame, which the DOM/SVG can't. No chart or map library is needed, since the map is just one image. |
| Hosting | Static site on Vercel | No server: nothing can go to sleep or fall over, and it loads fast with CDN caching. |

## Data flow

```
player_data/February_*/<user>_<match>.nakama-0   (1,243 parquet files)
        │  pipeline/build_data.py  (runs once, ~6 s)
        │   1. read every file; decode `event` bytes → str
        │   2. fix timestamps (see assumptions), drop 1,505 exact-duplicate rows
        │   3. classify each journey as human or bot; flag anomalies
        │   4. world (x, z) → minimap pixels (0–1024)
        │   5. group by match → journeys → {path samples, events}
        ▼
web/public/data/index.json      match summaries for the sidebar (145 KB)
web/public/data/<Map>.json      every journey on one map, loaded on demand (122 KB – 1.1 MB, gzip ≈ 25%)
web/public/minimaps/<Map>.jpg   minimaps resized to 2048² (≈ 300 KB each)
        │  fetch, cached per map
        ▼
React state (map, dates, match, layers, time) ──► heatmap.ts (256² density grid, Gaussian blur, colour ramp)
                                                └► render.ts  (canvas: minimap → heatmap → paths → markers → player heads)
```

Filtering, heatmaps and playback all run in the browser on the loaded map file, so every filter change updates instantly with no round trip. View state (map, match, heatmap) sits in the URL hash, so a designer can share a link to an exact view.

## Coordinate mapping

The README gives `u = (x − origin_x) / scale`, `v = (z − origin_z) / scale`, `px = u·1024`, `py = (1 − v)·1024`. I followed it, with three checks:

1. **Use `x` and `z`, not `y`.** `y` is elevation (AmbroseValley 100–163, Lockdown 33–71), so it is dropped for 2D plotting.
2. **The images aren't 1024².** The real minimaps are 4320², 2160×2158 and 9000². The pipeline outputs coordinates in a logical 1024-unit space, and the frontend always draws the image into a 1024×1024 box, so source resolution doesn't matter. Grand Rift's 2-pixel aspect difference is stretched away (0.09%, under one logical unit).
3. **Verified against the art.** I drew all 72k path samples on each minimap. Paths follow roads, route around rocks and cliffs, and never cross Lockdown's sea, and 0 of 87,599 points fall outside the image. If an axis were swapped or the V flip missing, paths would run through water and walls.

Paths and markers are drawn in screen space after the pan/zoom transform (`screen = offset + px · zoom`), so lines and markers stay the same pixel size at any zoom.

## Assumptions where the data was ambiguous

| What I found | How I handled it |
|---|---|
| `ts` is typed `timestamp[ms]`, but read as ms every match lasts < 1 s and the dates fall in Jan 1970. | The stored integer is **Unix seconds**. Read that way, dates land on Feb 10–14 2026 (matching the folders), matches last 1–15 min (median 6.4), and positions are sampled every ~5 s. Timestamps have 1 s resolution. |
| 17 files from 3 numeric (bot-style) IDs (`1379`, `1402`, `1429`) contain `Position`/`Loot`, which are human-only events. No other bot file ever loots. | Classified by **telemetry** (`Position` ⇒ human-controlled pawn, `BotPosition` ⇒ bot), and the README ID rule is the fallback. These journeys show as humans with a ⚠ "numeric ID" flag in the UI. |
| `BotKill`/`BotKilled` appear in bot files too, and the README only describes them from a human's view. | Checked: in both human and bot files, `BotKilled` is always the last telemetry (the owner died) and `BotKill` never is. So every event is read **from the file owner's point of view**, and the UI labels a bot's `BotKilled` as "Bot died". |
| 1,505 exact duplicate rows (same file, second, event and position), mostly `Loot`. | Dropped. |
| One match appears in both the `February_10` and `February_11` folders (it ran over the cut-off). | Merged into one match, dated by the earliest folder. |
| 779 of 796 matches have only **one** human file, and only 53 matches have more than one journey file. | Treated as sampled telemetry, not complete matches. The UI shows "journeys tracked", not "players in match", and has a filter for matches with 2+ journeys. Per-journey stats (e.g. how a human died) are still reliable, because each file records its owner's own death. |
| The 3 `Kill`/`Killed` pairs each sit in a single file at the same second. | Shown as-is. Possibly a trade or self-kill; too rare (n=3) to analyse. |
| No extraction event exists. | A human journey with no death event is labelled "Survived (no death logged)", not "Extracted". |
| Folder dates vs UTC | Date filters use the folder date. Times of day are shown in UTC. Feb 14 is marked as a partial day. |

## Trade-offs

| Decision | Considered | Chose | Why |
|---|---|---|---|
| Where to process data | Live backend + DB (DuckDB/Postgres) vs. precomputed static JSON | Static JSON | 1.7 MB in total. No server to host, secure or keep awake. Filters run on the client instantly. It would not scale to months of data; then I'd move to DuckDB-WASM or a small API that returns per-match slices. |
| Rendering | SVG/DOM, Leaflet/deck.gl, Canvas 2D | Canvas 2D | The overview draws ~50k segments. SVG chokes at that size, and deck.gl/Leaflet bring tile and projection machinery a single 1024² image doesn't need. |
| Heatmap | Server-side images vs. client-side computation | Client-side 256² grid + separable Gaussian | It recomputes on every filter change (map, dates, match, include bots) with no round trip. The colour scale is normalised to the 99.5th percentile, so one hotspot doesn't flatten the rest. |
| Traffic metric | Path length vs. position samples | Position samples | Samples come at a fixed ~5 s interval, so sample density ≈ time spent there. That is the question a designer actually asks. |
| Bot detection | README ID rule vs. event telemetry | Telemetry, with the ID rule as fallback and the anomalies flagged | It is what the server recorded about the pawn. The 17 disagreeing files stay visible instead of being silently mislabelled. |
| Paths | Raw 5 s samples vs. smoothing/interpolation | Straight lines between raw samples, with interpolated player heads during playback | No invented movement. Playback still looks continuous. |
| Stack | Streamlit (faster to build) vs. React | React + Canvas | Smoother playback and pan/zoom, a UI designed for level designers rather than a notebook look, and free static hosting with no cold starts. |
