// Kithwheel's coordinator workspace: pick a co-op, then work through its tabs.
'use client';

import { Plus, School } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BillingPanel } from '@/components/custom/billing/billing-panel';
import { AnnouncementsPanel } from '@/components/custom/coop/announcements-panel';
import { AttendancePanel } from '@/components/custom/coop/attendance-panel';
import tabStyles from '@/components/custom/coop/coop.module.css';
import { FamiliesPanel } from '@/components/custom/coop/families-panel';
import { FeesPanel } from '@/components/custom/coop/fees-panel';
import { SectionsPanel } from '@/components/custom/coop/sections-panel';
import { SettingsPanel } from '@/components/custom/coop/settings-panel';
import { SetupChecklist, type WorkspaceTab } from '@/components/custom/coop/setup-checklist';
import { errorMessage } from '@/components/custom/coop/shared';
import { VolunteerPanel } from '@/components/custom/coop/volunteer-panel';
import styles from '@/components/custom/scheduling/scheduling.module.css';
import { apiFetch } from '@/lib/api-client';
import { CoopSettings, type CoopSettings as CoopSettingsType } from '@/lib/contracts/coop-features';
import {
  type CoopRecord as Coop,
  CoopList,
  CoopRecord,
  SectionList,
  type SectionList as SectionListType,
} from '@/lib/contracts/coops';

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: 'schedule', label: 'Schedules' },
  { id: 'families', label: 'Families' },
  { id: 'checkin', label: 'Check-in' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'volunteer', label: 'Volunteer hours' },
  { id: 'fees', label: 'Fees' },
  { id: 'settings', label: 'Settings & team' },
];

function initialTab(): WorkspaceTab {
  if (typeof window === 'undefined') return 'schedule';
  const requested = new URL(window.location.href).searchParams.get('tab');
  return TABS.some((tab) => tab.id === requested) ? (requested as WorkspaceTab) : 'schedule';
}

export function CoordinatorWorkspace() {
  const [coops, setCoops] = useState<Coop[]>([]);
  const [coopId, setCoopId] = useState('');
  const [sections, setSections] = useState<SectionListType | null>(null);
  const [settings, setSettings] = useState<CoopSettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [coopDataError, setCoopDataError] = useState(false);
  const [creatingCoop, setCreatingCoop] = useState(false);
  const [coopName, setCoopName] = useState('');
  const [tab, setTab] = useState<WorkspaceTab>('schedule');

  useEffect(() => {
    setTab(initialTab());
  }, []);

  function goTo(next: WorkspaceTab) {
    setTab(next);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', next);
      window.history.replaceState(null, '', url);
    } catch {
      // The tab still switches; only the address bar isn't updated.
    }
  }

  const loadCoops = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const result = await apiFetch('/api/coops', { schema: CoopList });
      setCoops(result.items);
      // A ?coop= marker (returning from Stripe or an invitation) selects that co-op.
      const requested = new URL(window.location.href).searchParams.get('coop');
      setCoopId((current) => {
        if (requested && result.items.some((coop) => coop.id === requested)) return requested;
        return result.items.some((coop) => coop.id === current)
          ? current
          : (result.items[0]?.id ?? '');
      });
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCoops();
  }, [loadCoops]);

  const loadCoopData = useCallback(async (selectedCoopId: string) => {
    setCoopDataError(false);
    try {
      const [sectionResult, settingsResult] = await Promise.all([
        apiFetch(`/api/coops/${selectedCoopId}/sections`, { schema: SectionList }),
        apiFetch(`/api/coops/${selectedCoopId}/settings`, { schema: CoopSettings }),
      ]);
      setSections(sectionResult);
      setSettings(settingsResult);
    } catch {
      setSections(null);
      setSettings(null);
      setCoopDataError(true);
    }
  }, []);

  useEffect(() => {
    setSections(null);
    setSettings(null);
    if (coopId) void loadCoopData(coopId);
  }, [coopId, loadCoopData]);

  const refreshSettings = useCallback(async () => {
    if (!coopId) return;
    try {
      setSettings(await apiFetch(`/api/coops/${coopId}/settings`, { schema: CoopSettings }));
    } catch {
      // The tabs keep working with the settings they already have.
    }
  }, [coopId]);

  async function createCoop(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await apiFetch('/api/coops', {
        method: 'POST',
        body: JSON.stringify({ name: coopName }),
        schema: CoopRecord,
      });
      setCoops((current) => [...current, created]);
      setCoopId(created.id);
      setCoopName('');
      setCreatingCoop(false);
      toast.success('Co-op created with nine grade sections');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (loading) {
    return (
      <output className={styles.loading} aria-live="polite">
        Opening your co-op workspace…
      </output>
    );
  }

  if (loadError) {
    return (
      <section className={styles.errorState} role="alert">
        <h1 className={styles.emptyTitle}>We couldn’t open your workspace</h1>
        <p className={styles.description}>Check your connection and try again.</p>
        <button className={styles.button} type="button" onClick={() => void loadCoops()}>
          Try again
        </button>
      </section>
    );
  }

  const coopNameField = (id: string) => (
    <label className={styles.smallLabel} htmlFor={id}>
      Co-op name
      <input
        id={id}
        className={styles.field}
        value={coopName}
        onChange={(event) => setCoopName(event.target.value)}
        required
        maxLength={120}
      />
    </label>
  );

  const withClasses = sections?.items.filter((section) => section.classes.length) ?? [];
  const approved = withClasses.filter((section) => section.status === 'approved');

  return (
    <div className={styles.workspace}>
      <header className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>Kithwheel · Coordinator workspace</p>
          <h1 className={styles.title}>Co-op workspace</h1>
          <p className={styles.description}>
            Grade-section schedules, families, morning check-in, announcements, volunteer hours and
            fees for your co-op, in one place.
          </p>
        </div>
      </header>

      {!coops.length ? (
        <section className={styles.emptyState}>
          <School aria-hidden="true" size={22} color="var(--primary)" />
          <h2 className={styles.emptyTitle}>Start with your co-op</h2>
          <p className={styles.description}>
            Create a co-op workspace. You will be its first coordinator, and it starts with nine
            grade sections from Pre-K to 12th grade.
          </p>
          <form className={styles.inlineForm} onSubmit={createCoop}>
            {coopNameField('coop-name')}
            <button className={styles.button} type="submit">
              Create co-op
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className={styles.coopBar} aria-label="Selected co-op">
            <label className={styles.coopSelect} htmlFor="selected-coop">
              <span className={styles.fieldLabel}>Co-op</span>
              <select
                id="selected-coop"
                className={styles.select}
                value={coopId}
                onChange={(event) => setCoopId(event.target.value)}
              >
                {coops.map((coop) => (
                  <option key={coop.id} value={coop.id}>
                    {coop.name}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.buttonRow}>
              <button
                className={styles.quietButton}
                type="button"
                onClick={() => setCreatingCoop((open) => !open)}
              >
                <Plus aria-hidden="true" size={15} /> Add co-op
              </button>
              {creatingCoop && (
                <form className={styles.buttonRow} onSubmit={createCoop}>
                  {coopNameField('another-coop-name')}
                  <button className={styles.button} type="submit">
                    Create
                  </button>
                </form>
              )}
            </div>
          </section>

          {sections && (
            <section className={styles.currentBar} aria-label="Schedule status">
              <span className={styles.currentMark}>Schedules</span>
              <div className={styles.currentContent}>
                <strong className={styles.currentTitle}>
                  {approved.length} of {withClasses.length} approved
                </strong>
                <span className={styles.currentDetail}>
                  {withClasses.length
                    ? `${sections.items.length} grade sections · families see approved schedules`
                    : 'Add classes to each grade section, then approve its schedule'}
                </span>
              </div>
            </section>
          )}

          {/* Hidden while the co-op's records can't load; the error below has its own retry. */}
          {coopId && !coopDataError && <BillingPanel key={coopId} coopId={coopId} />}

          {coopDataError ? (
            <section className={styles.errorState} role="alert">
              <p className={styles.description}>
                We couldn’t load this co-op&apos;s records. Your workspace is still available.
              </p>
              <button
                className={styles.button}
                type="button"
                onClick={() => void loadCoopData(coopId)}
              >
                Try again
              </button>
            </section>
          ) : !sections || !settings ? (
            <output className={styles.loading} aria-live="polite">
              Loading this co-op&apos;s records…
            </output>
          ) : (
            <>
              <SetupChecklist coopId={coopId} settings={settings} onGo={goTo} />
              <nav className={tabStyles.tabs} aria-label="Co-op workspace sections">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`${tabStyles.tab} ${tab === item.id ? tabStyles.tabActive : ''}`}
                    aria-current={tab === item.id ? 'page' : undefined}
                    onClick={() => goTo(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              {tab === 'schedule' && (
                <SectionsPanel
                  key={coopId}
                  coopId={coopId}
                  sections={sections}
                  onSections={setSections}
                  onChanged={() => void refreshSettings()}
                />
              )}
              {tab === 'families' && (
                <FamiliesPanel
                  key={coopId}
                  coopId={coopId}
                  settings={settings}
                  onSettings={setSettings}
                />
              )}
              {tab === 'checkin' && (
                <AttendancePanel
                  key={coopId}
                  coopId={coopId}
                  settings={settings}
                  onSettings={setSettings}
                />
              )}
              {tab === 'announcements' && (
                <AnnouncementsPanel key={coopId} coopId={coopId} sections={sections.items} />
              )}
              {tab === 'volunteer' && (
                <VolunteerPanel
                  key={coopId}
                  coopId={coopId}
                  settings={settings}
                  onSettings={setSettings}
                />
              )}
              {tab === 'fees' && (
                <FeesPanel
                  key={coopId}
                  coopId={coopId}
                  settings={settings}
                  onSettings={setSettings}
                />
              )}
              {tab === 'settings' && (
                <SettingsPanel
                  key={coopId}
                  coopId={coopId}
                  settings={settings}
                  onSettings={setSettings}
                  onLeft={() => {
                    goTo('schedule');
                    void loadCoops();
                  }}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
