"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { usePageHeader } from "@/components/layout/page-header-context";
import { CaseWorkspace } from "@/components/cases/case-workspace";
import { useSession } from "@/components/layout/auth-guard";
import { canManageStock } from "@/lib/roles";

export default function CasesPage() {
  return (
    <Suspense>
      <CasesShell />
    </Suspense>
  );
}

function CasesShell() {
  const { setDetail } = usePageHeader();
  useEffect(() => {
    setDetail("ซ่อมแซม · บำรุงรักษา · ยืมพัสดุ");
    return () => setDetail(null);
  }, [setDetail]);

  // ?case=REPAIR:<id> — the link an item's ประวัติ hands over.
  const initial = useSearchParams().get("case") ?? undefined;
  const { user } = useSession();
  return <CaseWorkspace initialCaseId={initial} canEdit={canManageStock(user?.role ?? "")} />;
}
