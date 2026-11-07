import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { LabeledCheckbox } from '#components/forms/LabeledCheckbox';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
  GROUP_HEADING_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';

import { isinUrl, startPriceVars } from './etftax';
import { describeLiveError, fetchLivePrice } from './useLivePrices';
import type { LivePricesConfig } from './useLivePrices';

type EtfTaxPriceConfigurationProps = {
  priceLookupUrl?: string;
  livePrices?: LivePricesConfig;
  /** A held ISIN to try the price APIs with. */
  sampleIsin?: string;
  /** The tax year whose start price is fetched. */
  taxYear: number;
  onChange: (patch: {
    priceLookupUrl?: string;
    livePrices?: LivePricesConfig;
  }) => void;
};

const FIELD_STYLE = { width: 520, maxWidth: '100%' } as const;
const MONO_STYLE = { fontFamily: 'monospace', fontSize: 12 } as const;

type PriceKind = 'live' | 'start';

type TestResult =
  | { state: 'running' }
  | { state: 'ok'; price: number }
  | { state: 'error'; message: string };

/** The Remote lookup tab: the quote page link and optional fetched prices. */
export function EtfTaxPriceConfiguration({
  priceLookupUrl,
  livePrices,
  sampleIsin,
  taxYear,
  onChange,
}: EtfTaxPriceConfigurationProps) {
  const { t } = useTranslation();
  const [tests, setTests] = useState<Partial<Record<PriceKind, TestResult>>>(
    {},
  );
  const live = livePrices ?? {};
  const setLive = (patch: Partial<LivePricesConfig>) => {
    setTests({});
    onChange({ livePrices: { ...live, ...patch } });
  };

  const sources = {
    live: { url: live.url, jsonPath: live.jsonPath, vars: {} },
    start: {
      url: live.startUrl,
      jsonPath: live.startJsonPath,
      vars: startPriceVars(taxYear),
    },
  };

  const runTest = async (kind: PriceKind) => {
    const { url: template, jsonPath, vars } = sources[kind];
    const url = sampleIsin ? isinUrl(sampleIsin, template, vars) : null;
    if (!url || !jsonPath?.trim()) {
      return;
    }
    setTests(prev => ({ ...prev, [kind]: { state: 'running' } }));
    let result: TestResult;
    try {
      result = { state: 'ok', price: await fetchLivePrice(url, jsonPath) };
    } catch (error) {
      result = {
        state: 'error',
        message: t('No live price: {{reason}}', {
          reason: describeLiveError(
            error instanceof Error ? error.message : '',
            t,
          ),
        }),
      };
    }
    setTests(prev => ({ ...prev, [kind]: result }));
  };

  // One labelled monospace input.
  const field = (
    label: string,
    help: ReactNode,
    value: string | undefined,
    placeholder: string,
    onValue: (value: string | undefined) => void,
  ) => (
    <View style={FIELD_STYLE}>
      <View style={FIELD_LABEL_ROW_STYLE}>
        <Text style={FIELD_LABEL_STYLE}>{label}</Text>
        <MonteCarloHelpTooltip>{help}</MonteCarloHelpTooltip>
      </View>
      <Input
        defaultValue={value ?? ''}
        placeholder={placeholder}
        aria-label={label}
        onUpdate={newValue => onValue(newValue.trim() || undefined)}
        onEnter={newValue => onValue(newValue.trim() || undefined)}
        style={MONO_STYLE}
      />
    </View>
  );

  // Tries the configured API with a held ISIN.
  const testRow = (kind: PriceKind) => {
    const test = tests[kind];
    const { url, jsonPath } = sources[kind];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Button
          isDisabled={
            !sampleIsin || !url || !jsonPath || test?.state === 'running'
          }
          onPress={() => void runTest(kind)}
        >
          {sampleIsin ? (
            <Trans>Test with {{ isin: sampleIsin }}</Trans>
          ) : (
            <Trans>Test</Trans>
          )}
        </Button>
        {test?.state === 'ok' && (
          <Text style={{ color: theme.noticeTextLight }}>
            {t('Price: {{price}}', { price: test.price })}
          </Text>
        )}
        {test?.state === 'error' && (
          <Text style={{ color: theme.errorText }}>{test.message}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={{ gap: 20 }}>
      {field(
        t('Link Lookup URL'),
        <Trans>
          The page the link after each fund name opens. Write {'{isin}'} where
          the ISIN goes. Leave empty to show no link.
        </Trans>,
        priceLookupUrl,
        'https://example.com/quote?isin={isin}',
        value => onChange({ priceLookupUrl: value }),
      )}

      <View style={{ gap: 10 }}>
        <Text style={GROUP_HEADING_STYLE}>
          <Trans>Live & historical prices</Trans>
        </Text>
        <LabeledCheckbox
          id="etftax-live-prices"
          checked={Boolean(live.enabled)}
          onChange={() => setLive({ enabled: !live.enabled || undefined })}
        >
          <Trans>Fetch prices</Trans>
        </LabeledCheckbox>
        <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
          <Trans>
            Fills every current and start price you leave empty; a typed price
            still wins. The requests go through your sync server.
          </Trans>
        </Text>

        {live.enabled && (
          <View style={{ gap: 20 }}>
            <View style={{ gap: 10 }}>
              {field(
                t('Current price API URL'),
                <Trans>
                  An address that answers with JSON. Write {'{isin}'} where the
                  ISIN goes.
                </Trans>,
                live.url,
                'https://example.com/api/quote?isin={isin}',
                value => setLive({ url: value }),
              )}
              {field(
                t('JSON path to the current price'),
                <Trans>
                  Where the price is in the answer. Use dots for fields and [n]
                  for list items, [-1] being the last one. For
                  {' {"quote": {"price": 101.5}} '}
                  the path is quote.price.
                </Trans>,
                live.jsonPath,
                'quote.price',
                value => setLive({ jsonPath: value }),
              )}
              {testRow('live')}
            </View>

            <View style={{ gap: 10 }}>
              {field(
                t('Start price API URL'),
                <Trans>
                  An address that answers with the prices around the start of
                  the tax year. {'{isin}'}, {'{year}'}, {'{from}'} and {'{to}'}{' '}
                  are replaced; {'{from}'} to {'{to}'} covers 1 to 15 January,
                  which always holds the first trading day.
                </Trans>,
                live.startUrl,
                'https://example.com/api/history?isin={isin}&from={from}&to={to}',
                value => setLive({ startUrl: value }),
              )}
              {field(
                t('JSON path to the start price'),
                <Trans>
                  Where the price of the first trading day is in the answer,
                  usually the first item of a list, e.g. prices[0].close.
                </Trans>,
                live.startJsonPath,
                'prices[0].close',
                value => setLive({ startJsonPath: value }),
              )}
              {testRow('start')}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
