// @polsia:user-owned — focused sign-in entry for co-op coordinators.
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/custom/auth-pages.module.css';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';
import { SignInForm } from '@/components/custom/sign-in-form';

export const metadata: Metadata = { title: 'Sign in | Kithwheel' };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="Kithwheel home">
        <KithwheelMark className={styles.mark} />
        Kithwheel
      </Link>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Coordinator workspace</p>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.description}>Sign in to open your private coordinator workspace.</p>
        <SignInForm />
        <p className={styles.switch}>
          New to Kithwheel? <Link href="/signup">Create a coordinator account</Link>
        </p>
      </section>
      <Link href="/" className={styles.back}>
        Back to Kithwheel
      </Link>
    </main>
  );
}
