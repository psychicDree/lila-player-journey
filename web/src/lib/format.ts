export function fmtClock(s: number): string {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function fmtTimeOfDay(unix: number): string {
  const d = new Date(unix * 1000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

export function fmtDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${d}`;
}

export const shortId = (id: string) => (id.length > 12 ? id.slice(0, 8) : id);

export const MAP_LABEL: Record<string, string> = {
  AmbroseValley: "Ambrose Valley",
  GrandRift: "Grand Rift",
  Lockdown: "Lockdown",
};
