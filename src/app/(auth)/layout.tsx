import { ThemeToggle } from "@/components/theme-toggle";
import Image from "next/image";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[oklch(0.32_0.06_200)] via-[oklch(0.25_0.05_195)] to-[oklch(0.18_0.04_210)]">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-[oklch(0.60_0.10_192/0.15)] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-[oklch(0.65_0.14_155/0.12)] blur-3xl" />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      {/* Auth card */}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 px-4">
        {/* Logo + branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 shadow-lg backdrop-blur-sm ring-1 ring-white/20">
            <Image
              src="/OptimizaREP-icono-blanco.svg"
              alt="OptimizaREP"
              width={40}
              height={40}
            />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              OptimizaREP
            </h1>
            <p className="mt-1 text-sm text-white/60">
              Inteligencia para gestión REP más eficiente
            </p>
          </div>
        </div>

        {/* Clerk component slot */}
        {children}
      </div>
    </div>
  );
}
