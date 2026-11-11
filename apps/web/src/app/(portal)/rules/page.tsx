'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { getRules, saveRules } from '@/lib/api-client';
import { formatNumber } from '@/lib/format';
import { errorText, notifyError, notifySuccess } from '@/lib/notify';
import { useApi } from '@/lib/use-api';

const INTEGER = /^[0-9]+$/;
const LIMIT = 1_000_000;

function parse(value: string): number | null {
  const trimmed = value.trim();
  if (!INTEGER.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isSafeInteger(number) && number >= 1 && number <= LIMIT ? number : null;
}

export default function RulesPage() {
  const { data, error, loading, reload } = useApi(getRules, []);
  const [earn, setEarn] = useState('');
  const [min, setMin] = useState('');
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (data) {
      setEarn(String(data.earn_ratio));
      setMin(String(data.min_redemption_threshold));
    }
  }, [data]);

  const earnValue = parse(earn);
  const minValue = parse(min);
  const earnError = touched && earnValue === null ? `Enter a whole number from 1 to ${formatNumber(LIMIT)}.` : null;
  const minError = touched && minValue === null ? `Enter a whole number from 1 to ${formatNumber(LIMIT)}.` : null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (earnValue === null || minValue === null || saving) return;
    setSaving(true);
    try {
      await saveRules({ earn_ratio: earnValue, min_redemption_threshold: minValue });
      notifySuccess('MSG05');
      reload();
    } catch (caught) {
      notifyError(caught);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Loyalty rules"
        description="New rules apply to later transactions only. Past transactions never change."
      />

      <Card className="max-w-xl p-6">
        {error ? (
          <div>
            <p role="alert" className="text-sm text-red-700">
              {errorText(error)}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
              Try again
            </Button>
          </div>
        ) : loading && !data ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5" noValidate>
            {data === null ? (
              <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                No rules are set yet. Points cannot be issued or redeemed until you save them.
              </p>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="earn">VND per point</Label>
              <Input
                id="earn"
                inputMode="numeric"
                value={earn}
                onChange={(event) => setEarn(event.target.value)}
                aria-invalid={earnError ? true : undefined}
                aria-describedby="earn-help"
                disabled={saving}
              />
              <p id="earn-help" className={earnError ? 'text-xs text-red-700' : 'text-xs text-muted-foreground'}>
                {earnError ??
                  (earnValue
                    ? `A bill of ${formatNumber(earnValue * 10)} VND gives 10 points. The remainder is dropped.`
                    : 'Points = bill amount ÷ this number, rounded down.')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="min">Minimum points per redemption</Label>
              <Input
                id="min"
                inputMode="numeric"
                value={min}
                onChange={(event) => setMin(event.target.value)}
                aria-invalid={minError ? true : undefined}
                aria-describedby="min-help"
                disabled={saving}
              />
              <p id="min-help" className={minError ? 'text-xs text-red-700' : 'text-xs text-muted-foreground'}>
                {minError ?? 'A redemption below this number of points is refused.'}
              </p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                Save rules
              </Button>
            </div>
          </form>
        )}
      </Card>
    </>
  );
}
