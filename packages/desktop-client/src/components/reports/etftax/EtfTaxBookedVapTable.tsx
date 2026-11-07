import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import type { EtfTaxPosition } from './etftax-positions';

type EtfTaxBookedVapTableProps = {
  positions: EtfTaxPosition[];
  /** Depot name per account id; only shown when more than one depot is selected. */
  depotName: (depotId: string) => string | null;
  /** Fund name from the ISIN tag's description, if any. */
  fundName: (isin: string) => string | null;
  money: (value: number) => string;
  onBookedChange: (
    depotId: string,
    taxYear: number,
    isin: string,
    value: string,
  ) => void;
};

const CELL_WIDTH = 120;

/** One input per fund and settled tax year for the Vorabpauschale the bank booked. */
export function EtfTaxBookedVapTable({
  positions,
  depotName,
  fundName,
  money,
  onBookedChange,
}: EtfTaxBookedVapTableProps) {
  const { t } = useTranslation();
  const years = [
    ...new Set(positions.flatMap(p => p.vapYears.map(y => y.taxYear))),
  ].sort((a, b) => b - a);

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

        {positions.map(position => {
          const depot = depotName(position.depotId);
          const name = fundName(position.isin);
          const subtitle = [name ? position.isin : null, depot]
            .filter(Boolean)
            .join(' · ');
          return (
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
                <Text style={{ fontWeight: 600 }}>{name ?? position.isin}</Text>
                {subtitle && (
                  <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
                    {subtitle}
                  </Text>
                )}
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
                    <Input
                      key={entry.booked ?? 'none'}
                      defaultValue={
                        entry.booked === null ? '' : String(entry.booked)
                      }
                      placeholder={
                        entry.estimate === null
                          ? ''
                          : `≤ ${money(entry.estimate)}`
                      }
                      aria-label={t(
                        'Vorabpauschale of {{isin}} for tax year {{year}}',
                        { isin: position.isin, year },
                      )}
                      onUpdate={value =>
                        onBookedChange(
                          position.depotId,
                          year,
                          position.isin,
                          value,
                        )
                      }
                      onEnter={value =>
                        onBookedChange(
                          position.depotId,
                          year,
                          position.isin,
                          value,
                        )
                      }
                      style={{
                        textAlign: 'right',
                        ...(entry.booked === null && {
                          borderColor: theme.warningText,
                        }),
                      }}
                    />
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}
