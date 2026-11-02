// Fees tab: what each family owes, payments recorded, charges and discounts.
'use client';

import { Download } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import styles from '@/components/custom/coop/coop.module.css';
import { LoadState, useFamilyOverview } from '@/components/custom/coop/families-panel';
import {
  downloadCsv,
  errorMessage,
  formatDay,
  localToday,
  post,
} from '@/components/custom/coop/shared';
import base from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import {
  CoopSettings,
  type CoopSettings as CoopSettingsType,
  FamilyOverview,
  type FamilyOverview as FamilyOverviewType,
  type FamilyRecord,
} from '@/lib/contracts/coop-features';
import { centsToDollarInput, dollarsToCents, formatMoney } from '@/lib/coop/money';

type Props = {
  coopId: string;
  settings: CoopSettingsType;
  onSettings: (settings: CoopSettingsType) => void;
};

function FeeSettings({ coopId, settings, onSettings }: Props) {
  const [familyFee, setFamilyFee] = useState(centsToDollarInput(settings.familyFeeCents));
  const [childFee, setChildFee] = useState(centsToDollarInput(settings.childFeeCents));
  const [instructions, setInstructions] = useState(settings.paymentInstructions ?? '');
  const [saving, setSaving] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const familyFeeCents = dollarsToCents(familyFee);
    const childFeeCents = dollarsToCents(childFee);
    if (
      familyFeeCents === null ||
      childFeeCents === null ||
      familyFeeCents < 0 ||
      childFeeCents < 0
    ) {
      toast.error('Enter fees as dollar amounts, like 75 or 12.50.');
      return;
    }
    setSaving(true);
    try {
      onSettings(
        await apiFetch(`/api/coops/${coopId}/settings`, {
          ...post(
            { familyFeeCents, childFeeCents, paymentInstructions: instructions || null },
            'PATCH',
          ),
          schema: CoopSettings,
        }),
      );
      toast.success('Fees saved');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={base.panel} aria-labelledby="fee-settings-heading">
      <div className={base.panelHeader}>
        <h2 className={base.panelTitle} id="fee-settings-heading">
          Fees for this term
        </h2>
      </div>
      <form className={styles.stack} onSubmit={save}>
        <p className={base.muted}>
          Balances add up automatically: the family fee, the per-child fee for each child, and each
          class’s fee (set on the class) for the classes children are enrolled in.
        </p>
        <div className={base.optionalGrid}>
          <label className={base.smallLabel} htmlFor="family-fee">
            Family fee ($)
            <input
              id="family-fee"
              className={base.field}
              inputMode="decimal"
              value={familyFee}
              placeholder="0"
              onChange={(event) => setFamilyFee(event.target.value)}
            />
          </label>
          <label className={base.smallLabel} htmlFor="child-fee">
            Per-child fee ($)
            <input
              id="child-fee"
              className={base.field}
              inputMode="decimal"
              value={childFee}
              placeholder="0"
              onChange={(event) => setChildFee(event.target.value)}
            />
          </label>
        </div>
        <label className={base.smallLabel} htmlFor="payment-instructions">
          How families pay (shown on their family page)
          <textarea
            id="payment-instructions"
            className={styles.textarea}
            value={instructions}
            maxLength={1000}
            placeholder="e.g. Venmo @maple-grove-coop, or a check to Maple Grove Co-op at drop-off."
            onChange={(event) => setInstructions(event.target.value)}
          />
        </label>
        <p className={styles.note}>
          Online card payments through Kithwheel are coming soon. For now, record payments here as
          families pay you directly.
        </p>
        <div className={base.buttonRow}>
          <button className={base.button} type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save fees'}
          </button>
        </div>
      </form>
    </section>
  );
}

function FamilyLedger({
  coopId,
  family,
  onOverview,
}: {
  coopId: string;
  family: FamilyRecord;
  onOverview: (overview: FamilyOverviewType) => void;
}) {
  const [payment, setPayment] = useState({
    amount: '',
    method: 'Cash',
    note: '',
    paidOn: localToday(),
  });
  const [charge, setCharge] = useState({ description: '', amount: '', discount: false });
  const [busy, setBusy] = useState(false);

  async function run(path: string, init: RequestInit, message: string) {
    setBusy(true);
    try {
      onOverview(await apiFetch(path, { ...init, schema: FamilyOverview }));
      toast.success(message);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const { balance } = family;
  return (
    <details className={styles.details}>
      <summary>
        <span className={styles.rowMain}>
          <span className={styles.rowTitle}>{family.parentName}</span>
          <span className={styles.rowMeta}>
            Billed {formatMoney(balance.totalCents)} · Paid {formatMoney(balance.paidCents)}
          </span>
        </span>
        <span
          className={`${styles.pill} ${balance.balanceCents > 0 ? styles.pillWarn : styles.pillGood}`}
        >
          {balance.balanceCents > 0
            ? `${formatMoney(balance.balanceCents)} due`
            : balance.balanceCents < 0
              ? `${formatMoney(-balance.balanceCents)} credit`
              : 'Paid up'}
        </span>
      </summary>
      <div className={styles.detailsBody}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <tbody>
              {balance.lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are derived and have no ids.
                <tr key={index}>
                  <td>{line.label}</td>
                  <td className={styles.num}>{formatMoney(line.amountCents)}</td>
                </tr>
              ))}
              {family.payments.map((item) => (
                <tr key={item.id}>
                  <td>
                    Payment · {item.method} · {formatDay(item.paidOn)}
                    {item.note ? ` · ${item.note}` : ''}{' '}
                    <button
                      className={styles.chipButton}
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          `/api/coops/${coopId}/payments/${item.id}`,
                          post({}, 'DELETE'),
                          'Payment removed',
                        )
                      }
                    >
                      Remove
                    </button>
                  </td>
                  <td className={styles.num}>−{formatMoney(item.amountCents)}</td>
                </tr>
              ))}
              <tr>
                <td>
                  <strong>Balance</strong>
                </td>
                <td className={styles.num}>
                  <strong>{formatMoney(balance.balanceCents)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {family.charges.length > 0 && (
          <div className={base.buttonRow}>
            {family.charges.map((item) => (
              <button
                key={item.id}
                className={styles.chipButton}
                type="button"
                disabled={busy}
                onClick={() =>
                  void run(
                    `/api/coops/${coopId}/charges/${item.id}`,
                    post({}, 'DELETE'),
                    'Charge removed',
                  )
                }
              >
                Remove “{item.description}”
              </button>
            ))}
          </div>
        )}
        <div className={styles.grid2}>
          <form
            className={base.inlineForm}
            onSubmit={async (event) => {
              event.preventDefault();
              const amountCents = dollarsToCents(payment.amount);
              if (!amountCents || amountCents <= 0) {
                toast.error('Enter the amount paid.');
                return;
              }
              const ok = await run(
                `/api/coops/${coopId}/families/${family.id}/payments`,
                post({
                  amountCents,
                  method: payment.method,
                  note: payment.note,
                  paidOn: payment.paidOn,
                }),
                'Payment recorded',
              );
              if (ok) setPayment({ ...payment, amount: '', note: '' });
            }}
          >
            <strong className={styles.rowTitle}>Record a payment</strong>
            <div className={base.optionalGrid}>
              <label className={base.smallLabel}>
                Amount ($)
                <input
                  className={base.field}
                  inputMode="decimal"
                  value={payment.amount}
                  required
                  onChange={(event) => setPayment({ ...payment, amount: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Paid by
                <select
                  className={base.select}
                  value={payment.method}
                  onChange={(event) => setPayment({ ...payment, method: event.target.value })}
                >
                  {['Cash', 'Check', 'Venmo', 'PayPal', 'Zelle', 'Card', 'Other'].map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </label>
              <label className={base.smallLabel}>
                Date
                <input
                  className={base.field}
                  type="date"
                  value={payment.paidOn}
                  required
                  onChange={(event) => setPayment({ ...payment, paidOn: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Note (optional)
                <input
                  className={base.field}
                  value={payment.note}
                  maxLength={200}
                  placeholder="Check #1042"
                  onChange={(event) => setPayment({ ...payment, note: event.target.value })}
                />
              </label>
            </div>
            <div className={base.buttonRow}>
              <button className={base.button} type="submit" disabled={busy}>
                Record payment
              </button>
            </div>
          </form>
          <form
            className={base.inlineForm}
            onSubmit={async (event) => {
              event.preventDefault();
              const cents = dollarsToCents(charge.amount);
              if (!cents || cents <= 0) {
                toast.error('Enter an amount.');
                return;
              }
              const ok = await run(
                `/api/coops/${coopId}/families/${family.id}/charges`,
                post({
                  description: charge.description,
                  amountCents: charge.discount ? -cents : cents,
                }),
                charge.discount ? 'Discount added' : 'Charge added',
              );
              if (ok) setCharge({ description: '', amount: '', discount: false });
            }}
          >
            <strong className={styles.rowTitle}>Add a charge or discount</strong>
            <div className={base.optionalGrid}>
              <label className={base.smallLabel}>
                Description
                <input
                  className={base.field}
                  value={charge.description}
                  required
                  maxLength={200}
                  placeholder="Field trip, sibling discount…"
                  onChange={(event) => setCharge({ ...charge, description: event.target.value })}
                />
              </label>
              <label className={base.smallLabel}>
                Amount ($)
                <input
                  className={base.field}
                  inputMode="decimal"
                  value={charge.amount}
                  required
                  onChange={(event) => setCharge({ ...charge, amount: event.target.value })}
                />
              </label>
            </div>
            <label className={styles.checkRow}>
              <input
                type="checkbox"
                checked={charge.discount}
                onChange={(event) => setCharge({ ...charge, discount: event.target.checked })}
              />
              This is a discount (lowers the balance)
            </label>
            <div className={base.buttonRow}>
              <button className={base.quietButton} type="submit" disabled={busy}>
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </details>
  );
}

export function FeesPanel({ coopId, settings, onSettings }: Props) {
  const { overview, setOverview, error, reload } = useFamilyOverview(coopId);
  // Fee settings change balances, so reload families after saving them.
  const handleSettings = (next: CoopSettingsType) => {
    onSettings(next);
    void reload();
  };

  const totals = (overview?.families ?? []).reduce(
    (sum, family) => ({
      billed: sum.billed + family.balance.totalCents,
      paid: sum.paid + family.balance.paidCents,
      due: sum.due + Math.max(0, family.balance.balanceCents),
    }),
    { billed: 0, paid: 0, due: 0 },
  );

  function exportBalances() {
    if (!overview) return;
    downloadCsv('family-balances.csv', [
      ['Parent', 'Email', 'Billed', 'Paid', 'Balance'],
      ...overview.families.map((family) => [
        family.parentName,
        family.email,
        (family.balance.totalCents / 100).toFixed(2),
        (family.balance.paidCents / 100).toFixed(2),
        (family.balance.balanceCents / 100).toFixed(2),
      ]),
    ]);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatMoney(totals.billed)}</span>
          <span className={styles.statLabel}>Billed</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatMoney(totals.paid)}</span>
          <span className={styles.statLabel}>Collected</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{formatMoney(totals.due)}</span>
          <span className={styles.statLabel}>Still owed</span>
        </div>
      </div>
      <div className={styles.grid2} style={{ alignItems: 'start' }}>
        <FeeSettings key={coopId} coopId={coopId} settings={settings} onSettings={handleSettings} />
        <section className={base.panel} aria-labelledby="balances-heading">
          <div className={base.panelHeader}>
            <h2 className={base.panelTitle} id="balances-heading">
              Family balances
            </h2>
            <button
              className={base.quietButton}
              type="button"
              disabled={!overview?.families.length}
              onClick={exportBalances}
            >
              <Download aria-hidden="true" size={14} /> Spreadsheet
            </button>
          </div>
          {!overview ? (
            <LoadState error={error} onRetry={() => void reload()} />
          ) : overview.families.length ? (
            <div className={styles.stack} style={{ gap: 8 }}>
              {overview.families.map((family) => (
                <FamilyLedger
                  key={family.id}
                  coopId={coopId}
                  family={family}
                  onOverview={setOverview}
                />
              ))}
            </div>
          ) : (
            <p className={base.muted}>Balances appear here once families register.</p>
          )}
        </section>
      </div>
    </div>
  );
}
