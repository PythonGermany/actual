import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
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

import type { NotePatterns } from './etftax';
import type { EtfTaxPosition } from './etftax-positions';
import type { EtfTaxSellConfig } from './etftax-sell';
import { EtfTaxLookupLink } from './EtfTaxLookupLink';
import { EtfTaxLotsTable } from './EtfTaxLotsTable';
import { EtfTaxSellForm } from './EtfTaxSellForm';
import { formatShares } from './etftaxStyles';
import { remotePriceInput } from './useLivePrices';
import type { LivePrices } from './useLivePrices';

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
  /** Prices the user typed in; the positions' prices also include live ones. */
  typedPrices: Record<string, number>;
  live: LivePrices;
  /** Start prices the user typed in, and the fetched ones. */
  typedStartPrices: Record<string, number>;
  liveStart: LivePrices;
  /** The tax year whose Vorabpauschale is projected. */
  taxYear: number;
  sell: EtfTaxSellConfig;
  patterns: NotePatterns;
  accountName: (id: string) => string;
  /** Called after a sale was booked with the remaining Freibetrag, to reload the positions. */
  onSold: (freibetrag: number) => void;
  /** Remaining Freibetrag and tax rate, for the expected tax of a sale. */
  freibetrag: number;
  taxRate: number;
};

type ColumnKey =
  | 'shares'
  | 'invested'
  | 'vapHeld'
  | 'price'
  | 'taxed'
  | 'max'
  | 'startPrice'
  | 'vapNext';

type Column = {
  key: ColumnKey;
  label: ReactNode;
  width: number;
  align: 'left' | 'right';
  /** Left-aligned text after a right-aligned number column needs its own gap. */
  paddingLeft?: number;
  /** Price inputs get a fixed width in the narrow layout. */
  isInput?: boolean;
};

// Width of a price input in the narrow layout.
const NARROW_INPUT_WIDTH = 130;

/**
 * One row per position on wide screens, scrolling sideways when needed; one
 * card per position with a label–value row per column on narrow screens.
 */
export function EtfTaxPositionsTable({
  positions,
  depotName,
  fundName,
  money,
  onPriceChange,
  onStartPriceChange,
  priceLookupUrl: priceLookupTemplate,
  typedPrices,
  live,
  typedStartPrices,
  liveStart,
  taxYear,
  sell,
  patterns,
  accountName,
  onSold,
  freibetrag,
  taxRate,
}: EtfTaxPositionsTableProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // The position whose sell form is open; one at a time.
  const [selling, setSelling] = useState<string | null>(null);

  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  const heading = (label: ReactNode) => (
    <Text style={GROUP_HEADING_STYLE}>{label}</Text>
  );
  const columns: Column[] = [
    {
      key: 'shares',
      label: heading(<Trans>Shares</Trans>),
      width: 90,
      align: 'right',
    },
    {
      key: 'invested',
      label: heading(<Trans>Invested</Trans>),
      width: 110,
      align: 'right',
    },
    {
      key: 'vapHeld',
      label: heading(<Trans>VAP on held</Trans>),
      width: 110,
      align: 'right',
    },
    {
      key: 'price',
      label: heading(<Trans>Price</Trans>),
      width: 100,
      align: 'right',
      isInput: true,
    },
    {
      key: 'taxed',
      label: heading(<Trans>Taxed profit</Trans>),
      width: 130,
      align: 'right',
    },
    {
      key: 'max',
      label: heading(<Trans>Max tax-free sale</Trans>),
      width: 250,
      align: 'left',
      paddingLeft: 20,
    },
    {
      key: 'startPrice',
      label: (
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {heading(<Trans>Start price</Trans>)}
          <MonteCarloHelpTooltip>
            {t(
              'The closing price on the first trading day of {{year}}. The Vorabpauschale for {{year}} is 70% of the Basiszins times this price per share.',
              { year: taxYear },
            )}
          </MonteCarloHelpTooltip>
        </View>
      ),
      width: 100,
      align: 'right',
      isInput: true,
    },
    {
      key: 'vapNext',
      label: heading(t('VAP Jan {{year}}', { year: taxYear + 1 })),
      width: 150,
      align: 'right',
    },
  ];

  // The content of each column for one position.
  const cellsOf = (position: EtfTaxPosition): Record<ColumnKey, ReactNode> => {
    // A typed price wins; otherwise the live one is used and shown as the
    // placeholder.
    const typed = typedPrices[position.isin];
    const priceInput = remotePriceInput(typed, live, position.isin, t);
    const typedStart = typedStartPrices[position.isin];
    const startInput = remotePriceInput(
      typedStart,
      liveStart,
      position.isin,
      t,
    );
    const proceeds =
      position.max && position.price !== null
        ? position.max.qty * position.price
        : 0;
    const amount = (value: number) => (
      <Text>
        <PrivacyFilter>
          <FinancialText as="span">{money(value)}</FinancialText>
        </PrivacyFilter>
      </Text>
    );
    return {
      shares: (
        <Text>
          <PrivacyFilter>
            <FinancialText as="span">
              {formatShares(position.held)}
            </FinancialText>
          </PrivacyFilter>
        </Text>
      ),
      invested: amount(position.invested),
      vapHeld: amount(position.vapTotal),
      price: (
        <Input
          key={typed ?? 'none'}
          defaultValue={typed === undefined ? '' : String(typed)}
          placeholder={priceInput.placeholder ?? t('Price')}
          title={priceInput.title}
          aria-label={t('Current price of {{isin}}', { isin: position.isin })}
          onUpdate={value => onPriceChange(position.isin, value)}
          onEnter={value => onPriceChange(position.isin, value)}
          style={{
            textAlign: 'right',
            ...(priceInput.warn && { borderColor: theme.warningText }),
          }}
        />
      ),
      taxed:
        position.taxableIfSoldAll === null ? (
          <Text>–</Text>
        ) : (
          amount(position.taxableIfSoldAll)
        ),
      max: (
        <Text style={{ fontSize: 13 }}>
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
                : t('{{qty}} shares (~{{proceeds}}), uses {{consumed}}', {
                    qty: formatShares(position.max.qty),
                    proceeds: money(proceeds),
                    consumed: money(position.consumed ?? 0),
                  })}
            </PrivacyFilter>
          )}
        </Text>
      ),
      startPrice: (
        <Input
          key={typedStart ?? 'none'}
          defaultValue={typedStart === undefined ? '' : String(typedStart)}
          placeholder={startInput.placeholder ?? t('Price')}
          title={startInput.title}
          aria-label={t(
            'Price of {{isin}} on the first trading day of {{year}}',
            { isin: position.isin, year: taxYear },
          )}
          onUpdate={value => onStartPriceChange(position.isin, value)}
          onEnter={value => onStartPriceChange(position.isin, value)}
          style={{
            textAlign: 'right',
            ...(startInput.warn && { borderColor: theme.warningText }),
          }}
        />
      ),
      vapNext:
        position.projection === null ? (
          <Text style={{ color: theme.pageTextSubdued, fontSize: 13 }}>
            <Trans>Enter start price</Trans>
          </Text>
        ) : (
          <PrivacyFilter>
            <Text>
              <FinancialText as="span">
                {`~${money(
                  (position.projection.atPrice ?? position.projection.upper)
                    .total,
                )}`}
              </FinancialText>
            </Text>
            {position.projection.atPrice && (
              <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
                {t('≤ {{amount}} upper bound', {
                  amount: money(position.projection.upper.total),
                })}
              </Text>
            )}
          </PrivacyFilter>
        ),
    };
  };

  // Expand chevron, fund name with its lookup link, and the subtitle.
  const fundTitle = (position: EtfTaxPosition, key: string) => {
    const isExpanded = expanded.has(key);
    const depot = depotName(position.depotId);
    const name = fundName(position.isin);
    // Subdued line under the bold title: the ISIN (when a name is shown
    // above it) and the depot (when several are selected).
    const subtitle = [name ? position.isin : null, depot]
      .filter(Boolean)
      .join(' · ');
    return (
      <>
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
        <View style={{ flex: 1, minWidth: isNarrowWidth ? 0 : 150 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ fontWeight: 600 }}>{name ?? position.isin}</Text>
            <EtfTaxLookupLink
              isin={position.isin}
              template={priceLookupTemplate}
            />
          </View>
          {subtitle && (
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              {subtitle}
            </Text>
          )}
        </View>
      </>
    );
  };

  const sellButton = (position: EtfTaxPosition, key: string) => (
    <Button
      variant="bare"
      aria-label={t('Sell {{isin}}', { isin: position.isin })}
      onPress={() => setSelling(selling === key ? null : key)}
    >
      <Trans>Sell</Trans>
    </Button>
  );

  // The lots and the sell form open under the row or card.
  const details = (position: EtfTaxPosition, key: string) => (
    <>
      {expanded.has(key) && (
        <EtfTaxLotsTable
          lots={position.lots}
          price={position.price}
          projection={position.projection}
          money={money}
        />
      )}
      {selling === key && (
        <EtfTaxSellForm
          position={position}
          fundName={fundName(position.isin)}
          sell={sell}
          patterns={patterns}
          accountName={accountName}
          money={money}
          freibetrag={freibetrag}
          taxRate={taxRate}
          onClose={() => setSelling(null)}
          onSold={onSold}
        />
      )}
    </>
  );

  const columnStyle = (column: Column) => ({
    width: column.width,
    textAlign: column.align,
    paddingLeft: column.paddingLeft,
  });

  if (isNarrowWidth) {
    return (
      <View>
        {positions.map(position => {
          const key = `${position.depotId}/${position.isin}`;
          const cells = cellsOf(position);
          return (
            <View
              key={key}
              style={{
                borderBottom: `1px solid ${theme.tableBorder}`,
                padding: '8px 0',
              }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                {fundTitle(position, key)}
                {sellButton(position, key)}
              </View>
              <View style={{ gap: 6, padding: '6px 0 4px 32px' }}>
                {columns.map(column => (
                  <View
                    key={column.key}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      minHeight: 24,
                    }}
                  >
                    <View style={{ flexShrink: 0 }}>{column.label}</View>
                    <View
                      style={
                        column.isInput
                          ? { width: NARROW_INPUT_WIDTH }
                          : { flex: 1, minWidth: 0, textAlign: 'right' }
                      }
                    >
                      {cells[column.key]}
                    </View>
                  </View>
                ))}
              </View>
              {details(position, key)}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    // Scrolls sideways on smaller screens instead of squeezing the columns.
    <View style={{ overflowX: 'auto' }}>
      <View style={{ minWidth: 1350 }}>
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
          <View style={{ flex: 1, minWidth: 150 }}>
            {heading(<Trans>Fund</Trans>)}
          </View>
          {columns.map(column => (
            <View key={column.key} style={columnStyle(column)}>
              {column.label}
            </View>
          ))}
          <View style={{ width: 60 }} />
        </View>

        {positions.map(position => {
          const key = `${position.depotId}/${position.isin}`;
          const cells = cellsOf(position);
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
                {fundTitle(position, key)}
                {columns.map(column => (
                  <View key={column.key} style={columnStyle(column)}>
                    {cells[column.key]}
                  </View>
                ))}
                <View style={{ width: 60, alignItems: 'flex-end' }}>
                  {sellButton(position, key)}
                </View>
              </View>
              {details(position, key)}
            </View>
          );
        })}
      </View>
    </View>
  );
}
