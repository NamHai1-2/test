'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Copies `value` to the clipboard and shows a check mark for two seconds. */
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked (insecure context): the value stays selectable on screen
    }
  }

  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={label} title={label} onClick={() => void copy()}>
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </Button>
  );
}
