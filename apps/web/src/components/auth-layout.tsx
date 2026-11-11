import type { ReactNode } from 'react';
import { Coins, Link2, ShieldCheck, Zap } from 'lucide-react';

const POINTS = [
  { icon: Zap, text: 'Issue and redeem points in real time' },
  { icon: Link2, text: 'Every transaction anchored on Sui Testnet' },
  { icon: ShieldCheck, text: 'Balances and rules stay under your control' },
];

/** Split screen for /login and /register: brand panel on the left, form card on the right. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/25">
            <Coins className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-xl font-semibold tracking-tight">OctaPoint</span>
        </div>

        <div>
          <h1 className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Loyalty points your customers can trust.
          </h1>
          <ul className="mt-8 space-y-4">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-indigo-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-sm text-indigo-200">Academic MVP · Sui Testnet only</p>
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl"
          aria-hidden="true"
        />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
