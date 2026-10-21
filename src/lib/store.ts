import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Action } from "@/lib/market";

export type PaperPosition = {
  slug: string;
  title: string;
  question: string;
  side: "YES" | "NO";
  shares: number;
  avg: number;
  cost: number;
  openedAt: number;
};

export type TapeEntry = {
  id: string;
  at: number;
  slug: string;
  title: string;
  action: Action;
  executed: boolean;
  venue: "paper" | "live" | "none";
  fairYes: number | null;
  price: number | null;
  dollars: number;
  edge: number | null;
  shares: number;
  veto: string | null;
  seats: { scout: string; analyst: string; risk: string; clerk: string };
  orderId?: string;
  source: "grok" | "offline";
};

export type Mark = { yesBid: number; yesAsk: number };

type DeskState = {
  mode: "paper" | "live";
  armed: boolean;
  killed: boolean;
  liveConsent: boolean;
  intervalMin: number;
  dailyCap: number;
  bankroll: number;
  cash: number;
  maxDollars: number;
  maxPositions: number;
  minEdge: number;
  maxDailyLoss: number;
  keyId: string;
  secret: string;
  positions: PaperPosition[];
  tape: TapeEntry[];
  marks: Record<string, Mark>;
  callsToday: number;
  dayKey: string;
  dayStartEquity: number;
  lastCycleAt: number;
  cycleNote: string;
  liveBuyingPower: number | null;
  liveBalance: number | null;
  livePositions: Array<{ slug: string; net: string; cost: string; realized: string }>;
  liveOpenOrders: number | null;
  liveError: string;
  spark: Array<{ t: number; v: number }>;
  set: (partial: Partial<DeskState>) => void;
  pushTape: (entry: TapeEntry) => void;
  noteCycle: (note: string) => void;
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const startCash = 1000;

export const useDesk = create<DeskState>()(
  persist(
    (set) => ({
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
      minEdge: 0.05,
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
      pushTape: (entry) =>
        set((s) => ({ tape: [entry, ...s.tape].slice(0, 80) })),
      noteCycle: (note) => set({ cycleNote: note, lastCycleAt: Date.now() }),
    }),
    {
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
        cycleNote: s.cycleNote,
      }),
    },
  ),
);

export function dayKeyNow() {
  return todayKey();
}

export function positionMark(p: PaperPosition, marks: Record<string, Mark>) {
  const m = marks[p.slug];
  if (!m) return p.cost;
  const px = p.side === "YES" ? m.yesBid : Math.max(0, 1 - m.yesAsk);
  return p.shares * px;
}

export function equityOf(s: Pick<DeskState, "cash" | "positions" | "marks">) {
  const marks = s.positions.reduce((sum, p) => sum + positionMark(p, s.marks), 0);
  return s.cash + marks;
}
