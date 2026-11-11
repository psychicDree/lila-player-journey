import type { EventCode, Outcome } from "./types";

export interface EventStyle {
  label: string;
  botLabel: string;
  color: string;
  shape: "diamond" | "cross" | "triangle" | "square";
  size: number;
}

export const EVENT_STYLES: Record<EventCode, EventStyle> = {
  K: { label: "Killed a player", botLabel: "Killed a player", color: "#ff3b4e", shape: "diamond", size: 9 },
  BK: { label: "Killed a bot", botLabel: "Bot got a kill", color: "#ff9f1c", shape: "diamond", size: 7 },
  D: { label: "Killed by a player", botLabel: "Killed by a player", color: "#ff3b4e", shape: "cross", size: 9 },
  BD: { label: "Killed by a bot", botLabel: "Bot died", color: "#ff9f1c", shape: "cross", size: 8 },
  S: { label: "Died to storm", botLabel: "Died to storm", color: "#c77dff", shape: "triangle", size: 10 },
  L: { label: "Looted item", botLabel: "Looted item", color: "#ffe066", shape: "square", size: 4 },
};

export const EVENT_ORDER: EventCode[] = ["K", "D", "BK", "BD", "S", "L"];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  alive: "Survived (no death logged)",
  bot: "Killed by a bot",
  pvp: "Killed by a player",
  storm: "Died to storm",
};

export function outcomeLabel(o: Outcome, isBot: boolean): string {
  if (isBot && o === "bot") return "Died";
  if (isBot && o === "alive") return "Alive at end of log";
  return OUTCOME_LABEL[o];
}

export const HUMAN_COLORS = ["#ffd166", "#06d6a0", "#ef476f", "#f78c6b", "#b5e48c", "#ff99c8"];
export const BOT_COLOR = "#7fb2ff";
