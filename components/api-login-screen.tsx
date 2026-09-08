"use client";

/**
 * Жинхэнэ нэвтрэлт (API v2 · Sanctum).
 *
 * Хоёр зам: ажилтан имэйл/нууц үгээр, туслан гүйцэтгэгчийн төлөөлөгч олгогдсон
 * кодоор. Хоёр дахь нь захиалагчийн тусгай шаардлага — гүйцэтгэгч өөрөө ажлаа
 * бүртгэдэг байх ёстой, инженерийг хүлээхгүй.
 */
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { HardHat, LogIn, User } from "lucide-react";

import { FormField } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { request } from "@/lib/api/client";
import { storeSession, type AuthUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface LoginResponse {
  data: { token: string; user: AuthUser };
}

type Mode = "staff" | "contractor";

export function ApiLoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<Mode>("staff");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");

  const login = useMutation({
    mutationFn: () =>
      mode === "staff"
        ? request<LoginResponse>("POST", "/auth/login", {
            body: { email: email.trim(), password, deviceName: "web" },
          })
        : request<LoginResponse>("POST", "/auth/contractor-login", {
            body: { code: code.trim().toUpperCase(), deviceName: "web" },
          }),
    onSuccess: (res) => {
      storeSession(res.data.token, res.data.user);
      onSuccess();
    },
  });

  const ready = mode === "staff" ? Boolean(email.trim() && password) : code.trim().length >= 4;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">CPMS</h1>
          <p className="text-muted-foreground text-sm">Барилгын хяналтын систем</p>
        </div>

        <div className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1">
          {(
            [
              ["staff", "Ажилтан", User],
              ["contractor", "Гүйцэтгэгч", HardHat],
            ] as [Mode, string, typeof User][]
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                login.reset();
              }}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                mode === value ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-6">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                login.mutate();
              }}
            >
              {mode === "staff" ? (
                <>
                  <FormField label="Имэйл" required>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="director@cpms.mn"
                      autoComplete="username"
                      autoFocus
                    />
                  </FormField>
                  <FormField label="Нууц үг" required>
                    <Input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </FormField>
                </>
              ) : (
                <FormField
                  label="Нэвтрэх код"
                  required
                  hint="Гэрээний хугацаанд компаниас олгосон код."
                >
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="ГОО-K4M7XP"
                    autoCapitalize="characters"
                    autoComplete="one-time-code"
                    className="font-mono tracking-wider"
                    autoFocus
                  />
                </FormField>
              )}

              {login.error && (
                <p className="text-destructive text-sm" role="alert">
                  {(login.error as Error).message}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={!ready || login.isPending}>
                <LogIn className="size-4" /> Нэвтрэх
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-muted-foreground text-center text-xs">
          {mode === "staff"
            ? "Туршилтын хэрэглэгч: director@cpms.mn · password"
            : "Кодоо мартсан бол компанийн хариуцсан ажилтнаас асууна уу."}
        </p>
      </div>
    </main>
  );
}
