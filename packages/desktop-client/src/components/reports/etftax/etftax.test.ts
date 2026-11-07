import { describe, expect, it } from 'vitest';

import {
  basiszinsFor,
  buildState,
  compileNotePatterns,
  DEFAULT_NOTE_PATTERNS,
  DEFAULT_TAX_RATE,
  hasActualVap,
  maxTaxFreeQty,
  missingVap,
  parseNum,
  projectVap,
  prorationFactor,
  settlementDate,
  snapshotLotsAt,
  splitByDepot,
  taxableGain,
  vapTotal,
} from './etftax';
import type { Group, Lot, TxnRow } from './etftax';
import { computeEtfTax, summarizePositions } from './etftax-positions';
import {
  basiszinsOverridesOf,
  readYearlySettings,
  writeYearlySettings,
} from './etftax-yearly';

function row(
  account: string,
  date: string,
  notes: string,
  amount: number,
): TxnRow {
  return { account, date, notes, amount, isSplitChild: false };
}

function lot(qty: number, price: number, vap = 0): Lot {
  return {
    date: '',
    qtyOrig: qty,
    qtyRem: qty,
    price,
    vap,
    sales: [],
  };
}

function group(lots: Lot[]): Group {
  return {
    isin: '',
    lots,
    soldQty: 0,
    overshoot: 0,
    firstSeen: '',
    vapSources: [],
  };
}

const BASE_OPTIONS = {
  accounts: ['Depot'],
  freibetrag: 1000,
  prices: {},
  startPrices: {},
  taxRate: DEFAULT_TAX_RATE,
  patterns: DEFAULT_NOTE_PATTERNS,
  today: '2026-03-01',
};

// A depot with two buys and one sell.
function sampleRows(): TxnRow[] {
  return [
    row('Depot', '2025-03-10', '10x #IE00EXAMPLE1', 1250),
    row('Depot', '2025-08-01', '5x #IE00EXAMPLE1', 650),
    row('Depot', '2026-02-03', '12x #IE00EXAMPLE1', -1800),
    row('Other', '2026-02-03', 'ignored', 5),
  ];
}

describe('ledger', () => {
  it('records FIFO sales per lot', () => {
    const g = buildState(sampleRows(), 'Depot').groups.get('IE00EXAMPLE1');
    expect(g?.lots).toHaveLength(2);
    const [l0, l1] = g!.lots;
    expect(l0.qtyRem).toBe(0);
    expect(l0.sales).toHaveLength(1);
    expect(l0.sales[0].qty).toBe(10);
    expect(l1.qtyRem).toBeCloseTo(3, 9);
    expect(l1.sales).toHaveLength(1);
    expect(l1.sales[0].qty).toBe(2);
    expect(l1.sales[0].proceedsPerShare).toBeCloseTo(150, 9);
  });

  it('does not record sales in a snapshot', () => {
    const state = buildState(sampleRows(), 'Depot');
    const lots = snapshotLotsAt(state, 'IE00EXAMPLE1', '2025-12-31');
    expect(lots).toHaveLength(2);
    expect(lots![0].qtyRem).toBe(10);
    expect(lots![0].sales).toHaveLength(0);
  });

  it('parses German and English numbers', () => {
    const cases: Record<string, number> = {
      '1.234,56': 1234.56,
      '1,234.56': 1234.56,
      '3,5': 3.5,
      '7': 7,
    };
    for (const [input, want] of Object.entries(cases)) {
      expect(parseNum(input)).toBe(want);
    }
  });

  // weights 10*(10/12) + 5*(5/12) = 125/12, base = 18/(125/12).
  it('attributes the Vorabpauschale per lot', () => {
    const g = buildState(sampleRows(), 'Depot', DEFAULT_NOTE_PATTERNS, {
      '2025': { IE00EXAMPLE1: 18 },
    }).groups.get('IE00EXAMPLE1')!;
    expect(g.lots).toHaveLength(2);
    expect(g.lots[0].qtyOrig).toBe(10);
    const base = 18 / (125 / 12);
    expect(g.lots[0].vap).toBeCloseTo((base * 10) / 12, 9);
    expect(g.lots[1].vap).toBeCloseTo((base * 5) / 12, 9);
    expect(vapTotal(g)).toBeCloseTo((3 * base * 5) / 12, 9);
  });

  // lot 0 is sold out in 2024, lot 3 is bought after the tax year,
  // so the 5 EUR booked go entirely to the 5 shares of lot 1.
  it('skips lots sold before year end and later lots', () => {
    const rows = [
      row('Depot', '2023-01-10', '5x #DE00EXAMPLE2', 500),
      row('Depot', '2024-03-01', '5x #DE00EXAMPLE2', -600),
      row('Depot', '2024-06-01', '5x #DE00EXAMPLE2', 600),
      row('Depot', '2025-02-01', '5x #DE00EXAMPLE2', 700),
    ];
    const g = buildState(rows, 'Depot', DEFAULT_NOTE_PATTERNS, {
      '2024': { DE00EXAMPLE2: 5 },
    }).groups.get('DE00EXAMPLE2')!;
    expect(g.lots[0].vap).toBe(0);
    expect(g.lots[2].vap).toBe(0);
    expect(g.lots[1].vap).toBeCloseTo(1, 9);
  });

  it('prorates purchase-year lots', () => {
    expect(prorationFactor('2025-01-15', 2025)).toBeCloseTo(1, 9);
    expect(prorationFactor('2025-12-01', 2025)).toBeCloseTo(1 / 12, 9);
    expect(prorationFactor('2024-12-31', 2025)).toBeCloseTo(1, 9);
  });

  it('books an entered Vorabpauschale on the settlement date', () => {
    const state = buildState(sampleRows(), 'Depot', DEFAULT_NOTE_PATTERNS, {
      '2025': { ie00example1: 10.4167 },
      // Invalid entries are skipped.
      '2024': { IE00EXAMPLE1: Number.NaN },
      x: { IE00EXAMPLE1: 1 },
    });
    expect(hasActualVap(state, 'IE00EXAMPLE1', 2025)).toBe(true);
    expect(state.actualVap).toEqual([
      {
        isin: 'IE00EXAMPLE1',
        date: '2026-01-02',
        taxYear: 2025,
        total: 10.4167,
      },
    ]);
    const g = state.groups.get('IE00EXAMPLE1')!;
    expect(g.lots[0].vap).toBeCloseTo(10 / 12, 3);
    expect(g.lots[1].vap).toBeCloseTo(5 / 12, 3);
  });

  it('warns on split depot transactions', () => {
    const state = buildState(
      [
        {
          ...row('Depot', '2025-01-02', '1x #IE00EXAMPLE1', 100),
          isSplitChild: true,
        },
      ],
      'Depot',
    );
    expect(state.groups.size).toBe(0);
    expect(state.warnings).toHaveLength(1);
  });
});

describe('computeEtfTax', () => {
  it('reports open lots and the max tax-free sale per position', () => {
    const data = computeEtfTax(sampleRows(), {
      ...BASE_OPTIONS,
      freibetrag: 1000,
      prices: { IE00EXAMPLE1: 150 },
    });
    expect(data.positions).toHaveLength(1);
    const [position] = data.positions;
    // Lot 0 is sold out by the 12-share sale; lot 1 keeps 3 of 5.
    expect(position.lots).toHaveLength(1);
    expect(position.lots[0]).toMatchObject({
      date: '2025-08-01',
      qtyOrig: 5,
      price: 130,
    });
    expect(position.lots[0].qtyRem).toBeCloseTo(3, 9);
    expect(position.held).toBeCloseTo(3, 9);
    // 3 x (150 - 130) x 0.7 = 42 taxable, well within the Freibetrag.
    expect(position.max).toEqual({ qty: 3, exhaustedAll: true });
  });
});

describe('projectVap', () => {
  // 2026 Basiszins 3.2% × 0.7 × start price 100 = 2.24 per share. The lot from
  // March 2026 counts for 10/12 of the year.
  const lots = [
    { date: '2025-05-02', qtyRem: 10 },
    { date: '2026-03-16', qtyRem: 5 },
  ];
  const weighted = 10 + (5 * 10) / 12;

  it('computes the uncapped upper bound and its tax', () => {
    const p = projectVap({
      lots,
      taxYear: 2026,
      startPrice: 100,
      price: null,
      taxRate: DEFAULT_TAX_RATE,
    });
    expect(p.basiszins).toBe(0.032);
    expect(p.basiszinsKnown).toBe(true);
    expect(p.upperPerShare).toBeCloseTo(2.24, 9);
    expect(p.upper.total).toBeCloseTo(weighted * 2.24, 9);
    expect(p.upper.tax).toBeCloseTo(weighted * 2.24 * 0.7 * 0.26375, 9);
    expect(p.atPrice).toBeNull();
  });

  it('caps the estimate at the gain so far', () => {
    const at = (price: number) =>
      projectVap({ lots, taxYear: 2026, startPrice: 100, price, taxRate: 0.3 });
    // Gain of 1 per share is below the 2.24 Basisertrag.
    expect(at(101).atPricePerShare).toBeCloseTo(1, 9);
    expect(at(101).atPrice?.total).toBeCloseTo(weighted, 9);
    // A strong year is capped by the Basisertrag, a loss gives nothing.
    expect(at(150).atPricePerShare).toBeCloseTo(2.24, 9);
    expect(at(95).atPrice).toEqual({ total: 0, tax: 0 });
  });

  it('gives nothing in a year with a negative Basiszins', () => {
    const p = projectVap({
      lots,
      taxYear: 2021,
      startPrice: 100,
      price: 120,
      taxRate: DEFAULT_TAX_RATE,
    });
    expect(p.upper.total).toBe(0);
    expect(p.atPrice?.total).toBe(0);
  });

  it('is part of every position with a start price', () => {
    const data = computeEtfTax(
      [...sampleRows(), row('Depot', '2025-01-10', '4x #FR00EXAMPLE3', 400)],
      {
        ...BASE_OPTIONS,
        prices: { IE00EXAMPLE1: 150 },
        startPrices: { IE00EXAMPLE1: 140 },
      },
    );
    const [b, ie] = [...data.positions].sort((x, y) =>
      x.isin.localeCompare(y.isin),
    );
    expect(b.isin).toBe('FR00EXAMPLE3');
    expect(b.projection).toBeNull();
    // 3 shares left from August 2025 count fully: 0.032 × 0.7 × 140 = 3.136 each.
    expect(ie.projection?.upper.total).toBeCloseTo(3 * 3.136, 9);
    expect(ie.lots[0].prorated).toBe(1);
    expect(data.vapYear).toEqual({
      taxYear: 2026,
      basiszins: 0.032,
      basiszinsKnown: true,
    });
    expect(summarizePositions(data.positions)).toMatchObject({
      missingStartPriceCount: 1,
    });
  });
});

describe('booked Vorabpauschale years', () => {
  // Bought in 2024; 2024 and 2025 are settled by March 2026, 2026 is not.
  const rows = [
    row('Depot', '2024-04-02', '10x #DE00EXAMPLE2', 1000),
    row('Depot', '2024-04-02', '4x #FR00EXAMPLE3', 400),
  ];
  const data = computeEtfTax(rows, {
    ...BASE_OPTIONS,
    vapBooked: { Depot: { '2025': { DE00EXAMPLE2: 12.5, FR00EXAMPLE3: 0 } } },
    startPricesByYear: { '2024': { DE00EXAMPLE2: 100 } },
  });
  const [a, b] = data.positions;

  it('lists every settled year per position, newest first', () => {
    expect(a.vapYears.map(y => [y.taxYear, y.booked])).toEqual([
      [2025, 12.5],
      [2024, null],
    ]);
    // An entered 0 counts as booked.
    expect(b.vapYears.map(y => y.booked)).toEqual([0, null]);
    expect(data.missing.map(m => `${m.isin}/${m.taxYear}`).sort()).toEqual([
      'DE00EXAMPLE2/2024',
      'FR00EXAMPLE3/2024',
    ]);
  });

  it('estimates from the start price saved for that year', () => {
    // 0.0229 × 0.7 × 100 per share, 10 shares bought in April count 9/12.
    expect(a.vapYears[1].estimate).toBeCloseTo(
      0.0229 * 0.7 * 100 * 10 * 0.75,
      9,
    );
    expect(a.vapYears[0].estimate).toBeNull();
    expect(b.vapYears[1].estimate).toBeNull();
  });

  it('raises the Vorabpauschale on held shares', () => {
    expect(a.vapTotal).toBeCloseTo(12.5, 9);
    expect(b.vapTotal).toBe(0);
  });
});

describe('yearly settings', () => {
  const saved = writeYearlySettings(
    { basiszinsByYear: { '2025': 0.02 } },
    2026,
    {
      freibetrag: 400,
      startPrices: { IE00EXAMPLE1: 140 },
      basiszinsOverride: 0.033,
    },
  );

  it('reads back the year they were saved for', () => {
    expect(readYearlySettings(saved, 2026)).toEqual({
      freibetrag: 400,
      startPrices: { IE00EXAMPLE1: 140 },
      basiszinsOverride: 0.033,
    });
    // Overrides of other years are kept.
    expect(basiszinsOverridesOf(saved)).toEqual({ 2025: 0.02, 2026: 0.033 });
  });

  it('start the next year with the defaults', () => {
    expect(readYearlySettings(saved, 2027)).toEqual({
      freibetrag: 1000,
      startPrices: {},
      basiszinsOverride: null,
    });
  });

  it('drop a cleared override and keep start prices of other years', () => {
    const next = writeYearlySettings(saved, 2027, {
      freibetrag: 1000,
      startPrices: { IE00EXAMPLE1: 160 },
      basiszinsOverride: null,
    });
    expect(next.startPricesByYear).toEqual({
      '2026': { IE00EXAMPLE1: 140 },
      '2027': { IE00EXAMPLE1: 160 },
    });
    expect(next.basiszinsByYear).toEqual({ '2025': 0.02, '2026': 0.033 });
  });

  it('use an override over the built-in Basiszins', () => {
    expect(basiszinsFor(2026, { 2026: 0.04 })).toEqual({
      rate: 0.04,
      known: true,
    });
    expect(basiszinsFor(2027, { 2027: 0.03 })).toEqual({
      rate: 0.03,
      known: true,
    });
    const p = projectVap({
      lots: [{ date: '2025-01-02', qtyRem: 1 }],
      taxYear: 2027,
      startPrice: 100,
      price: null,
      taxRate: DEFAULT_TAX_RATE,
      basiszinsOverrides: { 2027: 0.03 },
    });
    expect(p.upperPerShare).toBeCloseTo(2.1, 9);
  });
});

describe('summarizePositions', () => {
  it('sums priced positions and counts the unpriced ones', () => {
    const rows = [
      ...sampleRows(),
      row('Depot', '2025-01-10', '10x #DE00EXAMPLE2', 1000),
      row('Depot', '2025-01-10', '4x #FR00EXAMPLE3', 400),
    ];
    // IE…: 3 shares, all tax-free at 150. A: 10 shares bought at 100, at 200 each
    // share is 70 taxable, so a 100 allowance covers only part. B has no price.
    const data = computeEtfTax(rows, {
      ...BASE_OPTIONS,
      freibetrag: 100,
      prices: { IE00EXAMPLE1: 150, DE00EXAMPLE2: 200 },
    });
    const summary = summarizePositions(data.positions);
    expect(summary).toMatchObject({
      positionCount: 3,
      unpricedCount: 1,
      fullyTaxFreeCount: 1,
      partlyTaxFreeCount: 1,
    });
    expect(summary.marketValue).toBeCloseTo(3 * 150 + 10 * 200, 6);
    expect(summary.taxableIfSoldAll).toBeCloseTo(
      3 * 20 * 0.7 + 10 * 100 * 0.7,
      6,
    );
  });
});

describe('default note patterns', () => {
  it('match "<number>x #ISIN" trades only', () => {
    const trade = (notes: string) =>
      DEFAULT_NOTE_PATTERNS.trade.exec(notes)?.groups;
    expect(trade('10x #IE00EXAMPLE1')).toMatchObject({
      qty: '10',
      isin: 'IE00EXAMPLE1',
    });
    expect(trade('2,5x #ie00example1 monthly plan')).toMatchObject({
      qty: '2,5',
      isin: 'ie00example1',
    });
    expect(trade('buy 10x #IE00EXAMPLE1')).toBeUndefined();
    expect(trade('10 #IE00EXAMPLE1')).toBeUndefined();
  });
});

describe('note patterns', () => {
  it('falls back to the default for empty input', () => {
    expect(compileNotePatterns({})).toEqual({
      patterns: DEFAULT_NOTE_PATTERNS,
    });
    expect(compileNotePatterns({ trade: '  ' })).toEqual({
      patterns: DEFAULT_NOTE_PATTERNS,
    });
  });

  it('rejects invalid syntax and missing named groups', () => {
    expect(compileNotePatterns({ trade: '(?<qty>\\d+' })).toHaveProperty(
      'error',
    );
    const missing = compileNotePatterns({ trade: '(?<qty>\\d+) Stk' });
    expect('error' in missing && missing.error).toContain('isin');
  });

  it('builds the same state from a custom note format', () => {
    const compiled = compileNotePatterns({
      trade:
        '^(?<kind>Kauf|Verkauf) (?<qty>[\\d.,]+) Stk (?<isin>[A-Z]{2}[A-Z0-9]{9}\\d)',
    });
    if (!('patterns' in compiled)) {
      throw new Error(compiled.error);
    }
    const custom = [
      row('Depot', '2025-03-10', 'Kauf 10 Stk IE00EXAMPLE1', 1250),
      row('Depot', '2025-08-01', 'Kauf 5 Stk IE00EXAMPLE1', 650),
      row('Depot', '2026-02-03', 'Verkauf 12 Stk IE00EXAMPLE1', -1800),
    ];
    const a = buildState(custom, 'Depot', compiled.patterns);
    const b = buildState(sampleRows(), 'Depot');
    expect(a.groups).toEqual(b.groups);
    expect(a.warnings).toEqual([]);
    // Default-format notes no longer match once the pattern changes.
    expect(
      buildState(sampleRows(), 'Depot', compiled.patterns).groups.size,
    ).toBe(0);
  });
});

describe('splitByDepot', () => {
  it('keeps FIFO separate per depot and drops other accounts', () => {
    const rowsByDepot = splitByDepot(
      [
        row('d1', '2024-02-01', '10x #DE00EXAMPLE2', 1000),
        row('d2', '2024-02-01', '5x #FR00EXAMPLE3', 500),
        row('d2', '2024-03-01', '5x #DE00EXAMPLE2', 500),
        row('cash', '2025-01-02', 'groceries', -50),
      ],
      ['d1', 'd2'],
    );
    expect([...rowsByDepot.keys()]).toEqual(['d1', 'd2']);
    const d1 = buildState(rowsByDepot.get('d1')!, 'd1');
    const d2 = buildState(rowsByDepot.get('d2')!, 'd2');
    expect(d1.groups.get('DE00EXAMPLE2')?.lots).toHaveLength(1);
    expect(d2.groups.get('DE00EXAMPLE2')?.lots).toHaveLength(1);
    expect(d1.groups.has('FR00EXAMPLE3')).toBe(false);
    expect(d1.warnings).toEqual([]);
  });
});

describe('tax', () => {
  // Jan 2 2027 is a Saturday, so booking moves to Monday Jan 4.
  it('moves the settlement date past weekends', () => {
    expect(settlementDate(2027)).toBe('2027-01-04');
  });

  // 20 gain x 0.7 = 14 taxable per share, so a 70 allowance covers 5 shares.
  it('computes the max tax-free quantity', () => {
    const g = group([lot(10, 100)]);
    expect(maxTaxFreeQty(g, 120, 0.3, 70)).toEqual({
      qty: 5,
      exhaustedAll: false,
    });
    expect(taxableGain(g, 5, 120, 0.3)).toBeCloseTo(70, 6);
    expect(maxTaxFreeQty(g, 120, 0.3, 1000)).toEqual({
      qty: 10,
      exhaustedAll: true,
    });
  });

  // A is sold out, so none of its years matter. B lacks 2024 but has 2025
  // booked as 0. C's 2023 lot is sold, so only years of its 2024 lot remain.
  // 2026 is not settled yet.
  it('lists missing Vorabpauschale bookings for shares still held', () => {
    const state = buildState(
      [
        row('Depot', '2023-05-02', '10x #DE00EXAMPLE2', 1000),
        row('Depot', '2024-06-03', '10x #DE00EXAMPLE2', -1100),
        row('Depot', '2024-02-01', '5x #FR00EXAMPLE3', 500),
        row('Depot', '2023-03-01', '5x #GB00EXAMPLE4', 500),
        row('Depot', '2024-03-01', '5x #GB00EXAMPLE4', 500),
        row('Depot', '2025-03-01', '5x #GB00EXAMPLE4', -600),
      ],
      'Depot',
      DEFAULT_NOTE_PATTERNS,
      { '2025': { FR00EXAMPLE3: 0 } },
    );
    const got = missingVap(state, '2026-03-01').map(
      j => `${j.isin}/${j.taxYear}`,
    );
    expect(got.sort()).toEqual([
      'FR00EXAMPLE3/2024',
      'GB00EXAMPLE4/2024',
      'GB00EXAMPLE4/2025',
    ]);
  });

  // 2021 and 2022 had a negative Basiszins.
  it('skips years with a negative Basiszins', () => {
    const state = buildState(
      [row('Depot', '2021-05-02', '10x #DE00EXAMPLE2', 1000)],
      'Depot',
    );
    for (const job of missingVap(state, '2023-06-01')) {
      expect(job.taxYear).toBeGreaterThanOrEqual(2023);
    }
  });

  // lot 0 gains 10/share and lot 1 gains 20/share, so 50 covers 5 shares of lot 0.
  it('uses the per-lot Vorabpauschale', () => {
    const g = group([lot(10, 100, 10), lot(10, 100)]);
    expect(maxTaxFreeQty(g, 120, 0, 50).qty).toBeCloseTo(5, 6);
    expect(taxableGain(g, 12, 120, 0)).toBeCloseTo(10 * 10 + 2 * 20, 6);
  });

  it('knows the Basiszins table', () => {
    const want: Record<number, number> = {
      2018: 0.0087,
      2021: -0.0045,
      2023: 0.0255,
      2025: 0.0253,
      2026: 0.032,
    };
    for (const [year, rate] of Object.entries(want)) {
      expect(basiszinsFor(Number(year))).toEqual({ rate, known: true });
    }
    // An unknown year falls back to the latest rate, flagged.
    expect(basiszinsFor(2028)).toEqual({ rate: 0.032, known: false });
  });
});
