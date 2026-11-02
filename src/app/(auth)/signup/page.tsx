// @polsia:user-owned — coordinator account creation.
import type { Metadata } from 'next';
import Link from 'next/link';
import styles from '@/components/custom/auth-pages.module.css';
import { KithwheelMark } from '@/components/custom/kithwheel-mark';
import { SignUpForm } from '@/components/custom/sign-up-form';

export const metadata: Metadata = { title: 'Create an account | Kithwheel' };

export default function SignupPage() {
  return (
    <main className={styles.page}>
      <Link href="/" className={styles.brand} aria-label="Kithwheel home">
        <KithwheelMark className={styles.mark} />
        Kithwheel
      </Link>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Coordinator workspace</p>
        <h1 className={styles.title}>Create your account</h1>
        <p className={styles.description}>
          Create your coordinator account, then name a private workspace for your co-op.
        </p>
        <SignUpForm />
        <p className={styles.note}>
          Kithwheel coordinator access is separate from any fees families may pay their co-op.
        </p>
        <p className={styles.switch}>
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </section>
      <Link href="/" className={styles.back}>
        Back to Kithwheel
      </Link>
    </main>
  );
}
