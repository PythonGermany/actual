// Pure evaluation of the ledger for the widget and report (no app imports, so it is unit-testable on its own).
import {
  basiszinsFor,
  buildState,
  isinsOf,
  maxTaxFreeQty,
  missingVap,
  projectVap,
  prorationFactor,
  snapshotLotsAt,
  splitByDepot,
  taxableGain,
  TEILFREISTELLUNG_EQUITY,
  vapTotal,
  vapYearsOf,
  yearOf,
} from './etftax';
import type {
  BasiszinsOverrides,
  BookedVap,
  MaxResult,
  MissingVapJob,
  NotePatterns,
  TxnRow,
  VapProjection,
} from './etftax';

export const DEFAULT_FREIBETRAG = 1000;

/** An open FIFO lot (fully sold lots are left out). */
export type EtfTaxOpenLot = {
  date: string;
  qtyOrig: number;
  qtyRem: number;
  /** Buy price per share. */
  price: number;
  /** Booked Vorabpauschale per share attributed to the lot. */
  vap: number;
  /** Share of the current tax year the lot counts for the expected Vorabpauschale. */
  prorated: number;
};

export type EtfTaxPosition = {
  depotId: string;
  isin: string;
  held: number;
  invested: number;
  vapTotal: number;
  price: number | null;
  /** Price on the first trading day of the year; null when not entered. */
  startPrice: number | null;
  /** Taxable gain if the whole position were sold; null without a price. */
  taxableIfSoldAll: number | null;
  max: MaxResult | null;
  /** Freibetrag used by the max sale; null without a price or when the whole position sells. */
  consumed: number | null;
  /** Expected Vorabpauschale next January; null without a start-of-year price. */
  projection: VapProjection | null;
  lots: EtfTaxOpenLot[];
  /** The settled tax years a Vorabpauschale booking is expected for, newest first. */
  vapYears: EtfTaxVapYear[];
};

export type EtfTaxVapYear = {
  taxYear: number;
  /** The day the bank books it (in January of the next year). */
  settle: string;
  /** The entered amount; null when nothing has been entered yet. */
  booked: number | null;
  /** Uncapped upper bound from that year's saved start price; null without one. */
  estimate: number | null;
};

export type EtfTaxData = {
  positions: EtfTaxPosition[];
  missing: Array<MissingVapJob & { depotId: string }>;
  warnings: string[];
  /** The tax year whose Vorabpauschale is projected (booked next January). */
  vapYear: { taxYear: number; basiszins: number; basiszinsKnown: boolean };
  /** Set when a configured note pattern does not compile; nothing else is computed then. */
  patternError?: string;
};

export type EtfTaxSummary = {
  positionCount: number;
  /** Positions without an entered price; they are left out of the sums. */
  unpricedCount: number;
  /** Σ shares × price over priced positions. */
  marketValue: number;
  /** Σ taxable gain if every priced position were sold. */
  taxableIfSoldAll: number;
  /** Σ booked Vorabpauschale on held shares (all positions). */
  vapTotal: number;
  /** Priced positions that sell completely within the Freibetrag. */
  fullyTaxFreeCount: number;
  /** Priced positions of which only part sells within the Freibetrag. */
  partlyTaxFreeCount: number;
  /** Positions without a start-of-year price; left out of the projection. */
  missingStartPriceCount: number;
  /** Σ expected Vorabpauschale at the current price (upper bound where no current price is set). */
  projectedVap: number;
  projectedTax: number;
  /** Σ uncapped upper bound. */
  projectedVapUpper: number;
  projectedTaxUpper: number;
};

/** Totals for the headline stats of the report. */
export function summarizePositions(positions: EtfTaxPosition[]): EtfTaxSummary {
  const summary: EtfTaxSummary = {
    positionCount: positions.length,
    unpricedCount: 0,
    marketValue: 0,
    taxableIfSoldAll: 0,
    vapTotal: 0,
    fullyTaxFreeCount: 0,
    partlyTaxFreeCount: 0,
    missingStartPriceCount: 0,
    projectedVap: 0,
    projectedTax: 0,
    projectedVapUpper: 0,
    projectedTaxUpper: 0,
  };
  for (const p of positions) {
    summary.vapTotal += p.vapTotal;
    if (p.projection === null) {
      summary.missingStartPriceCount++;
    } else {
      const estimate = p.projection.atPrice ?? p.projection.upper;
      summary.projectedVap += estimate.total;
      summary.projectedTax += estimate.tax;
      summary.projectedVapUpper += p.projection.upper.total;
      summary.projectedTaxUpper += p.projection.upper.tax;
    }
    if (p.price === null || p.max === null) {
      summary.unpricedCount++;
      continue;
    }
    summary.marketValue += p.held * p.price;
    summary.taxableIfSoldAll += p.taxableIfSoldAll ?? 0;
    if (p.max.exhaustedAll) {
      summary.fullyTaxFreeCount++;
    } else if (p.max.qty > 0) {
      summary.partlyTaxFreeCount++;
    }
  }
  return summary;
}

export type ComputeEtfTaxOptions = {
  accounts: string[];
  freibetrag: number;
  /** Current price per ISIN. */
  prices: Record<string, number>;
  /** Price on the first trading day of the year per ISIN. */
  startPrices: Record<string, number>;
  taxRate: number;
  patterns: NotePatterns;
  /** YYYY-MM-DD; its year is the projected tax year. */
  today: string;
  /** User-entered Basiszins per tax year, over the built-in table. */
  basiszinsOverrides?: BasiszinsOverrides;
  /** Entered Vorabpauschale per depot id. */
  vapBooked?: Readonly<Record<string, BookedVap>>;
  /** Saved start-of-year prices of past years (year → ISIN → price), for estimates. */
  startPricesByYear?: Readonly<Record<string, Record<string, number>>>;
};

/** Runs the ledger per depot and evaluates every position at its entered prices. */
export function computeEtfTax(
  rows: TxnRow[],
  {
    accounts,
    freibetrag,
    prices,
    startPrices,
    taxRate,
    patterns,
    today,
    basiszinsOverrides = {},
    vapBooked = {},
    startPricesByYear = {},
  }: ComputeEtfTaxOptions,
): EtfTaxData {
  const taxYear = yearOf(today);
  const { rate: basiszins, known: basiszinsKnown } = basiszinsFor(
    taxYear,
    basiszinsOverrides,
  );
  const rowsByDepot = splitByDepot(rows, accounts);
  const result: EtfTaxData = {
    positions: [],
    missing: [],
    warnings: [],
    vapYear: { taxYear, basiszins, basiszinsKnown },
  };
  const tf = TEILFREISTELLUNG_EQUITY;

  for (const depotId of accounts) {
    const booked = vapBooked[depotId] ?? {};
    const state = buildState(
      rowsByDepot.get(depotId) ?? [],
      depotId,
      patterns,
      booked,
    );
    result.warnings.push(...state.warnings);
    result.missing.push(
      ...missingVap(state, today, basiszinsOverrides).map(job => ({
        ...job,
        depotId,
      })),
    );
    const vapYears = vapYearsOf(state, today, basiszinsOverrides);
    const vapYearsFor = (isin: string): EtfTaxVapYear[] =>
      vapYears
        .filter(job => job.isin === isin)
        .map(job => {
          const amount = booked[job.taxYear]?.[isin];
          const pastStart = startPricesByYear[job.taxYear]?.[isin] ?? 0;
          return {
            taxYear: job.taxYear,
            settle: job.settle,
            booked: Number.isFinite(amount) ? amount : null,
            estimate:
              pastStart > 0
                ? projectVap({
                    lots:
                      snapshotLotsAt(state, isin, `${job.taxYear}-12-31`) ?? [],
                    taxYear: job.taxYear,
                    startPrice: pastStart,
                    price: null,
                    taxRate: 0,
                    basiszinsOverrides,
                  }).upper.total
                : null,
          };
        })
        .sort((a, b) => b.taxYear - a.taxYear);

    for (const isin of isinsOf(state)) {
      const group = state.groups.get(isin);
      const lots = (group?.lots ?? []).filter(l => l.qtyRem > 1e-9);
      if (!group || lots.length === 0) {
        continue;
      }
      const held = lots.reduce((sum, l) => sum + l.qtyRem, 0);
      const invested = lots.reduce((sum, l) => sum + l.qtyRem * l.price, 0);
      const vap = vapTotal(group);
      const price = prices[isin] > 0 ? prices[isin] : null;
      const startPrice = startPrices[isin] > 0 ? startPrices[isin] : null;
      const max =
        price === null ? null : maxTaxFreeQty(group, price, tf, freibetrag);
      result.positions.push({
        depotId,
        isin,
        held,
        invested,
        vapTotal: vap,
        price,
        startPrice,
        taxableIfSoldAll:
          price === null ? null : (held * price - (invested + vap)) * (1 - tf),
        max,
        consumed:
          price === null || max === null || max.exhaustedAll
            ? null
            : taxableGain(group, max.qty, price, tf),
        projection:
          startPrice === null
            ? null
            : projectVap({
                lots,
                taxYear,
                startPrice,
                price,
                taxRate,
                basiszinsOverrides,
              }),
        lots: lots.map(l => ({
          date: l.date,
          qtyOrig: l.qtyOrig,
          qtyRem: l.qtyRem,
          price: l.price,
          vap: l.vap,
          prorated: prorationFactor(l.date, taxYear),
        })),
        vapYears: vapYearsFor(isin),
      });
    }
  }
  return result;
}
