import * as monthUtils from '@actual-app/core/shared/months';
import { q } from '@actual-app/core/shared/query';
import { integerToAmount } from '@actual-app/core/shared/util';

import { runAll } from '#components/reports/util';
import type { useSpreadsheet } from '#hooks/useSpreadsheet';

import { compileNotePatterns, DEFAULT_NOTE_PATTERNS } from './etftax';
import type { BookedVap, NotePatterns, TxnRow } from './etftax';
import { computeEtfTax } from './etftax-positions';
import type { EtfTaxData } from './etftax-positions';
import type { LivePricesConfig } from './useLivePrices';

type QueryRow = {
  date: string;
  notes: string | null;
  amount: number;
  account: string;
  is_child: boolean;
};

export type EtfTaxConfig = {
  accounts: string[];
  freibetrag: number;
  taxRate: number;
  /** User-entered Basiszins for the current tax year; null uses the built-in table. */
  basiszinsOverride: number | null;
  tradePattern?: string;
  /** Quote page URL with an {isin} placeholder; not used by the computation. */
  priceLookupUrl?: string;
  /** Live price fetching; not used by the computation, which gets the fetched prices. */
  livePrices?: LivePricesConfig;
};

export function createEtfTaxSpreadsheet({
  accounts,
  freibetrag,
  taxRate,
  prices,
  startPrices,
  basiszinsOverrides,
  tradePattern,
  vapBooked,
  startPricesByYear,
}: Omit<EtfTaxConfig, 'basiszinsOverride'> & {
  prices: Record<string, number>;
  startPrices: Record<string, number>;
  /** Basiszins overrides of all tax years. */
  basiszinsOverrides: Record<number, number>;
  /** Entered Vorabpauschale: depot id → tax year → ISIN → amount. */
  vapBooked: Record<string, BookedVap>;
  /** Saved start prices of all years, for the estimates of booked years. */
  startPricesByYear: Record<string, Record<string, number>>;
  /**
   * Not read: the query runs once per data function, so passing a new value
   * (e.g. after booking a sale) makes the caller create a new one.
   */
  reloadKey?: number;
}) {
  return async (
    _spreadsheet: ReturnType<typeof useSpreadsheet>,
    setData: (data: EtfTaxData) => void,
  ) => {
    const today = monthUtils.currentDay();
    const compiled = compileNotePatterns({ trade: tradePattern });
    const compute = (rows: TxnRow[], patterns: NotePatterns) =>
      computeEtfTax(rows, {
        accounts,
        freibetrag,
        prices,
        startPrices,
        taxRate,
        patterns,
        today,
        basiszinsOverrides,
        vapBooked,
        startPricesByYear,
      });

    if ('error' in compiled) {
      setData({
        ...compute([], DEFAULT_NOTE_PATTERNS),
        patternError: compiled.error,
      });
      return;
    }
    if (accounts.length === 0) {
      setData(compute([], compiled.patterns));
      return;
    }
    const query = q('transactions')
      .filter({ account: { $oneof: accounts } })
      .select(['date', 'notes', 'amount', 'account', 'is_child']);

    await runAll([query], ([data]: [QueryRow[]]) => {
      const rows: TxnRow[] = data.map(r => ({
        account: r.account,
        date: r.date,
        notes: r.notes ?? '',
        amount: integerToAmount(r.amount),
        isSplitChild: r.is_child,
      }));
      setData(compute(rows, compiled.patterns));
    });
  };
}
