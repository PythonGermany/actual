import { send } from '@actual-app/core/platform/client/connection';
import { useQueries } from '@tanstack/react-query';
import type { QueryObserverResult } from '@tanstack/react-query';
import type { TFunction } from 'i18next';

import { isinUrl, readJsonPath, startPriceVars } from './etftax';

export type LivePricesConfig = {
  enabled?: boolean;
  /** API URL with an {isin} placeholder. */
  url?: string;
  /** Where the price is in the response, e.g. "latestQuote.raw". */
  jsonPath?: string;
  /** Start price API URL with {isin}, {year}, {from} and {to} placeholders. */
  startUrl?: string;
  /** Where the start price is in that response, e.g. "series[0].value.raw". */
  startJsonPath?: string;
};

export type LivePrices = {
  /** Fetched price per ISIN. */
  prices: Record<string, number>;
  /** Why no price was fetched, per ISIN: a server reason or "no-price". */
  errors: Record<string, string>;
};

type LiveResult =
  | { isin: string; price: number }
  | { isin: string; error: string };

/** A readable explanation of why no live price was fetched. */
export function describeLiveError(reason: string, t: TFunction): string {
  switch (reason) {
    case 'no-server':
      return t('live prices need a sync server.');
    case 'unauthorized':
    case 'token-expired':
      return t('sign in to your sync server again.');
    case 'url-not-allowed':
      return t('the server may not call this address.');
    case 'upstream-status':
    case 'upstream-unreachable':
      return t('the price API did not answer.');
    case 'not-json':
    case 'response-too-large':
      return t('the price API did not return JSON.');
    case 'no-price':
      return t('no price at the JSON path.');
    case 'unknown-method':
      return t(
        'the app backend is outdated; restart the app (or yarn start) so it is rebuilt.',
      );
    case '':
    case 'request-failed':
      return t('the request failed.');
    default:
      return t('the request failed ({{reason}}).', { reason });
  }
}

/** Fetches a price from the configured API; throws the reason on failure. */
export async function fetchLivePrice(
  url: string,
  jsonPath: string,
): Promise<number> {
  let result: Awaited<ReturnType<typeof send<'etf-price-fetch'>>>;
  try {
    result = await send('etf-price-fetch', { url });
  } catch (error) {
    // The backend rejects with plain objects ({ type, message }), not Errors.
    const message =
      error !== null && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '';
    throw new Error(
      message.startsWith('Unknown server method')
        ? 'unknown-method'
        : message || 'request-failed',
    );
  }
  if ('error' in result) {
    throw new Error(result.error);
  }
  const price = readJsonPath(result.json, jsonPath);
  if (price === null || !(price > 0)) {
    throw new Error('no-price');
  }
  return price;
}

// Module level, so react-query keeps the combined result's identity while
// the prices don't change; the report's data function depends on it.
function combine(results: Array<QueryObserverResult<LiveResult>>): LivePrices {
  const live: LivePrices = { prices: {}, errors: {} };
  for (const { data } of results) {
    if (data && 'price' in data) {
      live.prices[data.isin] = data.price;
    } else if (data && 'error' in data) {
      live.errors[data.isin] = data.error;
    }
  }
  return live;
}

/**
 * Live prices of the given ISINs, fetched through the sync server when
 * enabled. Kept for 15 minutes, so reopening the report doesn't refetch.
 */
export function useLivePrices(
  isins: readonly string[],
  config: LivePricesConfig | undefined,
): LivePrices {
  return useRemotePrices(isins, {
    enabled: Boolean(config?.enabled),
    url: config?.url,
    jsonPath: config?.jsonPath,
    staleTime: 15 * 60 * 1000,
  });
}

/**
 * Start prices of the tax year, fetched like the live prices. A past price
 * doesn't change, so it is fetched once per session.
 */
export function useLiveStartPrices(
  isins: readonly string[],
  config: LivePricesConfig | undefined,
  taxYear: number,
): LivePrices {
  return useRemotePrices(isins, {
    enabled: Boolean(config?.enabled),
    url: config?.startUrl,
    jsonPath: config?.startJsonPath,
    vars: startPriceVars(taxYear),
    staleTime: Infinity,
  });
}

/** What a price input shows for a fetched price: placeholder, title and a warning border. */
export function remotePriceInput(
  typed: number | undefined,
  live: LivePrices,
  isin: string,
  t: TFunction,
): { placeholder?: string; title?: string; warn: boolean } {
  if (typed !== undefined) {
    return { warn: false };
  }
  const price = live.prices[isin];
  if (price !== undefined) {
    return {
      placeholder: String(price),
      title: t('Fetched price. Type a price to override it.'),
      warn: false,
    };
  }
  const error = live.errors[isin];
  if (error !== undefined) {
    return {
      title: t('No live price: {{reason}}', {
        reason: describeLiveError(error, t),
      }),
      warn: true,
    };
  }
  return { warn: false };
}

function useRemotePrices(
  isins: readonly string[],
  {
    enabled,
    url: template,
    jsonPath: rawPath,
    vars,
    staleTime,
  }: {
    enabled: boolean;
    url?: string;
    jsonPath?: string;
    vars?: Record<string, string>;
    staleTime: number;
  },
): LivePrices {
  const jsonPath = rawPath?.trim() ?? '';
  const active = Boolean(enabled && template?.trim() && jsonPath);
  const live = useQueries({
    queries: isins.map(isin => {
      const url = isinUrl(isin, template, vars) ?? '';
      return {
        queryKey: ['etftax-live-price', url, jsonPath],
        // Failures are results too, so they show next to the price input.
        queryFn: async (): Promise<LiveResult> => {
          try {
            return { isin, price: await fetchLivePrice(url, jsonPath) };
          } catch (error) {
            return {
              isin,
              error: error instanceof Error ? error.message : 'request-failed',
            };
          }
        },
        enabled: active,
        staleTime,
        refetchOnWindowFocus: false,
      };
    }),
    combine,
  });
  // Cached prices stay in the query cache after switching it off.
  return active ? live : NO_LIVE_PRICES;
}

const NO_LIVE_PRICES: LivePrices = { prices: {}, errors: {} };
