// @polsia:user-owned — password recovery request page.
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/custom/auth-pages.module.css';
import { ForgotPasswordForm } from '@/components/custom/forgot-password-form';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';

export const metadata: Metadata = { title: 'Reset your password | Kithwheel' };

export default function ForgotPasswordPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="Kithwheel home">
        <KithwheelMark className={styles.mark} />
        Kithwheel
      </Link>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Coordinator account</p>
        <h1 className={styles.title}>Reset your password</h1>
        <p className={styles.description}>
          Enter your account email and we’ll send a one-time link that expires in one hour.
        </p>
        <ForgotPasswordForm />
        <p className={styles.switch}>
          Remembered your password? <Link href="/login">Back to sign in</Link>
        </p>
      </section>
      <Link href="/" className={styles.back}>
        Back to Kithwheel
      </Link>
    </main>
  );
}
