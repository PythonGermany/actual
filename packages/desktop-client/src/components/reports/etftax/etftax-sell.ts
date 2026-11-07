// Builds the transactions for selling ETF shares: a split in the payout
// account whose first part is a transfer from the depot over the invested
// value (FIFO cost basis), plus the capital gain and optional tax and fee parts.
import type { TransactionEntity } from '@actual-app/core/types/models';
import { v4 as uuidv4 } from 'uuid';

/** Payout account and the category, payee and note of each split part. */
export type EtfTaxSellConfig = {
  payoutAccount?: string;
  investedCategory?: string;
  gainCategory?: string;
  gainPayee?: string;
  gainNote?: string;
  taxCategory?: string;
  taxPayee?: string;
  taxNote?: string;
  feeCategory?: string;
  feePayee?: string;
  feeNote?: string;
  /** Fee prefilled for every sale, e.g. a flat order fee. */
  defaultFee?: number;
};

export type SalePlan = {
  /** FIFO cost basis of the sold shares; the depot transfer amount. */
  investedCents: number;
  /** Sale value − invested; negative for a loss. */
  gainCents: number;
  feeCents: number;
  taxCents: number;
  /** What reaches the payout account: sale value − fee − tax. */
  payoutCents: number;
};

export type SaleError =
  | 'no-shares'
  | 'too-many-shares'
  | 'no-sale-value'
  | 'negative-cost';

const EPS = 1e-9;

const toCents = (amount: number) => Math.round(amount * 100);

/**
 * The amounts of a sale of qty shares from the open lots (oldest first). The
 * gain is derived from the rounded invested value, so the parts always add up
 * to the payout exactly.
 */
export function planSale({
  lots,
  qty,
  saleValue,
  fee = 0,
  tax = 0,
}: {
  lots: ReadonlyArray<{ qtyRem: number; price: number }>;
  qty: number;
  saleValue: number;
  fee?: number;
  tax?: number;
}): { plan: SalePlan } | { error: SaleError } {
  if (!(qty > EPS)) {
    return { error: 'no-shares' };
  }
  const held = lots.reduce((sum, l) => sum + l.qtyRem, 0);
  if (qty > held + 1e-6) {
    return { error: 'too-many-shares' };
  }
  if (!(saleValue > 0)) {
    return { error: 'no-sale-value' };
  }
  if (fee < 0 || tax < 0) {
    return { error: 'negative-cost' };
  }
  let remaining = qty;
  let invested = 0;
  for (const lot of lots) {
    if (remaining <= EPS) {
      break;
    }
    const take = Math.min(lot.qtyRem, remaining);
    invested += take * lot.price;
    remaining -= take;
  }
  const investedCents = toCents(invested);
  const saleCents = toCents(saleValue);
  const feeCents = toCents(fee);
  const taxCents = toCents(tax);
  return {
    plan: {
      investedCents,
      gainCents: saleCents - investedCents,
      feeCents,
      taxCents,
      payoutCents: saleCents - feeCents - taxCents,
    },
  };
}

/**
 * The tax a sale is expected to trigger. The taxable gain is the sale value
 * minus the fee, the FIFO buy prices and the Vorabpauschale already taxed on
 * the sold shares, after the Teilfreistellung. Only the part above the
 * remaining Freibetrag is taxed; a loss gives no tax.
 *
 * taxSaved is the tax the sale avoids by realising gain within the
 * Freibetrag: that gain would otherwise be taxed when sold in a later year.
 */
export function expectedSaleTax({
  lots,
  qty,
  saleValue,
  fee = 0,
  freibetrag,
  taxRate,
  teilfreistellung,
}: {
  lots: ReadonlyArray<{ qtyRem: number; price: number; vap: number }>;
  qty: number;
  saleValue: number;
  fee?: number;
  freibetrag: number;
  taxRate: number;
  teilfreistellung: number;
}): {
  taxableGain: number;
  aboveFreibetrag: number;
  tax: number;
  taxSaved: number;
} {
  let remaining = qty;
  let basis = 0;
  for (const lot of lots) {
    if (remaining <= EPS) {
      break;
    }
    const take = Math.min(lot.qtyRem, remaining);
    basis += take * (lot.price + lot.vap);
    remaining -= take;
  }
  const taxableGain = (saleValue - fee - basis) * (1 - teilfreistellung);
  const allowance = Math.max(0, freibetrag);
  const aboveFreibetrag = Math.max(0, taxableGain - allowance);
  const taxFreeGain = Math.min(Math.max(0, taxableGain), allowance);
  return {
    taxableGain,
    aboveFreibetrag,
    tax: Math.round(aboveFreibetrag * taxRate * 100) / 100,
    taxSaved: Math.round(taxFreeGain * taxRate * 100) / 100,
  };
}

/**
 * The remaining Freibetrag after a sale with the given taxable gain. A gain
 * uses it up, never below 0; a loss leaves it unchanged, as the bank books
 * losses to the loss pot instead of adding them back.
 */
export function freibetragAfterSale(
  freibetrag: number,
  taxableGain: number,
): number {
  const left = Math.max(0, freibetrag - Math.max(0, taxableGain));
  return Math.round(left * 100) / 100;
}

/** The depot trade note for a sale, e.g. "12x #IE00EXAMPLE1". */
export function saleNote(qty: number, isin: string): string {
  return `${Number(qty.toFixed(4))}x #${isin}`;
}

/**
 * The parent and child transactions of a sale in the payout account. The
 * invested part pays the depot's transfer payee, so the server creates the
 * linked depot transaction when it is added.
 */
export function buildSaleTransactions({
  plan,
  isin,
  qty,
  date,
  payoutAccount,
  depotPayee,
  sell,
}: {
  plan: SalePlan;
  isin: string;
  qty: number;
  date: string;
  payoutAccount: string;
  /** The payee that transfers to the depot account. */
  depotPayee: string;
  sell: EtfTaxSellConfig;
}): TransactionEntity[] {
  const note = saleNote(qty, isin);
  const parent: TransactionEntity = {
    id: uuidv4(),
    is_parent: true,
    account: payoutAccount,
    date,
    amount: plan.payoutCents,
    payee: sell.feePayee ?? null,
    cleared: false,
    sort_order: Date.now(),
  };
  const child = (
    data: Pick<TransactionEntity, 'amount' | 'payee' | 'category' | 'notes'>,
  ): TransactionEntity => ({
    id: uuidv4(),
    is_child: true,
    parent_id: parent.id,
    account: payoutAccount,
    date,
    cleared: false,
    ...data,
  });
  // Shown in this order: invested value, capital gain, tax, fee.
  const parts = [
    child({
      amount: plan.investedCents,
      payee: depotPayee,
      category: sell.investedCategory,
      notes: note,
    }),
    ...(plan.gainCents !== 0
      ? [
          child({
            amount: plan.gainCents,
            payee: sell.gainPayee ?? null,
            category: sell.gainCategory,
            notes: sell.gainNote,
          }),
        ]
      : []),
    ...(plan.taxCents > 0
      ? [
          child({
            amount: -plan.taxCents,
            payee: sell.taxPayee ?? null,
            category: sell.taxCategory,
            notes: sell.taxNote,
          }),
        ]
      : []),
    ...(plan.feeCents > 0
      ? [
          child({
            amount: -plan.feeCents,
            payee: sell.feePayee ?? null,
            category: sell.feeCategory,
            notes: sell.feeNote,
          }),
        ]
      : []),
  ];
  // Split parts are listed by descending sort order, so count down.
  const children = parts.map((part, i) => ({
    ...part,
    sort_order: (parent.sort_order ?? 0) - i,
  }));
  return [parent, ...children];
}
