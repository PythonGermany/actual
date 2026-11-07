import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import type { VapProjection } from './etftax';
import type { EtfTaxOpenLot } from './etftax-positions';
import { formatShares } from './etftaxStyles';

type EtfTaxLotsTableProps = {
  lots: EtfTaxOpenLot[];
  /** Current price, or null when none is entered. */
  price: number | null;
  /** Expected Vorabpauschale of the position; null without a start-of-year price. */
  projection: VapProjection | null;
  money: (value: number) => string;
};

const COLUMNS = [
  { width: 100, align: 'left' },
  { width: 80, align: 'left' },
  { width: 90, align: 'right' },
  { width: 100, align: 'right' },
  { width: 100, align: 'right' },
  { width: 110, align: 'right' },
  { width: 110, align: 'right' },
  { width: 80, align: 'right' },
  { width: 80, align: 'right' },
  { width: 110, align: 'right' },
] as const;

/** Columns coloured by the sign of the profit. */
const PROFIT_COLUMNS = new Set([6, 7]);

/**
 * The open FIFO lots of one position, valued at the current price (profit
 * from buy prices only). A row per lot on wide screens, a small block of
 * labelled values per lot on narrow ones.
 */
export function EtfTaxLotsTable({
  lots,
  price,
  projection,
  money,
}: EtfTaxLotsTableProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const vapPerShare =
    projection === null
      ? null
      : (projection.atPricePerShare ?? projection.upperPerShare);
  const headings = [
    t('Buy date'),
    t('Status'),
    t('Shares'),
    t('Buy price'),
    t('VAP/share'),
    t('Value'),
    t('Profit'),
    t('Profit %'),
    t('Counts'),
    projection === null
      ? t('VAP next Jan')
      : t('VAP Jan {{year}}', { year: projection.taxYear + 1 }),
  ];

  const rows = lots.map(lot => {
    const cost = lot.qtyRem * lot.price;
    const value = price === null ? null : lot.qtyRem * price;
    const profit = value === null ? null : value - cost;
    const cells = [
      lot.date,
      lot.qtyRem < lot.qtyOrig - 1e-9 ? t('partial') : t('open'),
      formatShares(lot.qtyRem),
      money(lot.price),
      money(lot.vap),
      value === null ? '–' : money(value),
      profit === null ? '–' : money(profit),
      profit === null || cost <= 1e-9
        ? '–'
        : `${((profit / cost) * 100).toFixed(2)}%`,
      // Share of the tax year the lot counts for, in months.
      `${Math.round(lot.prorated * 12)}/12`,
      vapPerShare === null
        ? '–'
        : `~${money(lot.qtyRem * lot.prorated * vapPerShare)}`,
    ];
    return { key: lot.date + lot.qtyOrig, cells, profit };
  });

  const profitColor = (i: number, profit: number | null) =>
    PROFIT_COLUMNS.has(i) && profit !== null
      ? profit >= 0
        ? theme.reportsNumberPositive
        : theme.reportsNumberNegative
      : undefined;

  // Dates and status are plain text; everything else is a number.
  const cellContent = (cell: string, i: number) =>
    i === 0 || i === 1 ? (
      cell
    ) : (
      <PrivacyFilter>
        <FinancialText as="span">{cell}</FinancialText>
      </PrivacyFilter>
    );

  return (
    <View
      style={{
        marginLeft: isNarrowWidth ? 4 : 20,
        marginBottom: 10,
        padding: '4px 0 4px 14px',
        borderLeft: `2px solid ${theme.tableBorder}`,
        gap: 4,
      }}
    >
      {isNarrowWidth ? (
        rows.map(({ key, cells, profit }) => (
          <View
            key={key}
            style={{
              paddingBottom: 6,
              borderBottom: `1px solid ${theme.tableBorder}`,
            }}
          >
            <Text style={{ fontWeight: 600, fontSize: 13 }}>
              {`${cells[0]} · ${cells[1]}`}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {cells.slice(2).map((cell, offset) => {
                const i = offset + 2;
                return (
                  <View key={i} style={{ width: '50%', paddingTop: 4 }}>
                    <Text style={{ ...GROUP_HEADING_STYLE, fontSize: 11 }}>
                      {headings[i]}
                    </Text>
                    <Text style={{ color: profitColor(i, profit) }}>
                      {cellContent(cell, i)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {headings.map((heading, i) => (
              <Text
                key={heading}
                style={{
                  ...GROUP_HEADING_STYLE,
                  fontSize: 11,
                  width: COLUMNS[i].width,
                  textAlign: COLUMNS[i].align,
                }}
              >
                {heading}
              </Text>
            ))}
          </View>
          {rows.map(({ key, cells, profit }) => (
            <View key={key} style={{ flexDirection: 'row', gap: 10 }}>
              {cells.map((cell, i) => (
                <Text
                  key={i}
                  style={{
                    width: COLUMNS[i].width,
                    textAlign: COLUMNS[i].align,
                    color: profitColor(i, profit),
                  }}
                >
                  {cellContent(cell, i)}
                </Text>
              ))}
            </View>
          ))}
        </>
      )}
      <Text
        style={{ color: theme.pageTextSubdued, fontSize: 11, marginTop: 4 }}
      >
        <Trans>
          Profit uses the buy price only; the Vorabpauschale raises the tax
          basis, not the profit shown here. Lots bought this year count for the
          months from their purchase month on.
        </Trans>
      </Text>
    </View>
  );
}
