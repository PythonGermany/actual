import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { Input } from '@actual-app/components/input';
import { ModeButton } from '@actual-app/components/mode-button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { AccountSelector } from '#components/reports/AccountSelector';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';
import { MonteCarloNumberInput } from '#components/reports/reports/monte-carlo/MonteCarloNumberInput';
import {
  FIELD_LABEL_ROW_STYLE,
  FIELD_LABEL_STYLE,
  FIELD_STYLE,
  GROUP_HEADING_STYLE,
} from '#components/reports/reports/monte-carlo/monteCarloStyles';

import {
  basiszinsFor,
  compileNotePatterns,
  DEFAULT_TAX_RATE,
  DEFAULT_TRADE_PATTERN,
  KNOWN_BASISZINS,
} from './etftax';
import type { EtfTaxConfig } from './etftax-spreadsheet';

type ConfigurationTab = 'depots' | 'patterns';

const PATTERN_FIELD_STYLE = { width: 520, maxWidth: '100%' } as const;

type EtfTaxConfigurationProps = {
  accounts: AccountEntity[];
  config: EtfTaxConfig;
  /** The tax year the per-year fields (Freibetrag, Basiszins) apply to. */
  taxYear: number;
  /** Show the depot checklist here; on wide screens it lives in the sidebar instead. */
  showAccounts: boolean;
  onConfigChange: (patch: Partial<EtfTaxConfig>) => void;
};

export function EtfTaxConfiguration({
  accounts,
  config,
  taxYear,
  showAccounts,
  onConfigChange,
}: EtfTaxConfigurationProps) {
  const { t } = useTranslation();
  const builtInBasiszins: number | undefined = KNOWN_BASISZINS[taxYear];
  const latestKnownPercent = `${(basiszinsFor(taxYear).rate * 100).toFixed(2)}`;
  const [activeTab, setActiveTab] = useState<ConfigurationTab>('depots');
  const [patternErrors, setPatternErrors] = useState<
    Partial<Record<'trade', string>>
  >({});
  // Bumped on reset so the uncontrolled pattern inputs pick up the cleared values.
  const [resetCount, setResetCount] = useState(0);
  const openAccounts = accounts.filter(a => !a.tombstone);

  const savePattern = (field: 'trade', value: string) => {
    const compiled = compileNotePatterns({ [field]: value });
    if ('error' in compiled) {
      setPatternErrors(errors => ({ ...errors, [field]: compiled.error }));
      return;
    }
    setPatternErrors(errors => ({ ...errors, [field]: undefined }));
    onConfigChange({ tradePattern: value.trim() || undefined });
  };

  const patternGroups = [
    {
      field: 'trade' as const,
      heading: t('Trades'),
      label: t('Trade note pattern'),
      value: config.tradePattern ?? '',
      placeholder: DEFAULT_TRADE_PATTERN,
      help: t(
        'A regular expression matched against the notes of depot transactions. It needs the named groups (?<qty>…) for the number of shares and (?<isin>…) for the fund. The default matches "10x #IE00EXAMPLE1". A positive amount is a buy, a negative one a sale.',
      ),
    },
  ];

  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        padding: 20,
        flexShrink: 0,
        gap: 15,
      }}
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
        <ModeButton
          selected={activeTab === 'depots'}
          onSelect={() => setActiveTab('depots')}
        >
          {showAccounts ? <Trans>Depots & tax</Trans> : <Trans>Tax</Trans>}
        </ModeButton>
        <ModeButton
          selected={activeTab === 'patterns'}
          onSelect={() => setActiveTab('patterns')}
        >
          <Trans>Note pattern</Trans>
        </ModeButton>
      </View>

      <Text style={{ color: theme.pageText }}>
        {activeTab === 'depots' ? (
          showAccounts ? (
            <Trans>
              Which accounts hold your ETFs, how much of your Freibetrag is left
              this year and your tax rate.
            </Trans>
          ) : (
            <Trans>
              How much of your Freibetrag is left this year, your tax rate and
              the Basiszins.
            </Trans>
          )
        ) : (
          <Trans>
            How depot trades are recognised in your transaction notes.
          </Trans>
        )}
      </Text>

      {activeTab === 'depots' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 40 }}>
          {showAccounts && (
            <View style={{ gap: 10, width: '100%' }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text style={GROUP_HEADING_STYLE}>
                  <Trans>Depot accounts</Trans>
                </Text>
                <MonteCarloHelpTooltip>
                  <Trans>FIFO runs separately for each selected depot.</Trans>
                </MonteCarloHelpTooltip>
              </View>
              <AccountSelector
                accounts={openAccounts}
                selectedAccountIds={config.accounts}
                setSelectedAccountIds={ids => onConfigChange({ accounts: ids })}
              />
            </View>
          )}

          <View style={{ gap: 10 }}>
            <Text style={GROUP_HEADING_STYLE}>
              <Trans>Tax</Trans>
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
              <View style={FIELD_STYLE}>
                <View style={FIELD_LABEL_ROW_STYLE}>
                  <Text style={FIELD_LABEL_STYLE}>
                    <Trans>Remaining Freibetrag</Trans>
                  </Text>
                  <MonteCarloHelpTooltip>
                    <Trans>
                      The Sparerpauschbetrag you have not used yet this year.
                      Each position&apos;s maximum tax-free sale is planned
                      against the full amount; the sales are not combined. It
                      resets to the full amount when a new year starts.
                    </Trans>
                  </MonteCarloHelpTooltip>
                </View>
                <MonteCarloNumberInput
                  value={config.freibetrag}
                  aria-label={t('Remaining Freibetrag')}
                  min={0}
                  max={1_000_000}
                  step={1}
                  onCommit={value => onConfigChange({ freibetrag: value ?? 0 })}
                />
              </View>
              <View style={FIELD_STYLE}>
                <View style={FIELD_LABEL_ROW_STYLE}>
                  <Text style={FIELD_LABEL_STYLE}>
                    <Trans>Tax rate (%)</Trans>
                  </Text>
                  <MonteCarloHelpTooltip>
                    <Trans>
                      Used for the expected tax on the Vorabpauschale. 26.375%
                      is the Abgeltungsteuer plus Solidaritätszuschlag; enter a
                      higher rate if you also pay church tax.
                    </Trans>
                  </MonteCarloHelpTooltip>
                </View>
                <MonteCarloNumberInput
                  value={config.taxRate}
                  aria-label={t('Tax rate (%)')}
                  scale={100}
                  min={0}
                  max={1}
                  step={0.001}
                  onCommit={value =>
                    onConfigChange({ taxRate: value ?? DEFAULT_TAX_RATE })
                  }
                />
              </View>
              <View style={FIELD_STYLE}>
                <View style={FIELD_LABEL_ROW_STYLE}>
                  <Text style={FIELD_LABEL_STYLE}>
                    {t('Basiszins {{year}} (%)', { year: taxYear })}
                  </Text>
                  <MonteCarloHelpTooltip>
                    {builtInBasiszins === undefined
                      ? t(
                          'The interest rate the Vorabpauschale is calculated with. The finance ministry (BMF) publishes the rate for {{year}} in January; enter it here once it is out. Until then, the last known rate of {{rate}}% is used.',
                          { year: taxYear, rate: latestKnownPercent },
                        )
                      : t(
                          "The interest rate the Vorabpauschale is calculated with. This is the official rate the finance ministry (BMF) published for {{year}}, so you normally don't need to change it.",
                          { year: taxYear },
                        )}
                  </MonteCarloHelpTooltip>
                </View>
                <MonteCarloNumberInput
                  value={config.basiszinsOverride ?? builtInBasiszins ?? null}
                  aria-label={t('Basiszins {{year}} (%)', { year: taxYear })}
                  placeholder={latestKnownPercent}
                  scale={100}
                  allowEmpty
                  min={-0.1}
                  max={0.2}
                  step={0.0001}
                  onCommit={value =>
                    onConfigChange({
                      // Matching the built-in rate needs no override.
                      basiszinsOverride:
                        value === null || value === builtInBasiszins
                          ? null
                          : value,
                    })
                  }
                />
              </View>
            </View>
          </View>
        </View>
      ) : (
        <View style={{ gap: 20 }}>
          {patternGroups.map(
            ({ field, heading, label, value, placeholder, help }) => (
              <View key={`${field}-${resetCount}`} style={{ gap: 10 }}>
                <Text style={GROUP_HEADING_STYLE}>{heading}</Text>
                <View style={PATTERN_FIELD_STYLE}>
                  <View style={FIELD_LABEL_ROW_STYLE}>
                    <Text style={FIELD_LABEL_STYLE}>{label}</Text>
                    <MonteCarloHelpTooltip>{help}</MonteCarloHelpTooltip>
                  </View>
                  <Input
                    defaultValue={value}
                    placeholder={placeholder}
                    aria-label={label}
                    onUpdate={newValue => savePattern(field, newValue)}
                    onEnter={newValue => savePattern(field, newValue)}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                  {patternErrors[field] && (
                    <Text
                      style={{
                        color: theme.errorText,
                        fontSize: 12,
                        marginTop: 4,
                      }}
                    >
                      {patternErrors[field]}
                    </Text>
                  )}
                </View>
              </View>
            ),
          )}
          <Button
            onPress={() => {
              setPatternErrors({});
              setResetCount(count => count + 1);
              onConfigChange({ tradePattern: undefined });
            }}
            style={{ alignSelf: 'flex-start' }}
          >
            <Trans>Reset note pattern</Trans>
          </Button>
        </View>
      )}
    </View>
  );
}
