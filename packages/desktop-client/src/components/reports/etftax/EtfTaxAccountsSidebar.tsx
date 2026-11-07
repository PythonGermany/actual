import { Trans } from 'react-i18next';

import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import type { AccountEntity } from '@actual-app/core/types/models';

import { AccountSelector } from '#components/reports/AccountSelector';
import { MonteCarloHelpTooltip } from '#components/reports/reports/monte-carlo/MonteCarloHelpTooltip';

type EtfTaxAccountsSidebarProps = {
  accounts: AccountEntity[];
  selectedAccountIds: string[];
  onChange: (accountIds: string[]) => void;
};

/** The depot account checklist as a full-height left sidebar, laid out like the custom report's. */
export function EtfTaxAccountsSidebar({
  accounts,
  selectedAccountIds,
  onChange,
}: EtfTaxAccountsSidebarProps) {
  return (
    <View
      style={{
        minWidth: 225,
        maxWidth: 250,
        paddingTop: 10,
        paddingRight: 10,
        flexShrink: 0,
        overflowY: 'auto',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          marginBottom: 5,
        }}
      >
        <Text>
          <strong>
            <Trans>Depot accounts</Trans>
          </strong>
        </Text>
        <MonteCarloHelpTooltip>
          <Trans>FIFO runs separately for each selected depot.</Trans>
        </MonteCarloHelpTooltip>
      </View>
      <Text style={{ color: theme.pageTextSubdued, fontSize: 12 }}>
        <Trans>Tick the accounts that hold your ETFs.</Trans>
      </Text>
      <View style={{ marginTop: 10, minHeight: 200, flexGrow: 1 }}>
        <AccountSelector
          accounts={accounts.filter(a => !a.tombstone)}
          selectedAccountIds={selectedAccountIds}
          setSelectedAccountIds={onChange}
        />
      </View>
    </View>
  );
}
