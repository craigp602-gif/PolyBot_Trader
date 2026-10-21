import { i as __toESM } from "../_runtime.mjs";
import { J as require_react, x as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { a as Radio, i as ScrollText, n as ShieldAlert, o as BookOpen, r as Settings2 } from "../_libs/lucide-react.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { n as Line, r as ResponsiveContainer, t as LineChart } from "../_libs/recharts+[...].mjs";
import { n as toast, t as Toaster } from "../_libs/sonner.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as signAsync } from "../_libs/noble__ed25519.mjs";
import { n as persist, r as create, t as createJSONStorage } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-CDJHRqNa.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
var styles = cva("inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40", {
	variants: { variant: {
		brass: "bg-brass text-brass-ink hover:bg-brass/90",
		ghost: "border border-line bg-panel text-paper hover:bg-panel-2",
		danger: "border border-down/50 bg-panel text-down hover:bg-down/10"
	} },
	defaultVariants: { variant: "ghost" }
});
function Button({ className, variant, type = "button", ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
		type,
		className: cn(styles({ variant }), className),
		...props
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var listBoard = createServerFn({ method: "POST" }).validator((input) => input ?? {}).handler(createSsrRpc("85225206ca0408dae96cd3634c1ecd0e2c08698dec878fdf050ccb097f75c7a6"));
var runDesk = createServerFn({ method: "POST" }).validator((input) => {
	if (!input || !Array.isArray(input.markets)) throw new Error("Missing markets.");
	return {
		markets: input.markets.slice(0, 8),
		minEdge: Number(input.minEdge) || .05,
		maxDollars: Number(input.maxDollars) || 25,
		open: Array.isArray(input.open) ? input.open.slice(0, 8) : []
	};
}).handler(createSsrRpc("26f590a8b9dc42685dacc45cb0e4a29cd30bd78660f2325f20b18d11a6189a80"));
var ALLOWED = /* @__PURE__ */ new Set([
	"GET /v1/account/balances",
	"GET /v1/portfolio/positions",
	"GET /v1/orders/open",
	"POST /v1/orders",
	"POST /v1/orders/open/cancel"
]);
var proxySigned = createServerFn({ method: "POST" }).validator((input) => {
	if (!input?.method || !input.path || !input.accessKey || !input.timestamp || !input.signature) throw new Error("Missing signature headers.");
	const key = `${input.method} ${input.path}`;
	if (!ALLOWED.has(key)) throw new Error("That Polymarket path is not allowed.");
	const ts = Number(input.timestamp);
	if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 25e3) throw new Error("Signature timestamp is outside the exchange window. Check the device clock.");
	return input;
}).handler(createSsrRpc("3061b748b7a50d2e6e0d983caec8721f3691e6f63f3ae3eb8730c5f179669b25"));
var TICK = .001;
function clamp(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
function ceilTick(n) {
	return Math.ceil(n / TICK - 1e-9) * TICK;
}
function floorTick(n) {
	return Math.floor(n / TICK + 1e-9) * TICK;
}
function round3(n) {
	return Math.round(n * 1e3) / 1e3;
}
function gateOrder(input) {
	const { call, market } = input;
	const fair = Number.isFinite(call.analyst.fairYes) ? clamp(call.analyst.fairYes, 0, 1) : null;
	const base = (veto, action = "PASS") => ({
		action,
		veto,
		price: null,
		shares: 0,
		dollars: 0,
		edge: null,
		fairYes: fair,
		slug: market?.slug || call.scout.slug || ""
	});
	if (call.source === "offline") return base("Grok is offline, so the desk will not send an order.");
	if (!call.risk.approve || call.clerk.action === "PASS") return base(call.risk.approve ? "Clerk passed." : call.risk.note || "Risk stood down.");
	if (!market || !market.tradable) return base("That market is not on the live board.");
	if (market.yesAsk - market.yesBid > .12) return base("The book is too wide to price fairly.");
	const budget = Math.max(0, Math.min(input.maxDollars, call.clerk.dollars || input.maxDollars, input.cash));
	if (call.clerk.action === "SELL") {
		if (!input.held || input.held.shares < 1) return base("Nothing open in that market to close.");
		const price = input.held.side === "YES" ? floorTick(market.yesBid) : floorTick(1 - market.yesAsk);
		if (price <= .001) return base("No bid to exit into.");
		return {
			action: "SELL",
			veto: null,
			price: round3(price),
			shares: Math.floor(input.held.shares),
			dollars: round3(Math.floor(input.held.shares) * price),
			edge: fair == null ? null : input.held.side === "YES" ? price - fair : price - (1 - fair),
			fairYes: fair,
			slug: market.slug
		};
	}
	if (input.held) return base("Already in this market. The desk will not add.");
	if (input.openCount >= input.maxPositions) return base("Position cap is full.");
	if (budget <= 0) return base("No cash left under the size cap.");
	const buyingYes = call.clerk.action === "BUY_YES";
	const price = round3(clamp(ceilTick(buyingYes ? market.yesAsk : 1 - market.yesBid), .001, .999));
	if (price < .04 || price > .96) return base("Price is too close to settled.");
	if (fair == null) return base("Analyst did not give a fair price.");
	const edge = buyingYes ? fair - price : 1 - fair - price;
	if (edge < input.minEdge) return {
		...base(`Edge is ${(edge * 100).toFixed(1)}¢, under your ${(input.minEdge * 100).toFixed(0)}¢ minimum.`),
		edge,
		price
	};
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
		slug: market.slug
	};
}
function labelFor(b) {
	const title = b.title?.trim();
	const question = b.question?.trim();
	if (title && question && title.toLowerCase() !== question.toLowerCase()) return `${title} — ${question}`;
	return title || question || "Untitled market";
}
function bytesToB64(bytes) {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}
function decodeSecret(secret) {
	const cleaned = secret.trim().replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
	const pad = cleaned + "=".repeat((4 - cleaned.length % 4) % 4);
	let bin;
	try {
		bin = atob(pad);
	} catch {
		throw new Error("That secret is not valid base64. Paste the key from the Polymarket US developer page.");
	}
	const raw = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
	const seed = raw.length >= 32 ? raw.slice(0, 32) : raw;
	if (seed.length !== 32) throw new Error("The secret must decode to at least 32 bytes.");
	return seed;
}
async function signPolymarket(input) {
	const seed = decodeSecret(input.secret);
	const timestamp = String(Date.now());
	const message = new TextEncoder().encode(`${timestamp}${input.method}${input.path}`);
	return {
		timestamp,
		signature: bytesToB64(await signAsync(message, seed))
	};
}
function todayKey() {
	const d = /* @__PURE__ */ new Date();
	return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
var startCash = 1e3;
var useDesk = create()(persist((set) => ({
	mode: "paper",
	armed: false,
	killed: false,
	liveConsent: false,
	intervalMin: 20,
	dailyCap: 12,
	bankroll: startCash,
	cash: startCash,
	maxDollars: 25,
	maxPositions: 3,
	minEdge: .05,
	maxDailyLoss: 75,
	keyId: "",
	secret: "",
	positions: [],
	tape: [],
	marks: {},
	callsToday: 0,
	dayKey: todayKey(),
	dayStartEquity: startCash,
	lastCycleAt: 0,
	cycleNote: "Standing by.",
	liveBuyingPower: null,
	liveBalance: null,
	livePositions: [],
	liveOpenOrders: null,
	liveError: "",
	spark: [],
	set: (partial) => set(partial),
	pushTape: (entry) => set((s) => ({ tape: [entry, ...s.tape].slice(0, 80) })),
	noteCycle: (note) => set({
		cycleNote: note,
		lastCycleAt: Date.now()
	})
}), {
	name: "quorum-desk-v1",
	storage: createJSONStorage(() => localStorage),
	skipHydration: true,
	partialize: (s) => ({
		mode: s.mode,
		armed: s.armed,
		killed: s.killed,
		liveConsent: s.liveConsent,
		intervalMin: s.intervalMin,
		dailyCap: s.dailyCap,
		bankroll: s.bankroll,
		cash: s.cash,
		maxDollars: s.maxDollars,
		maxPositions: s.maxPositions,
		minEdge: s.minEdge,
		maxDailyLoss: s.maxDailyLoss,
		keyId: s.keyId,
		secret: s.secret,
		positions: s.positions,
		tape: s.tape,
		marks: s.marks,
		spark: s.spark,
		callsToday: s.callsToday,
		dayKey: s.dayKey,
		dayStartEquity: s.dayStartEquity,
		lastCycleAt: s.lastCycleAt,
		cycleNote: s.cycleNote
	})
}));
function dayKeyNow() {
	return todayKey();
}
function positionMark(p, marks) {
	const m = marks[p.slug];
	if (!m) return p.cost;
	const px = p.side === "YES" ? m.yesBid : Math.max(0, 1 - m.yesAsk);
	return p.shares * px;
}
function equityOf(s) {
	const marks = s.positions.reduce((sum, p) => sum + positionMark(p, s.marks), 0);
	return s.cash + marks;
}
var useBoard = create(() => ({
	markets: [],
	loading: false,
	error: "",
	at: 0
}));
var inflight = false;
function rid() {
	return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
async function refreshBoard() {
	useBoard.setState({
		loading: true,
		error: ""
	});
	try {
		const markets = (await listBoard({ data: {} })).markets || [];
		const marks = {};
		for (const m of markets) marks[m.slug] = {
			yesBid: m.yesBid,
			yesAsk: m.yesAsk
		};
		useDesk.setState((s) => ({ marks: {
			...s.marks,
			...marks
		} }));
		useBoard.setState({
			markets,
			loading: false,
			at: Date.now(),
			error: ""
		});
		return markets;
	} catch (err) {
		const message = err instanceof Error ? err.message : "Could not reach Polymarket US.";
		useBoard.setState({
			loading: false,
			error: message
		});
		throw err;
	}
}
async function signedCall(method, path, body) {
	const { keyId, secret } = useDesk.getState();
	if (!keyId.trim() || !secret.trim()) throw new Error("Add a Polymarket US key on Rules first.");
	const signed = await signPolymarket({
		secret,
		method,
		path
	});
	return proxySigned({ data: {
		method,
		path,
		accessKey: keyId.trim(),
		timestamp: signed.timestamp,
		signature: signed.signature,
		body
	} });
}
function readJson(text) {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
async function syncLive() {
	const balances = await signedCall("GET", "/v1/account/balances");
	const positions = await signedCall("GET", "/v1/portfolio/positions");
	const orders = await signedCall("GET", "/v1/orders/open");
	if (!balances.ok) throw new Error(balances.body.slice(0, 280) || `Balances rejected (${balances.status}).`);
	const bal = readJson(balances.body);
	const usd = bal?.balances?.find((b) => !b.currency || b.currency === "USD") || bal?.balances?.[0];
	const pos = readJson(positions.body);
	const livePositions = Object.entries(pos?.positions || {}).map(([slug, row]) => ({
		slug,
		net: String(row.netPositionDecimal ?? "0"),
		cost: String(row.cost?.value ?? ""),
		realized: String(row.realized?.value ?? "")
	})).filter((row) => Math.abs(Number(row.net) || 0) >= 1e-4);
	const open = readJson(orders.body);
	const liveOpenOrders = Array.isArray(open) ? open.length : Array.isArray(open?.orders) ? open.orders.length : null;
	useDesk.setState({
		liveBuyingPower: numOrNull(usd?.buyingPower),
		liveBalance: numOrNull(usd?.currentBalance),
		livePositions,
		liveOpenOrders,
		liveError: positions.ok ? "" : "Positions did not load."
	});
	return {
		balances,
		positions,
		orders
	};
}
function numOrNull(v) {
	const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
	return Number.isFinite(n) ? n : null;
}
function rollDay() {
	const s = useDesk.getState();
	const key = dayKeyNow();
	if (s.dayKey !== key) useDesk.setState({
		dayKey: key,
		callsToday: 0,
		dayStartEquity: equityOf(s)
	});
}
async function runCycle(reason) {
	if (inflight) return "A pass is already running.";
	const start = useDesk.getState();
	if (start.killed) return "Kill switch is on.";
	if (reason === "auto" && !start.armed) return "Desk is not armed.";
	rollDay();
	const s = useDesk.getState();
	if (s.callsToday >= s.dailyCap) {
		const note = `Daily Grok cap (${s.dailyCap}) is used. No more passes until tomorrow.`;
		if (Date.now() - s.lastCycleAt > 6e4) useDesk.getState().noteCycle(note);
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
		const open = fresh.mode === "live" ? fresh.livePositions.filter((p) => Math.abs(Number(p.net)) >= 1).map((p) => ({
			slug: p.slug,
			side: "YES",
			shares: Math.abs(Number(p.net)),
			avg: 0
		})) : fresh.positions.map((p) => ({
			slug: p.slug,
			side: p.side,
			shares: p.shares,
			avg: p.avg
		}));
		useDesk.setState({
			callsToday: fresh.callsToday + 1,
			cycleNote: "The four seats are voting. This usually takes under a minute."
		});
		const desk = await runDesk({ data: {
			markets: markets.slice(0, 8),
			minEdge: fresh.minEdge,
			maxDollars: fresh.maxDollars,
			open
		} });
		if (!desk.ok) {
			useDesk.getState().noteCycle(desk.error);
			return desk.error;
		}
		const call = desk.call;
		const market = markets.find((m) => m.slug === call.scout.slug);
		const heldPaper = fresh.positions.find((p) => p.slug === call.scout.slug);
		const liveRow = fresh.livePositions.find((p) => p.slug === call.scout.slug);
		const liveNet = liveRow ? Number(liveRow.net) : 0;
		const held = fresh.mode === "live" ? liveRow && Math.abs(liveNet) >= 1 ? {
			side: "YES",
			shares: Math.abs(liveNet),
			avg: 0
		} : void 0 : heldPaper ? {
			side: heldPaper.side,
			shares: heldPaper.shares,
			avg: heldPaper.avg
		} : void 0;
		const cash = fresh.mode === "live" ? fresh.liveBuyingPower ?? fresh.maxDollars : fresh.cash;
		const decision = gateOrder({
			call,
			market,
			held,
			openCount: fresh.mode === "live" ? fresh.livePositions.length : fresh.positions.length,
			cash,
			minEdge: fresh.minEdge,
			maxDollars: fresh.maxDollars,
			maxPositions: fresh.maxPositions
		});
		let executed = false;
		let venue = "none";
		let orderId;
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
		const entry = {
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
				clerk: call.clerk.note || "No note."
			},
			orderId,
			source: call.source
		};
		useDesk.getState().pushTape(entry);
		const after = useDesk.getState();
		const eq = equityOf(after);
		const spark = [...after.spark, {
			t: Date.now(),
			v: Number(eq.toFixed(2))
		}].slice(-48);
		let note = executed ? `${decision.action.replace("_", " ")} ${decision.shares} @ ${decision.price?.toFixed(3)} on ${title}.` : veto || "Passed.";
		if (after.mode === "paper" && eq <= after.dayStartEquity - after.maxDailyLoss) {
			useDesk.setState({
				killed: true,
				armed: false,
				spark,
				cycleNote: "Daily loss limit hit. Kill switch is on."
			});
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
function fillPaper(decision, market) {
	const s = useDesk.getState();
	if (decision.action === "SELL") {
		if (!s.positions.find((p) => p.slug === decision.slug) || decision.price == null) return;
		const proceeds = decision.shares * decision.price;
		useDesk.setState({
			cash: s.cash + proceeds,
			positions: s.positions.filter((p) => p.slug !== decision.slug)
		});
		return;
	}
	if (decision.price == null) return;
	const side = decision.action === "BUY_NO" ? "NO" : "YES";
	const pos = {
		slug: market.slug,
		title: market.title,
		question: market.question,
		side,
		shares: decision.shares,
		avg: decision.price,
		cost: decision.dollars,
		openedAt: Date.now()
	};
	useDesk.setState({
		cash: Math.max(0, s.cash - decision.dollars),
		positions: [...s.positions, pos]
	});
}
async function sendLive(decision, liveNet) {
	if (decision.price == null) return {
		ok: false,
		error: "No price."
	};
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
		price: {
			value: decision.price.toFixed(3),
			currency: "USD"
		},
		quantity,
		tif: "TIME_IN_FORCE_DAY",
		intent,
		manualOrderIndicator: "MANUAL_ORDER_INDICATOR_AUTOMATIC",
		synchronousExecution: true,
		maxBlockTime: 5
	});
	if (!res.ok) return {
		ok: false,
		error: `Exchange rejected the order (${res.status}). ${res.body.slice(0, 220)}`
	};
	return {
		ok: true,
		orderId: readJson(res.body)?.id
	};
}
async function cancelLiveOrders() {
	return signedCall("POST", "/v1/orders/open/cancel", { slugs: [] });
}
function money(n) {
	return n.toLocaleString("en-US", {
		style: "currency",
		currency: "USD"
	});
}
function cents(n) {
	return `${(n * 100).toFixed(1)}¢`;
}
function clock(ms) {
	const s = Math.max(0, Math.ceil(ms / 1e3));
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function DeskApp() {
	const [tab, setTab] = (0, import_react.useState)("floor");
	const [now, setNow] = (0, import_react.useState)(() => Date.now());
	(0, import_react.useEffect)(() => {
		useDesk.persist.rehydrate();
		refreshBoard().catch((err) => {
			toast.error(err instanceof Error ? err.message : "Board failed to load.");
		});
		const id = window.setInterval(() => {
			const s = useDesk.getState();
			if (s.armed && !s.killed && Date.now() - s.lastCycleAt >= s.intervalMin * 6e4) runCycle("auto");
		}, 1e3);
		const board = window.setInterval(() => {
			refreshBoard().catch(() => void 0);
		}, 6e4);
		const tick = window.setInterval(() => setNow(Date.now()), 1e3);
		return () => {
			clearInterval(id);
			clearInterval(board);
			clearInterval(tick);
		};
	}, []);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-ink text-paper",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Toaster, {
				theme: "dark",
				position: "top-center"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Header, { now }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
				className: "mx-auto w-full max-w-3xl px-4 pb-28 pt-4",
				children: [
					tab === "floor" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Floor, {}) : null,
					tab === "book" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Book, {}) : null,
					tab === "tape" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tape, {}) : null,
					tab === "rules" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rules, {}) : null
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
				className: "fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mx-auto grid max-w-3xl grid-cols-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
							active: tab === "floor",
							onClick: () => setTab("floor"),
							label: "Floor",
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Radio, { className: "size-4" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
							active: tab === "book",
							onClick: () => setTab("book"),
							label: "Book",
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BookOpen, { className: "size-4" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
							active: tab === "tape",
							onClick: () => setTab("tape"),
							label: "Tape",
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ScrollText, { className: "size-4" })
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(NavButton, {
							active: tab === "rules",
							onClick: () => setTab("rules"),
							label: "Rules",
							icon: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Settings2, { className: "size-4" })
						})
					]
				})
			})
		]
	});
}
function NavButton({ active, onClick, label, icon }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", {
		type: "button",
		onClick,
		className: cn("flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium", active ? "text-brass" : "text-mute"),
		children: [icon, label]
	});
}
function Header({ now }) {
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
	const equity = mode === "live" && liveBuyingPower != null ? liveBuyingPower : equityOf({
		cash,
		positions,
		marks
	});
	const remain = armed && !killed ? Math.max(0, intervalMin * 6e4 - (now - lastCycleAt)) : 0;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
		className: "border-b border-line",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mx-auto flex max-w-3xl items-end justify-between gap-3 px-4 py-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs font-medium tracking-[0.18em] text-brass uppercase",
				children: "Polymarket US"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "font-display text-4xl leading-none text-paper",
				children: "Quorum"
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "text-right",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-mute",
						children: mode === "live" ? "Buying power" : "Paper equity"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-display text-3xl tabular-nums text-paper",
						children: money(equity)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-mute tabular-nums",
						children: [
							killed ? "Killed" : armed ? `Next pass ${clock(remain)}` : "Not armed",
							" · ",
							callsToday,
							"/",
							dailyCap,
							" passes"
						]
					})
				]
			})]
		})
	});
}
function Floor() {
	const note = useDesk((s) => s.cycleNote);
	const armed = useDesk((s) => s.armed);
	const killed = useDesk((s) => s.killed);
	const tape = useDesk((s) => s.tape);
	const spark = useDesk((s) => s.spark);
	const board = useBoard();
	const latest = tape[0];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-desk border border-line bg-panel p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-xs tracking-[0.16em] text-mute uppercase",
							children: "Desk"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mt-1 text-base leading-snug text-paper",
							children: note
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Status, {})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: [
							killed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "brass",
								onClick: () => useDesk.setState({
									killed: false,
									cycleNote: "Kill switch cleared. Arm when you want the next pass."
								}),
								children: "Clear kill switch"
							}) : armed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								onClick: () => {
									useDesk.setState({
										armed: false,
										cycleNote: "Disarmed. The book stays where it is."
									});
								},
								children: "Disarm"
							}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								variant: "brass",
								onClick: () => armDesk(),
								children: "Arm desk"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
								onClick: () => {
									runCycle("manual").then((msg) => toast(msg));
								},
								disabled: killed,
								children: "Run one pass"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								variant: "danger",
								onClick: () => void killDesk(),
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(ShieldAlert, { className: "size-4" }), "Kill"]
							})
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-3 text-sm leading-relaxed text-mute",
						children: "While this screen stays open, an armed desk passes the board to Scout, Analyst, Risk, and Clerk, then trades only inside your caps. Phone sleep pauses it. This is not advice, and it can lose money."
					}),
					spark.length > 1 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-3 h-20",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
							width: "100%",
							height: "100%",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LineChart, {
								data: spark,
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Line, {
									type: "monotone",
									dataKey: "v",
									stroke: "var(--color-brass)",
									strokeWidth: 2,
									dot: false
								})
							})
						})
					}) : null
				]
			}),
			latest ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Seats, { entry: latest }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex items-baseline justify-between",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Board"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
						type: "button",
						className: "text-sm text-brass",
						onClick: () => void refreshBoard(),
						children: board.loading ? "Refreshing…" : "Refresh"
					})]
				}),
				board.error ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-down",
					children: board.error
				}) : null,
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "divide-y divide-line overflow-hidden rounded-desk border border-line",
					children: [
						board.markets.map((m) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-start justify-between gap-3 bg-panel px-3 py-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "truncate text-sm font-medium text-paper",
									children: labelFor(m)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs text-mute",
									children: [m.category, m.endDate ? ` · ${new Date(m.endDate).toLocaleDateString("en-US", {
										month: "short",
										day: "numeric"
									})}` : ""]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "text-right tabular-nums",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "text-sm text-paper",
									children: cents(m.yesAsk)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs text-mute",
									children: [cents(Math.max(0, m.yesAsk - m.yesBid)), " wide"]
								})]
							})]
						}, m.slug)),
						board.loading && board.markets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "bg-panel px-3 py-6 text-sm text-mute",
							children: "Loading the board…"
						}) : null,
						!board.loading && board.markets.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
							className: "bg-panel px-3 py-6 text-sm text-mute",
							children: "No open markets yet."
						}) : null
					]
				})
			] })
		]
	});
}
function Status() {
	const armed = useDesk((s) => s.armed);
	const killed = useDesk((s) => s.killed);
	const mode = useDesk((s) => s.mode);
	const label = killed ? "Killed" : armed ? "Armed" : "Idle";
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "shrink-0 text-right",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
			className: cn("text-sm font-semibold", killed ? "text-down" : armed ? "text-up" : "text-mute"),
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: cn("mr-1 inline-block size-2 rounded-full bg-current", armed && !killed && "motion-safe:animate-pulse") }), label]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-xs tracking-wide text-mute uppercase",
			children: mode
		})]
	});
}
function Seats({ entry }) {
	const seats = [
		["Scout", entry.seats.scout],
		["Analyst", entry.seats.analyst],
		["Risk", entry.seats.risk],
		["Clerk", entry.seats.clerk]
	];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [
		/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-2 flex items-baseline justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-2xl",
				children: "Last vote"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "text-xs text-mute",
				children: new Date(entry.at).toLocaleTimeString()
			})]
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "mb-2 text-sm text-paper",
			children: entry.executed ? `${entry.action.replaceAll("_", " ")} · ${entry.shares} @ ${entry.price != null ? cents(entry.price) : "—"} · ${entry.venue}` : entry.veto || "Passed."
		}),
		/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "grid gap-2 sm:grid-cols-2",
			children: seats.map(([name, body]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("article", {
				className: "rounded-desk border border-line bg-panel-2 p-3",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-lg text-brass",
					children: name
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm leading-relaxed text-paper/90",
					children: body
				})]
			}, name))
		})
	] });
}
function Book() {
	const mode = useDesk((s) => s.mode);
	const positions = useDesk((s) => s.positions);
	const marks = useDesk((s) => s.marks);
	const cash = useDesk((s) => s.cash);
	const livePositions = useDesk((s) => s.livePositions);
	const liveBalance = useDesk((s) => s.liveBalance);
	const liveOpenOrders = useDesk((s) => s.liveOpenOrders);
	if (mode === "live") return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-2xl",
				children: "Exchange book"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-mute",
				children: [
					"Cash ",
					liveBalance == null ? "—" : money(liveBalance),
					liveOpenOrders != null ? ` · ${liveOpenOrders} open orders` : ""
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: () => {
					syncLive().then(() => toast("Account synced.")).catch((err) => toast.error(err instanceof Error ? err.message : "Sync failed."));
				},
				children: "Sync account"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "divide-y divide-line overflow-hidden rounded-desk border border-line",
				children: [livePositions.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
					className: "bg-panel px-3 py-3",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-medium",
						children: p.slug
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-xs text-mute tabular-nums",
						children: [
							"Net ",
							p.net,
							p.cost ? ` · cost ${p.cost}` : "",
							p.realized ? ` · realized ${p.realized}` : ""
						]
					})]
				}, p.slug)), livePositions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "bg-panel px-3 py-6 text-sm text-mute",
					children: "No synced positions."
				}) : null]
			})
		]
	});
	const equity = equityOf({
		cash,
		positions,
		marks
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-3",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-2xl",
				children: "Paper book"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
				className: "text-sm text-mute tabular-nums",
				children: [
					"Cash ",
					money(cash),
					" · Equity ",
					money(equity)
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
				className: "divide-y divide-line overflow-hidden rounded-desk border border-line",
				children: [positions.map((p) => {
					const pnl = positionMark(p, marks) - p.cost;
					return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
						className: "bg-panel px-3 py-3",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-start justify-between gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
									className: "truncate text-sm font-medium",
									children: labelFor(p)
								}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
									className: "text-xs text-mute tabular-nums",
									children: [
										p.side,
										" ",
										p.shares,
										" @ ",
										cents(p.avg)
									]
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: cn("text-sm tabular-nums", pnl >= 0 ? "text-up" : "text-down"),
								children: [pnl >= 0 ? "+" : "", money(pnl)]
							})]
						})
					}, p.slug);
				}), positions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
					className: "bg-panel px-3 py-6 text-sm text-mute",
					children: "Flat. Arm the desk or run one pass."
				}) : null]
			})
		]
	});
}
function Tape() {
	const tape = useDesk((s) => s.tape);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
		className: "mb-2 font-display text-2xl",
		children: "Tape"
	}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
		className: "space-y-2",
		children: [tape.map((e) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
			className: "rounded-desk border border-line bg-panel px-3 py-3",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "flex items-baseline justify-between gap-2",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm font-medium",
						children: e.executed ? e.action.replaceAll("_", " ") : "Pass"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-xs text-mute",
						children: new Date(e.at).toLocaleString()
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-1 text-sm text-paper",
					children: e.title
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "mt-1 text-xs leading-relaxed text-mute",
					children: [
						e.executed ? `${e.venue} · ${e.shares} @ ${e.price != null ? cents(e.price) : "—"}${e.orderId ? ` · ${e.orderId}` : ""}` : e.veto,
						e.edge != null ? ` · edge ${(e.edge * 100).toFixed(1)}¢` : "",
						e.fairYes != null ? ` · fair YES ${cents(e.fairYes)}` : ""
					]
				})
			]
		}, e.id)), tape.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", {
			className: "text-sm text-mute",
			children: "No passes yet."
		}) : null]
	})] });
}
function Rules() {
	const s = useDesk();
	const [confirmReset, setConfirmReset] = (0, import_react.useState)(false);
	function num(key, value, lo, hi) {
		const n = Number(value);
		if (!Number.isFinite(n)) return;
		useDesk.setState({ [key]: Math.min(hi, Math.max(lo, n)) });
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-2xl",
				children: "Rules"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 text-sm leading-relaxed text-mute",
				children: "Hard limits sit in front of the model. Risk can say yes and the desk will still refuse a trade that breaks these."
			})] }),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid grid-cols-2 gap-2",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: s.mode === "paper" ? "brass" : "ghost",
					onClick: () => useDesk.setState({
						mode: "paper",
						armed: false,
						cycleNote: "Paper mode. Disarmed until you arm again."
					}),
					children: "Paper"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
					variant: s.mode === "live" ? "brass" : "ghost",
					onClick: () => {
						if (!s.liveConsent || !s.keyId || !s.secret) {
							toast("Check the live box and save a key before switching.");
							return;
						}
						useDesk.setState({
							mode: "live",
							armed: false,
							cycleNote: "Live mode. Disarmed until you arm again."
						});
					},
					children: "Live"
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
				className: "flex items-start gap-3 rounded-desk border border-line bg-panel p-3 text-sm leading-relaxed",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
					type: "checkbox",
					className: "mt-1 size-5 accent-brass",
					checked: s.liveConsent,
					onChange: (e) => useDesk.setState({
						liveConsent: e.target.checked,
						mode: e.target.checked ? s.mode : "paper"
					})
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "I understand live mode can send real Polymarket US orders, marked automatic, and I can lose money. Keys stay in this browser only." })]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Pass every (minutes)",
						value: s.intervalMin,
						min: 10,
						max: 120,
						onChange: (v) => num("intervalMin", v, 10, 120)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Grok passes / day",
						value: s.dailyCap,
						min: 1,
						max: 36,
						onChange: (v) => num("dailyCap", v, 1, 36)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Max dollars / order",
						value: s.maxDollars,
						min: 1,
						max: 500,
						onChange: (v) => num("maxDollars", v, 1, 500)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Max open positions",
						value: s.maxPositions,
						min: 1,
						max: 8,
						onChange: (v) => num("maxPositions", v, 1, 8)
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Min edge (cents)",
						value: Math.round(s.minEdge * 100),
						min: 2,
						max: 20,
						onChange: (v) => {
							const n = Number(v);
							if (Number.isFinite(n)) useDesk.setState({ minEdge: Math.min(.2, Math.max(.02, n / 100)) });
						}
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
						label: "Daily loss stop",
						value: s.maxDailyLoss,
						min: 10,
						max: 1e3,
						onChange: (v) => num("maxDailyLoss", v, 10, 1e3)
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "space-y-2 rounded-desk border border-line bg-panel p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl",
						children: "Polymarket US key"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "text-sm text-mute",
						children: [
							"Create a key at",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("a", {
								className: "text-brass underline",
								href: "https://polymarket.us/developer",
								target: "_blank",
								rel: "noreferrer",
								children: "polymarket.us/developer"
							}),
							". The secret is signed in the browser and is not stored on the server."
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs text-mute",
						children: ["Key ID", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							className: "mt-1 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper",
							value: s.keyId,
							autoComplete: "off",
							onChange: (e) => useDesk.setState({ keyId: e.target.value })
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
						className: "block text-xs text-mute",
						children: ["Secret key", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
							type: "password",
							className: "mt-1 min-h-11 w-full rounded-md border border-line bg-ink px-3 text-sm text-paper",
							value: s.secret,
							autoComplete: "off",
							onChange: (e) => useDesk.setState({ secret: e.target.value }),
							onBlur: () => {
								if (!s.secret.trim()) return;
								try {
									decodeSecret(s.secret);
								} catch (err) {
									toast.error(err instanceof Error ? err.message : "Bad secret.");
								}
							}
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						onClick: () => {
							syncLive().then(() => toast("Connected. Balances loaded.")).catch((err) => toast.error(err instanceof Error ? err.message : "Could not connect."));
						},
						children: "Test connection"
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-desk border border-line bg-panel p-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "font-display text-xl",
						children: "Paper bankroll"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-1 text-sm text-mute",
						children: "Reset clears the simulated book only. It does not touch the exchange."
					}),
					confirmReset ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-3 flex gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							variant: "danger",
							onClick: () => {
								const bankroll = useDesk.getState().bankroll;
								useDesk.setState({
									cash: bankroll,
									positions: [],
									spark: [],
									dayStartEquity: bankroll,
									cycleNote: "Paper book reset."
								});
								setConfirmReset(false);
							},
							children: "Confirm reset"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							onClick: () => setConfirmReset(false),
							children: "Cancel"
						})]
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
						className: "mt-3",
						onClick: () => setConfirmReset(true),
						children: "Reset paper book"
					})
				]
			})
		]
	});
}
function Field({ label, value, min, max, onChange }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "block rounded-desk border border-line bg-panel px-3 py-2 text-xs text-mute",
		children: [label, /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
			type: "number",
			inputMode: "decimal",
			min,
			max,
			value,
			onChange: (e) => onChange(e.target.value),
			className: "mt-1 min-h-11 w-full bg-transparent text-base text-paper tabular-nums outline-none"
		})]
	});
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
		lastCycleAt: Date.now() - s.intervalMin * 6e4 + 2500,
		cycleNote: s.mode === "live" ? "Armed live. First pass shortly." : "Armed on the paper book. First pass shortly."
	});
}
async function killDesk() {
	const s = useDesk.getState();
	useDesk.setState({
		killed: true,
		armed: false,
		cycleNote: "Kill switch is on. No new orders."
	});
	if (s.mode === "live" && s.keyId && s.secret) try {
		const res = await cancelLiveOrders();
		toast(res.ok ? "Cancel-all sent to the exchange." : `Cancel failed (${res.status}).`);
	} catch (err) {
		toast.error(err instanceof Error ? err.message : "Cancel failed.");
	}
	else toast("Desk stopped.");
}
var SplitComponent = DeskApp;
//#endregion
export { SplitComponent as component };
