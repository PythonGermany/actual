import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
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

/** One split part: its name, help text and the content of each column. */
type Part = {
  name: string;
  help: string;
  cells: {
    category: ReactNode;
    payee: ReactNode;
    note: ReactNode;
    amount: ReactNode;
  };
};

/**
 * The Selling tab: payout account and the split parts, as a table on wide
 * screens and as one card per part on narrow ones.
 */
export function EtfTaxSellConfiguration({
  sell,
  onSellChange,
}: EtfTaxSellConfigurationProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
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
  // The split parts, in the order they are booked.
  const parts: Part[] = [
    {
      name: t('Invested value'),
      help: t(
        'The transfer from the depot over the FIFO cost basis of the sold shares. Its category is only used when the depot is off budget and the payout account on budget.',
      ),
      cells: {
        category: category(t('Invested value category'), 'investedCategory'),
        payee: readOnly(t('Depot transfer')),
        note: readOnly(t('[shares]x #[ISIN]')),
        amount: readOnly(t('FIFO cost basis')),
      },
    },
    {
      name: t('Capital gain'),
      help: t(
        'The sale value minus the invested value: income for a gain, negative for a loss.',
      ),
      cells: {
        category: category(t('Capital gain category'), 'gainCategory'),
        payee: payee(t('Capital gain payee'), 'gainPayee'),
        note: note(t('Capital gain note'), 'gainNote'),
        amount: readOnly(t('Sale value − invested')),
      },
    },
    {
      name: t('Tax'),
      help: t(
        'The tax withheld on the sale, if the Freibetrag did not cover it. Its payee could be the tax office.',
      ),
      cells: {
        category: category(t('Tax category'), 'taxCategory'),
        payee: payee(t('Tax payee'), 'taxPayee'),
        note: note(t('Tax note'), 'taxNote'),
        amount: readOnly(t('Expected tax')),
      },
    },
    {
      name: t('Fee'),
      help: t(
        "The broker's order fee. Its payee, usually your broker, is also the payee of the whole split.",
      ),
      cells: {
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
            onCommit={value => onSellChange({ defaultFee: value || undefined })}
          />
        ),
      },
    },
  ];
  // Labels of the cells in the narrow layout, as in the table header.
  const cellLabels: Array<[keyof Part['cells'], string]> = [
    ['category', t('Category')],
    ['payee', t('Payee')],
    ['note', t('Note')],
    ['amount', t('Default amount')],
  ];

  const partTitle = ({ name, help }: Part) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text>{name}</Text>
      <MonteCarloHelpTooltip>{help}</MonteCarloHelpTooltip>
    </View>
  );

  // One split part as a card: its title, then each setting under its label.
  const partCard = (part: Part) => (
    <View
      key={part.name}
      style={{
        padding: 10,
        gap: 8,
        backgroundColor: theme.tableBackground,
        borderBottom: `1px solid ${theme.tableBorder}`,
      }}
    >
      <View style={{ fontWeight: 600 }}>{partTitle(part)}</View>
      {cellLabels.map(([key, label]) => (
        <View key={key} style={{ gap: 4 }}>
          <Text style={FIELD_LABEL_STYLE}>{label}</Text>
          {part.cells[key]}
        </View>
      ))}
    </View>
  );

  // One split part as a table row.
  const partRow = ({ name, help, cells }: Part) => (
    <Row
      key={name}
      collapsed
      height={ROW_HEIGHT}
      style={{
        backgroundColor: theme.tableBackground,
        ':hover': { backgroundColor: theme.tableRowBackgroundHover },
      }}
    >
      <Field width={SELL_COLUMNS.part} truncate={false}>
        {partTitle({ name, help, cells })}
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
      <View style={{ width: 260, maxWidth: '100%', gap: 4 }}>
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

      {isNarrowWidth ? (
        <View
          style={{
            border: `1px solid ${theme.tableBorder}`,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          {parts.map(partCard)}
        </View>
      ) : (
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
            {parts.map(partRow)}
          </View>
        </View>
      )}
    </View>
  );
}
