import { listBoard, proxySigned, runDesk } from "@/lib/desk-api";
import { gateOrder, labelFor, type Brief } from "@/lib/market";
import { signPolymarket } from "@/lib/sign";
import { dayKeyNow, equityOf, useDesk, type PaperPosition, type TapeEntry } from "@/lib/store";
import { create } from "zustand";

type BoardState = {
  markets: Brief[];
  loading: boolean;
  error: string;
  at: number;
};

export const useBoard = create<BoardState>(() => ({
  markets: [],
  loading: false,
  error: "",
  at: 0,
}));

let inflight = false;

function rid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export async function refreshBoard() {
  useBoard.setState({ loading: true, error: "" });
  try {
    const res = await listBoard({ data: {} });
    const markets = res.markets || [];
    const marks: Record<string, { yesBid: number; yesAsk: number }> = {};
    for (const m of markets) marks[m.slug] = { yesBid: m.yesBid, yesAsk: m.yesAsk };
    useDesk.setState((s) => ({ marks: { ...s.marks, ...marks } }));
    useBoard.setState({ markets, loading: false, at: Date.now(), error: "" });
    return markets;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach Polymarket US.";
    useBoard.setState({ loading: false, error: message });
    throw err;
  }
}

async function signedCall(method: "GET" | "POST", path: string, body?: unknown) {
  const { keyId, secret } = useDesk.getState();
  if (!keyId.trim() || !secret.trim()) {
    throw new Error("Add a Polymarket US key on Rules first.");
  }
  const signed = await signPolymarket({ secret, method, path });
  return proxySigned({
    data: {
      method,
      path,
      accessKey: keyId.trim(),
      timestamp: signed.timestamp,
      signature: signed.signature,
      body,
    },
  });
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function syncLive() {
  const balances = await signedCall("GET", "/v1/account/balances");
  const positions = await signedCall("GET", "/v1/portfolio/positions");
  const orders = await signedCall("GET", "/v1/orders/open");
  if (!balances.ok) {
    throw new Error(balances.body.slice(0, 280) || `Balances rejected (${balances.status}).`);
  }
  const bal = readJson(balances.body) as {
    balances?: Array<{ buyingPower?: number | string; currentBalance?: number | string; currency?: string }>;
  } | null;
  const usd = bal?.balances?.find((b) => !b.currency || b.currency === "USD") || bal?.balances?.[0];
  const pos = readJson(positions.body) as {
    positions?: Record<string, { netPositionDecimal?: string; cost?: { value?: string }; realized?: { value?: string } }>;
  } | null;
  const livePositions = Object.entries(pos?.positions || {})
    .map(([slug, row]) => ({
      slug,
      net: String(row.netPositionDecimal ?? "0"),
      cost: String(row.cost?.value ?? ""),
      realized: String(row.realized?.value ?? ""),
    }))
    .filter((row) => Math.abs(Number(row.net) || 0) >= 0.0001);
  const open = readJson(orders.body) as { orders?: unknown[] } | unknown[] | null;
  const liveOpenOrders = Array.isArray(open) ? open.length : Array.isArray(open?.orders) ? open.orders.length : null;
  useDesk.setState({
    liveBuyingPower: numOrNull(usd?.buyingPower),
    liveBalance: numOrNull(usd?.currentBalance),
    livePositions,
    liveOpenOrders,
    liveError: positions.ok ? "" : "Positions did not load.",
  });
  return { balances, positions, orders };
}

function numOrNull(v: unknown) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function rollDay() {
  const s = useDesk.getState();
  const key = dayKeyNow();
  if (s.dayKey !== key) {
    useDesk.setState({ dayKey: key, callsToday: 0, dayStartEquity: equityOf(s) });
  }
}

export async function runCycle(reason: "auto" | "manual") {
  if (inflight) return "A pass is already running.";
  const start = useDesk.getState();
  if (start.killed) return "Kill switch is on.";
  if (reason === "auto" && !start.armed) return "Desk is not armed.";
  rollDay();
  const s = useDesk.getState();
  if (s.callsToday >= s.dailyCap) {
    const note = `Daily Grok cap (${s.dailyCap}) is used. No more passes until tomorrow.`;
    if (Date.now() - s.lastCycleAt > 60_000) useDesk.getState().noteCycle(note);
    return note;
  }

  inflight = true;
  useDesk.setState({ cycleNote: "Scout is reading the board…" });
  try {
    const markets = await refreshBoard();
    if (markets.length === 0) {
      useDesk.getState().noteCycle("Polymarket US returned no open markets.");
      return "No markets.";
    }
    if (useDesk.getState().mode === "live") {
      useDesk.setState({ cycleNote: "Checking the exchange account…" });
      await syncLive();
    }
    const fresh = useDesk.getState();
    const open =
      fresh.mode === "live"
        ? fresh.livePositions
            .filter((p) => Math.abs(Number(p.net)) >= 1)
            .map((p) => ({
              slug: p.slug,
              side: "YES" as const,
              shares: Math.abs(Number(p.net)),
              avg: 0,
            }))
        : fresh.positions.map((p) => ({
            slug: p.slug,
            side: p.side,
            shares: p.shares,
            avg: p.avg,
          }));

    useDesk.setState({ callsToday: fresh.callsToday + 1, cycleNote: "The four seats are voting. This usually takes under a minute." });
    const desk = await runDesk({
      data: {
        markets: markets.slice(0, 8),
        minEdge: fresh.minEdge,
        maxDollars: fresh.maxDollars,
        open,
      },
    });
    if (!desk.ok) {
      useDesk.getState().noteCycle(desk.error);
      return desk.error;
    }

    const call = desk.call;
    const market = markets.find((m) => m.slug === call.scout.slug);
    const heldPaper = fresh.positions.find((p) => p.slug === call.scout.slug);
    const liveRow = fresh.livePositions.find((p) => p.slug === call.scout.slug);
    const liveNet = liveRow ? Number(liveRow.net) : 0;
    const held =
      fresh.mode === "live"
        ? liveRow && Math.abs(liveNet) >= 1
          ? { side: "YES" as const, shares: Math.abs(liveNet), avg: 0 }
          : undefined
        : heldPaper
          ? { side: heldPaper.side, shares: heldPaper.shares, avg: heldPaper.avg }
          : undefined;

    const cash = fresh.mode === "live" ? (fresh.liveBuyingPower ?? fresh.maxDollars) : fresh.cash;
    const openCount = fresh.mode === "live" ? fresh.livePositions.length : fresh.positions.length;
    const decision = gateOrder({
      call,
      market,
      held,
      openCount,
      cash,
      minEdge: fresh.minEdge,
      maxDollars: fresh.maxDollars,
      maxPositions: fresh.maxPositions,
    });

    let executed = false;
    let venue: TapeEntry["venue"] = "none";
    let orderId: string | undefined;
    let veto = decision.veto;

    if (!decision.veto && decision.price != null && decision.shares > 0 && market) {
      if (fresh.mode === "paper") {
        fillPaper(decision, market);
        executed = true;
        venue = "paper";
      } else {
        const sent = await sendLive(decision, liveNet);
        executed = sent.ok;
        venue = "live";
        orderId = sent.orderId;
        if (!sent.ok) veto = sent.error ?? "Order was not accepted.";
      }
    }

    const title = market ? labelFor(market) : call.scout.slug || "No market";
    const entry: TapeEntry = {
      id: rid(),
      at: Date.now(),
      slug: decision.slug,
      title,
      action: executed ? decision.action : "PASS",
      executed,
      venue: executed ? venue : "none",
      fairYes: decision.fairYes,
      price: decision.price,
      dollars: executed ? decision.dollars : 0,
      edge: decision.edge,
      shares: executed ? decision.shares : 0,
      veto: executed ? null : veto,
      seats: {
        scout: call.scout.note || "No note.",
        analyst: call.analyst.note || "No note.",
        risk: call.risk.note || "No note.",
        clerk: call.clerk.note || "No note.",
      },
      orderId,
      source: call.source,
    };
    useDesk.getState().pushTape(entry);
    const after = useDesk.getState();
    const eq = equityOf(after);
    const spark = [...after.spark, { t: Date.now(), v: Number(eq.toFixed(2)) }].slice(-48);
    let note = executed
      ? `${decision.action.replace("_", " ")} ${decision.shares} @ ${decision.price?.toFixed(3)} on ${title}.`
      : veto || "Passed.";
    const loss =
      after.mode === "paper" && eq <= after.dayStartEquity - after.maxDailyLoss;
    if (loss) {
      useDesk.setState({ killed: true, armed: false, spark, cycleNote: "Daily loss limit hit. Kill switch is on." });
      note = "Daily loss limit hit. Kill switch is on.";
    } else {
      useDesk.setState({ spark });
      useDesk.getState().noteCycle(note);
    }
    return note;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pass failed.";
    useDesk.getState().noteCycle(message);
    return message;
  } finally {
    inflight = false;
  }
}

function fillPaper(
  decision: { action: string; slug: string; shares: number; price: number | null; dollars: number },
  market: Brief,
) {
  const s = useDesk.getState();
  if (decision.action === "SELL") {
    const held = s.positions.find((p) => p.slug === decision.slug);
    if (!held || decision.price == null) return;
    const proceeds = decision.shares * decision.price;
    useDesk.setState({
      cash: s.cash + proceeds,
      positions: s.positions.filter((p) => p.slug !== decision.slug),
    });
    return;
  }
  if (decision.price == null) return;
  const side = decision.action === "BUY_NO" ? "NO" : "YES";
  const pos: PaperPosition = {
    slug: market.slug,
    title: market.title,
    question: market.question,
    side,
    shares: decision.shares,
    avg: decision.price,
    cost: decision.dollars,
    openedAt: Date.now(),
  };
  useDesk.setState({
    cash: Math.max(0, s.cash - decision.dollars),
    positions: [...s.positions, pos],
  });
}

async function sendLive(
  decision: { action: string; slug: string; shares: number; price: number | null },
  liveNet: number,
): Promise<{ ok: boolean; orderId?: string; error?: string }> {
  if (decision.price == null) return { ok: false, error: "No price." };
  let intent = "ORDER_INTENT_BUY_LONG";
  let quantity = decision.shares;
  if (decision.action === "BUY_NO") intent = "ORDER_INTENT_BUY_SHORT";
  if (decision.action === "SELL") {
    intent = liveNet < 0 ? "ORDER_INTENT_SELL_SHORT" : "ORDER_INTENT_SELL_LONG";
    quantity = Math.max(1, Math.floor(Math.abs(liveNet)));
  }
  const res = await signedCall("POST", "/v1/orders", {
    marketSlug: decision.slug,
    type: "ORDER_TYPE_LIMIT",
    price: { value: decision.price.toFixed(3), currency: "USD" },
    quantity,
    tif: "TIME_IN_FORCE_DAY",
    intent,
    manualOrderIndicator: "MANUAL_ORDER_INDICATOR_AUTOMATIC",
    synchronousExecution: true,
    maxBlockTime: 5,
  });
  if (!res.ok) {
    return { ok: false, error: `Exchange rejected the order (${res.status}). ${res.body.slice(0, 220)}` };
  }
  const parsed = readJson(res.body) as { id?: string } | null;
  return { ok: true, orderId: parsed?.id };
}

export async function cancelLiveOrders() {
  return signedCall("POST", "/v1/orders/open/cancel", { slugs: [] });
}
