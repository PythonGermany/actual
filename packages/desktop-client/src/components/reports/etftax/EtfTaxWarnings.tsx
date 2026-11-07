import { useTranslation } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import type { EtfTaxData } from './etftax-positions';

type EtfTaxWarningsProps = {
  data: EtfTaxData;
  depotName: (depotId: string) => string;
  /** Fund name from the ISIN tag's description, if any. */
  fundName: (isin: string) => string | null;
};

export function EtfTaxWarnings({
  data,
  depotName,
  fundName,
}: EtfTaxWarningsProps) {
  const { t } = useTranslation();

  return (
    <View style={{ gap: 6 }}>
      {data.missing.map(job => {
        const name = fundName(job.isin);
        const params = {
          isin: job.isin,
          // The ISIN followed by the fund name, when its tag has one.
          fund: name ? `${job.isin} – ${name}` : job.isin,
          depot: depotName(job.depotId),
          year: job.taxYear,
          settle: job.settle,
        };
        return (
          <Text
            key={`${job.depotId}/${job.isin}/${job.taxYear}`}
            style={{ color: theme.warningText }}
          >
            {t(
              'No Vorabpauschale entered for {{fund}} ({{depot}}), tax year {{year}} (booked {{settle}}). Enter it under Booked Vorabpauschale, or 0 if none was charged.',
              params,
            )}
          </Text>
        );
      })}
      {data.warnings.map((warning, i) => (
        <Text key={i} style={{ color: theme.warningText }}>
          {warning}
        </Text>
      ))}
    </View>
  );
}
