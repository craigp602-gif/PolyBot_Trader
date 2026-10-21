import { createServerFn } from "@tanstack/react-start";
import type { Action, Brief, SeatCall } from "@/lib/market";

const GATEWAY = "https://gateway.polymarket.us";
const TRADE = "https://api.polymarket.us";
const CATEGORIES = ["politics", "sports", "crypto", "finance", "culture", "science"] as const;

type RawMarket = {
  slug?: string | null;
  title?: string | null;
  question?: string | null;
  category?: string | null;
  endDate?: string | null;
  description?: string | null;
  active?: boolean | null;
  closed?: boolean | null;
  hidden?: boolean | null;
  status?: string | null;
  tradable?: boolean | null;
  bestBidQuote?: { value?: string | number | null } | null;
  bestAskQuote?: { value?: string | null } | null;
  marketSides?: Array<{
    long?: boolean | null;
    tradable?: boolean | null;
    description?: string | null;
    price?: string | null;
    quote?: { value?: string | null } | null;
  }> | null;
};

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function normalize(m: RawMarket): Brief | null {
  const slug = m.slug?.trim();
  if (!slug || m.closed || m.hidden || m.active === false) return null;
  if (m.status && m.status !== "MARKET_STATUS_OPEN") return null;
  const bid = num(m.bestBidQuote?.value);
  const ask = num(m.bestAskQuote?.value);
  const yesSide = m.marketSides?.find((s) => s.long);
  const mid = num(yesSide?.quote?.value) ?? num(yesSide?.price);
  let yesBid = bid ?? mid;
  let yesAsk = ask ?? mid;
  if (yesBid == null || yesAsk == null) return null;
  if (yesAsk < yesBid) [yesBid, yesAsk] = [yesAsk, yesBid];
  if (yesBid <= 0 || yesAsk >= 1) return null;
  const tradable = m.marketSides?.some((s) => s.tradable) ?? true;
  return {
    slug,
    title: (m.title || "").trim(),
    question: (m.question || "").trim(),
    category: (m.category || "other").trim(),
    endDate: m.endDate || null,
    yesBid,
    yesAsk,
    tradable,
    blurb: (m.description || "").replace(/\s+/g, " ").trim().slice(0, 360),
  };
}

function score(b: Brief, now: number) {
  const spread = Math.max(0, b.yesAsk - b.yesBid);
  const mid = (b.yesAsk + b.yesBid) / 2;
  const days = b.endDate ? (new Date(b.endDate).getTime() - now) / 86_400_000 : 400;
  const middle = mid > 0.12 && mid < 0.88 ? 28 : 6;
  const tight = (1 - Math.min(spread, 0.15) / 0.15) * 40;
  const soon = days > 0 ? Math.max(0, 32 - Math.min(days, 120) / 4) : 0;
  return tight + middle + soon;
}

async function fetchCategory(category: string): Promise<Brief[]> {
  const url = new URL("/v1/markets", GATEWAY);
  url.searchParams.set("limit", "20");
  url.searchParams.set("active", "true");
  url.searchParams.set("closed", "false");
  url.searchParams.set("categories", category);
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return [];
  const body = (await res.json()) as { markets?: RawMarket[] };
  const out: Brief[] = [];
  for (const raw of body.markets || []) {
    const brief = normalize(raw);
    if (!brief) continue;
    if (brief.yesAsk < 0.03 || brief.yesAsk > 0.97) continue;
    if (brief.yesAsk - brief.yesBid > 0.15) continue;
    out.push({ ...brief, category: brief.category === "other" ? category : brief.category });
  }
  return out;
}

export const listBoard = createServerFn({ method: "POST" })
  .validator((input: { unused?: boolean } | undefined) => input ?? {})
  .handler(async () => {
    const settled = await Promise.all(CATEGORIES.map((c) => fetchCategory(c).catch(() => [] as Brief[])));
    const now = Date.now();
    const seen = new Set<string>();
    const byCat = new Map<string, Brief[]>();
    for (const list of settled) {
      for (const b of list) {
        if (seen.has(b.slug)) continue;
        seen.add(b.slug);
        const arr = byCat.get(b.category) || [];
        arr.push(b);
        byCat.set(b.category, arr);
      }
    }
    for (const arr of byCat.values()) arr.sort((a, b) => score(b, now) - score(a, now));
    const board: Brief[] = [];
    const cursors = [...byCat.values()];
    let added = true;
    while (board.length < 24 && added) {
      added = false;
      for (const arr of cursors) {
        const next = arr.shift();
        if (!next) continue;
        board.push(next);
        added = true;
        if (board.length >= 24) break;
      }
    }
    return { ok: true as const, markets: board, fetchedAt: now };
  });

function clip(s: unknown, n: number) {
  return String(s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, n);
}

function parseModel(text: string): SeatCall {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The desk reply was not JSON.");
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    scout?: { slug?: unknown; note?: unknown };
    analyst?: { fairYes?: unknown; confidence?: unknown; note?: unknown };
    risk?: { approve?: unknown; note?: unknown };
    clerk?: { action?: unknown; dollars?: unknown; note?: unknown };
  };
  const action = String(parsed.clerk?.action || "PASS").toUpperCase();
  const allowed: Action[] = ["BUY_YES", "BUY_NO", "SELL", "PASS"];
  const fair = Number(parsed.analyst?.fairYes);
  const conf = Number(parsed.analyst?.confidence);
  const dollars = Number(parsed.clerk?.dollars);
  return {
    scout: { slug: clip(parsed.scout?.slug, 160), note: clip(parsed.scout?.note, 280) },
    analyst: {
      fairYes: Number.isFinite(fair) ? fair : 0.5,
      confidence: Number.isFinite(conf) ? conf : 0,
      note: clip(parsed.analyst?.note, 360),
    },
    risk: { approve: parsed.risk?.approve === true, note: clip(parsed.risk?.note, 240) },
    clerk: {
      action: (allowed.includes(action as Action) ? action : "PASS") as Action,
      dollars: Number.isFinite(dollars) ? dollars : 0,
      note: clip(parsed.clerk?.note, 200),
    },
    source: "grok",
  };
}

export const runDesk = createServerFn({ method: "POST" })
  .validator(
    (input: {
      markets: Brief[];
      minEdge: number;
      maxDollars: number;
      open: Array<{ slug: string; side: "YES" | "NO"; shares: number; avg: number }>;
    }) => {
      if (!input || !Array.isArray(input.markets)) throw new Error("Missing markets.");
      return {
        markets: input.markets.slice(0, 8),
        minEdge: Number(input.minEdge) || 0.05,
        maxDollars: Number(input.maxDollars) || 25,
        open: Array.isArray(input.open) ? input.open.slice(0, 8) : [],
      };
    },
  )
  .handler(async ({ data }) => {
    const dns = await import("node:dns");
    dns.setDefaultResultOrder("ipv4first");
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      const empty: SeatCall = {
        scout: { slug: "", note: "No scan. Grok is not available in this environment." },
        analyst: { fairYes: 0.5, confidence: 0, note: "Standing down." },
        risk: { approve: false, note: "No model, no order." },
        clerk: { action: "PASS", dollars: 0, note: "Pass." },
        source: "offline",
      };
      return { ok: true as const, call: empty };
    }

    const pack = data.markets.slice(0, 8).map((m) => ({
      slug: m.slug,
      outcome: m.title,
      event: m.question,
      category: m.category,
      ends: m.endDate,
      yesBid: Number(m.yesBid.toFixed(3)),
      yesAsk: Number(m.yesAsk.toFixed(3)),
      rules: m.blurb.slice(0, 180),
    }));

    const user = {
      now: new Date().toISOString(),
      minEdge: data.minEdge,
      maxDollars: data.maxDollars,
      openPositions: data.open,
      markets: pack,
      replyShape: {
        scout: { slug: "slug from the list or empty", note: "one or two sentences" },
        analyst: { fairYes: 0.5, confidence: 0.5, note: "why the fair YES probability differs or not" },
        risk: { approve: false, note: "approve only if edge clears minEdge" },
        clerk: { action: "PASS", dollars: 0, note: "BUY_YES, BUY_NO, SELL, or PASS" },
      },
    };

    let res: Response;
    try {
      res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(65_000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        reasoning_effort: "low",
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          {
            role: "system",
            content:
              "You are Quorum, four seats on one Polymarket US desk: Scout, Analyst, Risk, Clerk. Return one JSON object and nothing else. Use only slugs from the list. Fair YES probabilities are decimals from 0 to 1. Risk approves only when the edge versus the price you would pay is at least minEdge and the reason is specific. If you are unsure, pass. SELL means close an open position, never open a short. Do not claim a trade will profit.",
          },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });
    } catch {
      return { ok: false as const, error: "Grok did not answer in time. No order was sent." };
    }

    if (!res.ok) {
      return { ok: false as const, error: `Grok request failed (${res.status}). No order was sent.` };
    }
    const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content || "";
    try {
      const call = parseModel(text);
      if (call.scout.slug && !data.markets.some((m) => m.slug === call.scout.slug)) {
        call.scout.slug = "";
        call.risk.approve = false;
        call.risk.note = "Scout named a market that was not on the list.";
        call.clerk.action = "PASS";
      }
      call.clerk.dollars = Math.max(0, Math.min(data.maxDollars, call.clerk.dollars));
      return { ok: true as const, call };
    } catch {
      return { ok: false as const, error: "The desk reply could not be read. No order was sent." };
    }
  });

const ALLOWED = new Set([
  "GET /v1/account/balances",
  "GET /v1/portfolio/positions",
  "GET /v1/orders/open",
  "POST /v1/orders",
  "POST /v1/orders/open/cancel",
]);

export const proxySigned = createServerFn({ method: "POST" })
  .validator(
    (input: {
      method: "GET" | "POST";
      path: string;
      accessKey: string;
      timestamp: string;
      signature: string;
      body?: unknown;
    }) => {
      if (!input?.method || !input.path || !input.accessKey || !input.timestamp || !input.signature) {
        throw new Error("Missing signature headers.");
      }
      const key = `${input.method} ${input.path}`;
      if (!ALLOWED.has(key)) throw new Error("That Polymarket path is not allowed.");
      const ts = Number(input.timestamp);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 25_000) {
        throw new Error("Signature timestamp is outside the exchange window. Check the device clock.");
      }
      return input;
    },
  )
  .handler(async ({ data }) => {
    const headers: Record<string, string> = {
      "X-PM-Access-Key": data.accessKey.trim(),
      "X-PM-Timestamp": data.timestamp,
      "X-PM-Signature": data.signature,
      accept: "application/json",
    };
    let body: string | undefined;
    if (data.method === "POST") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data.body ?? {});
    }
    const res = await fetch(`${TRADE}${data.path}`, { method: data.method, headers, body });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      body: text.slice(0, 8000),
    };
  });
