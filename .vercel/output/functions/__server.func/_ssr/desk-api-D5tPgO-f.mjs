import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/desk-api-D5tPgO-f.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var GATEWAY = "https://gateway.polymarket.us";
var TRADE = "https://api.polymarket.us";
var CATEGORIES = [
	"politics",
	"sports",
	"crypto",
	"finance",
	"culture",
	"science"
];
function num(v) {
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
	return null;
}
function normalize(m) {
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
		blurb: (m.description || "").replace(/\s+/g, " ").trim().slice(0, 360)
	};
}
function score(b, now) {
	const spread = Math.max(0, b.yesAsk - b.yesBid);
	const mid = (b.yesAsk + b.yesBid) / 2;
	const days = b.endDate ? (new Date(b.endDate).getTime() - now) / 864e5 : 400;
	const middle = mid > .12 && mid < .88 ? 28 : 6;
	const tight = (1 - Math.min(spread, .15) / .15) * 40;
	const soon = days > 0 ? Math.max(0, 32 - Math.min(days, 120) / 4) : 0;
	return tight + middle + soon;
}
async function fetchCategory(category) {
	const url = new URL("/v1/markets", GATEWAY);
	url.searchParams.set("limit", "20");
	url.searchParams.set("active", "true");
	url.searchParams.set("closed", "false");
	url.searchParams.set("categories", category);
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) return [];
	const body = await res.json();
	const out = [];
	for (const raw of body.markets || []) {
		const brief = normalize(raw);
		if (!brief) continue;
		if (brief.yesAsk < .03 || brief.yesAsk > .97) continue;
		if (brief.yesAsk - brief.yesBid > .15) continue;
		out.push({
			...brief,
			category: brief.category === "other" ? category : brief.category
		});
	}
	return out;
}
var listBoard_createServerFn_handler = createServerRpc({
	id: "85225206ca0408dae96cd3634c1ecd0e2c08698dec878fdf050ccb097f75c7a6",
	name: "listBoard",
	filename: "src/lib/desk-api.ts"
}, (opts) => listBoard.__executeServer(opts));
var listBoard = createServerFn({ method: "POST" }).validator((input) => input ?? {}).handler(listBoard_createServerFn_handler, async () => {
	const settled = await Promise.all(CATEGORIES.map((c) => fetchCategory(c).catch(() => [])));
	const now = Date.now();
	const seen = /* @__PURE__ */ new Set();
	const byCat = /* @__PURE__ */ new Map();
	for (const list of settled) for (const b of list) {
		if (seen.has(b.slug)) continue;
		seen.add(b.slug);
		const arr = byCat.get(b.category) || [];
		arr.push(b);
		byCat.set(b.category, arr);
	}
	for (const arr of byCat.values()) arr.sort((a, b) => score(b, now) - score(a, now));
	const board = [];
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
	return {
		ok: true,
		markets: board,
		fetchedAt: now
	};
});
function clip(s, n) {
	return String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
}
function parseModel(text) {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const raw = fenced ? fenced[1] : text;
	const start = raw.indexOf("{");
	const end = raw.lastIndexOf("}");
	if (start < 0 || end <= start) throw new Error("The desk reply was not JSON.");
	const parsed = JSON.parse(raw.slice(start, end + 1));
	const action = String(parsed.clerk?.action || "PASS").toUpperCase();
	const allowed = [
		"BUY_YES",
		"BUY_NO",
		"SELL",
		"PASS"
	];
	const fair = Number(parsed.analyst?.fairYes);
	const conf = Number(parsed.analyst?.confidence);
	const dollars = Number(parsed.clerk?.dollars);
	return {
		scout: {
			slug: clip(parsed.scout?.slug, 160),
			note: clip(parsed.scout?.note, 280)
		},
		analyst: {
			fairYes: Number.isFinite(fair) ? fair : .5,
			confidence: Number.isFinite(conf) ? conf : 0,
			note: clip(parsed.analyst?.note, 360)
		},
		risk: {
			approve: parsed.risk?.approve === true,
			note: clip(parsed.risk?.note, 240)
		},
		clerk: {
			action: allowed.includes(action) ? action : "PASS",
			dollars: Number.isFinite(dollars) ? dollars : 0,
			note: clip(parsed.clerk?.note, 200)
		},
		source: "grok"
	};
}
var runDesk_createServerFn_handler = createServerRpc({
	id: "26f590a8b9dc42685dacc45cb0e4a29cd30bd78660f2325f20b18d11a6189a80",
	name: "runDesk",
	filename: "src/lib/desk-api.ts"
}, (opts) => runDesk.__executeServer(opts));
var runDesk = createServerFn({ method: "POST" }).validator((input) => {
	if (!input || !Array.isArray(input.markets)) throw new Error("Missing markets.");
	return {
		markets: input.markets.slice(0, 8),
		minEdge: Number(input.minEdge) || .05,
		maxDollars: Number(input.maxDollars) || 25,
		open: Array.isArray(input.open) ? input.open.slice(0, 8) : []
	};
}).handler(runDesk_createServerFn_handler, async ({ data }) => {
	(await import("node:dns")).setDefaultResultOrder("ipv4first");
	const apiKey = process.env.XAI_API_KEY;
	if (!apiKey) return {
		ok: true,
		call: {
			scout: {
				slug: "",
				note: "No scan. Grok is not available in this environment."
			},
			analyst: {
				fairYes: .5,
				confidence: 0,
				note: "Standing down."
			},
			risk: {
				approve: false,
				note: "No model, no order."
			},
			clerk: {
				action: "PASS",
				dollars: 0,
				note: "Pass."
			},
			source: "offline"
		}
	};
	const pack = data.markets.slice(0, 8).map((m) => ({
		slug: m.slug,
		outcome: m.title,
		event: m.question,
		category: m.category,
		ends: m.endDate,
		yesBid: Number(m.yesBid.toFixed(3)),
		yesAsk: Number(m.yesAsk.toFixed(3)),
		rules: m.blurb.slice(0, 180)
	}));
	const user = {
		now: (/* @__PURE__ */ new Date()).toISOString(),
		minEdge: data.minEdge,
		maxDollars: data.maxDollars,
		openPositions: data.open,
		markets: pack,
		replyShape: {
			scout: {
				slug: "slug from the list or empty",
				note: "one or two sentences"
			},
			analyst: {
				fairYes: .5,
				confidence: .5,
				note: "why the fair YES probability differs or not"
			},
			risk: {
				approve: false,
				note: "approve only if edge clears minEdge"
			},
			clerk: {
				action: "PASS",
				dollars: 0,
				note: "BUY_YES, BUY_NO, SELL, or PASS"
			}
		}
	};
	let res;
	try {
		res = await fetch("https://api.x.ai/v1/chat/completions", {
			method: "POST",
			signal: AbortSignal.timeout(65e3),
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: "grok-4.5",
				reasoning_effort: "low",
				temperature: .2,
				max_tokens: 500,
				messages: [{
					role: "system",
					content: "You are Quorum, four seats on one Polymarket US desk: Scout, Analyst, Risk, Clerk. Return one JSON object and nothing else. Use only slugs from the list. Fair YES probabilities are decimals from 0 to 1. Risk approves only when the edge versus the price you would pay is at least minEdge and the reason is specific. If you are unsure, pass. SELL means close an open position, never open a short. Do not claim a trade will profit."
				}, {
					role: "user",
					content: JSON.stringify(user)
				}]
			})
		});
	} catch {
		return {
			ok: false,
			error: "Grok did not answer in time. No order was sent."
		};
	}
	if (!res.ok) return {
		ok: false,
		error: `Grok request failed (${res.status}). No order was sent.`
	};
	const text = (await res.json()).choices?.[0]?.message?.content || "";
	try {
		const call = parseModel(text);
		if (call.scout.slug && !data.markets.some((m) => m.slug === call.scout.slug)) {
			call.scout.slug = "";
			call.risk.approve = false;
			call.risk.note = "Scout named a market that was not on the list.";
			call.clerk.action = "PASS";
		}
		call.clerk.dollars = Math.max(0, Math.min(data.maxDollars, call.clerk.dollars));
		return {
			ok: true,
			call
		};
	} catch {
		return {
			ok: false,
			error: "The desk reply could not be read. No order was sent."
		};
	}
});
var ALLOWED = /* @__PURE__ */ new Set([
	"GET /v1/account/balances",
	"GET /v1/portfolio/positions",
	"GET /v1/orders/open",
	"POST /v1/orders",
	"POST /v1/orders/open/cancel"
]);
var proxySigned_createServerFn_handler = createServerRpc({
	id: "3061b748b7a50d2e6e0d983caec8721f3691e6f63f3ae3eb8730c5f179669b25",
	name: "proxySigned",
	filename: "src/lib/desk-api.ts"
}, (opts) => proxySigned.__executeServer(opts));
var proxySigned = createServerFn({ method: "POST" }).validator((input) => {
	if (!input?.method || !input.path || !input.accessKey || !input.timestamp || !input.signature) throw new Error("Missing signature headers.");
	const key = `${input.method} ${input.path}`;
	if (!ALLOWED.has(key)) throw new Error("That Polymarket path is not allowed.");
	const ts = Number(input.timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 25e3) throw new Error("Signature timestamp is outside the exchange window. Check the device clock.");
	return input;
}).handler(proxySigned_createServerFn_handler, async ({ data }) => {
	const headers = {
		"X-PM-Access-Key": data.accessKey.trim(),
		"X-PM-Timestamp": data.timestamp,
		"X-PM-Signature": data.signature,
		accept: "application/json"
	};
	let body;
	if (data.method === "POST") {
		headers["Content-Type"] = "application/json";
		body = JSON.stringify(data.body ?? {});
	}
	const res = await fetch(`${TRADE}${data.path}`, {
		method: data.method,
		headers,
		body
	});
	const text = await res.text();
	return {
		ok: res.ok,
		status: res.status,
		body: text.slice(0, 8e3)
	};
});
//#endregion
export { listBoard_createServerFn_handler, proxySigned_createServerFn_handler, runDesk_createServerFn_handler };
