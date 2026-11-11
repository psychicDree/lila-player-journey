export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";
export const MAP_IDS: MapId[] = ["AmbroseValley", "GrandRift", "Lockdown"];

export type EventCode = "K" | "D" | "BK" | "BD" | "S" | "L";

export interface MapConfig {
  scale: number;
  origin_x: number;
  origin_z: number;
  image: string;
  source_size?: [number, number];
}

export interface MatchSummary {
  id: string;
  map: MapId;
  date: string;
  start: number;
  dur: number;
  humans: number;
  bots: number;
  kills: number;
  deaths: number;
  storm: number;
  loot: number;
}

export interface DataIndex {
  map_px: number;
  maps: Record<MapId, MapConfig>;
  dates: string[];
  matches: MatchSummary[];
}

export type RawEvent = [number, EventCode, number, number];

export type Outcome = "alive" | "bot" | "pvp" | "storm";

export interface Journey {
  u: string;
  b: 0 | 1;
  o: Outcome;
  p: number[];
  e: RawEvent[];
  f?: string;
}

export interface MatchData {
  id: string;
  date: string;
  start: number;
  dur: number;
  journeys: Journey[];
}

export interface MapData {
  map: MapId;
  matches: MatchData[];
}

export interface Stats {
  cleaning: Record<string, unknown>;
  events: Record<string, number>;
  unique_humans: number;
  unique_bot_ids: number;
  matches: number;
  per_map: Record<string, { human_journeys: number; matches: number; outcome_pct: Record<string, number> }>;
}

export type HeatmapKind = "off" | "traffic" | "kills" | "deaths" | "storm" | "loot";

export interface Layers {
  humanPaths: boolean;
  botPaths: boolean;
  events: Record<EventCode, boolean>;
  heatmap: HeatmapKind;
  heatmapBots: boolean;
  heatOpacity: number;
  heatScope: "filtered" | "match";
}
