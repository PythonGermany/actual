import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Input } from '@actual-app/components/input';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { AccountAutocomplete } from '#components/autocomplete/AccountAutocomplete';
import { CategoryAutocomplete } from '#components/autocomplete/CategoryAutocomplete';
import { PayeeAutocomplete } from '#components/autocomplete/PayeeAutocomplete';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { MonteCarloNumberInput } from '#components/reports/reports/monte-carlo/MonteCarloNumberInput';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';
import { Field, Row } from '#components/table';
import { useCategories } from '#hooks/useCategories';

import type { EtfTaxSellConfig } from './etftax-sell';
import { EtfTaxSellTableHeader, SELL_COLUMNS } from './EtfTaxSellTableHeader';

type EtfTaxSellConfigurationProps = {
  sell: EtfTaxSellConfig;
  onSellChange: (patch: Partial<EtfTaxSellConfig>) => void;
};

const ROW_HEIGHT = 43;

/** The Selling tab: payout account and a table of the split parts. */
export function EtfTaxSellConfiguration({
  sell,
  onSellChange,
}: EtfTaxSellConfigurationProps) {
  const { t } = useTranslation();
  const { data: { grouped: categoryGroups } = { grouped: [] } } =
    useCategories();

  const category = (
    label: string,
    key: 'investedCategory' | 'feeCategory' | 'taxCategory' | 'gainCategory',
  ) => (
    <CategoryAutocomplete
      categoryGroups={categoryGroups}
      showHiddenCategories
      openOnFocus
      value={sell[key] ?? null}
      inputProps={{ placeholder: t('No category'), 'aria-label': label }}
      onSelect={id => onSellChange({ [key]: id || undefined })}
    />
  );
  const payee = (label: string, key: 'gainPayee' | 'taxPayee' | 'feePayee') => (
    <PayeeAutocomplete
      showMakeTransfer={false}
      openOnFocus
      value={sell[key] ?? null}
      inputProps={{ placeholder: t('No payee'), 'aria-label': label }}
      onSelect={id => onSellChange({ [key]: id || undefined })}
    />
  );
  const note = (label: string, key: 'gainNote' | 'taxNote' | 'feeNote') => (
    <Input
      defaultValue={sell[key] ?? ''}
      placeholder={t('No note')}
      aria-label={label}
      onUpdate={value => onSellChange({ [key]: value.trim() || undefined })}
      onEnter={value => onSellChange({ [key]: value.trim() || undefined })}
    />
  );
  // A value the widget fills in itself, so it can't be configured here.
  const readOnly = (text: string) => (
    <Text style={{ color: theme.pageTextSubdued, fontStyle: 'italic' }}>
      {text}
    </Text>
  );
  // One split part, in the order the parts are booked.
  const partRow = (
    name: string,
    help: string,
    cells: {
      category: ReactNode;
      payee: ReactNode;
      note: ReactNode;
      amount: ReactNode;
    },
  ) => (
    <Row
      collapsed
      height={ROW_HEIGHT}
      style={{
        backgroundColor: theme.tableBackground,
        ':hover': { backgroundColor: theme.tableRowBackgroundHover },
      }}
    >
      <Field width={SELL_COLUMNS.part} truncate={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text>{name}</Text>
          <MonteCarloHelpTooltip>{help}</MonteCarloHelpTooltip>
        </View>
      </Field>
      <Field
        width="flex"
        style={{ minWidth: SELL_COLUMNS.category }}
        truncate={false}
      >
        {cells.category}
      </Field>
      <Field
        width="flex"
        style={{ minWidth: SELL_COLUMNS.payee }}
        truncate={false}
      >
        {cells.payee}
      </Field>
      <Field
        width="flex"
        style={{ minWidth: SELL_COLUMNS.note }}
        truncate={false}
      >
        {cells.note}
      </Field>
      <Field
        width="flex"
        style={{ minWidth: SELL_COLUMNS.amount }}
        truncate={false}
      >
        {cells.amount}
      </Field>
    </Row>
  );

  return (
    <View style={{ gap: 20 }}>
      <View style={{ width: 260, gap: 4 }}>
        <View style={FIELD_LABEL_ROW_STYLE}>
          <Text style={FIELD_LABEL_STYLE}>
            <Trans>Payout account</Trans>
          </Text>
          <MonteCarloHelpTooltip>
            <Trans>
              The account the sale proceeds are paid into, usually the cash
              account linked to the depot.
            </Trans>
          </MonteCarloHelpTooltip>
        </View>
        <AccountAutocomplete
          includeClosedAccounts={false}
          openOnFocus
          value={sell.payoutAccount ?? null}
          inputProps={{
            placeholder: t('Choose an account'),
            'aria-label': t('Payout account'),
          }}
          onSelect={id => onSellChange({ payoutAccount: id || undefined })}
        />
      </View>

      <View
        style={{
          ...styles.tableContainer,
          ...styles.horizontalScrollbar,
          flex: 'unset',
          // Scroll sideways when the columns' minimum widths don't fit
          overflowX: 'auto',
        }}
      >
        <View style={{ minWidth: 'fit-content' }}>
          <EtfTaxSellTableHeader />
          {partRow(
            t('Invested value'),
            t(
              'The transfer from the depot over the FIFO cost basis of the sold shares. Its category is only used when the depot is off budget and the payout account on budget.',
            ),
            {
              category: category(
                t('Invested value category'),
                'investedCategory',
              ),
              payee: readOnly(t('Depot transfer')),
              note: readOnly(t('[shares]x #[ISIN]')),
              amount: readOnly(t('FIFO cost basis')),
            },
          )}
          {partRow(
            t('Capital gain'),
            t(
              'The sale value minus the invested value: income for a gain, negative for a loss.',
            ),
            {
              category: category(t('Capital gain category'), 'gainCategory'),
              payee: payee(t('Capital gain payee'), 'gainPayee'),
              note: note(t('Capital gain note'), 'gainNote'),
              amount: readOnly(t('Sale value − invested')),
            },
          )}
          {partRow(
            t('Tax'),
            t(
              'The tax withheld on the sale, if the Freibetrag did not cover it. Its payee could be the tax office.',
            ),
            {
              category: category(t('Tax category'), 'taxCategory'),
              payee: payee(t('Tax payee'), 'taxPayee'),
              note: note(t('Tax note'), 'taxNote'),
              amount: readOnly(t('Expected tax')),
            },
          )}
          {partRow(
            t('Fee'),
            t(
              "The broker's order fee. Its payee, usually your broker, is also the payee of the whole split.",
            ),
            {
              category: category(t('Fee category'), 'feeCategory'),
              payee: payee(t('Fee payee'), 'feePayee'),
              note: note(t('Fee note'), 'feeNote'),
              amount: (
                <MonteCarloNumberInput
                  value={sell.defaultFee ?? null}
                  aria-label={t('Default fee')}
                  placeholder="0"
                  allowEmpty
                  min={0}
                  max={10_000}
                  step={0.01}
                  onCommit={value =>
                    onSellChange({ defaultFee: value || undefined })
                  }
                />
              ),
            },
          )}
        </View>
      </View>
    </View>
  );
}
