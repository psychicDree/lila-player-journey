import type { DataIndex, MapData, MapId, Stats } from "./types";

const cache = new Map<string, Promise<unknown>>();

function getJSON<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`${import.meta.env.BASE_URL}${path}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path} (${r.status})`);
      return r.json();
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return cache.get(path) as Promise<T>;
}

export const loadIndex = () => getJSON<DataIndex>("data/index.json");
export const loadStats = () => getJSON<Stats>("data/stats.json");
export const loadMap = (map: MapId) => getJSON<MapData>(`data/${map}.json`);
