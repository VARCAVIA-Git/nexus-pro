'use client';

import Link from 'next/link';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-nexus-bg">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-nexus-border bg-nexus-card p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Create Account</h1>
          <p className="mt-1 text-sm text-nexus-dim">Start trading with Nexus Pro</p>
        </div>
        <form className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-nexus-dim">Display Name</label>
            <input type="text" className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white focus:border-nexus-accent focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-nexus-dim">Email</label>
            <input type="email" className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white focus:border-nexus-accent focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-nexus-dim">Password</label>
            <input type="password" className="w-full rounded-lg border border-nexus-border bg-nexus-bg px-3 py-2 text-sm text-white focus:border-nexus-accent focus:outline-none" />
          </div>
          <button type="submit" className="w-full rounded-lg bg-nexus-accent py-2.5 text-sm font-semibold text-nexus-bg hover:bg-nexus-accent/80">
            Create Account
          </button>
        </form>
        <p className="text-center text-xs text-nexus-dim">
          Already have an account? <Link href="/login" className="text-nexus-accent hover:underline">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
