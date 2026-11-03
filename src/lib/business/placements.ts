// Moving children between sections, and their case-by-case class exceptions.
import 'server-only';
import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Puts a child in a section (or none). Exceptions that no longer make sense are dropped:
 * "skip" marks on the old section's classes, and "added" classes that now belong to the
 * child's own section.
 */
export async function moveChildToSection(tx: Tx, childId: string, sectionId: string | null) {
  await tx.coopChild.update({ where: { id: childId }, data: { sectionId } });
  await tx.coopClassException.deleteMany({
    where: {
      childId,
      OR: [
        { kind: 'SKIP', class: sectionId ? { NOT: { sectionId } } : {} },
        ...(sectionId ? [{ kind: 'ADD' as const, class: { sectionId } }] : []),
      ],
    },
  });
}
