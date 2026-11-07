// Settings that only hold for one tax year. Reading them for another year gives
// the defaults, so a new year starts with empty start-of-year prices, the full
// Freibetrag and the built-in Basiszins.
import type { EtfTaxWidget } from '@actual-app/core/types/models';

import { DEFAULT_FREIBETRAG } from './etftax-positions';

type EtfTaxMeta = EtfTaxWidget['meta'];

export type YearlySettings = {
  freibetrag: number;
  /** Price per ISIN on the first trading day of the year. */
  startPrices: Record<string, number>;
  /** User-entered Basiszins for the year; null uses the built-in table. */
  basiszinsOverride: number | null;
};

/** The settings for one tax year, falling back to the defaults. */
export function readYearlySettings(
  meta: EtfTaxMeta,
  year: number,
): YearlySettings {
  return {
    freibetrag:
      meta?.freibetragYear === year
        ? (meta.freibetrag ?? DEFAULT_FREIBETRAG)
        : DEFAULT_FREIBETRAG,
    startPrices: meta?.startPricesByYear?.[String(year)] ?? {},
    basiszinsOverride: meta?.basiszinsByYear?.[String(year)] ?? null,
  };
}

/**
 * The meta fields that store the settings for a tax year. Start prices and
 * Basiszins overrides of other years are kept: the estimate of an already
 * booked Vorabpauschale and settled years still use them.
 */
export function writeYearlySettings(
  meta: EtfTaxMeta,
  year: number,
  settings: YearlySettings,
): Partial<NonNullable<EtfTaxMeta>> {
  const key = String(year);
  const { [key]: _previous, ...otherOverrides } = meta?.basiszinsByYear ?? {};
  return {
    freibetrag: settings.freibetrag,
    freibetragYear: year,
    startPricesByYear: {
      ...meta?.startPricesByYear,
      [key]: settings.startPrices,
    },
    basiszinsByYear:
      settings.basiszinsOverride === null
        ? otherOverrides
        : { ...otherOverrides, [key]: settings.basiszinsOverride },
  };
}

/** The saved start-of-year prices of every year (year → ISIN → price). */
export function startPricesByYearOf(
  meta: EtfTaxMeta,
): Record<string, Record<string, number>> {
  return meta?.startPricesByYear ?? {};
}

/** All Basiszins overrides by tax year, for the calculation. */
export function basiszinsOverridesOf(meta: EtfTaxMeta): Record<number, number> {
  return Object.fromEntries(
    Object.entries(meta?.basiszinsByYear ?? {}).map(([year, rate]) => [
      Number(year),
      rate,
    ]),
  );
}
