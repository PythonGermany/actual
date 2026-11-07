import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Block } from '@actual-app/components/block';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import type { EtfTaxWidget } from '@actual-app/core/types/models';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { ReportCard } from '#components/reports/ReportCard';
import { ReportCardName } from '#components/reports/ReportCardName';
import { useReport } from '#components/reports/useReport';
import { useFormat } from '#hooks/useFormat';

import { DEFAULT_TAX_RATE, yearOf } from './etftax';
import { summarizePositions } from './etftax-positions';
import type { EtfTaxData } from './etftax-positions';
import { createEtfTaxSpreadsheet } from './etftax-spreadsheet';
import {
  basiszinsOverridesOf,
  readYearlySettings,
  startPricesByYearOf,
} from './etftax-yearly';
import { formatShares } from './etftaxStyles';
import { useFundNames } from './useFundNames';

const EMPTY_IDS: string[] = [];
const EMPTY_PRICES: Record<string, number> = {};

type EtfTaxCardProps = {
  widgetId: string;
  isEditing?: boolean;
  meta: EtfTaxWidget['meta'];
  onMetaChange: (newMeta: EtfTaxWidget['meta']) => void;
};

export function EtfTaxCard({
  widgetId,
  isEditing,
  meta,
  onMetaChange,
}: EtfTaxCardProps) {
  const { t } = useTranslation();
  const format = useFormat();
  const fundName = useFundNames();
  const [nameMenuOpen, setNameMenuOpen] = useState(false);

  const accountIds = meta?.accounts ?? EMPTY_IDS;
  const prices = meta?.prices ?? EMPTY_PRICES;
  const taxRate = meta?.taxRate ?? DEFAULT_TAX_RATE;
  const tradePattern = meta?.tradePattern;
  // Start prices, Freibetrag and Basiszins only hold for the year they were
  // saved in; a new year starts from the defaults.
  // Memoised: a year without start prices yields a fresh {} each call, which
  // would otherwise reload the report on every render.
  const taxYear = yearOf(monthUtils.currentDay());
  const { freibetrag, startPrices } = useMemo(
    () => readYearlySettings(meta, taxYear),
    [meta, taxYear],
  );

  const params = useMemo(
    () =>
      createEtfTaxSpreadsheet({
        accounts: accountIds,
        freibetrag,
        taxRate,
        prices,
        startPrices,
        basiszinsOverrides: basiszinsOverridesOf(meta),
        tradePattern,
        vapBooked: meta?.vapBooked ?? {},
        startPricesByYear: startPricesByYearOf(meta),
      }),
    [accountIds, freibetrag, taxRate, prices, startPrices, meta, tradePattern],
  );
  const data = useReport<EtfTaxData>('etf_tax', params);

  const money = (value: number) => format(amountToInteger(value), 'financial');
  const warningCount = data ? data.missing.length + data.warnings.length : 0;
  const summary =
    data && !data.patternError ? summarizePositions(data.positions) : null;
  const hasProjection =
    summary !== null && summary.positionCount > summary.missingStartPriceCount;

  return (
    <ReportCard
      widgetId={widgetId}
      isEditing={isEditing}
      disableClick={nameMenuOpen}
      to={`/reports/german-etf-tax/${widgetId}`}
      onRename={() => setNameMenuOpen(true)}
    >
      <View style={{ flex: 1, padding: 20, overflow: 'hidden', gap: 8 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <ReportCardName
              name={meta?.name || t('German ETF Tax')}
              isEditing={nameMenuOpen}
              onChange={newName => {
                onMetaChange({ ...meta, name: newName });
                setNameMenuOpen(false);
              }}
              onClose={() => setNameMenuOpen(false)}
            />
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              <Trans>Remaining Freibetrag:</Trans>{' '}
              <FinancialText>{money(freibetrag)}</FinancialText>
            </Text>
          </View>
          {data && summary && hasProjection && (
            <View style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              <Block
                style={{
                  ...styles.mediumText,
                  fontWeight: 500,
                  marginBottom: 5,
                }}
              >
                <PrivacyFilter>
                  <FinancialText>{`~${money(summary.projectedTax)}`}</FinancialText>
                </PrivacyFilter>
              </Block>
              <Block style={{ fontSize: 12, color: theme.pageTextSubdued }}>
                <Trans>
                  Vorabpauschale tax Jan {{ year: data.vapYear.taxYear + 1 }}
                </Trans>
              </Block>
            </View>
          )}
        </View>

        {accountIds.length === 0 ? (
          <Text style={{ color: theme.pageTextSubdued }}>
            <Trans>Open to choose depot accounts.</Trans>
          </Text>
        ) : !data ? (
          <LoadingIndicator />
        ) : data.patternError ? (
          <Text style={{ color: theme.errorText }}>
            <Trans>Invalid note pattern. Open to fix it.</Trans>
          </Text>
        ) : (
          <View style={{ flex: 1, gap: 4, overflow: 'hidden' }}>
            {data.positions.length === 0 && (
              <Text style={{ color: theme.pageTextSubdued }}>
                <Trans>No open positions.</Trans>
              </Text>
            )}
            {data.positions.map(position => (
              <View
                key={`${position.depotId}/${position.isin}`}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  gap: 10,
                  fontSize: 13,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  <Text style={{ fontWeight: 600 }}>
                    {fundName(position.isin) ?? position.isin}
                  </Text>
                  {fundName(position.isin) && (
                    <Text
                      style={{ color: theme.pageTextSubdued, fontSize: 11 }}
                    >
                      {` ${position.isin}`}
                    </Text>
                  )}
                </Text>
                <Text style={{ textAlign: 'right', flexShrink: 0 }}>
                  {position.max === null ? (
                    <Text style={{ color: theme.pageTextSubdued }}>
                      <Trans>No price yet</Trans>
                    </Text>
                  ) : (
                    <PrivacyFilter>
                      {position.max.exhaustedAll
                        ? t('All {{qty}} shares tax-free', {
                            qty: formatShares(position.max.qty),
                          })
                        : t('{{qty}} shares tax-free (~{{proceeds}})', {
                            qty: formatShares(position.max.qty),
                            proceeds: money(
                              position.max.qty * (position.price ?? 0),
                            ),
                          })}
                    </PrivacyFilter>
                  )}
                </Text>
              </View>
            ))}
          </View>
        )}

        {warningCount > 0 && (
          <Text style={{ color: theme.warningText, fontSize: 12 }}>
            {t('{{count}} warnings', { count: warningCount })}
          </Text>
        )}
      </View>
    </ReportCard>
  );
}
