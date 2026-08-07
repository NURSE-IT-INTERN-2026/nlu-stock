"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { login, ApiError } from "@/lib/api";

// Dev shortcuts. These emails must be listed in the matching *_EMAILS env var
// (see .env.example) — the allowlist is what grants the role, not this array.
const quickLogins = [
  { label: "SuperAdmin", email: "superadmin@nlu.ac.th", role: "SUPERADMIN" },
  { label: "Admin", email: "admin@nlu.ac.th", role: "ADMIN" },
  { label: "Executive", email: "executive@nlu.ac.th", role: "EXECUTIVE" },
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(loginEmail: string) {
    setLoading(true);
    setError("");
    try {
      await login(loginEmail, "");
      // ?next= is set by middleware — send QR scanners back to the item they scanned.
      // Same-origin paths only ("//host" is protocol-relative, i.e. off-site).
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Network error");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">NLU Stock</CardTitle>
        <CardDescription>Sign in to manage inventory</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          {quickLogins.map((q) => (
            <Button
              key={q.email}
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => handleLogin(q.email)}
            >
              {q.label}
            </Button>
          ))}
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (email) handleLogin(email);
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
          <Button type="submit" className="w-full" disabled={loading || !email}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign In
          </Button>
        </form>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
      </CardContent>
    </Card>
  );
}
