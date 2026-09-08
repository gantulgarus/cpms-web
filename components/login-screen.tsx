"use client";

import { ChevronRight, ShieldCheck, ClipboardCheck } from "lucide-react";

import { Card } from "@/components/ui/card";
import { ROLE_DESCRIPTION, ROLE_LABEL, useRole, type Role } from "@/lib/role";

const OPTIONS: { role: Role; icon: typeof ShieldCheck }[] = [
  { role: "admin", icon: ShieldCheck },
  { role: "director", icon: ClipboardCheck },
];

export function LoginScreen() {
  const { login } = useRole();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight">CPMS</h1>
          <p className="text-muted-foreground text-sm">
            Үндсэн компанийн хяналтын консол — нэвтрэх эрхээ сонгоно уу.
          </p>
        </div>

        <div className="space-y-3">
          {OPTIONS.map(({ role, icon: Icon }) => (
            <Card
              key={role}
              role="button"
              tabIndex={0}
              onClick={() => login(role)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  login(role);
                }
              }}
              className="hover:border-primary/50 hover:bg-accent/40 flex cursor-pointer flex-row items-center gap-4 p-4 transition-colors"
            >
              <div className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-full">
                <Icon className="size-5" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{ROLE_LABEL[role]}</div>
                <div className="text-muted-foreground text-sm">{ROLE_DESCRIPTION[role]}</div>
              </div>
              <ChevronRight className="text-muted-foreground size-4" />
            </Card>
          ))}
        </div>

        <p className="text-muted-foreground text-center text-xs">
          Туршилтын горим — нэвтрэлт одоохондоо шалгалтгүй.
        </p>
      </div>
    </main>
  );
}
