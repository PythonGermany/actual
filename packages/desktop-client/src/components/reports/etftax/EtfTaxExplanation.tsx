import { Trans } from 'react-i18next';

import { Paragraph } from '@actual-app/components/paragraph';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { GROUP_HEADING_STYLE } from '#components/reports/reports/monte-carlo/monteCarloStyles';

import { maxTaxFreeQty, projectVap, TEILFREISTELLUNG_EQUITY } from './etftax';
import type { BasiszinsOverrides, Group } from './etftax';
import { formatShares } from './etftaxStyles';

type EtfTaxExplanationProps = {
  /** The current tax year; the Vorabpauschale example uses its Basiszins. */
  taxYear: number;
  taxRate: number;
  basiszinsOverrides: BasiszinsOverrides;
  money: (value: number) => string;
};

// Inputs of the worked examples. The results are computed with the same
// functions as the report, so the text always matches the calculation.
const VAP_SHARES = 10;
const VAP_START_PRICE = 100;
const SALE_SHARES = 50;
const SALE_BUY_PRICE = 80;
const SALE_VAP_PER_SHARE = 2;
const SALE_PRICE = 120;
const SALE_FREIBETRAG = 1000;

const SECTION_HEADING_STYLE = { ...GROUP_HEADING_STYLE, marginBottom: 5 };

/** A worked example, set apart from the prose with a left border. */
const EXAMPLE_STYLE = {
  ...styles.tnum,
  borderLeft: `2px solid ${theme.tableBorder}`,
  paddingLeft: 10,
  marginBottom: 15,
  gap: 2,
  lineHeight: '1.5em',
};

/** The "How is this calculated?" panel at the bottom of the report. */
export function EtfTaxExplanation({
  taxYear,
  taxRate,
  basiszinsOverrides,
  money,
}: EtfTaxExplanationProps) {
  const percent = (value: number, digits: number) =>
    `${Number((value * 100).toFixed(digits))}%`;
  const year = taxYear;
  const rate = percent(taxRate, 3);
  const exempt = percent(TEILFREISTELLUNG_EQUITY, 0);
  const taxable = percent(1 - TEILFREISTELLUNG_EQUITY, 0);

  // Vorabpauschale: 10 shares bought in March count for 10/12 of the year.
  const vapLots = [{ date: `${taxYear}-03-15`, qtyRem: VAP_SHARES }];
  const vap = projectVap({
    lots: vapLots,
    taxYear,
    startPrice: VAP_START_PRICE,
    price: null,
    taxRate,
    basiszinsOverrides,
  });
  // A year that rose by only half the Basisertrag shows the cap.
  const rise = Math.round(vap.upperPerShare * 50) / 100;
  const capped = projectVap({
    lots: vapLots,
    taxYear,
    startPrice: VAP_START_PRICE,
    price: VAP_START_PRICE + rise,
    taxRate,
    basiszinsOverrides,
  });
  const basiszins = percent(vap.basiszins, 2);
  const startPrice = money(VAP_START_PRICE);
  const perShare = money(vap.upperPerShare);
  const upper = money(vap.upper.total);
  const upperTax = money(vap.upper.tax);
  const riseText = money(rise);
  const cappedTotal = money(capped.atPrice?.total ?? 0);

  // Max tax-free sale on a single lot.
  const saleGroup: Group = {
    isin: '',
    lots: [
      {
        date: '',
        qtyOrig: SALE_SHARES,
        qtyRem: SALE_SHARES,
        price: SALE_BUY_PRICE,
        vap: SALE_VAP_PER_SHARE,
        sales: [],
      },
    ],
    soldQty: 0,
    overshoot: 0,
    firstSeen: '',
    vapSources: [],
  };
  const max = maxTaxFreeQty(
    saleGroup,
    SALE_PRICE,
    TEILFREISTELLUNG_EQUITY,
    SALE_FREIBETRAG,
  );
  const saleTaxablePerShare =
    (SALE_PRICE - SALE_BUY_PRICE - SALE_VAP_PER_SHARE) *
    (1 - TEILFREISTELLUNG_EQUITY);
  const freibetrag = money(SALE_FREIBETRAG);
  const shares = formatShares(SALE_SHARES);
  const buyPrice = money(SALE_BUY_PRICE);
  const vapPerShare = money(SALE_VAP_PER_SHARE);
  const salePrice = money(SALE_PRICE);
  const taxablePerShare = money(saleTaxablePerShare);
  const maxShares = formatShares(max.qty);
  const proceeds = money(max.qty * SALE_PRICE);

  return (
    <View
      style={{
        backgroundColor: theme.tableBackground,
        padding: 20,
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <Text
        style={{
          ...styles.mediumText,
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        <Trans>How is this calculated?</Trans>
      </Text>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Lots and FIFO</Trans>
      </Text>
      <Paragraph>
        <Trans>
          Every depot transaction whose note matches the trade pattern (by
          default &quot;10x #ISIN&quot;) is a trade: a positive amount is a buy,
          a negative one a sale. Each buy opens a lot whose buy price is the
          amount divided by the shares. A sale always uses up the oldest shares
          first (FIFO), as German tax law requires, and every depot is counted
          on its own.
        </Trans>
      </Paragraph>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Teilfreistellung</Trans>
      </Text>
      <Paragraph>
        <Trans>
          For equity ETFs {{ exempt }} of every gain is tax-free, so only{' '}
          {{ taxable }} of it is taxed. &quot;Taxed profit&quot; is the market
          value minus what you paid and minus the Vorabpauschale already taxed
          on the held shares, times {{ taxable }}.
        </Trans>
      </Paragraph>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Vorabpauschale</Trans>
      </Text>
      <Paragraph>
        <Trans>
          Every January the bank taxes a notional gain for the previous year,
          even if you sold nothing. Per share it is the Basiszins × 70% × the
          price on the first trading day of the year, but never more than the
          price actually rose during the year, and nothing in a year the price
          fell. Shares bought during the year count only for the months held:
          (13 − purchase month) ÷ 12. The tax on it is the amount ×{' '}
          {{ taxable }} × your tax rate, and nothing as long as your Freibetrag
          covers it.
        </Trans>
      </Paragraph>
      <Paragraph>
        <Trans>
          The taxed amount isn&apos;t lost: it is spread over the shares held on
          December 31 and lowers the gain when you later sell them, so the same
          gain is never taxed twice.
        </Trans>
      </Paragraph>
      <View style={EXAMPLE_STYLE}>
        <Text>
          <Trans>
            Example for {{ year }}: 10 shares bought in March, start price{' '}
            {{ startPrice }}, Basiszins {{ basiszins }}, tax rate {{ rate }}.
          </Trans>
        </Text>
        <Text>
          <Trans>
            Per share: {{ basiszins }} × 70% × {{ startPrice }} = {{ perShare }}
          </Trans>
        </Text>
        <Text>
          <Trans>
            Vorabpauschale: {{ perShare }} × 10 shares × 10/12 = {{ upper }}
          </Trans>
        </Text>
        <Text>
          <Trans>
            Tax: {{ upper }} × {{ taxable }} × {{ rate }} = {{ upperTax }}
          </Trans>
        </Text>
        {rise > 0 && (
          <Text>
            <Trans>
              If the price only rose by {{ riseText }}, the cap applies:{' '}
              {{ riseText }} × 10 shares × 10/12 = {{ cappedTotal }}
            </Trans>
          </Text>
        )}
      </View>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Booked and expected Vorabpauschale</Trans>
      </Text>
      <Paragraph>
        <Trans>
          Enter the gross Vorabpauschale from your bank&apos;s January statement
          under Booked Vorabpauschale. A year is expected when its Basiszins was
          positive and some of the shares held at its end are still in the
          depot; years whose shares are all sold no longer matter, so they are
          not asked for. The expected Vorabpauschale for next January uses the
          start price you enter and today&apos;s price as the year-end price;
          the upper bound ignores the cap, in case the price still rises.
        </Trans>
      </Paragraph>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Max tax-free sale</Trans>
      </Text>
      <Paragraph>
        <Trans>
          Going from the oldest lot to the newest, each share is taxed on (price
          − buy price − Vorabpauschale per share) × {{ taxable }}. Shares are
          sold until the remaining Freibetrag is used up. A lot at a loss has to
          be sold anyway because FIFO can&apos;t skip it, and its loss adds to
          what can be sold tax-free.
        </Trans>
      </Paragraph>
      <View style={EXAMPLE_STYLE}>
        <Text>
          <Trans>
            Example: {{ freibetrag }} Freibetrag left, one lot of {{ shares }}{' '}
            shares bought at {{ buyPrice }} with {{ vapPerShare }}{' '}
            Vorabpauschale per share, price now {{ salePrice }}.
          </Trans>
        </Text>
        <Text>
          <Trans>
            Taxed per share: ({{ salePrice }} − {{ buyPrice }} −{' '}
            {{ vapPerShare }}) × {{ taxable }} = {{ taxablePerShare }}
          </Trans>
        </Text>
        <Text>
          <Trans>
            Tax-free: {{ freibetrag }} ÷ {{ taxablePerShare }} ≈ {{ maxShares }}{' '}
            shares (about {{ proceeds }})
          </Trans>
        </Text>
      </View>

      <Text style={SECTION_HEADING_STYLE}>
        <Trans>Limits</Trans>
      </Text>
      <Paragraph isLast>
        <Trans>
          These are estimates for accumulating equity ETFs: distributions are
          ignored and only the {{ exempt }} equity-fund exemption is used. Your
          Freibetrag is shared with interest and dividends from other accounts,
          so enter what is left of it. Loss pots (Verlusttöpfe) are not taken
          into account, and church tax only if you include it in the tax rate.
        </Trans>
      </Paragraph>
    </View>
  );
}
