"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { login, ApiError } from "@/lib/api";
import { withBase } from "@/lib/base-path";

// ?next= is set by middleware — send QR scanners back to the item they scanned.
// Same-origin paths only ("//host" is protocol-relative, i.e. off-site).
function safeNext(): string {
  const next = new URLSearchParams(window.location.search).get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

// Dev shortcuts. These skip the provider entirely via /api/auth/login, which 404s in
// production — so this block would be a dead end there even if it rendered.
const isDev = process.env.NODE_ENV !== "production";
const quickLogins = [
  { label: "SuperAdmin", email: "superadmin@nlu.ac.th", role: "SUPERADMIN" },
  { label: "Admin", email: "admin@nlu.ac.th", role: "ADMIN" },
  { label: "Executive", email: "executive@nlu.ac.th", role: "EXECUTIVE" },
  // Neither is in any allowlist — the CMU claims are what earn them the role, exactly as a
  // real account would. Two of them because นศ. and บุคลากร reach BORROWER by different
  // signals: the student by faculty code, the staffer by department name (their code is
  // unknown — no one here has an account to look it up with).
  { label: "นักศึกษา", email: "student@cmu.ac.th", role: "BORROWER", claims: { orgCode: "12", accountType: "StudentAccount" } },
  { label: "บุคลากร", email: "staff@cmu.ac.th", role: "BORROWER", claims: { orgCode: "4501", orgName: "ภาควิชาการพยาบาลศัลยศาสตร์", accountType: "MISEmployee" } },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // The OAuth callback bounces failures back here as ?error=<ข้อความ>.
  useEffect(() => {
    const msg = new URLSearchParams(window.location.search).get("error");
    if (msg) setError(msg);
  }, []);

  function handleOAuth() {
    setLoading(true);
    // Full navigation, not a router push: the destination is the provider, off-origin.
    window.location.href = withBase(`/api/auth/cmu?next=${encodeURIComponent(safeNext())}`);
  }

  async function handleDevLogin(loginEmail: string, claims?: { orgCode?: string; orgName?: string; accountType?: string }) {
    setLoading(true);
    setError("");
    try {
      await login(loginEmail, "", claims);
      router.push(safeNext());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">NLU Stock</CardTitle>
        <CardDescription>เข้าสู่ระบบด้วยบัญชีมหาวิทยาลัย</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* The OAuth callback bounces refusals here, so this is the first thing to read —
            above the button, not tucked under it. dark:text-danger-400 because plain
            text-destructive does not clear AA on the dark card. */}
        {error && (
          <p
            role="alert"
            className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive dark:text-danger-400"
          >
            {error}
          </p>
        )}

        <Button className="w-full" disabled={loading} onClick={handleOAuth}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          เข้าสู่ระบบด้วยบัญชี CMU
        </Button>

        {isDev && (
          <>
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">dev only</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {quickLogins.map((q) => (
                <Button
                  key={q.email}
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => handleDevLogin(q.email, q.claims)}
                >
                  {q.label}
                </Button>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (email) handleDevLogin(email);
              }}
              className="space-y-3"
            >
              <Input
                type="email"
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
              <Button type="submit" variant="outline" className="w-full" disabled={loading || !email}>
                Sign In
              </Button>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
