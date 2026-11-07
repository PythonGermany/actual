import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { View } from '@actual-app/components/view';

import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { Field, TableHeader } from '#components/table';

// Shared by the header and the split part rows so the columns line up. The
// part column is fixed; the settings columns flex with these minimum widths
// so the autocompletes don't get crushed on narrow windows.
export const SELL_COLUMNS = {
  part: 160,
  category: 190,
  payee: 190,
  note: 190,
  amount: 170,
} as const;

const HEADER_LABEL_STYLE = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap',
} as const;

export function EtfTaxSellTableHeader() {
  return (
    <TableHeader>
      <Field width={SELL_COLUMNS.part}>
        <Trans>Split part</Trans>
      </Field>
      <Field width="flex" style={{ minWidth: SELL_COLUMNS.category }}>
        <Trans>Category</Trans>
      </Field>
      <Field width="flex" style={{ minWidth: SELL_COLUMNS.payee }}>
        <Trans>Payee</Trans>
      </Field>
      <Field width="flex" style={{ minWidth: SELL_COLUMNS.note }}>
        <Trans>Note</Trans>
      </Field>
      <Field
        width="flex"
        style={{ minWidth: SELL_COLUMNS.amount }}
        truncate={false}
      >
        <View style={HEADER_LABEL_STYLE}>
          <Text>
            <Trans>Default amount</Trans>
          </Text>
          <MonteCarloHelpTooltip>
            <Trans>
              The amount prefilled in the sell form. Greyed out amounts are
              calculated for each sale; you can still change the tax and fee per
              sale.
            </Trans>
          </MonteCarloHelpTooltip>
        </View>
      </Field>
    </TableHeader>
  );
}
