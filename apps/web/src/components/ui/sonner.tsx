'use client';

import { Toaster as Sonner } from 'sonner';

/** Toasts for success, warning, info and error messages (SRS 5.3 "Toast" types). */
export function Toaster() {
  return <Sonner theme="light" position="top-right" richColors closeButton />;
}
