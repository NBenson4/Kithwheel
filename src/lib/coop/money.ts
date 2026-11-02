// Pure helpers for fees and volunteer hours. Safe to import in client and server code.

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString('en-US');
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, '0')}`;
}

/** "45", "45.5", "$1,200.00" → cents. Null when it isn't a sensible amount. */
export function dollarsToCents(value: string): number | null {
  const cleaned = value.replace(/[$,\s]/g, '');
  if (cleaned === '') return 0;
  if (!/^-?\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return Number.isFinite(cents) ? cents : null;
}

export function centsToDollarInput(cents: number): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

export function formatHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${hours.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${hours === 1 ? 'hour' : 'hours'}`;
}

/** "1.5" hours → 90 minutes. Null for anything that isn't a positive quarter-hour-ish number. */
export function hoursToMinutes(value: string): number | null {
  const hours = Number(value.trim());
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return null;
  return Math.round(hours * 60);
}

export type BalanceInput = {
  familyFeeCents: number;
  childFeeCents: number;
  childCount: number;
  /** Fees of classes each child is enrolled in (waitlisted classes are not charged). */
  classFees: { label: string; amountCents: number }[];
  charges: { label: string; amountCents: number }[];
  paymentsCents: number[];
};

export type BalanceLine = { label: string; amountCents: number };

export type Balance = {
  lines: BalanceLine[];
  totalCents: number;
  paidCents: number;
  balanceCents: number;
};

export function computeBalance(input: BalanceInput): Balance {
  const lines: BalanceLine[] = [];
  if (input.familyFeeCents) lines.push({ label: 'Family fee', amountCents: input.familyFeeCents });
  if (input.childFeeCents && input.childCount) {
    lines.push({
      label: `Per-child fee × ${input.childCount}`,
      amountCents: input.childFeeCents * input.childCount,
    });
  }
  for (const fee of input.classFees) if (fee.amountCents) lines.push(fee);
  for (const charge of input.charges) lines.push(charge);
  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const paidCents = input.paymentsCents.reduce((sum, value) => sum + value, 0);
  return { lines, totalCents, paidCents, balanceCents: totalCents - paidCents };
}
