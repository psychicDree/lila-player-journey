import json, sys, statistics as st
from collections import Counter, defaultdict

DATA = sys.argv[1] if len(sys.argv) > 1 else "web/public/data"
MAPS = ["AmbroseValley", "GrandRift", "Lockdown"]
CELL = 64


def cell(x, y):
    return (int(x // CELL), int(y // CELL))


for m in MAPS:
    d = json.load(open(f"{DATA}/{m}.json"))
    hum = [(mt, j) for mt in d["matches"] for j in mt["journeys"] if not j["b"]]
    print(f"\n=== {m}: {len(d['matches'])} matches, {len(hum)} human journeys")

    oc = Counter(j["o"] for _, j in hum)
    print("outcomes", dict(oc), {k: f"{100*v/len(hum):.1f}%" for k, v in oc.items()})
    death_t = defaultdict(list)
    for mt, j in hum:
        for e in j["e"]:
            if e[1] in ("BD", "D", "S"):
                death_t[e[1]].append(e[0])
    for k, v in death_t.items():
        print(f"  death {k}: n={len(v)} median t={st.median(v):.0f}s  p25={sorted(v)[len(v)//4]}s  share<120s={sum(1 for t in v if t<120)/len(v):.0%}")
    surv_dur = [j["p"][-3] for _, j in hum if j["o"] == "alive" and j["p"]]
    print(f"  survivor journey length median {st.median(surv_dur):.0f}s")

    storm = [(e[2], e[3], e[0]) for _, j in hum for e in j["e"] if e[1] == "S"]
    if storm:
        xs, ys, ts = zip(*storm)
        print(f"  storm deaths x range {min(xs):.0f}-{max(xs):.0f} mean {st.mean(xs):.0f}; y range {min(ys):.0f}-{max(ys):.0f} mean {st.mean(ys):.0f}; t median {st.median(ts):.0f}s min {min(ts)}s")

    traffic = Counter()
    for mt, j in hum:
        for i in range(0, len(j["p"]), 3):
            traffic[cell(j["p"][i + 1], j["p"][i + 2])] += 1
    allpos = Counter()
    for mt in d["matches"]:
        for j in mt["journeys"]:
            for i in range(0, len(j["p"]), 3):
                allpos[cell(j["p"][i + 1], j["p"][i + 2])] += 1
    tot = sum(traffic.values())
    ranked = traffic.most_common()
    top10 = sum(v for _, v in ranked[: max(1, len(ranked) // 10)]) / tot
    print(f"  human traffic: {len(traffic)} cells visited of {len(allpos)} reachable (any journey); top 10% cells = {top10:.0%} of samples")
    rare = [c for c in allpos if traffic.get(c, 0) <= tot * 0.001]
    print(f"  cells with <=0.1% of human time: {len(rare)} ({len(rare)/len(allpos):.0%} of reachable)")

    loot = Counter(cell(e[2], e[3]) for _, j in hum for e in j["e"] if e[1] == "L")
    lt = sum(loot.values())
    lr = loot.most_common()
    if lt:
        print(f"  loot: {lt} pickups in {len(loot)} cells; top 5 cells = {sum(v for _,v in lr[:5])/lt:.0%}; top cells {lr[:5]}")
    lpj = defaultdict(list)
    for _, j in hum:
        lpj[j["o"]].append(sum(1 for e in j["e"] if e[1] == "L"))
    print("  loot per journey by outcome", {k: round(st.mean(v), 1) for k, v in lpj.items()})

    bd = Counter(cell(e[2], e[3]) for _, j in hum for e in j["e"] if e[1] == "BD")
    bt = sum(bd.values())
    if bt:
        br = bd.most_common(5)
        print(f"  human deaths to bots: {bt}; top 5 cells = {sum(v for _,v in br)/bt:.0%} {br}")
    bk = [sum(1 for e in j["e"] if e[1] == "BK") for _, j in hum]
    print(f"  bot kills per human journey mean {st.mean(bk):.2f}; journeys with 0 kills {sum(1 for x in bk if x==0)/len(bk):.0%}")
    fl = [min(e[0] for e in j["e"] if e[1] == "L") for _, j in hum if any(e[1] == "L" for e in j["e"])]
    fc = [min(e[0] for e in j["e"] if e[1] in ("BK", "BD", "K", "D")) for _, j in hum if any(e[1] in ("BK", "BD", "K", "D") for e in j["e"])]
    print(f"  first loot median {st.median(fl):.0f}s, first combat median {st.median(fc):.0f}s")
    durs = [mt["dur"] for mt in d["matches"]]
    print(f"  match length median {st.median(durs)/60:.1f} min, max {max(durs)/60:.1f}")

idx = json.load(open(f"{DATA}/index.json"))
print("\nmatches per date", Counter(m["date"] for m in idx["matches"]))
print("matches per map per date", Counter((m["map"], m["date"]) for m in idx["matches"]))
