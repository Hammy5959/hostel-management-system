import type { Metadata } from "next";
import { Building2, ShieldCheck } from "lucide-react";

import { VerifyOtpForm } from "@/components/auth/verify-otp-form";

export const metadata: Metadata = {
  title: "Security Verification",
};

const CAMPUS_IMAGE_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCOhjDdyek9z77G-XIj_IE8GDKHVszBKzzYbl6QVKfmGBYh42LqK1op_w-Dg_c5sbGiQmMvc_1InFLp22gGyLPxgRbdWD3Bnf-yk6muMunTGYGEDuqv4ilUl8NM8QqWiMyAiCS9UirmmB8ZnGAZey1iMHaEEYZ-0wRSnVl6FOfeH0kRXMca1hyiyYnBajGQ0wXoaBYQ1zJukZDS9r_lXzW1fzLqoJkBZ_a3xa7NRgVU5p_JZxgmC74y";

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { email } = await searchParams;
  const emailValue = typeof email === "string" ? email : undefined;

  return (
    <main className="flex min-h-dvh bg-surface-container-lowest font-sans antialiased">
      {/* Left pane: branding & imagery (desktop only) */}
      <div className="relative hidden w-1/2 overflow-hidden bg-surface-container-high lg:flex">
        <div className="absolute inset-0 z-0">
          <div
            aria-hidden
            className="h-full w-full bg-cover bg-center opacity-40"
            style={{ backgroundImage: `url('${CAMPUS_IMAGE_URL}')` }}
          />
        </div>
        <div
          aria-hidden
          className="absolute inset-0 z-10 bg-gradient-to-tr from-primary/90 to-primary-container/70 mix-blend-multiply"
        />
        <div className="relative z-20 flex w-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <Building2 aria-hidden className="size-9 text-white" strokeWidth={1.75} />
            <h1 className="text-2xl font-bold text-white">SHMS</h1>
          </div>
          <div className="max-w-md">
            <h2 className="mb-6 text-5xl font-bold leading-[1.15] tracking-tight text-white">
              Secure Access.
            </h2>
            <p className="text-base leading-relaxed text-white/90">
              Protecting institutional data and ensuring a safe, frictionless
              experience for administrators and residents.
            </p>
          </div>
        </div>
      </div>

      {/* Right pane: OTP form */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-24">
        {/* Mobile logo */}
        <div className="mb-12 flex items-center gap-3 lg:hidden">
          <Building2 aria-hidden className="size-8 text-primary" strokeWidth={1.75} />
          <span className="text-2xl font-bold text-primary">SHMS</span>
        </div>

        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 text-center sm:text-left">
            <div className="mb-6 inline-flex size-12 items-center justify-center rounded-full bg-primary-container/10">
              <ShieldCheck aria-hidden className="size-6 text-primary" />
            </div>
            <h2 className="mb-2 text-[28px] font-semibold leading-9 tracking-tight text-on-surface sm:text-[32px]">
              Security Verification
            </h2>
            <p className="text-sm text-on-surface-variant">
              We&apos;ve sent a 6-digit verification code to{" "}
              <strong className="font-semibold text-on-surface">{emailValue}</strong>.
              Please enter it below to continue.
            </p>
          </div>

          <VerifyOtpForm email={emailValue} />
        </div>
      </div>
    </main>
  );
}
