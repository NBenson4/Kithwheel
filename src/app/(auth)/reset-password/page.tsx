// @polsia:user-owned — one-time password reset page.
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/custom/auth-pages.module.css';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';
import { ResetPasswordForm } from '@/components/custom/reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password | Kithwheel' };

export default function ResetPasswordPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="Kithwheel home">
        <KithwheelMark className={styles.mark} />
        Kithwheel
      </Link>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Coordinator account</p>
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.description}>
          Set a password you have not used before for your Kithwheel account.
        </p>
        <ResetPasswordForm />
        <p className={styles.switch}>
          Need another link? <Link href="/forgot-password">Request a reset email</Link>
        </p>
      </section>
      <Link href="/" className={styles.back}>
        Back to Kithwheel
      </Link>
    </main>
  );
}
