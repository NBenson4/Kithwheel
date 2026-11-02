// @polsia:user-owned — Kithwheel's public home.

import { ArrowRight, Check, ChevronRight, Clock3, Mail } from 'lucide-react';
import type { Metadata } from 'next';
import { AuthNav } from '@/components/custom/auth-nav';
import { siteDescription, siteName } from '@/lib/brand';

export const metadata: Metadata = {
  title: { absolute: siteName },
  description: siteDescription,
  alternates: { canonical: '/' },
};

const capabilities = [
  {
    number: '01',
    title: 'Plan the whole rotation',
    description:
      'Build age-group class rotations, assign teachers and rooms, then keep the schedule easy for families to find.',
    note: 'Classes · teachers · rooms',
  },
  {
    number: '02',
    title: 'Bring family sign-ups together',
    description:
      'Handle registration, class choices, capacity and waitlists alongside the schedule they belong to.',
    note: 'Registration · sign-ups · waitlists',
  },
  {
    number: '03',
    title: 'Keep class updates in context',
    description:
      'Share announcements and materials lists with the families who need them, right beside class details.',
    note: 'Announcements · materials · schedules',
  },
  {
    number: '04',
    title: 'Keep contributions visible',
    description:
      'Collect semester fees and supply payments through Stripe, and track the volunteer hours your co-op requires.',
    note: 'Fees · supplies · volunteer hours',
  },
];

const inboxItems = [
  ['Rotations & rooms', 'Age groups, teachers, spaces'],
  ['Family registration', 'Classes, capacity, waitlists'],
  ['Class announcements', 'Schedules and materials'],
  ['Fees & volunteer hours', 'Payments and contributions'],
];

export default function HomePage() {
  return (
    <div className="kw-site">
      <header className="kw-header">
        <a className="kw-wordmark" href="#top" aria-label="Kithwheel home">
          <span className="kw-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <b />
          </span>
          <span>Kithwheel</span>
        </a>
        <nav className="kw-nav" aria-label="Main navigation">
          <a href="#toolkit">What it handles</a>
          <a href="#together">How it fits</a>
        </nav>
        <div className="kw-header-actions">
          <a className="kw-header-cta" href="mailto:kithwheel@polsia.app?subject=Hello%20Kithwheel">
            Get in touch <ArrowRight aria-hidden="true" size={15} />
          </a>
          <AuthNav />
        </div>
      </header>

      <main id="top">
        <section className="kw-hero" aria-labelledby="hero-title">
          <div className="kw-hero-copy">
            <p className="kw-kicker">
              <span /> For homeschool co-ops
            </p>
            <h1 id="hero-title">
              A co-op week,
              <br />
              all in <span>sync.</span>
            </h1>
            <p className="kw-hero-lede">
              The co-op management app that keeps every moving part in sync.
            </p>
            <p className="kw-hero-description">
              Bring class rotations, family sign-ups, fees, materials and volunteer hours into one
              shared place.
            </p>
            <div className="kw-hero-actions">
              <a
                className="kw-button kw-button-dark"
                href="mailto:kithwheel@polsia.app?subject=Hello%20Kithwheel"
              >
                <Mail aria-hidden="true" size={16} />
                Contact Kithwheel
              </a>
              <a className="kw-text-link" href="#toolkit">
                Explore the toolkit <ChevronRight aria-hidden="true" size={15} />
              </a>
            </div>
            <div className="kw-hero-footnote">
              <span className="kw-footnote-rule" />
              <span>Made for the people who make co-op happen.</span>
            </div>
          </div>

          <div className="kw-hero-visual">
            <div className="kw-orbit kw-orbit-one" aria-hidden="true" />
            <div className="kw-orbit kw-orbit-two" aria-hidden="true" />
            <div
              className="kw-workspace"
              role="img"
              aria-label="Illustrative Kithwheel workspace overview with class rotations, family registration, class announcements, payments and volunteer hours."
            >
              <div className="kw-window-bar">
                <div className="kw-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </div>
                <span>KITHWHEEL / CO-OP SPACE</span>
                <span className="kw-window-menu">•••</span>
              </div>
              <div className="kw-app-layout">
                <aside className="kw-app-sidebar">
                  <div className="kw-app-brand">
                    <span className="kw-mini-mark" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                      <b />
                    </span>
                    <span>Kithwheel</span>
                  </div>
                  <div className="kw-sidebar-label">YOUR CO-OP</div>
                  <div className="kw-side-link kw-side-active">
                    <span className="kw-side-dot" /> Overview
                  </div>
                  <div className="kw-side-link">
                    <span className="kw-side-dot kw-dot-clay" /> Classes
                  </div>
                  <div className="kw-side-link">
                    <span className="kw-side-dot kw-dot-gold" /> Families
                  </div>
                  <div className="kw-side-link">
                    <span className="kw-side-dot kw-dot-blue" /> Contributions
                  </div>
                  <div className="kw-sidebar-bottom">
                    <span className="kw-avatar">K</span>
                    <span>Co-op workspace</span>
                  </div>
                </aside>
                <div className="kw-app-main">
                  <div className="kw-app-topline">
                    <span>CO-OP OVERVIEW</span>
                    <span className="kw-live-label">
                      <i /> SHARED SPACE
                    </span>
                  </div>
                  <h2>Your co-op, in rhythm.</h2>
                  <p className="kw-app-subtitle">Keep the moving pieces close together.</p>
                  <div className="kw-app-content">
                    <div className="kw-rotation-card">
                      <div className="kw-module-head">
                        <span className="kw-module-icon kw-icon-green">
                          <span className="kw-rotation-symbol" />
                        </span>
                        <div>
                          <strong>Rotations & rooms</strong>
                          <small>Build a schedule that fits</small>
                        </div>
                        <span className="kw-module-more">···</span>
                      </div>
                      <div className="kw-rotation-lines" aria-hidden="true">
                        <div className="kw-rotation-line">
                          <i className="kw-line-age" />
                          <span />
                          <b />
                        </div>
                        <div className="kw-rotation-line">
                          <i className="kw-line-teacher" />
                          <span />
                          <b />
                        </div>
                        <div className="kw-rotation-line">
                          <i className="kw-line-room" />
                          <span />
                          <b />
                        </div>
                      </div>
                      <div className="kw-rotation-legend">
                        <span>AGE GROUP</span>
                        <span>TEACHER</span>
                        <span>ROOM</span>
                      </div>
                    </div>
                    <div className="kw-task-list">
                      {inboxItems.map(([title, detail], index) => (
                        <div className="kw-task-row" key={title}>
                          <span className={`kw-task-check kw-task-check-${index}`}>
                            <Check aria-hidden="true" size={11} />
                          </span>
                          <span className="kw-task-copy">
                            <strong>{title}</strong>
                            <small>{detail}</small>
                          </span>
                          <ChevronRight aria-hidden="true" size={14} className="kw-task-chevron" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="kw-app-bottomline">
                    <span>
                      <Clock3 aria-hidden="true" size={12} /> Built around your co-op's week
                    </span>
                    <span className="kw-status-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="kw-float-note kw-float-note-top">
              <span className="kw-float-wheel" aria-hidden="true">
                <i />
                <i />
                <i />
                <i />
                <b />
              </span>
              <span>
                One shared home
                <br />
                for co-op life
              </span>
            </div>
            <div className="kw-float-note kw-float-note-bottom">
              <span className="kw-float-check">
                <Check aria-hidden="true" size={13} />
              </span>
              <span>
                Right details,
                <br />
                right families
              </span>
            </div>
          </div>
        </section>

        <section className="kw-capability-ribbon" aria-label="Kithwheel features">
          <span>Class rotations</span>
          <i />
          <span>Family sign-ups</span>
          <i />
          <span>Class updates</span>
          <i />
          <span>Payments</span>
          <i />
          <span>Volunteer hours</span>
        </section>

        <section className="kw-toolkit" id="toolkit" aria-labelledby="toolkit-title">
          <div className="kw-section-intro">
            <p className="kw-kicker kw-kicker-dark">
              <span /> The co-op toolkit
            </p>
            <div className="kw-section-heading">
              <h2 id="toolkit-title">
                The details that make
                <br />
                co-op <span>run well.</span>
              </h2>
              <p>
                Each part of the week has a place to land, so coordinators and families can stay on
                the same page.
              </p>
            </div>
          </div>
          <div className="kw-capability-list">
            {capabilities.map((item) => (
              <article className="kw-capability" key={item.number}>
                <span className="kw-capability-number">{item.number}</span>
                <div className="kw-capability-main">
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className="kw-capability-note">{item.note}</span>
              </article>
            ))}
          </div>
        </section>

        <section className="kw-together" id="together" aria-labelledby="together-title">
          <div className="kw-together-copy">
            <p className="kw-kicker kw-kicker-light">
              <span /> One shared workspace
            </p>
            <h2 id="together-title">
              More room for the
              <br />
              good part of <span className="kw-together-serif">co-op.</span>
            </h2>
            <p>
              Co-op coordination takes a lot of care. Kithwheel brings the schedules, family
              details, class notes, payments and volunteer tracking into one place built around how
              a co-op works.
            </p>
            <a
              className="kw-button kw-button-paper"
              href="mailto:kithwheel@polsia.app?subject=Hello%20Kithwheel"
            >
              Say hello <ArrowRight aria-hidden="true" size={15} />
            </a>
          </div>
          <div className="kw-community-visual" aria-hidden="true">
            <div className="kw-community-ring kw-ring-outer" />
            <div className="kw-community-ring kw-ring-inner" />
            <div className="kw-community-center">
              <span className="kw-community-mark">
                <i />
                <i />
                <i />
                <i />
                <b />
              </span>
              <span>one co-op</span>
            </div>
            <div className="kw-orbit-node kw-node-classes">
              <span className="kw-node-icon kw-node-class" />
              <span>classes</span>
            </div>
            <div className="kw-orbit-node kw-node-families">
              <span className="kw-node-icon kw-node-family" />
              <span>families</span>
            </div>
            <div className="kw-orbit-node kw-node-updates">
              <span className="kw-node-icon kw-node-updates-icon" />
              <span>updates</span>
            </div>
            <div className="kw-orbit-node kw-node-contributions">
              <span className="kw-node-icon kw-node-contribution" />
              <span>contributions</span>
            </div>
          </div>
        </section>

        <section className="kw-contact" id="contact" aria-labelledby="contact-title">
          <div>
            <p className="kw-kicker kw-kicker-dark">
              <span /> Start a conversation
            </p>
            <h2 id="contact-title">Tell us about your co-op.</h2>
          </div>
          <div className="kw-contact-action">
            <p>Every co-op has its own rhythm. We’d love to hear what yours needs.</p>
            <a
              className="kw-button kw-button-dark"
              href="mailto:kithwheel@polsia.app?subject=Hello%20Kithwheel"
            >
              <Mail aria-hidden="true" size={16} />
              kithwheel@polsia.app
            </a>
          </div>
        </section>
      </main>

      <footer className="kw-footer">
        <a className="kw-wordmark kw-footer-brand" href="#top">
          <span className="kw-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <b />
          </span>
          <span>Kithwheel</span>
        </a>
        <span className="kw-footer-tagline">
          The co-op management app that keeps every moving part in sync.
        </span>
        <a className="kw-footer-email" href="mailto:kithwheel@polsia.app">
          kithwheel@polsia.app
        </a>
        <span className="kw-copyright">© {new Date().getFullYear()} Kithwheel</span>
      </footer>
    </div>
  );
}
