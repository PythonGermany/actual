import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import type { EtfTaxData, EtfTaxSummary } from './etftax-positions';

type EtfTaxStatsProps = {
  summary: EtfTaxSummary;
  vapYear: EtfTaxData['vapYear'];
  freibetrag: number;
  warningCount: number;
  money: (value: number) => string;
};

const VALUE_STYLE = { ...styles.mediumText, fontWeight: 500 } as const;

/** The headline tiles and summary sentence, laid out like Monte Carlo's results. */
export function EtfTaxStats({
  summary,
  vapYear,
  freibetrag,
  warningCount,
  money,
}: EtfTaxStatsProps) {
  const { t } = useTranslation();
  const hasPrices = summary.positionCount > summary.unpricedCount;
  const hasProjection = summary.positionCount > summary.missingStartPriceCount;
  const basiszinsPercent = `${(vapYear.basiszins * 100).toFixed(2)}%`;

  const tile = (label: ReactNode, value: ReactNode) => (
    <View style={{ gap: 4 }}>
      <Text style={GROUP_HEADING_STYLE}>{label}</Text>
      {value}
    </View>
  );
  const amount = (value: number) => (
    <Text style={VALUE_STYLE}>
      <PrivacyFilter>
        <FinancialText as="span">{money(value)}</FinancialText>
      </PrivacyFilter>
    </Text>
  );
  // An estimate with its uncapped upper bound underneath.
  const estimate = (value: number, upper: number) => (
    <View>
      <Text style={VALUE_STYLE}>
        <PrivacyFilter>
          <FinancialText as="span">{`~${money(value)}`}</FinancialText>
        </PrivacyFilter>
      </Text>
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
        <PrivacyFilter>
          {t('≤ {{amount}} upper bound', { amount: money(upper) })}
        </PrivacyFilter>
      </Text>
    </View>
  );

  const sentences = [
    hasPrices &&
      t(
        'Within the {{freibetrag}} Freibetrag, {{full}} of {{priced}} priced positions can be sold completely and {{partly}} partly; each is planned against the full amount.',
        {
          freibetrag: money(freibetrag),
          full: summary.fullyTaxFreeCount,
          partly: summary.partlyTaxFreeCount,
          priced: summary.positionCount - summary.unpricedCount,
        },
      ),
    summary.unpricedCount > 0 &&
      t(
        '{{count}} positions still need a current price before a sale can be planned.',
        { count: summary.unpricedCount },
      ),
    hasProjection &&
      (vapYear.basiszinsKnown
        ? t(
            'The Vorabpauschale for {{year}}, booked in January {{next}}, uses the {{year}} Basiszins of {{rate}}: 70% of it times the start-of-year price, capped at the gain so far at the current price. The tax is before any remaining Freibetrag.',
            {
              year: vapYear.taxYear,
              next: vapYear.taxYear + 1,
              rate: basiszinsPercent,
            },
          )
        : t(
            'The {{year}} Basiszins is not published yet, so the latest known rate of {{rate}} is used for the Vorabpauschale booked in January {{next}}. The tax is before any remaining Freibetrag.',
            {
              year: vapYear.taxYear,
              next: vapYear.taxYear + 1,
              rate: basiszinsPercent,
            },
          )),
    summary.missingStartPriceCount > 0 &&
      t(
        '{{count}} positions still need a start-of-year price for the Vorabpauschale.',
        { count: summary.missingStartPriceCount },
      ),
  ].filter(Boolean);

  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        padding: 20,
        flexShrink: 0,
        gap: 15,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 40,
          rowGap: 20,
          alignItems: 'flex-start',
        }}
      >
        {tile(
          <Trans>Remaining Freibetrag</Trans>,
          <Text style={styles.veryLargeText}>
            <FinancialText as="span">{money(freibetrag)}</FinancialText>
          </Text>,
        )}
        {tile(
          <Trans>Positions</Trans>,
          <Text style={VALUE_STYLE}>
            <FinancialText as="span">
              {String(summary.positionCount)}
            </FinancialText>
          </Text>,
        )}
        {hasPrices &&
          tile(<Trans>Market value</Trans>, amount(summary.marketValue))}
        {hasPrices &&
          tile(
            <Trans>Taxable gain if all sold</Trans>,
            amount(summary.taxableIfSoldAll),
          )}
        {tile(<Trans>VAP on held shares</Trans>, amount(summary.vapTotal))}
        {hasProjection &&
          tile(
            t('Vorabpauschale Jan {{year}}', { year: vapYear.taxYear + 1 }),
            estimate(summary.projectedVap, summary.projectedVapUpper),
          )}
        {hasProjection &&
          tile(
            <Trans>Expected tax</Trans>,
            estimate(summary.projectedTax, summary.projectedTaxUpper),
          )}
        {tile(
          <Trans>Warnings</Trans>,
          <Text
            style={{
              ...VALUE_STYLE,
              color: warningCount > 0 ? theme.warningText : undefined,
            }}
          >
            <FinancialText as="span">{String(warningCount)}</FinancialText>
          </Text>,
        )}
      </View>
      {sentences.length > 0 && (
        <View style={{ marginTop: 10, gap: 5 }}>
          <Text style={GROUP_HEADING_STYLE}>
            <Trans>Summary</Trans>
          </Text>
          <Text>{sentences.join(' ')}</Text>
        </View>
      )}
    </View>
  );
}
