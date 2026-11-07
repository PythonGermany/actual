import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import * as monthUtils from '@actual-app/core/shared/months';
import { amountToInteger } from '@actual-app/core/shared/util';
import type {
  AccountEntity,
  EtfTaxWidget,
} from '@actual-app/core/types/models';

import { EditablePageHeaderTitle } from '#components/EditablePageHeaderTitle';
import { MobileBackButton } from '#components/mobile/MobileBackButton';
import { MobilePageHeader, Page, PageHeader } from '#components/Page';
import { LoadingIndicator } from '#components/reports/LoadingIndicator';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { useReport } from '#components/reports/useReport';
import { useAccounts } from '#hooks/useAccounts';
import { useFormat } from '#hooks/useFormat';
import { useNavigate } from '#hooks/useNavigate';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';
import { useUpdateDashboardWidgetMutation } from '#reports/mutations';

import {
  compileNotePatterns,
  DEFAULT_NOTE_PATTERNS,
  DEFAULT_TAX_RATE,
  parseNum,
  yearOf,
} from './etftax';
import { summarizePositions } from './etftax-positions';
import type { EtfTaxData } from './etftax-positions';
import type { EtfTaxSellConfig } from './etftax-sell';
import { createEtfTaxSpreadsheet } from './etftax-spreadsheet';
import type { EtfTaxConfig } from './etftax-spreadsheet';
import {
  basiszinsOverridesOf,
  readYearlySettings,
  startPricesByYearOf,
  writeYearlySettings,
} from './etftax-yearly';
import { EtfTaxAccountsSidebar } from './EtfTaxAccountsSidebar';
import { EtfTaxBookedVapTable } from './EtfTaxBookedVapTable';
import { EtfTaxConfiguration } from './EtfTaxConfiguration';
import { EtfTaxExplanation } from './EtfTaxExplanation';
import { EtfTaxPositionsTable } from './EtfTaxPositionsTable';
import { EtfTaxStats } from './EtfTaxStats';
import { EtfTaxWarnings } from './EtfTaxWarnings';
import { useFundNames } from './useFundNames';

const EMPTY_ACCOUNTS: AccountEntity[] = [];

type VapBooked = NonNullable<NonNullable<EtfTaxWidget['meta']>['vapBooked']>;

/** A results block, matching the panels of the Monte Carlo report. */
const PANEL_STYLE = {
  backgroundColor: theme.tableBackground,
  padding: 20,
  flexShrink: 0,
  gap: 15,
} as const;

type GermanEtfTaxReportProps = {
  /** The dashboard widget being edited; undefined when opened without one. */
  widget: EtfTaxWidget | undefined;
};

/**
 * The full-screen report. Mounted once the widget has loaded (keyed by its id),
 * so the editable config starts from the saved meta without an init effect.
 */
export function GermanEtfTaxReport({ widget }: GermanEtfTaxReportProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const format = useFormat();
  const navigate = useNavigate();
  const { isNarrowWidth } = useResponsive();
  const allAccounts = useAccounts().data ?? EMPTY_ACCOUNTS;
  const fundName = useFundNames();

  // The tax year the page edits; per-year settings are read and saved for it.
  const [taxYear] = useState(() => yearOf(monthUtils.currentDay()));
  const [config, setConfig] = useState<EtfTaxConfig>(() => {
    const yearly = readYearlySettings(widget?.meta ?? null, taxYear);
    return {
      accounts: widget?.meta?.accounts ?? [],
      freibetrag: yearly.freibetrag,
      taxRate: widget?.meta?.taxRate ?? DEFAULT_TAX_RATE,
      basiszinsOverride: yearly.basiszinsOverride,
      tradePattern: widget?.meta?.tradePattern,
      priceLookupUrl: widget?.meta?.priceLookupUrl,
    };
  });
  const [prices, setPrices] = useState<Record<string, number>>(
    () => widget?.meta?.prices ?? {},
  );
  const [startPrices, setStartPrices] = useState<Record<string, number>>(
    () => readYearlySettings(widget?.meta ?? null, taxYear).startPrices,
  );
  const [vapBooked, setVapBooked] = useState<VapBooked>(
    () => widget?.meta?.vapBooked ?? {},
  );
  const [sell, setSell] = useState<EtfTaxSellConfig>(
    () => widget?.meta?.sell ?? {},
  );
  // Bumped after a sale is booked so the transactions are queried again.
  const [reloadKey, setReloadKey] = useState(0);

  // The saved overrides of all years, with the one being edited for this year.
  const basiszinsOverrides = useMemo(() => {
    const overrides = basiszinsOverridesOf(widget?.meta ?? null);
    if (config.basiszinsOverride === null) {
      delete overrides[taxYear];
    } else {
      overrides[taxYear] = config.basiszinsOverride;
    }
    return overrides;
  }, [config.basiszinsOverride, widget?.meta, taxYear]);

  const getData = useMemo(() => {
    const {
      basiszinsOverride: _edited,
      priceLookupUrl: _lookup,
      ...rest
    } = config;
    return createEtfTaxSpreadsheet({
      reloadKey,
      ...rest,
      prices,
      startPrices,
      basiszinsOverrides,
      vapBooked,
      startPricesByYear: startPricesByYearOf(widget?.meta ?? null),
    });
  }, [
    config,
    prices,
    startPrices,
    vapBooked,
    widget?.meta,
    basiszinsOverrides,
    reloadKey,
  ]);
  const freshData = useReport<EtfTaxData>('etf_tax', getData);
  // useReport resets to null on every input change. Keep showing the last
  // result meanwhile, so the table doesn't unmount (collapsing expanded lots
  // and jumping the scroll position) each time a price is edited.
  const [data, setData] = useState<EtfTaxData | null>(null);
  if (freshData !== null && freshData !== data) {
    setData(freshData);
  }

  const { mutate: updateWidget } = useUpdateDashboardWidgetMutation();

  function onSaveWidget() {
    // The save button only renders when a widget exists
    if (!widget) {
      return;
    }
    updateWidget(
      {
        widget: {
          id: widget.id,
          meta: {
            ...(widget.meta ?? {}),
            accounts: config.accounts,
            taxRate: config.taxRate,
            tradePattern: config.tradePattern,
            priceLookupUrl: config.priceLookupUrl,
            vapBooked,
            sell,
            prices,
            ...writeYearlySettings(widget.meta, taxYear, {
              freibetrag: config.freibetrag,
              startPrices,
              basiszinsOverride: config.basiszinsOverride,
            }),
          },
        },
      },
      {
        onSuccess: () => {
          dispatch(
            addNotification({
              notification: {
                type: 'message',
                message: t('Dashboard widget successfully saved.'),
              },
            }),
          );
        },
      },
    );
  }

  // A booked sale is permanent, so the Freibetrag it used is saved right away
  // (only that field; other unsaved edits still wait for "Save widget").
  const onSold = (freibetrag: number) => {
    setReloadKey(key => key + 1);
    if (freibetrag === config.freibetrag) {
      return;
    }
    setConfig(prev => ({ ...prev, freibetrag }));
    if (widget) {
      updateWidget({
        widget: {
          id: widget.id,
          meta: {
            ...(widget.meta ?? {}),
            freibetrag,
            freibetragYear: taxYear,
          },
        },
      });
    }
  };

  const title = widget?.meta?.name || t('German ETF Tax');
  const onSaveWidgetName = (newName: string) => {
    // The editable title only renders when a widget exists
    if (!widget) {
      return;
    }
    updateWidget({
      widget: {
        id: widget.id,
        meta: { ...(widget.meta ?? {}), name: newName || t('German ETF Tax') },
      },
    });
  };

  const money = (value: number) => format(amountToInteger(value), 'financial');
  const accountName = (id: string) =>
    allAccounts.find(a => a.id === id)?.name ?? id;
  const usesDefaultPatterns = !config.tradePattern;
  // The positions only render once the pattern compiled, so the fallback is never used.
  const compiledPatterns = compileNotePatterns({ trade: config.tradePattern });
  const tradePatterns =
    'patterns' in compiledPatterns
      ? compiledPatterns.patterns
      : DEFAULT_NOTE_PATTERNS;

  // Prices per ISIN; an empty or invalid input removes the entry.
  const updatePrice =
    (setter: typeof setPrices) => (isin: string, input: string) => {
      const value = parseNum(input);
      setter(prev => {
        const next = { ...prev };
        if (value === null || value <= 0) {
          delete next[isin];
        } else {
          next[isin] = value;
        }
        return next;
      });
    };
  const onPriceChange = updatePrice(setPrices);
  const onStartPriceChange = updatePrice(setStartPrices);

  // Booked Vorabpauschale; an empty or invalid input removes the entry, 0 is kept.
  const onBookedChange = (
    depotId: string,
    bookedYear: number,
    isin: string,
    input: string,
  ) => {
    const value = parseNum(input);
    setVapBooked(prev => {
      const year = String(bookedYear);
      const byYear = { ...prev[depotId] };
      const byIsin = { ...byYear[year] };
      if (value === null || value < 0) {
        delete byIsin[isin];
      } else {
        byIsin[isin] = value;
      }
      byYear[year] = byIsin;
      return { ...prev, [depotId]: byYear };
    });
  };

  const sectionHeading = { ...styles.mediumText, fontWeight: 600 } as const;

  return (
    <Page
      header={
        isNarrowWidth ? (
          <MobilePageHeader
            title={title}
            leftContent={
              <MobileBackButton onPress={() => navigate('/reports')} />
            }
          />
        ) : (
          <PageHeader
            title={
              widget ? (
                <EditablePageHeaderTitle
                  title={title}
                  onSave={onSaveWidgetName}
                />
              ) : (
                title
              )
            }
          />
        )
      }
      padding={0}
    >
      {/* Sidebar + main area, laid out like the custom report. */}
      <View
        style={{
          flexDirection: 'row',
          flex: 1,
          minHeight: 0,
          paddingLeft: isNarrowWidth ? 0 : 20,
        }}
      >
        {!isNarrowWidth && (
          <EtfTaxAccountsSidebar
            accounts={allAccounts}
            selectedAccountIds={config.accounts}
            onChange={ids => setConfig(prev => ({ ...prev, accounts: ids }))}
          />
        )}
        <View
          style={{
            flex: 1,
            overflowY: 'auto',
            paddingLeft: 10,
            paddingRight: isNarrowWidth ? 10 : 20,
            paddingBottom: 20,
            gap: 10,
          }}
        >
          {/* Configuration */}
          <View style={{ flexShrink: 0 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
              }}
            >
              <Text style={sectionHeading}>
                <Trans>Configuration</Trans>
              </Text>
              {widget && (
                <Button variant="primary" onPress={onSaveWidget}>
                  <Trans>Save widget</Trans>
                </Button>
              )}
            </View>
            <EtfTaxConfiguration
              accounts={allAccounts}
              config={config}
              taxYear={taxYear}
              showAccounts={isNarrowWidth}
              onConfigChange={patch =>
                setConfig(prev => ({ ...prev, ...patch }))
              }
              sell={sell}
              onSellChange={patch => setSell(prev => ({ ...prev, ...patch }))}
            />
          </View>

          {/* Results */}
          <View style={{ padding: '10px 0', flexShrink: 0 }}>
            <Text style={sectionHeading}>
              <Trans>Results</Trans>
            </Text>
          </View>

          {!data ? (
            <LoadingIndicator />
          ) : data.patternError || config.accounts.length === 0 ? (
            <View style={PANEL_STYLE}>
              {data.patternError ? (
                <Text style={{ color: theme.errorText }}>
                  {t('Invalid note pattern: {{error}}', {
                    error: data.patternError,
                  })}
                </Text>
              ) : (
                <Text style={{ color: theme.pageTextSubdued }}>
                  {isNarrowWidth ? (
                    <Trans>
                      Select the depot accounts on the Depots & tax tab to see
                      your positions.
                    </Trans>
                  ) : (
                    <Trans>
                      Select the depot accounts in the sidebar to see your
                      positions.
                    </Trans>
                  )}
                </Text>
              )}
            </View>
          ) : (
            <>
              {data.missing.length + data.warnings.length > 0 && (
                <View style={PANEL_STYLE}>
                  <Text style={sectionHeading}>
                    <Trans>Warnings</Trans>
                  </Text>
                  <EtfTaxWarnings
                    data={data}
                    depotName={accountName}
                    fundName={fundName}
                  />
                </View>
              )}

              <EtfTaxStats
                summary={summarizePositions(data.positions)}
                vapYear={data.vapYear}
                freibetrag={config.freibetrag}
                warningCount={data.missing.length + data.warnings.length}
                money={money}
              />

              <View style={PANEL_STYLE}>
                <Text style={sectionHeading}>
                  <Trans>Positions</Trans>
                </Text>
                {data.positions.length === 0 ? (
                  <Text style={{ color: theme.pageTextSubdued }}>
                    {usesDefaultPatterns ? (
                      <Trans>
                        No open positions. Depot notes must look like "10x
                        #ISIN".
                      </Trans>
                    ) : (
                      <Trans>
                        No open positions. Depot notes must match the trade note
                        pattern.
                      </Trans>
                    )}
                  </Text>
                ) : (
                  <EtfTaxPositionsTable
                    positions={data.positions}
                    fundName={fundName}
                    depotName={id =>
                      config.accounts.length > 1 ? accountName(id) : null
                    }
                    money={money}
                    onPriceChange={onPriceChange}
                    onStartPriceChange={onStartPriceChange}
                    priceLookupUrl={config.priceLookupUrl}
                    taxYear={data.vapYear.taxYear}
                    sell={sell}
                    patterns={tradePatterns}
                    accountName={accountName}
                    onSold={onSold}
                    freibetrag={config.freibetrag}
                    taxRate={config.taxRate}
                  />
                )}
              </View>

              {data.positions.some(p => p.vapYears.length > 0) && (
                <View style={PANEL_STYLE}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text style={sectionHeading}>
                      <Trans>Booked Vorabpauschale</Trans>
                    </Text>
                    <MonteCarloHelpTooltip>
                      {t(
                        "Enter the Vorabpauschale from your bank's January statement for each fund, or 0 if none was charged. Use the gross amount, before the 30% Teilfreistellung, not the taxable amount below it. It lowers the taxable gain when you sell. The grey value is an upper bound from the start-of-year price saved for that year.",
                      )}
                    </MonteCarloHelpTooltip>
                  </View>
                  <EtfTaxBookedVapTable
                    positions={data.positions}
                    fundName={fundName}
                    depotName={id =>
                      config.accounts.length > 1 ? accountName(id) : null
                    }
                    money={money}
                    priceLookupUrl={config.priceLookupUrl}
                    onBookedChange={onBookedChange}
                  />
                </View>
              )}
            </>
          )}

          <EtfTaxExplanation
            taxYear={taxYear}
            taxRate={config.taxRate}
            basiszinsOverrides={basiszinsOverrides}
            money={money}
          />
        </View>
      </View>
    </Page>
  );
}
