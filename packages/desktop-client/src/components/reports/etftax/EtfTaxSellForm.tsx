import { useState } from 'react';
import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { Input } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { send } from '@actual-app/core/platform/client/connection';
import * as monthUtils from '@actual-app/core/shared/months';
import { integerToAmount } from '@actual-app/core/shared/util';

import { FinancialText } from '#components/FinancialText';
import {
  FIELD_LABEL_STYLE,
  GROUP_HEADING_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';
import { DateSelect } from '#components/select/DateSelect';
import { useDateFormat } from '#hooks/useDateFormat';
import { usePayees } from '#hooks/usePayees';
import { addNotification } from '#notifications/notificationsSlice';
import { useDispatch } from '#redux';

import { parseNum, TEILFREISTELLUNG_EQUITY, yearOf } from './etftax';
import type { NotePatterns } from './etftax';
import type { EtfTaxPosition } from './etftax-positions';
import {
  buildSaleTransactions,
  expectedSaleTax,
  freibetragAfterSale,
  planSale,
  saleNote,
} from './etftax-sell';
import type { EtfTaxSellConfig, SaleError } from './etftax-sell';
import { formatShares } from './etftaxStyles';

type EtfTaxSellFormProps = {
  position: EtfTaxPosition;
  /** Fund name from the ISIN tag's description, if any. */
  fundName: string | null;
  sell: EtfTaxSellConfig;
  patterns: NotePatterns;
  accountName: (id: string) => string;
  money: (value: number) => string;
  /** Remaining Freibetrag and tax rate, for the expected tax of the sale. */
  freibetrag: number;
  taxRate: number;
  onClose: () => void;
  /** Called once the transactions are created, with the remaining Freibetrag. */
  onSold: (freibetrag: number) => void;
};

const INPUT_STYLE = { width: 130, textAlign: 'right' } as const;

/** Inline form under a position that books a sale in the payout account. */
export function EtfTaxSellForm({
  position,
  fundName,
  sell,
  patterns,
  accountName,
  money,
  freibetrag,
  taxRate,
  onClose,
  onSold,
}: EtfTaxSellFormProps) {
  const { t } = useTranslation();
  const { isNarrowWidth } = useResponsive();
  const dispatch = useDispatch();
  const dateFormat = useDateFormat() || 'MM/dd/yyyy';
  const { data: payees = [] } = usePayees();
  const [date, setDate] = useState(() => monthUtils.currentDay());
  const [sharesInput, setSharesInput] = useState('');
  const [saleInput, setSaleInput] = useState('');
  const [feeInput, setFeeInput] = useState('');
  const [taxInput, setTaxInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const qty = parseNum(sharesInput) ?? 0;
  // Without an entered sale value, the shares are valued at the current price.
  const defaultSaleValue =
    position.price === null
      ? null
      : Math.round(qty * position.price * 100) / 100;
  const saleValue = parseNum(saleInput) ?? defaultSaleValue ?? 0;
  // An empty fee field uses the configured default fee.
  const fee = parseNum(feeInput) ?? sell.defaultFee ?? 0;
  // Without an entered tax, the tax beyond the remaining Freibetrag is booked.
  const expected = expectedSaleTax({
    lots: position.lots,
    qty,
    saleValue,
    fee,
    freibetrag,
    taxRate,
    teilfreistellung: TEILFREISTELLUNG_EQUITY,
  });
  const taxIsEstimated = parseNum(taxInput) === null;
  // Realising gain within the Freibetrag saves tax later; a fee can eat that up.
  const feeOutweighsSaving = fee > 0 && fee >= expected.taxSaved;
  const result = planSale({
    lots: position.lots,
    qty,
    saleValue,
    fee,
    tax: parseNum(taxInput) ?? expected.tax,
  });

  const depotPayee = payees.find(p => p.transfer_acct === position.depotId);
  const note = saleNote(qty, position.isin);
  const noteGroups = patterns.trade.exec(note)?.groups;
  const noteMatches =
    noteGroups?.isin?.toUpperCase() === position.isin &&
    parseNum(noteGroups.qty ?? '') === Number(qty.toFixed(4));

  const errorText = (error: SaleError) => {
    switch (error) {
      case 'no-shares':
        return t('Enter the number of shares to sell.');
      case 'too-many-shares':
        return t('You only hold {{held}} shares.', {
          held: formatShares(position.held),
        });
      case 'no-sale-value':
        return t('Enter the sale value from the order statement.');
      default:
        return t('Fee and tax cannot be negative.');
    }
  };
  const blocker = !sell.payoutAccount
    ? t('Choose a payout account on the Selling tab first.')
    : sell.payoutAccount === position.depotId
      ? t('The payout account must not be the depot itself.')
      : !depotPayee
        ? t('No transfer payee found for the depot account.')
        : !noteMatches
          ? t(
              'The note "{{note}}" does not match your trade note pattern, so the sale would not be recognised.',
              { note },
            )
          : null;

  const create = async () => {
    if (!('plan' in result) || blocker || !sell.payoutAccount || !depotPayee) {
      return;
    }
    setIsSaving(true);
    try {
      await send('transactions-batch-update', {
        added: buildSaleTransactions({
          plan: result.plan,
          isin: position.isin,
          qty: Number(qty.toFixed(4)),
          date,
          payoutAccount: sell.payoutAccount,
          depotPayee: depotPayee.id,
          sell,
        }),
      });
      // Only a sale in the current tax year uses this year's Freibetrag.
      const newFreibetrag =
        yearOf(date) === yearOf(monthUtils.currentDay())
          ? freibetragAfterSale(freibetrag, expected.taxableGain)
          : freibetrag;
      dispatch(
        addNotification({
          notification: {
            type: 'message',
            message:
              newFreibetrag === freibetrag
                ? t('Sale of {{shares}} shares of {{isin}} booked.', {
                    shares: formatShares(qty),
                    isin: position.isin,
                  })
                : t(
                    'Sale of {{shares}} shares of {{isin}} booked. Remaining Freibetrag: {{freibetrag}}.',
                    {
                      shares: formatShares(qty),
                      isin: position.isin,
                      freibetrag: money(newFreibetrag),
                    },
                  ),
          },
        }),
      );
      onSold(newFreibetrag);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const cents = (value: number) => money(integerToAmount(value));
  const preview =
    'plan' in result
      ? [
          {
            label: t('Transfer from {{depot}} (invested value)', {
              depot: accountName(position.depotId),
            }),
            amount: result.plan.investedCents,
          },
          ...(result.plan.gainCents !== 0
            ? [
                {
                  label:
                    result.plan.gainCents > 0
                      ? t('Capital gain')
                      : t('Capital loss'),
                  amount: result.plan.gainCents,
                },
              ]
            : []),
          ...(result.plan.taxCents > 0
            ? [{ label: t('Tax'), amount: -result.plan.taxCents }]
            : []),
          ...(result.plan.feeCents > 0
            ? [{ label: t('Fee'), amount: -result.plan.feeCents }]
            : []),
        ]
      : [];

  const labelled = (label: string, input: ReactNode) => (
    <View style={{ gap: 4 }}>
      <Text style={FIELD_LABEL_STYLE}>{label}</Text>
      {input}
    </View>
  );

  return (
    <View
      style={{
        marginLeft: isNarrowWidth ? 4 : 20,
        marginBottom: 10,
        padding: '4px 0 4px 14px',
        borderLeft: `2px solid ${theme.tableBorder}`,
        gap: 12,
      }}
    >
      <Text style={GROUP_HEADING_STYLE}>
        {t('Sell {{fund}}', { fund: fundName ?? position.isin })}
        {fundName && (
          <Text
            style={{
              color: theme.pageTextSubdued,
              fontSize: 11,
              fontWeight: 400,
              letterSpacing: 0,
              marginLeft: 6,
            }}
          >
            {position.isin}
          </Text>
        )}
      </Text>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          gap: 15,
        }}
      >
        {labelled(
          t('Date'),
          <DateSelect
            value={date}
            dateFormat={dateFormat}
            inputProps={{ 'aria-label': t('Sale date'), style: { width: 120 } }}
            onSelect={setDate}
          />,
        )}
        {labelled(
          t('Shares'),
          <Input
            value={sharesInput}
            onChangeValue={setSharesInput}
            aria-label={t('Shares to sell')}
            style={INPUT_STYLE}
          />,
        )}
        {position.max && position.max.qty > 0 && (
          <Button
            onPress={() => setSharesInput(String(position.max?.qty ?? 0))}
          >
            <Trans>Max tax-free</Trans>
          </Button>
        )}
        <Button onPress={() => setSharesInput(String(position.held))}>
          <Trans>All</Trans>
        </Button>
        {labelled(
          t('Sale value'),
          <Input
            value={saleInput}
            onChangeValue={setSaleInput}
            placeholder={
              defaultSaleValue === null ? '' : String(defaultSaleValue)
            }
            aria-label={t('Sale value')}
            style={INPUT_STYLE}
          />,
        )}
        {labelled(
          t('Fee'),
          <Input
            value={feeInput}
            onChangeValue={setFeeInput}
            placeholder={String(sell.defaultFee ?? 0)}
            aria-label={t('Fee')}
            style={INPUT_STYLE}
          />,
        )}
        {labelled(
          t('Tax withheld'),
          <Input
            value={taxInput}
            onChangeValue={setTaxInput}
            placeholder={String(expected.tax)}
            aria-label={t('Tax withheld')}
            style={INPUT_STYLE}
          />,
        )}
      </View>

      {'error' in result ? (
        <Text style={{ color: theme.pageTextSubdued }}>
          {errorText(result.error)}
        </Text>
      ) : (
        <View style={{ gap: 4, maxWidth: 520 }}>
          {feeOutweighsSaving && (
            <Text style={{ color: theme.warningText }}>
              {expected.taxSaved > 0
                ? t(
                    'The fee of {{fee}} is more than the {{saved}} tax this sale saves by using your Freibetrag, and buying back usually costs another fee.',
                    { fee: money(fee), saved: money(expected.taxSaved) },
                  )
                : t(
                    'This sale saves no tax, since no gain falls within your Freibetrag, but costs a fee of {{fee}}.',
                    { fee: money(fee) },
                  )}
            </Text>
          )}
          {taxIsEstimated && (
            <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
              {expected.aboveFreibetrag > 0
                ? t(
                    'Taxable gain {{gain}} exceeds the remaining Freibetrag of {{freibetrag}} by {{above}}, so {{tax}} tax is expected and booked. Enter the tax from the statement to override it.',
                    {
                      gain: money(expected.taxableGain),
                      freibetrag: money(freibetrag),
                      above: money(expected.aboveFreibetrag),
                      tax: money(expected.tax),
                    },
                  )
                : t(
                    'Taxable gain {{gain}} is covered by the remaining Freibetrag of {{freibetrag}}, so no tax is expected.',
                    {
                      gain: money(Math.max(0, expected.taxableGain)),
                      freibetrag: money(freibetrag),
                    },
                  )}
            </Text>
          )}
          <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
            {t(
              'Split in {{account}}; the transfer line with the note "{{note}}" also books {{amount}} out of the depot:',
              {
                account: sell.payoutAccount
                  ? accountName(sell.payoutAccount)
                  : t('the payout account'),
                note,
                amount: cents(result.plan.investedCents),
              },
            )}
          </Text>
          {preview.map(line => (
            <View
              key={line.label}
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <Text>{line.label}</Text>
              <FinancialText
                style={{
                  color: line.amount < 0 ? theme.errorText : theme.pageText,
                }}
              >
                {cents(line.amount)}
              </FinancialText>
            </View>
          ))}
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              borderTop: `1px solid ${theme.tableBorder}`,
              paddingTop: 4,
              fontWeight: 600,
            }}
          >
            <Text>
              <Trans>Paid out</Trans>
            </Text>
            <FinancialText>{cents(result.plan.payoutCents)}</FinancialText>
          </View>
        </View>
      )}

      {blocker && <Text style={{ color: theme.warningText }}>{blocker}</Text>}

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          variant="primary"
          isDisabled={!('plan' in result) || blocker !== null || isSaving}
          onPress={() => void create()}
        >
          <Trans>Create transactions</Trans>
        </Button>
        <Button onPress={onClose}>
          <Trans>Cancel</Trans>
        </Button>
      </View>
    </View>
  );
}
