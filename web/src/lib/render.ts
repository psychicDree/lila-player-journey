import { BOT_COLOR, EVENT_STYLES, HUMAN_COLORS } from "./events";
import type { EventCode, Journey, Layers, MatchData } from "./types";

export interface View {
  k: number;
  tx: number;
  ty: number;
}

export interface Hit {
  sx: number;
  sy: number;
  code: EventCode | "head";
  journey: Journey;
  matchId: string;
  t: number;
}

export interface DrawInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  view: View;
  image: HTMLImageElement | null;
  heat: HTMLCanvasElement | null;
  layers: Layers;
  matches: MatchData[];
  time: number | null;
  focusUser: string | null;
  overview: boolean;
}

export const journeyKey = (matchId: string, j: Journey) => `${matchId}:${j.u}`;

export function journeyColor(match: MatchData, j: Journey): string {
  if (j.b) return BOT_COLOR;
  const humans = match.journeys.filter((x) => !x.b);
  return HUMAN_COLORS[humans.indexOf(j) % HUMAN_COLORS.length];
}

export function positionAt(p: number[], t: number): [number, number] | null {
  const n = p.length / 3;
  if (n === 0 || t < p[0]) return null;
  if (t >= p[(n - 1) * 3]) return [p[(n - 1) * 3 + 1], p[(n - 1) * 3 + 2]];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (p[mid * 3] <= t) lo = mid;
    else hi = mid;
  }
  const t0 = p[lo * 3];
  const t1 = p[hi * 3];
  const f = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
  return [p[lo * 3 + 1] + (p[hi * 3 + 1] - p[lo * 3 + 1]) * f, p[lo * 3 + 2] + (p[hi * 3 + 2] - p[lo * 3 + 2]) * f];
}

function drawShape(ctx: CanvasRenderingContext2D, shape: string, x: number, y: number, s: number, color: string) {
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = color;
  switch (shape) {
    case "diamond":
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "cross": {
      const w = s * 0.38;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.PI / 4);
      ctx.rect(-s, -w, 2 * s, 2 * w);
      ctx.rect(-w, -s, 2 * w, 2 * s);
      ctx.restore();
      ctx.stroke();
      ctx.fill();
      break;
    }
    case "triangle":
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.9, y + s * 0.65);
      ctx.lineTo(x - s * 0.9, y + s * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    default:
      ctx.rect(x - s, y - s, 2 * s, 2 * s);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
  }
}

export function draw(input: DrawInput): Hit[] {
  const { ctx, width, height, dpr, view, image, heat, layers, matches, time, focusUser, overview } = input;
  const hits: Hit[] = [];
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, width, height);

  ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.tx, dpr * view.ty);
  if (image) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, 1024, 1024);
  }
  if (heat && heat.width > 0) {
    ctx.globalAlpha = layers.heatOpacity;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(heat, 0, 0, 1024, 1024);
    ctx.globalAlpha = 1;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const sx = (x: number) => view.tx + x * view.k;
  const sy = (y: number) => view.ty + y * view.k;
  const many = overview && matches.length > 1;

  for (const pass of [1, 0] as const) {
    if (pass === 1 && !layers.botPaths) continue;
    if (pass === 0 && !layers.humanPaths) continue;
    for (const m of matches) {
      for (const j of m.journeys) {
        if (j.b !== pass) continue;
        const key = journeyKey(m.id, j);
        const dim = focusUser !== null && focusUser !== key;
        const color = many ? (j.b ? BOT_COLOR : "#ffd166") : journeyColor(m, j);
        ctx.strokeStyle = color;
        const manyAlpha = Math.max(0.1, Math.min(0.45, 20 / matches.length));
        ctx.globalAlpha = dim ? 0.12 : many ? (j.b ? manyAlpha * 0.6 : manyAlpha) : j.b ? 0.75 : 0.95;
        ctx.lineWidth = many ? 1 : j.b ? 1.4 : 2.2;
        ctx.setLineDash(j.b ? [5, 4] : []);
        ctx.lineJoin = "round";
        ctx.beginPath();
        const p = j.p;
        let started = false;
        for (let i = 0; i < p.length; i += 3) {
          if (time !== null && p[i] > time) break;
          if (!started) {
            ctx.moveTo(sx(p[i + 1]), sy(p[i + 2]));
            started = true;
          } else ctx.lineTo(sx(p[i + 1]), sy(p[i + 2]));
        }
        if (time !== null && started) {
          const head = positionAt(p, time);
          if (head) ctx.lineTo(sx(head[0]), sy(head[1]));
        }
        ctx.stroke();
      }
    }
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;

  const order: EventCode[] = ["L", "BK", "K", "BD", "D", "S"];
  for (const code of order) {
    if (!layers.events[code]) continue;
    const st = EVENT_STYLES[code];
    for (const m of matches) {
      for (const j of m.journeys) {
        if (j.b ? !layers.botPaths : !layers.humanPaths) continue;
        const key = journeyKey(m.id, j);
        const dim = focusUser !== null && focusUser !== key;
        ctx.globalAlpha = dim ? 0.15 : 1;
        for (const e of j.e) {
          if (e[1] !== code) continue;
          if (time !== null && e[0] > time) continue;
          const x = sx(e[2]);
          const y = sy(e[3]);
          if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
          const size = st.size * (j.b ? 0.8 : 1) * (many ? 0.6 : 1);
          drawShape(ctx, st.shape, x, y, size, st.color);
          if (!dim) hits.push({ sx: x, sy: y, code, journey: j, matchId: m.id, t: e[0] });
        }
      }
    }
  }
  ctx.globalAlpha = 1;

  if (time !== null) {
    for (const m of matches) {
      for (const j of m.journeys) {
        if (j.b ? !layers.botPaths : !layers.humanPaths) continue;
        const pos = positionAt(j.p, time);
        if (!pos) continue;
        const lastT = j.p.length ? j.p[j.p.length - 3] : 0;
        const deadOrGone = time > lastT;
        const key = journeyKey(m.id, j);
        const dim = focusUser !== null && focusUser !== key;
        const x = sx(pos[0]);
        const y = sy(pos[1]);
        ctx.globalAlpha = dim ? 0.2 : deadOrGone ? 0.35 : 1;
        ctx.fillStyle = journeyColor(m, j);
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (j.b) ctx.rect(x - 4.5, y - 4.5, 9, 9);
        else ctx.arc(x, y, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (!dim) hits.push({ sx: x, sy: y, code: "head", journey: j, matchId: m.id, t: Math.min(time, lastT) });
      }
    }
    ctx.globalAlpha = 1;
  }
  return hits;
}

export function fitView(width: number, height: number, pad = 16): View {
  const k = Math.max(0.05, Math.min((width - pad * 2) / 1024, (height - pad * 2) / 1024));
  return { k, tx: (width - 1024 * k) / 2, ty: (height - 1024 * k) / 2 };
}

export function matchBounds(matches: MatchData[]): [number, number, number, number] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of matches)
    for (const j of m.journeys) {
      for (let i = 0; i < j.p.length; i += 3) {
        x0 = Math.min(x0, j.p[i + 1]); x1 = Math.max(x1, j.p[i + 1]);
        y0 = Math.min(y0, j.p[i + 2]); y1 = Math.max(y1, j.p[i + 2]);
      }
      for (const e of j.e) {
        x0 = Math.min(x0, e[2]); x1 = Math.max(x1, e[2]);
        y0 = Math.min(y0, e[3]); y1 = Math.max(y1, e[3]);
      }
    }
  return Number.isFinite(x0) ? [x0, y0, x1, y1] : null;
}

export function fitBounds(width: number, height: number, b: [number, number, number, number], maxK: number, rightInset = 0): View {
  const pad = 60;
  const minSpan = 256;
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const w = Math.max(minSpan, b[2] - b[0]);
  const h = Math.max(minSpan, b[3] - b[1]);
  const availW = Math.max(100, width - rightInset - pad * 2);
  const availH = Math.max(100, height - pad * 2);
  const k = Math.min(maxK, availW / w, availH / h);
  return { k, tx: (width - rightInset) / 2 - cx * k, ty: height / 2 - cy * k };
}
