import { fmtClock, fmtDate, fmtTimeOfDay, MAP_LABEL } from "../lib/format";
import { MAP_IDS, type MapId, type MatchSummary } from "../lib/types";

export type SortKey = "start" | "dur" | "kills" | "deaths" | "storm" | "loot" | "bots";

interface Props {
  mapId: MapId;
  onMap: (m: MapId) => void;
  allDates: string[];
  dates: Set<string>;
  onDates: (d: Set<string>) => void;
  multiOnly: boolean;
  onMultiOnly: (v: boolean) => void;
  sort: SortKey;
  onSort: (s: SortKey) => void;
  allMatches: MatchSummary[];
  matches: MatchSummary[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}

const SORT_LABEL: Record<SortKey, string> = {
  start: "Start time",
  dur: "Longest",
  kills: "Most kills",
  deaths: "Most deaths",
  storm: "Storm deaths",
  loot: "Most loot",
  bots: "Most bots tracked",
};

export default function Sidebar(p: Props) {
  const inDates = (m: MatchSummary) => p.dates.has(m.date) && (!p.multiOnly || m.humans + m.bots > 1);
  const mapCount = (id: MapId) => p.allMatches.filter((m) => m.map === id && inDates(m)).length;
  const dateCount = (d: string) => p.allMatches.filter((m) => m.map === p.mapId && m.date === d && (!p.multiOnly || m.humans + m.bots > 1)).length;

  const toggleDate = (d: string) => {
    const next = new Set(p.dates);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    p.onDates(next);
  };

  return (
    <aside className="sidebar">
      <header className="brand">
        <div className="brand-title">LILA BLACK</div>
        <div className="brand-sub">Player Journey Explorer</div>
      </header>

      <section>
        <h3>Map</h3>
        <div className="seg">
          {MAP_IDS.map((id) => (
            <button key={id} className={id === p.mapId ? "on" : ""} onClick={() => p.onMap(id)}>
              {MAP_LABEL[id]}
              <span className="count">{mapCount(id)}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3>
          Dates <span className="muted small">(UTC)</span>
          <button className="link" onClick={() => p.onDates(new Set(p.allDates))}>all</button>
        </h3>
        <div className="chips">
          {p.allDates.map((d) => (
            <button key={d} className={`chip ${p.dates.has(d) ? "on" : ""}`} onClick={() => toggleDate(d)} title={d === "2026-02-14" ? "Partial day" : ""}>
              {fmtDate(d)}
              {d === "2026-02-14" && "*"} <span className="count">{dateCount(d)}</span>
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={p.multiOnly} onChange={(e) => p.onMultiOnly(e.target.checked)} />
          Only matches with 2+ tracked journeys
        </label>
      </section>

      <section className="match-section">
        <h3>
          Matches <span className="muted small">{p.matches.length}</span>
          <select value={p.sort} onChange={(e) => p.onSort(e.target.value as SortKey)} aria-label="Sort matches">
            {Object.entries(SORT_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </h3>
        <div className="match-list" role="listbox">
          <button className={`match-row overview ${p.selected === null ? "on" : ""}`} onClick={() => p.onSelect(null)}>
            <div className="mr-main">All filtered matches</div>
            <div className="mr-sub muted">Overview · aggregate paths, events &amp; heatmaps</div>
          </button>
          {p.matches.map((m) => (
            <button
              key={m.id}
              className={`match-row ${p.selected === m.id ? "on" : ""}`}
              onClick={() => p.onSelect(m.id)}
              title={`Match ${m.id}`}
              aria-label={`${fmtDate(m.date)} ${fmtTimeOfDay(m.start)}, ${fmtClock(m.dur)}, ${m.humans} humans, ${m.bots} bots, ${m.kills} kills, ${m.deaths} deaths`}
            >
              <div className="mr-main">
                <span>
                  {fmtDate(m.date)} · {fmtTimeOfDay(m.start)}
                </span>
                <span className="mr-dur">{fmtClock(m.dur)}</span>
              </div>
              <div className="mr-sub">
                <span title="Human journeys">👤 {m.humans}</span>
                <span title="Bot journeys tracked">🤖 {m.bots}</span>
                <span title="Kills" className="c-kill">◆ {m.kills}</span>
                <span title="Deaths" className="c-death">✖ {m.deaths}</span>
                {m.storm > 0 && <span title="Storm deaths" className="c-storm">▲ {m.storm}</span>}
                <span title="Loot pickups" className="c-loot">■ {m.loot}</span>
              </div>
            </button>
          ))}
          {p.matches.length === 0 && <div className="empty">No matches for this filter.</div>}
        </div>
      </section>
    </aside>
  );
}
