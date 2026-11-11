import { useState } from "react";
import { BOT_COLOR, EVENT_ORDER, EVENT_STYLES, outcomeLabel } from "../lib/events";
import { fmtClock, shortId } from "../lib/format";
import { journeyColor, journeyKey } from "../lib/render";
import type { EventCode, HeatmapKind, Layers, MatchData } from "../lib/types";

interface Props {
  layers: Layers;
  onLayers: (l: Layers) => void;
  heatCount: number | null;
  match: MatchData | null;
  focusUser: string | null;
  onFocus: (key: string | null) => void;
}

const HEAT_OPTIONS: { value: HeatmapKind; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "" },
  { value: "traffic", label: "Traffic", hint: "Where players spend time (position samples)" },
  { value: "kills", label: "Kills", hint: "Where kills happen (vs players and bots)" },
  { value: "deaths", label: "Deaths", hint: "All deaths: players, bots, storm" },
  { value: "storm", label: "Storm deaths", hint: "Where the storm catches players" },
  { value: "loot", label: "Loot", hint: "Where items get picked up" },
];

export function Glyph({ code }: { code: EventCode }) {
  const st = EVENT_STYLES[code];
  const c = st.color;
  const s = 7;
  let shape: JSX.Element;
  switch (st.shape) {
    case "diamond":
      shape = <polygon points={`8,${8 - s} ${8 + s},8 8,${8 + s} ${8 - s},8`} fill={c} stroke="#000" />;
      break;
    case "cross":
      shape = (
        <g transform="rotate(45 8 8)" fill={c} stroke="#000">
          <rect x={1} y={5.5} width={14} height={5} />
          <rect x={5.5} y={1} width={5} height={14} />
        </g>
      );
      break;
    case "triangle":
      shape = <polygon points="8,1 15,13 1,13" fill={c} stroke="#000" />;
      break;
    default:
      shape = <rect x={4} y={4} width={8} height={8} fill={c} stroke="#000" />;
  }
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden>
      {shape}
    </svg>
  );
}

export default function LayersPanel({ layers, onLayers, heatCount, match, focusUser, onFocus }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const set = (patch: Partial<Layers>) => onLayers({ ...layers, ...patch });
  const setEvent = (code: EventCode, v: boolean) => set({ events: { ...layers.events, [code]: v } });
  const hint = HEAT_OPTIONS.find((o) => o.value === layers.heatmap)?.hint;

  return (
    <div className={`panel layers ${collapsed ? "collapsed" : ""}`}>
      <button className="panel-head" onClick={() => setCollapsed(!collapsed)}>
        Layers &amp; legend <span>{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed && (
        <div className="panel-body">
          <div className="group">
            <div className="group-title">Journeys</div>
            <label className="check">
              <input type="checkbox" checked={layers.humanPaths} onChange={(e) => set({ humanPaths: e.target.checked })} />
              <svg width={26} height={10} aria-hidden>
                <line x1={1} y1={5} x2={25} y2={5} stroke="#ffd166" strokeWidth={3} />
                <circle cx={21} cy={5} r={4} fill="#ffd166" stroke="#000" />
              </svg>
              Humans
            </label>
            <label className="check">
              <input type="checkbox" checked={layers.botPaths} onChange={(e) => set({ botPaths: e.target.checked })} />
              <svg width={26} height={10} aria-hidden>
                <line x1={1} y1={5} x2={25} y2={5} stroke={BOT_COLOR} strokeWidth={2} strokeDasharray="5 4" />
                <rect x={17} y={1} width={8} height={8} fill={BOT_COLOR} stroke="#000" />
              </svg>
              Bots
            </label>
          </div>

          <div className="group">
            <div className="group-title">
              Events
              <button className="link" onClick={() => set({ events: { K: true, D: true, BK: true, BD: true, S: true, L: true } })}>all</button>
              <button className="link no-auto" onClick={() => set({ events: { K: false, D: false, BK: false, BD: false, S: false, L: false } })}>none</button>
            </div>
            {EVENT_ORDER.map((code) => (
              <label key={code} className="check">
                <input type="checkbox" checked={layers.events[code]} onChange={(e) => setEvent(code, e.target.checked)} />
                <Glyph code={code} />
                {EVENT_STYLES[code].label}
              </label>
            ))}
            <div className="muted small">Bot-owned events draw smaller. Hover a marker for details.</div>
          </div>

          <div className="group">
            <div className="group-title">Heatmap</div>
            <div className="heat-grid">
              {HEAT_OPTIONS.map((o) => (
                <button key={o.value} className={layers.heatmap === o.value ? "on" : ""} onClick={() => set({ heatmap: o.value })} title={o.hint}>
                  {o.label}
                </button>
              ))}
            </div>
            {layers.heatmap !== "off" && (
              <>
                <div className="muted small">
                  {hint}
                  {heatCount !== null && ` · ${heatCount.toLocaleString()} points`}
                </div>
                {match && (
                  <div className="seg small-seg">
                    <button className={layers.heatScope === "filtered" ? "on" : ""} onClick={() => set({ heatScope: "filtered" })}>
                      All filtered matches
                    </button>
                    <button className={layers.heatScope === "match" ? "on" : ""} onClick={() => set({ heatScope: "match" })}>
                      This match
                    </button>
                  </div>
                )}
                <label className="check">
                  <input type="checkbox" checked={layers.heatmapBots} onChange={(e) => set({ heatmapBots: e.target.checked })} />
                  Include bot journeys
                </label>
                <label className="range">
                  Opacity
                  <input type="range" min={0.1} max={1} step={0.05} value={layers.heatOpacity} onChange={(e) => set({ heatOpacity: Number(e.target.value) })} />
                </label>
                <div className="heat-scale">
                  <span>low</span>
                  <div className="bar" />
                  <span>high</span>
                </div>
              </>
            )}
          </div>

          {match && (
            <div className="group">
              <div className="group-title">
                Journeys in match <span className="muted">{match.journeys.length}</span>
                {focusUser && (
                  <button className="link" onClick={() => onFocus(null)}>
                    show all
                  </button>
                )}
              </div>
              <div className="players">
                {match.journeys.map((j) => {
                  const key = journeyKey(match.id, j);
                  const last = j.p.length ? j.p[j.p.length - 3] : 0;
                  const loot = j.e.filter((e) => e[1] === "L").length;
                  const kills = j.e.filter((e) => e[1] === "K" || e[1] === "BK").length;
                  return (
                    <button
                      key={key}
                      className={`player ${focusUser === key ? "on" : ""} ${focusUser && focusUser !== key ? "dim" : ""}`}
                      onClick={() => onFocus(focusUser === key ? null : key)}
                      title={`${j.u}\nClick to isolate this journey`}
                    >
                      <span className="swatch" style={{ background: journeyColor(match, j), borderRadius: j.b ? 2 : 8 }} />
                      <span className="p-name">
                        {j.b ? `Bot ${j.u}` : `Player ${shortId(j.u)}`}
                        {j.f && <span className="warn" title="Numeric (bot-style) ID but human telemetry"> ⚠</span>}
                      </span>
                      <span className="p-meta muted">
                        {j.b ? "" : `■${loot} `}◆{kills} · {outcomeLabel(j.o, !!j.b).replace(" (no death logged)", "")} {j.o !== "alive" ? `@${fmtClock(last)}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
