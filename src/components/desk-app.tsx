import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, Radio, ScrollText, Settings2, ShieldAlert } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelLiveOrders, refreshBoard, runCycle, syncLive, useBoard } from "@/lib/cycle";
import { labelFor } from "@/lib/market";
import { decodeSecret } from "@/lib/sign";
import { equityOf, positionMark, useDesk, type TapeEntry } from "@/lib/store";
import { cn } from "@/lib/cn";

type Tab = "floor" | "book" | "tape" | "rules";

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function cents(n: number) {
  return `${(n * 100).toFixed(1)}¢`;
}

function clock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function DeskApp() {
  const [tab, setTab] = useState<Tab>("floor");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void useDesk.persist.rehydrate();
    void refreshBoard().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Board failed to load.");
    });
    const id = window.setInterval(() => {
      const s = useDesk.getState();
      if (s.armed && !s.killed && Date.now() - s.lastCycleAt >= s.intervalMin * 60_000) {
        void runCycle("auto");
      }
    }, 1000);
    const board = window.setInterval(() => {
      void refreshBoard().catch(() => undefined);
    }, 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(id);
      clearInterval(board);
      clearInterval(tick);
    };
  }, []);

  return (
    <div className="min-h-dvh bg-ink text-paper">
      <Toaster theme="dark" position="top-center" />
      <Header now={now} />
      <main className="mx-auto w-full max-w-3xl px-4 pb-28 pt-4">
        {tab === "floor" ? <Floor /> : null}
        {tab === "book" ? <Book /> : null}
        {tab === "tape" ? <Tape /> : null}
        {tab === "rules" ? <Rules /> : null}
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          <NavButton active={tab === "floor"} onClick={() => setTab("floor")} label="Floor" icon={<Radio className="size-4" />} />
          <NavButton active={tab === "book"} onClick={() => setTab("book")} label="Book" icon={<BookOpen className="size-4" />} />
          <NavButton active={tab === "tape"} onClick={() => setTab("tape")} label="Tape" icon={<ScrollText className="size-4" />} />
          <NavButton active={tab === "rules"} onClick={() => setTab("rules")} label="Rules" icon={<Settings2 className="size-4" />} />
        </div>
      </nav>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium",
        active ? "text-brass" : "text-mute",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function Header({ now }: { now: number }) {
  const armed = useDesk((s) => s.armed);
  const killed = useDesk((s) => s.killed);
  const mode = useDesk((s) => s.mode);
  const cash = useDesk((s) => s.cash);
  const positions = useDesk((s) => s.positions);
  const marks = useDesk((s) => s.marks);
  const liveBuyingPower = useDesk((s) => s.liveBuyingPower);
  const intervalMin = useDesk((s) => s.intervalMin);
  const lastCycleAt = useDesk((s) => s.lastCycleAt);
  const callsToday = useDesk((s) => s.callsToday);
  const dailyCap = useDesk((s) => s.dailyCap);
  const equity = mode === "live" && liveBuyingPower != null ? liveBuyingPower : equityOf({ cash, positions, marks });
  const remain = armed && !killed ? Math.max(0, intervalMin * 60_000 - (now - lastCycleAt)) : 0;

  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-3xl items-end justify-between gap-3 px-4 py-4">
        <div>
          <p className="text-xs font-medium tracking-[0.18em] text-brass uppercase">Polymarket US</p>
          <h1 className="font-display text-4xl leading-none text-paper">Quorum</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-mute">{mode === "live" ? "Buying power" : "Paper equity"}</p>
          <p className="font-display text-3xl tabular-nums text-paper">{money(equity)}</p>
          <p className="text-xs text-mute tabular-nums">
            {killed ? "Killed" : armed ? `Next pass ${clock(remain)}` : "Not armed"} · {callsToday}/{dailyCap} passes
          </p>
        </div>
      </div>
    </header>
  );
}

function Floor() {
  const note = useDesk((s) => s.cycleNote);
  const armed = useDesk((s) => s.armed);
  const killed = useDesk((s) => s.killed);
  const tape = useDesk((s) => s.tape);
  const spark = useDesk((s) => s.spark);
  const board = useBoard();
  const latest = tape[0];

  return (
    <div className="space-y-4">
      <section className="rounded-desk border border-line bg-panel p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.16em] text-mute uppercase">Desk</p>
            <p className="mt-1 text-base leading-snug text-paper">{note}</p>
          </div>
          <Status />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {killed ? (
            <Button
              variant="brass"
              onClick={() => useDesk.setState({ killed: false, cycleNote: "Kill switch cleared. Arm when you want the next pass." })}
            >
              Clear kill switch
            </Button>
          ) : armed ? (
            <Button
              onClick={() => {
                useDesk.setState({ armed: false, cycleNote: "Disarmed. The book stays where it is." });
              }}
            >
              Disarm
            </Button>
          ) : (
            <Button variant="brass" onClick={() => armDesk()}>
              Arm desk
            </Button>
          )}
          <Button
            onClick={() => {
              void runCycle("manual").then((msg) => toast(msg));
            }}
            disabled={killed}
          >
            Run one pass
          </Button>
          <Button variant="danger" onClick={() => void killDesk()}>
            <ShieldAlert className="size-4" />
            Kill
          </Button>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          While this screen stays open, an armed desk passes the board to Scout, Analyst, Risk, and Clerk, then trades only inside your caps. Phone sleep pauses it. This is not advice, and it can lose money.
        </p>
        {spark.length > 1 ? (
          <div className="mt-3 h-20">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={spark}>
                <Line type="monotone" dataKey="v" stroke="var(--color-brass)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </section>

      {latest ? <Seats entry={latest} /> : null}

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-display text-2xl">Board</h2>
          <button type="button" className="text-sm text-brass" onClick={() => void refreshBoard()}>
            {board.loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
        {board.error ? <p className="text-sm text-down">{board.error}</p> : null}
        <ul className="divide-y divide-line overflow-hidden rounded-desk border border-line">
          {board.markets.map((m) => (
            <li key={m.slug} className="flex items-start justify-between gap-3 bg-panel px-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-paper">{labelFor(m)}</p>
                <p className="text-xs text-mute">
                  {m.category}
                  {m.endDate ? ` · ${new Date(m.endDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                </p>
              </div>
              <div className="text-right tabular-nums">
                <p className="text-sm text-paper">{cents(m.yesAsk)}</p>
                <p className="text-xs text-mute">{cents(Math.max(0, m.yesAsk - m.yesBid))} wide</p>
              </div>
            </li>
          ))}
          {board.loading && board.markets.length === 0 ? (
            <li className="bg-panel px-3 py-6 text-sm text-mute">Loading the board…</li>
          ) : null}
          {!board.loading && board.markets.length === 0 ? (
            <li className="bg-panel px-3 py-6 text-sm text-mute">No open markets yet.</li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}

function Status() {
  const armed = useDesk((s) => s.armed);
  const killed = useDesk((s) => s.killed);
  const mode = useDesk((s) => s.mode);
  const label = killed ? "Killed" : armed ? "Armed" : "Idle";
  return (
    <div className="shrink-0 text-right">
      <p className={cn("text-sm font-semibold", killed ? "text-down" : armed ? "text-up" : "text-mute")}>
        <span className={cn("mr-1 inline-block size-2 rounded-full bg-current", armed && !killed && "motion-safe:animate-pulse")} />
        {label}
      </p>
      <p className="text-xs tracking-wide text-mute uppercase">{mode}</p>
    </div>
  );
}

function Seats({ entry }: { entry: TapeEntry }) {
  const seats = [
    ["Scout", entry.seats.scout],
    ["Analyst", entry.seats.analyst],
    ["Risk", entry.seats.risk],
    ["Clerk", entry.seats.clerk],
  ] as const;
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="font-display text-2xl">Last vote</h2>
        <p className="text-xs text-mute">{new Date(entry.at).toLocaleTimeString()}</p>
      </div>
      <p className="mb-2 text-sm text-paper">
        {entry.executed
          ? `${entry.action.replaceAll("_", " ")} · ${entry.shares} @ ${entry.price != null ? cents(entry.price) : "—"} · ${entry.venue}`
          : entry.veto || "Passed."}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {seats.map(([name, body]) => (
          <article key={name} className="rounded-desk border border-line bg-panel-2 p-3">
            <h3 className="font-display text-lg text-brass">{name}</h3>
            <p className="mt-1 text-sm leading-relaxed text-paper/90">{body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Book() {
  const mode = useDesk((s) => s.mode);
  const positions = useDesk((s) => s.positions);
  const marks = useDesk((s) => s.marks);
  const cash = useDesk((s) => s.cash);
  const livePositions = useDesk((s) => s.livePositions);
  const liveBalance = useDesk((s) => s.liveBalance);
  const liveOpenOrders = useDesk((s) => s.liveOpenOrders);

  if (mode === "live") {
    return (
      <section className="space-y-3">
        <h2 className="font-display text-2xl">Exchange book</h2>
        <p className="text-sm text-mute">
          Cash {liveBalance == null ? "—" : money(liveBalance)}
          {liveOpenOrders != null ? ` · ${liveOpenOrders} open orders` : ""}
        </p>
        <Button
          onClick={() => {
            void syncLive()
              .then(() => toast("Account synced."))
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Sync failed."));
          }}
        >
          Sync account
        </Button>
        <ul className="divide-y divide-line overflow-hidden rounded-desk border border-line">
          {livePositions.map((p) => (
            <li key={p.slug} className="bg-panel px-3 py-3">
              <p className="text-sm font-medium">{p.slug}</p>
              <p className="text-xs text-mute tabular-nums">
                Net {p.net}
                {p.cost ? ` · cost ${p.cost}` : ""}
                {p.realized ? ` · realized ${p.realized}` : ""}
              </p>
            </li>
          ))}
          {livePositions.length === 0 ? <li className="bg-panel px-3 py-6 text-sm text-mute">No synced positions.</li> : null}
        </ul>
      </section>
    );
  }

  const equity = equityOf({ cash, positions, marks });
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">Paper book</h2>
      <p className="text-sm text-mute tabular-nums">
        Cash {money(cash)} · Equity {money(equity)}
      </p>
      <ul className="divide-y divide-line overflow-hidden rounded-desk border border-line">
        {positions.map((p) => {
          const mark = positionMark(p, marks);
          const pnl = mark - p.cost;
          return (
            <li key={p.slug} className="bg-panel px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{labelFor(p)}</p>
                  <p className="text-xs text-mute tabular-nums">
                    {p.side} {p.shares} @ {cents(p.avg)}
                  </p>
                </div>
                <p className={cn("text-sm tabular-nums", pnl >= 0 ? "text-up" : "text-down")}>
                  {pnl >= 0 ? "+" : ""}
                  {money(pnl)}
                </p>
              </div>
            </li>
          );
        })}
        {positions.length === 0 ? <li className="bg-panel px-3 py-6 text-sm text-mute">Flat. Arm the desk or run one pass.</li> : null}
      </ul>
    </section>
  );
}

function Tape() {
  const tape = useDesk((s) => s.tape);
  return (
    <section>
      <h2 className="mb-2 font-display text-2xl">Tape</h2>
      <ul className="space-y-2">
        {tape.map((e) => (
          <li key={e.id} className="rounded-desk border border-line bg-panel px-3 py-3">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{e.executed ? e.action.replaceAll("_", " ") : "Pass"}</p>
              <p className="text-xs text-mute">{new Date(e.at).toLocaleString()}</p>
            </div>
            <p className="mt-1 text-sm text-paper">{e.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-mute">
              {e.executed
                ? `${e.venue} · ${e.shares} @ ${e.price != null ? cents(e.price) : "—"}${e.orderId ? ` · ${e.orderId}` : ""}`
                : e.veto}
              {e.edge != null ? ` · edge ${(e.edge * 100).toFixed(1)}¢` : ""}
              {e.fairYes != null ? ` · fair YES ${cents(e.fairYes)}` : ""}
            </p>
          </li>
        ))}
        {tape.length === 0 ? <li className="text-sm text-mute">No passes yet.</li> : null}
      </ul>
    </section>
  );
}

function Rules() {
  const s = useDesk();
  const [confirmReset, setConfirmReset] = useState(false);

  function num(key: "maxDollars" | "maxPositions" | "maxDailyLoss" | "dailyCap" | "intervalMin", value: string, lo: number, hi: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    useDesk.setState({ [key]: Math.min(hi, Math.max(lo, n)) });
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-2xl">Rules</h2>
        <p className="mt-1 text-sm leading-relaxed text-mute">
          Hard limits sit in front of the model. Risk can say yes and the desk will still refuse a trade that breaks these.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={s.mode === "paper" ? "brass" : "ghost"}
          onClick={() => useDesk.setState({ mode: "paper", armed: false, cycleNote: "Paper mode. Disarmed until you arm again." })}
        >
          Paper
        </Button>
        <Button
          variant={s.mode === "live" ? "brass" : "ghost"}
          onClick={() => {
            if (!s.liveConsent || !s.keyId || !s.secret) {
              toast("Check the live box and save a key before switching.");
              return;
            }
            useDesk.setState({ mode: "live", armed: false, cycleNote: "Live mode. Disarmed until you arm again." });
          }}
        >
          Live
        </Button>
      </div>

      <label className="flex items-start gap-3 rounded-desk border border-line bg-panel p-3 text-sm leading-relaxed">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-brass"
          checked={s.liveConsent}
          onChange={(e) => useDesk.setState({ liveConsent: e.target.checked, mode: e.target.checked ? s.mode : "paper" })}
        />
        <span>
          I understand live mode can send real Polymarket US orders, marked automatic, and I can lose money. Keys stay in this browser only.
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Pass every (minutes)" value={s.intervalMin} min={10} max={120} onChange={(v) => num("intervalMin", v, 10, 120)} />
        <Field label="Grok passes / day" value={s.dailyCap} min={1} max={36} onChange={(v) => num("dailyCap", v, 1, 36)} />
        <Field label="Max dollars / order" value={s.maxDollars} min={1} max={500} onChange={(v) => num("maxDollars", v, 1, 500)} />
        <Field label="Max open positions" value={s.maxPositions} min={1} max={8} onChange={(v) => num("maxPositions", v, 1, 8)} />
        <Field
          label="Min edge (cents)"
          value={Math.round(s.minEdge * 100)}
          min={2}
          max={20}
          onChange={(v) => {
            const n = Number(v);
            if (Number.isFinite(n)) useDesk.setState({ minEdge: Math.min(0.2, Math.max(0.02, n / 100)) });
          }}
        />
        <Field label="Daily loss stop" value={s.maxDailyLoss} min={10} max={1000} onChange={(v) => num("maxDailyLoss", v, 10, 1000)} />
      </div>

      <div className="space-y-2 rounded-desk border border-line bg-panel p-3">
        <h3 className="font-display text-xl">Polymarket US key</h3>
        <p className="text-sm text-mute">
          Create a key at{" "}
          <a className="text-brass underline" href="https://polymarket.us/developer" target="_blank" rel="noreferrer">
            polymarket.us/developer
          </a>
          . The secret is signed in the browser and is not stored on the server.
        </p>
        <label className="block text-xs text-mute">
          Key ID
          <input
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper"
            value={s.keyId}
            autoComplete="off"
            onChange={(e) => useDesk.setState({ keyId: e.target.value })}
          />
        </label>
        <label className="block text-xs text-mute">
          Secret key
          <input
            type="password"
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper"
            value={s.secret}
            autoComplete="off"
            onChange={(e) => useDesk.setState({ secret: e.target.value })}
            onBlur={() => {
              if (!s.secret.trim()) return;
              try {
                decodeSecret(s.secret);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Bad secret.");
              }
            }}
          />
        </label>
        <Button
          onClick={() => {
            void syncLive()
              .then(() => toast("Connected. Balances loaded."))
              .catch((err: unknown) => toast.error(err instanceof Error ? err.message : "Could not connect."));
          }}
        >
          Test connection
        </Button>
      </div>

      <div className="rounded-desk border border-line bg-panel p-3">
        <h3 className="font-display text-xl">Paper bankroll</h3>
        <p className="mt-1 text-sm text-mute">Reset clears the simulated book only. It does not touch the exchange.</p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <Button
              variant="danger"
              onClick={() => {
                const bankroll = useDesk.getState().bankroll;
                useDesk.setState({
                  cash: bankroll,
                  positions: [],
                  spark: [],
                  dayStartEquity: bankroll,
                  cycleNote: "Paper book reset.",
                });
                setConfirmReset(false);
              }}
            >
              Confirm reset
            </Button>
            <Button onClick={() => setConfirmReset(false)}>Cancel</Button>
          </div>
        ) : (
          <Button className="mt-3" onClick={() => setConfirmReset(true)}>
            Reset paper book
          </Button>
        )}
      </div>
    </section>
  );
}

function Field({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block rounded-desk border border-line bg-panel px-3 py-2 text-xs text-mute">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 min-h-11 w-full bg-transparent text-base text-paper tabular-nums outline-none"
      />
    </label>
  );
}

function armDesk() {
  const s = useDesk.getState();
  if (s.killed) {
    toast("Clear the kill switch first.");
    return;
  }
  if (s.mode === "live" && (!s.liveConsent || !s.keyId.trim() || !s.secret.trim())) {
    toast("Live needs the consent box and a key, on Rules.");
    return;
  }
  useDesk.setState({
    armed: true,
    lastCycleAt: Date.now() - s.intervalMin * 60_000 + 2500,
    cycleNote: s.mode === "live" ? "Armed live. First pass shortly." : "Armed on the paper book. First pass shortly.",
  });
}

async function killDesk() {
  const s = useDesk.getState();
  useDesk.setState({ killed: true, armed: false, cycleNote: "Kill switch is on. No new orders." });
  if (s.mode === "live" && s.keyId && s.secret) {
    try {
      const res = await cancelLiveOrders();
      toast(res.ok ? "Cancel-all sent to the exchange." : `Cancel failed (${res.status}).`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Cancel failed.");
    }
  } else {
    toast("Desk stopped.");
  }
}
