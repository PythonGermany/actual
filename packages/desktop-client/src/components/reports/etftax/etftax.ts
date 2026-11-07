// German ETF taxation: FIFO lots per ISIN, booked and expected Vorabpauschale,
// maximum tax-free sale and missing-Vorabpauschale check.

/** Teilfreistellung for equity ETFs (§ 20 InvStG). */
export const TEILFREISTELLUNG_EQUITY = 0.3;

/** Abgeltungsteuer plus Solidaritätszuschlag (no church tax). */
export const DEFAULT_TAX_RATE = 0.26375;

/** Basisertrag = 70% of Basiszins × start-of-year price (§ 18 Abs. 1 InvStG); unrelated to the Teilfreistellung. */
export const BASISERTRAG_FACTOR = 0.7;

/**
 * BMF-published Basiszins (§ 18 Abs. 4 InvStG) by the tax year it applies to.
 * Negative rates yield no Vorabpauschale.
 */
export const KNOWN_BASISZINS: Readonly<Record<number, number>> = {
  2018: 0.0087,
  2019: 0.0052,
  2020: 0.0007,
  2021: -0.0045,
  2022: -0.0005,
  2023: 0.0255,
  2024: 0.0229,
  2025: 0.0253,
  2026: 0.032,
};

const EPS = 1e-9;

export type TxnRow = {
  account: string;
  date: string;
  notes: string;
  /** Positive = money into the account (a buy on the depot). */
  amount: number;
  isSplitChild: boolean;
};

export type Trade = {
  date: string;
  isin: string;
  qty: number;
  amount: number;
  buy: boolean;
  idx: number;
};

export type Sale = { date: string; qty: number; proceedsPerShare: number };

export type Lot = {
  date: string;
  qtyOrig: number;
  qtyRem: number;
  price: number;
  /** Booked Vorabpauschale per share attributed to this lot. */
  vap: number;
  sales: Sale[];
};

export type Group = {
  isin: string;
  lots: Lot[];
  soldQty: number;
  overshoot: number;
  firstSeen: string;
  vapSources: string[];
};

export type ActualVap = {
  isin: string;
  date: string;
  taxYear: number;
  total: number;
};

export type EtfTaxState = {
  groups: Map<string, Group>;
  txns: Trade[];
  warnings: string[];
  actualVap: ActualVap[];
};

export type MissingVapJob = { isin: string; taxYear: number; settle: string };

export type MaxResult = { qty: number; exhaustedAll: boolean };

/** Depot trade note, e.g. "10x #IE00EXAMPLE1". Needs the named groups qty and isin. */
export const DEFAULT_TRADE_PATTERN = '^(?<qty>[\\d.,]+)x #(?<isin>\\w{12})\\b';

export type NotePatterns = { trade: RegExp };

export const DEFAULT_NOTE_PATTERNS: NotePatterns = {
  trade: new RegExp(DEFAULT_TRADE_PATTERN, 'i'),
};

/**
 * A lookup page URL template with {isin} replaced. Null without a template,
 * so no link is shown.
 */
export function isinUrl(isin: string, template?: string): string | null {
  const source = template?.trim();
  return source ? source.replaceAll('{isin}', encodeURIComponent(isin)) : null;
}

/** The site a lookup URL points to, e.g. "example.com"; null for an invalid URL. */
export function lookupSite(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/**
 * Booked Vorabpauschale of one depot, as entered from the bank statements:
 * tax year → ISIN → total amount. The Vorabpauschale for tax year Y is booked
 * in January of Y + 1. An entered 0 counts as booked.
 */
export type BookedVap = Readonly<
  Record<string, Readonly<Record<string, number>>>
>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Compiles one note pattern (case-insensitive) and checks it has the required named groups. */
function compilePattern(
  source: string,
  groups: string[],
): RegExp | { error: string } {
  let re: RegExp;
  try {
    re = new RegExp(source, 'i');
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  // Adding an empty alternative makes every pattern match "", which lists all its named groups.
  const present = Object.keys(
    new RegExp(`${source}|`, 'i').exec('')?.groups ?? {},
  );
  const missing = groups.filter(g => !present.includes(g));
  if (missing.length > 0) {
    return {
      error: `missing named group(s): ${missing.map(g => `(?<${g}>…)`).join(', ')}`,
    };
  }
  return re;
}

/**
 * Compiles the configured note pattern; an empty or missing one falls back to
 * the default.
 */
export function compileNotePatterns(config: {
  trade?: string;
}): { patterns: NotePatterns } | { error: string } {
  const trade = config.trade?.trim()
    ? compilePattern(config.trade.trim(), ['qty', 'isin'])
    : DEFAULT_NOTE_PATTERNS.trade;
  if (!(trade instanceof RegExp)) {
    return { error: trade.error };
  }
  return { patterns: { trade } };
}

/** User-entered Basiszins per tax year; takes precedence over the built-in table. */
export type BasiszinsOverrides = Readonly<Record<number, number>>;

/**
 * The Basiszins for a tax year: an override if one is entered, else the
 * built-in rate. For a year not yet published the most recent known rate is
 * returned with known = false; before 2018 there is none.
 */
export function basiszinsFor(
  taxYear: number,
  overrides: BasiszinsOverrides = {},
): {
  rate: number;
  known: boolean;
} {
  if (Number.isFinite(overrides[taxYear])) {
    return { rate: overrides[taxYear], known: true };
  }
  if (taxYear in KNOWN_BASISZINS) {
    return { rate: KNOWN_BASISZINS[taxYear], known: true };
  }
  const earlier = Object.keys(KNOWN_BASISZINS)
    .map(Number)
    .filter(y => y < taxYear);
  if (earlier.length === 0) {
    return { rate: 0, known: false };
  }
  return { rate: KNOWN_BASISZINS[Math.max(...earlier)], known: false };
}

/** The year of a YYYY-MM-DD date, or 0 if it is malformed. */
export function yearOf(date: string): number {
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) {
    return 0;
  }
  return Number(date.slice(0, 4));
}

/**
 * Parses German ("1.234,56") and English ("1,234.56") numbers. When both
 * separators occur the last one is the decimal separator; a lone "," is a decimal comma.
 */
export function parseNum(input: string): number | null {
  let s = input.replaceAll(' ', '').trim();
  if (s === '') {
    return null;
  }
  const lc = s.lastIndexOf(',');
  const ld = s.lastIndexOf('.');
  if (lc >= 0 && ld >= 0 && lc > ld) {
    s = s.replaceAll('.', '').replace(',', '.');
  } else if (lc >= 0 && ld >= 0) {
    s = s.replaceAll(',', '');
  } else {
    s = s.replaceAll(',', '.');
  }
  const value = Number(s);
  return Number.isFinite(value) ? value : null;
}

/**
 * The share of the year a lot bought on lotDate counts for the Vorabpauschale
 * of taxYear: (13 − month)/12 in the purchase year, else 1.
 */
export function prorationFactor(lotDate: string, taxYear: number): number {
  if (lotDate.length >= 7 && lotDate.slice(0, 4) === String(taxYear)) {
    const month = Number(lotDate.slice(5, 7));
    if (Number.isInteger(month) && month >= 1 && month <= 12) {
      return (13 - month) / 12;
    }
  }
  return 1;
}

/** The booked Vorabpauschale on the shares still held. */
export function vapTotal(group: Group): number {
  return group.lots.reduce((sum, l) => sum + l.qtyRem * l.vap, 0);
}

/** Removes qty shares from the oldest lots; with a sale given, logs it on every touched lot. */
function consume(
  lots: Lot[],
  qty: number,
  sale?: { date: string; proceedsPerShare: number },
): number {
  let remaining = qty;
  for (const lot of lots) {
    if (remaining <= EPS) {
      break;
    }
    const take = Math.min(lot.qtyRem, remaining);
    if (take <= EPS) {
      continue;
    }
    lot.qtyRem -= take;
    remaining -= take;
    if (sale) {
      lot.sales.push({ ...sale, qty: take });
    }
  }
  return remaining;
}

/**
 * The FIFO lot stack of an ISIN as of a date (buys on/before the date, minus
 * all sells on/before it), or null if nothing was bought by then.
 */
export function snapshotLotsAt(
  state: EtfTaxState,
  isin: string,
  date: string,
): Lot[] | null {
  const group = state.groups.get(isin);
  if (!group) {
    return null;
  }
  const temp: Lot[] = group.lots
    .filter(l => l.date <= date)
    .map(l => ({ ...l, qtyRem: l.qtyOrig, vap: 0, sales: [] }));
  if (temp.length === 0) {
    return null;
  }
  for (const t of state.txns) {
    if (t.date > date) {
      break;
    }
    if (t.isin === isin && !t.buy) {
      consume(temp, t.qty);
    }
  }
  return temp;
}

export function hasActualVap(
  state: EtfTaxState,
  isin: string,
  taxYear: number,
): boolean {
  return state.actualVap.some(
    a => a.isin.toUpperCase() === isin.toUpperCase() && a.taxYear === taxYear,
  );
}

/** The known ISINs, sorted. */
export function isinsOf(state: EtfTaxState): string[] {
  return [...state.groups.keys()].sort();
}

/** Groups the rows by depot so FIFO can run per depot; rows of other accounts are dropped. */
export function splitByDepot(
  rows: TxnRow[],
  depotIds: string[],
): Map<string, TxnRow[]> {
  const rowsByDepot = new Map<string, TxnRow[]>(
    depotIds.map(id => [id, [] as TxnRow[]]),
  );
  for (const r of rows) {
    rowsByDepot.get(r.account)?.push(r);
  }
  return rowsByDepot;
}

/** Replays the depot's trades into FIFO lots and spreads the booked Vorabpauschale over the held lots. */
export function buildState(
  rows: TxnRow[],
  depotAccount: string,
  patterns: NotePatterns = DEFAULT_NOTE_PATTERNS,
  booked: BookedVap = {},
): EtfTaxState {
  const state: EtfTaxState = {
    groups: new Map(),
    txns: [],
    warnings: [],
    actualVap: bookedToActual(booked),
  };
  const trades: Trade[] = [];
  rows.forEach((row, i) => {
    if (row.account !== depotAccount) {
      return;
    }
    const trade = parseTrade(state, i, row, patterns.trade);
    if (trade) {
      trades.push(trade);
    }
  });
  trades.sort((a, b) =>
    a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.idx - b.idx,
  );
  state.txns = trades;
  replayFifo(state);
  attributeBookedVap(state);
  return state;
}

/** The entered amounts as bookings on each year's settlement date; invalid entries are skipped. */
function bookedToActual(booked: BookedVap): ActualVap[] {
  const out: ActualVap[] = [];
  for (const [year, byIsin] of Object.entries(booked)) {
    const taxYear = Number(year);
    if (!Number.isInteger(taxYear) || taxYear <= 0) {
      continue;
    }
    for (const [isin, total] of Object.entries(byIsin)) {
      if (Number.isFinite(total) && total >= 0) {
        out.push({
          isin: isin.toUpperCase(),
          date: settlementDate(taxYear + 1),
          taxYear,
          total,
        });
      }
    }
  }
  return out;
}

/** Turns a depot row matching the trade pattern into a trade (positive amount = buy), or warns. */
function parseTrade(
  state: EtfTaxState,
  idx: number,
  row: TxnRow,
  tradePattern: RegExp,
): Trade | null {
  const where = `${row.date} ("${row.notes}")`;
  if (row.isSplitChild) {
    state.warnings.push(
      `${where}: split transaction on the depot — depot transfers must not be split; skipped`,
    );
    return null;
  }
  const groups = tradePattern.exec(row.notes)?.groups;
  if (!groups?.qty || !groups.isin) {
    state.warnings.push(
      `${where}: depot note does not match the trade note pattern; skipped`,
    );
    return null;
  }
  const qty = parseNum(groups.qty);
  if (qty === null || qty <= 0) {
    state.warnings.push(`${where}: quantity "${groups.qty}" invalid; skipped`);
    return null;
  }
  return {
    date: row.date,
    isin: groups.isin.toUpperCase(),
    qty,
    amount: Math.abs(row.amount),
    buy: row.amount > 0,
    idx,
  };
}

/** Buys open lots, sells consume the oldest lots and record the realized slices. */
function replayFifo(state: EtfTaxState) {
  for (const t of state.txns) {
    let group = state.groups.get(t.isin);
    if (!group) {
      group = {
        isin: t.isin,
        lots: [],
        soldQty: 0,
        overshoot: 0,
        firstSeen: t.date,
        vapSources: [],
      };
      state.groups.set(t.isin, group);
    }
    if (t.buy) {
      group.lots.push({
        date: t.date,
        qtyOrig: t.qty,
        qtyRem: t.qty,
        price: t.amount / t.qty,
        vap: 0,
        sales: [],
      });
      continue;
    }
    group.soldQty += t.qty;
    const rem = consume(group.lots, t.qty, {
      date: t.date,
      proceedsPerShare: t.amount / t.qty,
    });
    if (rem > 1e-6) {
      group.overshoot += rem;
      state.warnings.push(
        `sell of ${rem.toFixed(4)} shares of ${t.isin} on ${t.date} exceeds tracked holdings`,
      );
    }
  }
}

/**
 * Spreads each booked Vorabpauschale over the lots held on Dec 31 of its tax
 * year, weighting every lot by its purchase-year proration.
 */
function attributeBookedVap(state: EtfTaxState) {
  for (const a of state.actualVap) {
    const group = state.groups.get(a.isin);
    if (!group) {
      state.warnings.push(
        `booked Vorabpauschale for ${a.isin} (tax year ${a.taxYear}): no transactions found for this ISIN`,
      );
      continue;
    }
    const snap = snapshotLotsAt(state, a.isin, `${a.taxYear}-12-31`) ?? [];
    let weight = 0;
    let shares = 0;
    for (const l of snap) {
      if (l.qtyRem > EPS) {
        weight += l.qtyRem * prorationFactor(l.date, a.taxYear);
        shares += l.qtyRem;
      }
    }
    if (weight <= 0) {
      state.warnings.push(
        `booked Vorabpauschale for ${a.isin} (tax year ${a.taxYear}): no shares held on Dec 31; ignored`,
      );
      continue;
    }
    const base = a.total / weight;
    snap.forEach((l, i) => {
      if (l.qtyRem > EPS) {
        group.lots[i].vap += base * prorationFactor(l.date, a.taxYear);
      }
    });
    group.vapSources.push(
      `tax year ${a.taxYear} (booked ${a.date}): €${a.total.toFixed(2)} on ${shares.toFixed(4)} shares → base €${base.toFixed(4)}/share`,
    );
  }
}

/** Splits a sale of qty shares over the oldest open lots. */
function fifoAlloc(
  group: Group,
  qty: number,
): Array<{ lot: Lot; take: number }> {
  const out: Array<{ lot: Lot; take: number }> = [];
  let remaining = qty;
  for (const lot of group.lots) {
    if (remaining <= EPS) {
      break;
    }
    const take = Math.min(lot.qtyRem, remaining);
    if (take > EPS) {
      out.push({ lot, take });
      remaining -= take;
    }
  }
  return out;
}

/** The taxable gain (after Teilfreistellung tf) of selling qty shares FIFO at price. */
export function taxableGain(
  group: Group,
  qty: number,
  price: number,
  tf: number,
): number {
  const gain = fifoAlloc(group, qty).reduce(
    (sum, { lot, take }) => sum + take * (price - (lot.price + lot.vap)),
    0,
  );
  return gain * (1 - tf);
}

/**
 * The largest FIFO sale whose taxable gain stays within the Freibetrag.
 * FIFO cannot skip a lot, so a lot without gain is always sold and a loss
 * enlarges the remaining allowance; the walk ends at the first lot that is only
 * partly sellable or once the allowance is used up.
 */
export function maxTaxFreeQty(
  group: Group,
  price: number,
  tf: number,
  freibetrag: number,
): MaxResult {
  let allowance = freibetrag;
  let total = 0;
  let available = 0;
  for (const lot of group.lots) {
    available += lot.qtyRem;
    if (lot.qtyRem <= EPS) {
      continue;
    }
    const perShare = (price - (lot.price + lot.vap)) * (1 - tf);
    if (perShare <= EPS) {
      total += lot.qtyRem;
      allowance -= lot.qtyRem * perShare;
      continue;
    }
    if (allowance <= EPS) {
      break;
    }
    const q = Math.min(lot.qtyRem, allowance / perShare);
    total += q;
    allowance -= q * perShare;
    if (q < lot.qtyRem) {
      break;
    }
  }
  if (total >= available - 1e-6) {
    return { qty: Math.floor(available * 10000) / 10000, exhaustedAll: true };
  }
  return { qty: Math.floor(total * 10000) / 10000, exhaustedAll: false };
}

/**
 * The first non-weekend day on/after Jan 2 of year: the day the bank books
 * the Vorabpauschale for tax year year − 1.
 */
export function settlementDate(year: number): string {
  const d = new Date(Date.UTC(year, 0, 2));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Every settled tax year (first purchase year … last year) whose
 * Vorabpauschale still matters: a Vorabpauschale can arise (positive
 * Basiszins) and some of the shares held at that year-end are still held.
 * An open lot bought by Dec 31 was necessarily held then. Years whose shares
 * are all sold are left out; their Vorabpauschale was settled with the sale.
 */
export function vapYearsOf(
  state: EtfTaxState,
  today: string,
  basiszinsOverrides: BasiszinsOverrides = {},
): MissingVapJob[] {
  const todayYear = yearOf(today);
  const jobs: MissingVapJob[] = [];
  for (const isin of isinsOf(state)) {
    const group = state.groups.get(isin);
    const first = yearOf(group?.firstSeen ?? '');
    if (!group || first === 0) {
      continue;
    }
    const openLots = group.lots.filter(l => l.qtyRem > EPS);
    for (let y = first; y <= todayYear - 1; y++) {
      const settle = settlementDate(y + 1);
      if (settle > today) {
        continue;
      }
      if (basiszinsFor(y, basiszinsOverrides).rate <= 0) {
        continue;
      }
      if (!openLots.some(l => l.date <= `${y}-12-31`)) {
        continue;
      }
      jobs.push({ isin, taxYear: y, settle });
    }
  }
  return jobs;
}

/** The years of vapYearsOf for which nothing has been booked yet. */
export function missingVap(
  state: EtfTaxState,
  today: string,
  basiszinsOverrides: BasiszinsOverrides = {},
): MissingVapJob[] {
  return vapYearsOf(state, today, basiszinsOverrides).filter(
    job => !hasActualVap(state, job.isin, job.taxYear),
  );
}

export type VapAmount = { total: number; tax: number };

export type VapProjection = {
  taxYear: number;
  basiszins: number;
  /** False when the year's Basiszins isn't published yet and the latest known rate is used. */
  basiszinsKnown: boolean;
  /** Basiszins × 0.7 × start-of-year price per share, uncapped. */
  upperPerShare: number;
  upper: VapAmount;
  /** Per share capped at the gain so far (current price − start price); null without a current price. */
  atPricePerShare: number | null;
  atPrice: VapAmount | null;
};

/**
 * The Vorabpauschale expected to be booked next January for the shares held
 * now, before any remaining Freibetrag. Distributions are ignored
 * (accumulating ETFs); lots bought in the tax year are prorated. The upper bound
 * is the Basisertrag; the estimate also applies the legal cap at the year's
 * gain, using the current price as the year-end price.
 */
export function projectVap({
  lots,
  taxYear,
  startPrice,
  price,
  taxRate,
  basiszinsOverrides = {},
}: {
  lots: ReadonlyArray<{ date: string; qtyRem: number }>;
  taxYear: number;
  startPrice: number;
  price: number | null;
  taxRate: number;
  basiszinsOverrides?: BasiszinsOverrides;
}): VapProjection {
  const { rate: basiszins, known: basiszinsKnown } = basiszinsFor(
    taxYear,
    basiszinsOverrides,
  );
  const upperPerShare =
    Math.max(0, basiszins) * BASISERTRAG_FACTOR * startPrice;
  const atPricePerShare =
    price === null
      ? null
      : Math.min(upperPerShare, Math.max(0, price - startPrice));

  // Shares weighted by the part of the tax year they were held.
  const weightedShares = lots.reduce(
    (sum, l) => sum + l.qtyRem * prorationFactor(l.date, taxYear),
    0,
  );
  const amount = (perShare: number): VapAmount => {
    const total = weightedShares * perShare;
    return { total, tax: total * (1 - TEILFREISTELLUNG_EQUITY) * taxRate };
  };

  return {
    taxYear,
    basiszins,
    basiszinsKnown,
    upperPerShare,
    upper: amount(upperPerShare),
    atPricePerShare,
    atPrice: atPricePerShare === null ? null : amount(atPricePerShare),
  };
}
