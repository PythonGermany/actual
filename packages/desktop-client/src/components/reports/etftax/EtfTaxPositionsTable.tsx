import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgCheveronDown,
  SvgCheveronRight,
} from '@actual-app/components/icons/v1';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { FinancialText } from '#components/FinancialText';
import { PrivacyFilter } from '#components/PrivacyFilter';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import type { EtfTaxPosition } from './etftax-positions';
import { EtfTaxLookupLink } from './EtfTaxLookupLink';
import { EtfTaxLotsTable } from './EtfTaxLotsTable';
import { formatShares } from './etftaxStyles';

type EtfTaxPositionsTableProps = {
  positions: EtfTaxPosition[];
  /** Depot name per account id; only shown when more than one depot is selected. */
  depotName: (depotId: string) => string | null;
  /** Fund name from the ISIN tag's description, if any. */
  fundName: (isin: string) => string | null;
  money: (value: number) => string;
  onPriceChange: (isin: string, value: string) => void;
  onStartPriceChange: (isin: string, value: string) => void;
  /** Quote page URL template for the price lookup links; no link when unset. */
  priceLookupUrl?: string;
  /** The tax year whose Vorabpauschale is projected. */
  taxYear: number;
};

const NUMBER_CELL = { width: 110, textAlign: 'right' } as const;
// Left-aligned text after a right-aligned number column needs its own gap,
// since it starts right where the numbers end.
const TEXT_CELL = { width: 250, paddingLeft: 20 } as const;

export function EtfTaxPositionsTable({
  positions,
  depotName,
  fundName,
  money,
  onPriceChange,
  onStartPriceChange,
  priceLookupUrl: priceLookupTemplate,
  taxYear,
}: EtfTaxPositionsTableProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  return (
    // Scrolls sideways on narrow screens instead of squeezing the columns.
    <View style={{ overflowX: 'auto' }}>
      <View style={{ minWidth: 1280 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            padding: '0 8px 8px',
            borderBottom: `1px solid ${theme.tableBorder}`,
          }}
        >
          <View style={{ width: 24 }} />
          <Text style={{ ...GROUP_HEADING_STYLE, flex: 1, minWidth: 150 }}>
            <Trans>Fund</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL, width: 90 }}>
            <Trans>Shares</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL }}>
            <Trans>Invested</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL }}>
            <Trans>VAP on held</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL, width: 100 }}>
            <Trans>Price</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL, width: 130 }}>
            <Trans>Taxed profit</Trans>
          </Text>
          <Text style={{ ...GROUP_HEADING_STYLE, ...TEXT_CELL }}>
            <Trans>Max tax-free sale</Trans>
          </Text>
          <View
            style={{
              ...NUMBER_CELL,
              width: 100,
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={GROUP_HEADING_STYLE}>
              <Trans>Start price</Trans>
            </Text>
            <MonteCarloHelpTooltip>
              {t(
                'The closing price on the first trading day of {{year}}. The Vorabpauschale for {{year}} is 70% of the Basiszins times this price per share.',
                { year: taxYear },
              )}
            </MonteCarloHelpTooltip>
          </View>
          <Text style={{ ...GROUP_HEADING_STYLE, ...NUMBER_CELL, width: 150 }}>
            {t('VAP Jan {{year}}', { year: taxYear + 1 })}
          </Text>
        </View>

        {positions.map(position => {
          const key = `${position.depotId}/${position.isin}`;
          const isExpanded = expanded.has(key);
          const depot = depotName(position.depotId);
          const name = fundName(position.isin);
          // Subdued line under the bold title: the ISIN (when a name is
          // shown above it) and the depot (when several are selected).
          const subtitle = [name ? position.isin : null, depot]
            .filter(Boolean)
            .join(' · ');
          const proceeds =
            position.max && position.price !== null
              ? position.max.qty * position.price
              : 0;
          return (
            <View
              key={key}
              style={{ borderBottom: `1px solid ${theme.tableBorder}` }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 8,
                }}
              >
                <Button
                  variant="bare"
                  aria-label={
                    isExpanded
                      ? t('Hide lots of {{isin}}', { isin: position.isin })
                      : t('Show lots of {{isin}}', { isin: position.isin })
                  }
                  onPress={() => toggle(key)}
                  style={{ width: 24, padding: 4 }}
                >
                  {isExpanded ? (
                    <SvgCheveronDown width={12} height={12} />
                  ) : (
                    <SvgCheveronRight width={12} height={12} />
                  )}
                </Button>
                <View style={{ flex: 1, minWidth: 150 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={{ fontWeight: 600 }}>
                      {name ?? position.isin}
                    </Text>
                    <EtfTaxLookupLink
                      isin={position.isin}
                      template={priceLookupTemplate}
                    />
                  </View>
                  {subtitle && (
                    <Text
                      style={{ color: theme.pageTextSubdued, fontSize: 12 }}
                    >
                      {subtitle}
                    </Text>
                  )}
                </View>
                <Text style={{ ...NUMBER_CELL, width: 90 }}>
                  <PrivacyFilter>
                    <FinancialText as="span">
                      {formatShares(position.held)}
                    </FinancialText>
                  </PrivacyFilter>
                </Text>
                <Text style={NUMBER_CELL}>
                  <PrivacyFilter>
                    <FinancialText as="span">
                      {money(position.invested)}
                    </FinancialText>
                  </PrivacyFilter>
                </Text>
                <Text style={NUMBER_CELL}>
                  <PrivacyFilter>
                    <FinancialText as="span">
                      {money(position.vapTotal)}
                    </FinancialText>
                  </PrivacyFilter>
                </Text>
                <View style={{ width: 100 }}>
                  <Input
                    key={position.price ?? 'none'}
                    defaultValue={
                      position.price === null ? '' : String(position.price)
                    }
                    placeholder={t('Price')}
                    aria-label={t('Current price of {{isin}}', {
                      isin: position.isin,
                    })}
                    onUpdate={value => onPriceChange(position.isin, value)}
                    onEnter={value => onPriceChange(position.isin, value)}
                    style={{ textAlign: 'right' }}
                  />
                </View>
                <Text style={{ ...NUMBER_CELL, width: 130 }}>
                  {position.taxableIfSoldAll === null ? (
                    '–'
                  ) : (
                    <PrivacyFilter>
                      <FinancialText as="span">
                        {money(position.taxableIfSoldAll)}
                      </FinancialText>
                    </PrivacyFilter>
                  )}
                </Text>
                <Text style={{ ...TEXT_CELL, fontSize: 13 }}>
                  {position.max === null ? (
                    <Text style={{ color: theme.pageTextSubdued }}>
                      <Trans>Enter a price</Trans>
                    </Text>
                  ) : (
                    <PrivacyFilter>
                      {position.max.exhaustedAll
                        ? t('Whole position: {{qty}} shares (~{{proceeds}})', {
                            qty: formatShares(position.max.qty),
                            proceeds: money(proceeds),
                          })
                        : t(
                            '{{qty}} shares (~{{proceeds}}), uses {{consumed}}',
                            {
                              qty: formatShares(position.max.qty),
                              proceeds: money(proceeds),
                              consumed: money(position.consumed ?? 0),
                            },
                          )}
                    </PrivacyFilter>
                  )}
                </Text>
                <View style={{ width: 100 }}>
                  <Input
                    key={position.startPrice ?? 'none'}
                    defaultValue={
                      position.startPrice === null
                        ? ''
                        : String(position.startPrice)
                    }
                    placeholder={t('Price')}
                    aria-label={t(
                      'Price of {{isin}} on the first trading day of {{year}}',
                      { isin: position.isin, year: taxYear },
                    )}
                    onUpdate={value => onStartPriceChange(position.isin, value)}
                    onEnter={value => onStartPriceChange(position.isin, value)}
                    style={{ textAlign: 'right' }}
                  />
                </View>
                <View style={{ ...NUMBER_CELL, width: 150 }}>
                  {position.projection === null ? (
                    <Text
                      style={{ color: theme.pageTextSubdued, fontSize: 13 }}
                    >
                      <Trans>Enter start price</Trans>
                    </Text>
                  ) : (
                    <PrivacyFilter>
                      <Text>
                        <FinancialText as="span">
                          {`~${money(
                            (
                              position.projection.atPrice ??
                              position.projection.upper
                            ).total,
                          )}`}
                        </FinancialText>
                      </Text>
                      {position.projection.atPrice && (
                        <Text
                          style={{
                            color: theme.pageTextSubdued,
                            fontSize: 12,
                          }}
                        >
                          {t('≤ {{amount}} upper bound', {
                            amount: money(position.projection.upper.total),
                          })}
                        </Text>
                      )}
                    </PrivacyFilter>
                  )}
                </View>
              </View>
              {isExpanded && (
                <EtfTaxLotsTable
                  lots={position.lots}
                  price={position.price}
                  projection={position.projection}
                  money={money}
                />
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}
