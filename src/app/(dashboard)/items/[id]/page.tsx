"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { ItemDetailShell } from "@/components/items/item-detail-shell";

export default function Page() {
  const params = useParams();
  return (
    <Suspense fallback={null}>
      <ItemDetailShell itemId={params.id as string} />
    </Suspense>
  );
}
