export type Brief = {
  slug: string;
  title: string;
  question: string;
  category: string;
  endDate: string | null;
  yesBid: number;
  yesAsk: number;
  tradable: boolean;
  blurb: string;
};

export type Action = "BUY_YES" | "BUY_NO" | "SELL" | "PASS";

export type SeatCall = {
  scout: { slug: string; note: string };
  analyst: { fairYes: number; confidence: number; note: string };
  risk: { approve: boolean; note: string };
  clerk: { action: Action; dollars: number; note: string };
  source: "grok" | "offline";
};

export type Held = {
  side: "YES" | "NO";
  shares: number;
  avg: number;
};

export type Gate = {
  action: Action;
  veto: string | null;
  price: number | null;
  shares: number;
  dollars: number;
  edge: number | null;
  fairYes: number | null;
  slug: string;
};

const TICK = 0.001;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

function ceilTick(n: number) {
  return Math.ceil(n / TICK - 1e-9) * TICK;
}

function floorTick(n: number) {
  return Math.floor(n / TICK + 1e-9) * TICK;
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function gateOrder(input: {
  call: SeatCall;
  market: Brief | undefined;
  held: Held | undefined;
  openCount: number;
  cash: number;
  minEdge: number;
  maxDollars: number;
  maxPositions: number;
}): Gate {
  const { call, market } = input;
  const fair = Number.isFinite(call.analyst.fairYes) ? clamp(call.analyst.fairYes, 0, 1) : null;
  const base = (veto: string | null, action: Action = "PASS"): Gate => ({
    action,
    veto,
    price: null,
    shares: 0,
    dollars: 0,
    edge: null,
    fairYes: fair,
    slug: market?.slug || call.scout.slug || "",
  });

  if (call.source === "offline") {
    return base("Grok is offline, so the desk will not send an order.");
  }
  if (!call.risk.approve || call.clerk.action === "PASS") {
    return base(call.risk.approve ? "Clerk passed." : call.risk.note || "Risk stood down.");
  }
  if (!market || !market.tradable) {
    return base("That market is not on the live board.");
  }
  if (market.yesAsk - market.yesBid > 0.12) {
    return base("The book is too wide to price fairly.");
  }

  const budget = Math.max(0, Math.min(input.maxDollars, call.clerk.dollars || input.maxDollars, input.cash));

  if (call.clerk.action === "SELL") {
    if (!input.held || input.held.shares < 1) return base("Nothing open in that market to close.");
    const price =
      input.held.side === "YES"
        ? floorTick(market.yesBid)
        : floorTick(1 - market.yesAsk);
    if (price <= 0.001) return base("No bid to exit into.");
    return {
      action: "SELL",
      veto: null,
      price: round3(price),
      shares: Math.floor(input.held.shares),
      dollars: round3(Math.floor(input.held.shares) * price),
      edge: fair == null ? null : input.held.side === "YES" ? price - fair : price - (1 - fair),
      fairYes: fair,
      slug: market.slug,
    };
  }

  if (input.held) return base("Already in this market. The desk will not add.");
  if (input.openCount >= input.maxPositions) return base("Position cap is full.");
  if (budget <= 0) return base("No cash left under the size cap.");

  const buyingYes = call.clerk.action === "BUY_YES";
  const raw = buyingYes ? market.yesAsk : 1 - market.yesBid;
  const price = round3(clamp(ceilTick(raw), 0.001, 0.999));
  if (price < 0.04 || price > 0.96) return base("Price is too close to settled.");
  if (fair == null) return base("Analyst did not give a fair price.");
  const edge = buyingYes ? fair - price : 1 - fair - price;
  if (edge < input.minEdge) {
    return {
      ...base(`Edge is ${(edge * 100).toFixed(1)}¢, under your ${(input.minEdge * 100).toFixed(0)}¢ minimum.`),
      edge,
      price,
    };
  }
  const shares = Math.floor(budget / price);
  if (shares < 1) return base("One contract costs more than the size cap.", "PASS");
  return {
    action: call.clerk.action,
    veto: null,
    price,
    shares,
    dollars: round3(shares * price),
    edge,
    fairYes: fair,
    slug: market.slug,
  };
}

export function labelFor(b: Pick<Brief, "title" | "question">) {
  const title = b.title?.trim();
  const question = b.question?.trim();
  if (title && question && title.toLowerCase() !== question.toLowerCase()) {
    return `${title} — ${question}`;
  }
  return title || question || "Untitled market";
}
