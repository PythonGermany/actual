import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';

type EtfTaxPriceConfigurationProps = {
  priceLookupUrl?: string;
  onChange: (patch: { priceLookupUrl?: string }) => void;
};

const FIELD_STYLE = { width: 520, maxWidth: '100%' } as const;
const MONO_STYLE = { fontFamily: 'monospace', fontSize: 12 } as const;

/** The Remote lookup tab: the quote page link. */
export function EtfTaxPriceConfiguration({
  priceLookupUrl,
  onChange,
}: EtfTaxPriceConfigurationProps) {
  const { t } = useTranslation();
  return (
    <View style={FIELD_STYLE}>
      <View style={FIELD_LABEL_ROW_STYLE}>
        <Text style={FIELD_LABEL_STYLE}>
          <Trans>Link Lookup URL</Trans>
        </Text>
        <MonteCarloHelpTooltip>
          <Trans>
            The page the link after each fund name opens. Write {'{isin}'} where
            the ISIN goes. Leave empty to show no link.
          </Trans>
        </MonteCarloHelpTooltip>
      </View>
      <Input
        defaultValue={priceLookupUrl ?? ''}
        placeholder="https://example.com/quote?isin={isin}"
        aria-label={t('Link Lookup URL')}
        onUpdate={value =>
          onChange({ priceLookupUrl: value.trim() || undefined })
        }
        onEnter={value =>
          onChange({ priceLookupUrl: value.trim() || undefined })
        }
        style={MONO_STYLE}
      />
    </View>
  );
}
