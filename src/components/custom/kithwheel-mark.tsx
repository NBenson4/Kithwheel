// The four-part Kithwheel mark shared by product screens.
import type { HTMLAttributes } from 'react';

export function KithwheelMark({ className }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={className} aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
      <b />
    </span>
  );
}
