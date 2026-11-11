import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { EVENT_STYLES, outcomeLabel } from "../lib/events";
import { draw, fitBounds, fitView, matchBounds, type Hit, type View } from "../lib/render";
import type { Layers, MatchData } from "../lib/types";
import { fmtClock, shortId } from "../lib/format";

interface Props {
  imageUrl: string;
  heat: HTMLCanvasElement | null;
  layers: Layers;
  matches: MatchData[];
  time: number | null;
  focusUser: string | null;
  overview: boolean;
  onPickMatch?: (matchId: string) => void;
}

const MIN_ZOOM_FACTOR = 0.5;
const MAX_ZOOM_FACTOR = 12;

export default function MapCanvas({ imageUrl, heat, layers, matches, time, focusUser, overview, onPickMatch }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [view, setView] = useState<View | null>(null);
  const hitsRef = useRef<Hit[]>([]);
  const [hover, setHover] = useState<{ hit: Hit; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const baseK = useRef(1);

  useEffect(() => {
    let alive = true;
    setImage(null);
    const img = new Image();
    img.onload = () => alive && setImage(img);
    img.src = imageUrl;
    return () => {
      alive = false;
    };
  }, [imageUrl]);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: Math.max(100, width), h: Math.max(100, height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const autoView = useCallback(() => {
    const v = fitView(size.w, size.h);
    baseK.current = v.k;
    if (overview) return v;
    const b = matchBounds(matches);
    return b ? fitBounds(size.w, size.h, b, v.k * 4, size.w > 900 ? 276 : 0) : v;
  }, [size.w, size.h, overview, overview ? null : matches]);

  useEffect(() => {
    setView(autoView());
  }, [autoView, imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !view) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size.w * dpr) || canvas.height !== Math.round(size.h * dpr)) {
      canvas.width = Math.round(size.w * dpr);
      canvas.height = Math.round(size.h * dpr);
    }
    const ctx = canvas.getContext("2d")!;
    hitsRef.current = draw({ ctx, width: size.w, height: size.h, dpr, view, image, heat, layers, matches, time, focusUser, overview });
  }, [view, size, image, heat, layers, matches, time, focusUser, overview]);

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    setView((v) => {
      if (!v) return v;
      const k = Math.min(baseK.current * MAX_ZOOM_FACTOR, Math.max(baseK.current * MIN_ZOOM_FACTOR, v.k * factor));
      const f = k / v.k;
      return { k, tx: cx - (cx - v.tx) * f, ty: cy - (cy - v.ty) * f };
    });
  }, []);

  useEffect(() => {
    const el = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const findHit = (x: number, y: number): Hit | null => {
    let best: Hit | null = null;
    let bestD = 10 * 10;
    for (const h of hitsRef.current) {
      const d = (h.sx - x) ** 2 + (h.sy - y) ** 2;
      if (d <= bestD) {
        bestD = d;
        best = h;
      }
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
      drag.current.x = e.clientX;
      drag.current.y = e.clientY;
      setView((v) => (v ? { ...v, tx: v.tx + dx, ty: v.ty + dy } : v));
      setHover(null);
      return;
    }
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const hit = findHit(x, y);
    setHover(hit ? { hit, x, y } : null);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved && hover && overview && onPickMatch) onPickMatch(hover.hit.matchId);
  };

  const reset = () => setView(autoView());
  const showWholeMap = () => setView(fitView(size.w, size.h));

  return (
    <div ref={wrapRef} className="map-wrap">
      <canvas
        ref={canvasRef}
        style={{ width: size.w, height: size.h, cursor: hover ? "pointer" : drag.current ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={reset}
      />
      {!image && <div className="map-loading">Loading minimap…</div>}
      <div className="zoom-controls">
        <button title="Zoom in" onClick={() => zoomAt(1.4, size.w / 2, size.h / 2)}>+</button>
        <button title="Zoom out" onClick={() => zoomAt(1 / 1.4, size.w / 2, size.h / 2)}>−</button>
        <button title={overview ? "Reset view (double-click map)" : "Fit to match (double-click map)"} onClick={reset}>⤢</button>
        {!overview && <button title="Show whole map" onClick={showWholeMap}>◻</button>}
      </div>
      {hover && <Tooltip hit={hover.hit} x={hover.x} y={hover.y} overview={overview} />}
    </div>
  );
}

function Tooltip({ hit, x, y, overview }: { hit: Hit; x: number; y: number; overview: boolean }) {
  const j = hit.journey;
  const who = j.b ? `Bot ${j.u}` : `Player ${shortId(j.u)}`;
  const title = hit.code === "head" ? who : j.b ? EVENT_STYLES[hit.code].botLabel : EVENT_STYLES[hit.code].label;
  return (
    <div className="tooltip" style={{ left: x + 14, top: y + 14 }}>
      <div className="tt-title">{title}</div>
      <div className="tt-row">
        {hit.code !== "head" && <span>{who} · </span>}
        <span>at {fmtClock(hit.t)}</span>
      </div>
      <div className="tt-row muted">Journey outcome: {outcomeLabel(j.o, !!j.b)}</div>
      {j.f && <div className="tt-row warn">Numeric ID but human telemetry</div>}
      {overview && <div className="tt-row muted">Click to open this match</div>}
    </div>
  );
}
