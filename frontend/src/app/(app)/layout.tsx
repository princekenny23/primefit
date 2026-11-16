import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";

export default function ProductLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={<div className="app-shell"><main className="main-area"><div className="page-content"><div className="page-loading"><span />Loading PrimeFit…</div></div></main></div>}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}
