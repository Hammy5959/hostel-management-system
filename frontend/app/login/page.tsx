import type { Metadata } from "next";
import { Building2, Lock } from "lucide-react";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[480px]">
        {/* Brand header (outside card) */}
        <div className="mb-8 flex flex-col items-center justify-center">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Building2 aria-hidden className="size-12" strokeWidth={1.5} />
          </div>
          <h1 className="text-[32px] font-semibold leading-10 tracking-tight text-on-surface">
            SHMS Admin
          </h1>
          <p className="mt-1 text-base text-on-surface-variant">
            Student Hostel Management Portal
          </p>
        </div>

        {/* Login card */}
        <div className="relative overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-8 shadow-[0px_20px_25px_-5px_rgba(0,0,0,0.1),0px_8px_10px_-6px_rgba(0,0,0,0.05)]">
          {/* Subtle top highlight */}
          <div aria-hidden className="absolute inset-x-0 top-0 h-1 bg-primary" />

          <div className="mb-8 text-center">
            <h2 className="text-2xl font-semibold tracking-tight text-on-surface">
              Sign in
            </h2>
            <p className="mt-1 text-sm text-on-surface-variant">
              Enter your institutional credentials to access the dashboard.
            </p>
          </div>

          <LoginForm />

          <div className="mt-8 flex flex-col items-center justify-center gap-2">
            <a
              href="#"
              className="text-xs font-semibold tracking-wide text-primary transition-colors hover:text-primary-container"
            >
              Trouble signing in?
            </a>
            <a
              href="#"
              className="text-xs font-semibold tracking-wide text-on-surface-variant transition-colors hover:text-on-surface"
            >
              Contact IT Support
            </a>
          </div>
        </div>

        {/* Security footer */}
        <div className="mt-8 flex items-center justify-center gap-2 text-on-surface-variant opacity-80">
          <Lock aria-hidden className="size-4" />
          <span className="text-xs font-semibold tracking-wide">
            Secured by SHMS Enterprise
          </span>
        </div>
      </div>
    </main>
  );
}
