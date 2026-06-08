"use client";

import { useEffect, useState } from "react";
import type { SessionUser } from "@/types";
import { getSession } from "@/lib/api";

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then((data) => {
        if (data.user) setUser(data.user as SessionUser);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { user, loading };
}
