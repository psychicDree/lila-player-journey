import { useEffect, useMemo, useState } from "react";
import LayersPanel from "./components/LayersPanel";
import MapCanvas from "./components/MapCanvas";
import Sidebar, { type SortKey } from "./components/Sidebar";
import Timeline from "./components/Timeline";
import { loadIndex, loadMap } from "./lib/data";
import { fmtClock, fmtDate, fmtTimeOfDay, MAP_LABEL } from "./lib/format";
import { renderHeatmap } from "./lib/heatmap";
import { MAP_IDS, type DataIndex, type HeatmapKind, type Layers, type MapData, type MapId, type MatchData } from "./lib/types";

const DEFAULT_LAYERS: Layers = {
  humanPaths: true,
  botPaths: true,
  events: { K: true, D: true, BK: true, BD: true, S: true, L: false },
  heatmap: "off",
  heatmapBots: true,
  heatOpacity: 0.7,
  heatScope: "filtered",
};

const HEAT_KINDS: HeatmapKind[] = ["off", "traffic", "kills", "deaths", "storm", "loot"];
function readHash(): { map?: MapId; match?: string; heat?: HeatmapKind } {
  const h = new URLSearchParams(window.location.hash.slice(1));
  const map = h.get("map") as MapId | null;
  const heat = h.get("heat") as HeatmapKind | null;
  return {
    map: map && MAP_IDS.includes(map) ? map : undefined,
    match: h.get("match") ?? undefined,
    heat: heat && HEAT_KINDS.includes(heat) ? heat : undefined,
  };
}

export default function App() {
  const initial = useMemo(readHash, []);
  const [index, setIndex] = useState<DataIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState<MapId>(initial.map ?? "AmbroseValley");
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [dates, setDates] = useState<Set<string>>(new Set());
  const [multiOnly, setMultiOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("start");
  const [selected, setSelected] = useState<string | null>(initial.match ?? null);
  const [layers, setLayers] = useState<Layers>({ ...DEFAULT_LAYERS, heatmap: initial.heat ?? DEFAULT_LAYERS.heatmap });
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const [focusUser, setFocusUser] = useState<string | null>(null);

  useEffect(() => {
    loadIndex()
      .then((idx) => {
        setIndex(idx);
        setDates(new Set(idx.dates));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    let alive = true;
    setMapData(null);
    loadMap(mapId)
      .then((d) => alive && setMapData(d))
      .catch((e) => setError(String(e)));
    return () => {
      alive = false;
    };
  }, [mapId]);

  useEffect(() => {
    const h = new URLSearchParams({ map: mapId });
    if (selected) h.set("match", selected);
    if (layers.heatmap !== "off") h.set("heat", layers.heatmap);
    window.history.replaceState(null, "", `#${h.toString()}`);
  }, [mapId, selected, layers.heatmap]);

  const filteredSummaries = useMemo(() => {
    if (!index) return [];
    const list = index.matches.filter((m) => m.map === mapId && dates.has(m.date) && (!multiOnly || m.humans + m.bots > 1));
    const key: Record<SortKey, (m: (typeof list)[number]) => number> = {
      start: (m) => -m.start,
      dur: (m) => -m.dur,
      kills: (m) => -m.kills,
      deaths: (m) => -m.deaths,
      storm: (m) => -m.storm,
      loot: (m) => -m.loot,
      bots: (m) => -m.bots,
    };
    return [...list].sort((a, b) => key[sort](a) - key[sort](b) || b.start - a.start);
  }, [index, mapId, dates, multiOnly, sort]);

  const filteredMatches: MatchData[] = useMemo(() => {
    if (!mapData) return [];
    const ids = new Set(filteredSummaries.map((m) => m.id));
    return mapData.matches.filter((m) => ids.has(m.id));
  }, [mapData, filteredSummaries]);

  const match = useMemo(() => (selected && mapData ? mapData.matches.find((m) => m.id === selected) ?? null : null), [selected, mapData]);

  useEffect(() => {
    if (mapData && selected && !match) setSelected(null);
  }, [mapData, selected, match]);

  useEffect(() => {
    setPlaying(false);
    setFocusUser(null);
    setTime(match ? match.dur : 0);
  }, [match]);

  useEffect(() => {
    if (!playing || !match) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTime((t) => {
        const next = t + dt * speed;
        if (next >= match.dur) {
          setPlaying(false);
          return match.dur;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, match]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      if (!match) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (!playing && time >= match.dur) setTime(0);
        setPlaying((p) => !p);
      } else if (e.code === "ArrowRight") setTime((t) => Math.min(match.dur, t + 5));
      else if (e.code === "ArrowLeft") setTime((t) => Math.max(0, t - 5));
      else if (e.code === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [match, playing, time]);

  const heatSource = useMemo(
    () => (match && layers.heatScope === "match" ? [match] : filteredMatches),
    [match, layers.heatScope, filteredMatches],
  );
  const heat = useMemo(() => renderHeatmap(heatSource, layers.heatmap, layers.heatmapBots), [heatSource, layers.heatmap, layers.heatmapBots]);

  const drawn = match ? [match] : filteredMatches;
  const totals = useMemo(() => {
    const t = { humans: 0, bots: 0, kills: 0, deaths: 0, storm: 0, loot: 0 };
    for (const m of filteredSummaries) {
      t.humans += m.humans;
      t.bots += m.bots;
      t.kills += m.kills;
      t.deaths += m.deaths;
      t.storm += m.storm;
      t.loot += m.loot;
    }
    return t;
  }, [filteredSummaries]);
  const selSummary = match ? index?.matches.find((m) => m.id === match.id) : null;

  if (error) return <div className="fatal">Could not load data: {error}</div>;
  if (!index) return <div className="fatal">Loading…</div>;

  return (
    <div className="app">
      <Sidebar
        mapId={mapId}
        onMap={(m) => {
          setMapId(m);
          setSelected(null);
        }}
        allDates={index.dates}
        dates={dates}
        onDates={setDates}
        multiOnly={multiOnly}
        onMultiOnly={setMultiOnly}
        sort={sort}
        onSort={setSort}
        allMatches={index.matches}
        matches={filteredSummaries}
        selected={selected}
        onSelect={setSelected}
      />
      <main className="main">
        <div className="topbar">
          {match && selSummary ? (
            <>
              <button className="back" onClick={() => setSelected(null)} title="Back to overview (Esc)">
                ← Overview
              </button>
              <div className="tb-title">
                {MAP_LABEL[mapId]} · {fmtDate(match.date)} {fmtTimeOfDay(match.start)} UTC · {fmtClock(match.dur)}
              </div>
              <div className="tb-stats">
                <span>👤 {selSummary.humans}</span>
                <span>🤖 {selSummary.bots}</span>
                <span className="c-kill">◆ {selSummary.kills} kills</span>
                <span className="c-death">✖ {selSummary.deaths} deaths</span>
                <span className="c-storm">▲ {selSummary.storm} storm</span>
                <span className="c-loot">■ {selSummary.loot} loot</span>
              </div>
            </>
          ) : (
            <>
              <div className="tb-title">
                {MAP_LABEL[mapId]} · {filteredSummaries.length} matches
              </div>
              <div className="tb-stats">
                <span>👤 {totals.humans} human journeys</span>
                <span>🤖 {totals.bots} bot journeys</span>
                <span className="c-kill">◆ {totals.kills}</span>
                <span className="c-death">✖ {totals.deaths}</span>
                <span className="c-storm">▲ {totals.storm}</span>
                <span className="c-loot">■ {totals.loot}</span>
              </div>
            </>
          )}
        </div>
        <div className="stage">
          {!mapData && <div className="map-loading">Loading {MAP_LABEL[mapId]} telemetry…</div>}
          <MapCanvas
            imageUrl={`${import.meta.env.BASE_URL}${index.maps[mapId].image}`}
            heat={heat?.canvas ?? null}
            layers={layers}
            matches={drawn}
            time={match ? time : null}
            focusUser={focusUser}
            overview={!match}
            onPickMatch={setSelected}
          />
          <LayersPanel
            layers={layers}
            onLayers={setLayers}
            heatCount={heat?.count ?? null}
            match={match}
            focusUser={focusUser}
            onFocus={setFocusUser}
          />
          {!match && mapData && (
            <div className="hint">Pick a match on the left (or click any marker) to replay it. Scroll to zoom, drag to pan.</div>
          )}
        </div>
        {match && (
          <Timeline match={match} time={time} playing={playing} speed={speed} onTime={setTime} onPlay={setPlaying} onSpeed={setSpeed} />
        )}
      </main>
    </div>
  );
}
