import { useMemo } from "react";
import { EVENT_STYLES } from "../lib/events";
import { fmtClock } from "../lib/format";
import type { EventCode, MatchData } from "../lib/types";

interface Props {
  match: MatchData;
  time: number;
  playing: boolean;
  speed: number;
  onTime: (t: number) => void;
  onPlay: (p: boolean) => void;
  onSpeed: (s: number) => void;
}

export const SPEEDS = [1, 5, 10, 20, 60];

export default function Timeline({ match, time, playing, speed, onTime, onPlay, onSpeed }: Props) {
  const dur = Math.max(1, match.dur);

  const ticks = useMemo(() => {
    const out: { t: number; code: EventCode; bot: boolean }[] = [];
    for (const j of match.journeys) for (const e of j.e) if (e[1] !== "L") out.push({ t: e[0], code: e[1], bot: !!j.b });
    return out.sort((a, b) => a.t - b.t);
  }, [match]);

  const nextEvent = (dir: 1 | -1) => {
    const list = dir === 1 ? ticks.filter((k) => k.t > time + 0.5) : ticks.filter((k) => k.t < time - 0.5).reverse();
    if (list.length) onTime(list[0].t);
  };

  return (
    <div className="timeline">
      <button className="tl-btn" title="Previous fight/death" onClick={() => nextEvent(-1)}>⏮</button>
      <button
        className="tl-btn play"
        title="Play / pause (space)"
        onClick={() => {
          if (!playing && time >= dur) onTime(0);
          onPlay(!playing);
        }}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <button className="tl-btn" title="Next fight/death" onClick={() => nextEvent(1)}>⏭</button>
      <div className="tl-clock">
        {fmtClock(time)} <span className="muted">/ {fmtClock(dur)}</span>
      </div>
      <div className="tl-track">
        <div className="tl-ticks">
          {ticks.map((k, i) => (
            <span
              key={i}
              className="tl-tick"
              title={`${EVENT_STYLES[k.code][k.bot ? "botLabel" : "label"]} at ${fmtClock(k.t)}`}
              style={{ left: `${(k.t / dur) * 100}%`, background: EVENT_STYLES[k.code].color, height: k.bot ? 8 : 14 }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={dur}
          step={0.1}
          value={Math.min(time, dur)}
          onChange={(e) => onTime(Number(e.target.value))}
          aria-label="Match time"
        />
      </div>
      <select className="tl-speed" value={speed} onChange={(e) => onSpeed(Number(e.target.value))} title="Playback speed">
        {SPEEDS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
    </div>
  );
}
