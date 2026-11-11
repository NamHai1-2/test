'use client';

import type { ReactNode } from 'react';
import * as AlertDialog from '@radix-ui/react-alert-dialog';

interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** While true (a request is running) the dialog cannot be closed by Escape. */
  busy?: boolean;
  /** Wider box for forms with more fields. */
  wide?: boolean;
}

/**
 * Dialog for forms and one-time information (add customer, issue points, show an API secret).
 * It is built on the alert-dialog primitive on purpose: it does not close when the user clicks outside,
 * so half-typed input or a secret that is shown once cannot be lost by accident.
 */
export function Modal({ open, onOpenChange, title, description, children, busy = false, wide = false }: ModalProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content
          className={`fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] ${wide ? 'max-w-xl' : 'max-w-md'} -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border bg-card p-6 shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95`}
        >
          <AlertDialog.Title className="text-lg font-semibold tracking-tight">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
            {description ?? ''}
          </AlertDialog.Description>
          <div className="mt-5">{children}</div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export const ModalCancel = AlertDialog.Cancel;
