import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import type { EtfTaxPosition, EtfTaxVapYear } from './etftax-positions';
import { EtfTaxLookupLink } from './EtfTaxLookupLink';

type EtfTaxBookedVapTableProps = {
  positions: EtfTaxPosition[];
  /** Depot name per account id; only shown when more than one depot is selected. */
  depotName: (depotId: string) => string | null;
  /** Fund name from the ISIN tag's description, if any. */
  fundName: (isin: string) => string | null;
  money: (value: number) => string;
  /** Quote page URL template for the lookup links; no links when unset. */
  priceLookupUrl?: string;
  onBookedChange: (
    depotId: string,
    taxYear: number,
    isin: string,
    value: string,
  ) => void;
};

const CELL_WIDTH = 120;
// Width of an input in the narrow layout.
const NARROW_INPUT_WIDTH = 130;

/**
 * One input per fund and settled tax year for the Vorabpauschale the bank
 * booked: a grid on wide screens, a block per fund on narrow ones.
 */
export function EtfTaxBookedVapTable({
  positions,
  depotName,
  fundName,
  money,
  priceLookupUrl,
  onBookedChange,
}: EtfTaxBookedVapTableProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const years = [
    ...new Set(positions.flatMap(p => p.vapYears.map(y => y.taxYear))),
  ].sort((a, b) => b - a);

  // Fund name with its lookup link, and the subtitle.
  const fundTitle = (position: EtfTaxPosition) => {
    const depot = depotName(position.depotId);
    const name = fundName(position.isin);
    const subtitle = [name ? position.isin : null, depot]
      .filter(Boolean)
      .join(' · ');
    return (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontWeight: 600 }}>{name ?? position.isin}</Text>
          <EtfTaxLookupLink isin={position.isin} template={priceLookupUrl} />
        </View>
        {subtitle && (
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            {subtitle}
          </Text>
        )}
      </>
    );
  };

  const bookedInput = (position: EtfTaxPosition, entry: EtfTaxVapYear) => (
    <Input
      key={entry.booked ?? 'none'}
      defaultValue={entry.booked === null ? '' : String(entry.booked)}
      placeholder={entry.estimate === null ? '' : `≤ ${money(entry.estimate)}`}
      aria-label={t('Vorabpauschale of {{isin}} for tax year {{year}}', {
        isin: position.isin,
        year: entry.taxYear,
      })}
      onUpdate={value =>
        onBookedChange(position.depotId, entry.taxYear, position.isin, value)
      }
      onEnter={value =>
        onBookedChange(position.depotId, entry.taxYear, position.isin, value)
      }
      style={{
        textAlign: 'right',
        ...(entry.booked === null && { borderColor: theme.warningText }),
      }}
    />
  );

  if (isNarrowWidth) {
    return (
      <View>
        {positions
          .filter(position => position.vapYears.length > 0)
          .map(position => (
            <View
              key={`${position.depotId}/${position.isin}`}
              style={{
                padding: '8px 0',
                borderBottom: `1px solid ${theme.tableBorder}`,
                gap: 6,
              }}
            >
              <View>{fundTitle(position)}</View>
              {[...position.vapYears]
                .sort((a, b) => b.taxYear - a.taxYear)
                .map(entry => (
                  <View
                    key={entry.taxYear}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <View>
                      <Text style={GROUP_HEADING_STYLE}>
                        {String(entry.taxYear)}
                      </Text>
                      <Text
                        style={{ color: theme.pageTextSubdued, fontSize: 11 }}
                      >
                        {t('booked Jan {{year}}', { year: entry.taxYear + 1 })}
                      </Text>
                    </View>
                    <View style={{ width: NARROW_INPUT_WIDTH }}>
                      {bookedInput(position, entry)}
                    </View>
                  </View>
                ))}
            </View>
          ))}
      </View>
    );
  }

  return (
    // Scrolls sideways when there are many years.
    <View style={{ overflowX: 'auto' }}>
      <View style={{ minWidth: 220 + years.length * (CELL_WIDTH + 10) }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 10,
            padding: '0 8px 8px',
            borderBottom: `1px solid ${theme.tableBorder}`,
          }}
        >
          <Text style={{ ...GROUP_HEADING_STYLE, flex: 1, minWidth: 200 }}>
            <Trans>Fund</Trans>
          </Text>
          {years.map(year => (
            <View key={year} style={{ width: CELL_WIDTH, textAlign: 'right' }}>
              <Text style={GROUP_HEADING_STYLE}>{String(year)}</Text>
              <Text style={{ color: theme.pageTextSubdued, fontSize: 11 }}>
                {t('booked Jan {{year}}', { year: year + 1 })}
              </Text>
            </View>
          ))}
        </View>

        {positions.map(position => (
          <View
            key={`${position.depotId}/${position.isin}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              padding: 8,
              borderBottom: `1px solid ${theme.tableBorder}`,
            }}
          >
            <View style={{ flex: 1, minWidth: 200 }}>
              {fundTitle(position)}
            </View>
            {years.map(year => {
              const entry = position.vapYears.find(y => y.taxYear === year);
              if (!entry) {
                return (
                  <Text
                    key={year}
                    style={{
                      width: CELL_WIDTH,
                      textAlign: 'right',
                      color: theme.pageTextSubdued,
                    }}
                  >
                    –
                  </Text>
                );
              }
              return (
                <View key={year} style={{ width: CELL_WIDTH }}>
                  {bookedInput(position, entry)}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
