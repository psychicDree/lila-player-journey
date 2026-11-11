import type { HeatmapKind, MatchData } from "./types";

const GRID = 256;
const MAP_PX = 1024;

const KIND_CODES: Record<Exclude<HeatmapKind, "off" | "traffic">, string[]> = {
  kills: ["K", "BK"],
  deaths: ["D", "BD", "S"],
  storm: ["S"],
  loot: ["L"],
};

export function accumulate(matches: MatchData[], kind: HeatmapKind, includeBots: boolean): { grid: Float32Array; count: number } {
  const grid = new Float32Array(GRID * GRID);
  let count = 0;
  const add = (x: number, y: number) => {
    const gx = Math.min(GRID - 1, Math.max(0, Math.floor((x / MAP_PX) * GRID)));
    const gy = Math.min(GRID - 1, Math.max(0, Math.floor((y / MAP_PX) * GRID)));
    grid[gy * GRID + gx] += 1;
    count++;
  };
  if (kind === "off") return { grid, count };
  for (const m of matches) {
    for (const j of m.journeys) {
      if (j.b && !includeBots) continue;
      if (kind === "traffic") {
        for (let i = 0; i < j.p.length; i += 3) add(j.p[i + 1], j.p[i + 2]);
      } else {
        const codes = KIND_CODES[kind];
        for (const e of j.e) if (codes.includes(e[1])) add(e[2], e[3]);
      }
    }
  }
  return { grid, count };
}

function blur(src: Float32Array, radius: number): Float32Array {
  const sigma = radius / 2;
  const kernel: number[] = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < GRID) acc += src[y * GRID + xx] * kernel[k + radius];
      }
      tmp[y * GRID + x] = acc;
    }
  }
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < GRID) acc += tmp[yy * GRID + x] * kernel[k + radius];
      }
      out[y * GRID + x] = acc;
    }
  }
  return out;
}

const STOPS: [number, [number, number, number, number]][] = [
  [0.0, [0, 0, 0, 0]],
  [0.15, [40, 60, 200, 90]],
  [0.35, [0, 190, 220, 160]],
  [0.6, [255, 230, 70, 200]],
  [0.85, [255, 120, 30, 225]],
  [1.0, [230, 20, 40, 240]],
];

function rampColor(t: number): [number, number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    if (t <= STOPS[i][0]) {
      const [t0, c0] = STOPS[i - 1];
      const [t1, c1] = STOPS[i];
      const f = (t - t0) / (t1 - t0);
      return [0, 1, 2, 3].map((k) => c0[k] + (c1[k] - c0[k]) * f) as [number, number, number, number];
    }
  }
  return STOPS[STOPS.length - 1][1];
}

const LUT = Array.from({ length: 256 }, (_, i) => rampColor(i / 255));

export function renderHeatmap(matches: MatchData[], kind: HeatmapKind, includeBots: boolean): { canvas: HTMLCanvasElement; count: number } | null {
  if (kind === "off") return null;
  const { grid, count } = accumulate(matches, kind, includeBots);
  if (count === 0) return { canvas: document.createElement("canvas"), count };
  const radius = kind === "traffic" ? 4 : count < 60 ? 9 : 6;
  const smooth = blur(grid, radius);
  const nz = Array.from(smooth).filter((v) => v > 0).sort((a, b) => a - b);
  const ref = nz[Math.floor(nz.length * 0.995)] || nz[nz.length - 1] || 1;
  const canvas = document.createElement("canvas");
  canvas.width = GRID;
  canvas.height = GRID;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(GRID, GRID);
  for (let i = 0; i < smooth.length; i++) {
    const t = Math.min(1, Math.sqrt(smooth[i] / ref));
    const c = LUT[Math.round(t * 255)];
    img.data[i * 4] = c[0];
    img.data[i * 4 + 1] = c[1];
    img.data[i * 4 + 2] = c[2];
    img.data[i * 4 + 3] = c[3];
  }
  ctx.putImageData(img, 0, 0);
  return { canvas, count };
}
