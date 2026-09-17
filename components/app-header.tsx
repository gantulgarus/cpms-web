"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMe } from "@/lib/api/v2/use-me";
import { clearSession } from "@/lib/auth";
import { SHOW_V2_UI } from "@/lib/config";
import { ROLE_LABEL, useRole } from "@/lib/role";

export function AppHeader() {
  const pathname = usePathname();
  const { role, isAdmin, logout } = useRole();
  const { me } = useMe();
  const isRep = me?.role === "contractor";

  // v2 горимд v1 хуудсууд шинэ backend дээр байхгүй тул цэснээс хасагдана.
  const nav = SHOW_V2_UI
    ? [
        {
          href: "/dashboard",
          label: "Хянах самбар",
          match: (p: string) => p === "/" || p.startsWith("/dashboard"),
        },
        {
          href: "/blocks",
          label: isRep ? "Миний ажлууд" : "Блокууд",
          match: (p: string) => p.startsWith("/blocks"),
        },
        // Дараалал бол өдөр тутмын ажлын эхлэл цэг — блокоос ч түрүүлж
        // харагдах ёстой, гэхдээ бүтэц нь блокоос гардаг тул хоёр дахьд.
        {
          href: "/queue",
          label: "Дараалал",
          match: (p: string) => p.startsWith("/queue"),
        },
        // Акт нь гүйцэтгэгчид ч хэрэгтэй — өөрийн хийсэн ажлын баримт.
        {
          href: "/reports",
          label: "Тайлан",
          match: (p: string) => p.startsWith("/reports"),
        },
        // Гүйцэтгэгчийн жагсаалтад бусад компанийн мэдээлэл, нэвтрэх код
        // байдаг. Сервер 403 буцаадаг ч цэсэнд харуулах нь утгагүй.
        ...(me?.canManageContractors
          ? [
              {
                href: "/contractors-v2",
                label: "Гүйцэтгэгчид",
                match: (p: string) => p.startsWith("/contractors"),
              },
            ]
          : []),
        ...(me?.canManageReferenceData
          ? [
              {
                href: "/reference",
                label: "Лавлах сан",
                match: (p: string) => p.startsWith("/reference"),
              },
            ]
          : []),
        ...(me?.canManageUsers
          ? [
              {
                href: "/users",
                label: "Хэрэглэгчид",
                match: (p: string) => p.startsWith("/users"),
              },
            ]
          : []),
      ]
    : [
        {
          href: "/",
          label: "Төслүүд",
          match: (p: string) => p === "/" || p.startsWith("/projects"),
        },
        ...(isAdmin
          ? [
              {
                href: "/companies",
                label: "Компаниуд",
                match: (p: string) => p.startsWith("/companies"),
              },
            ]
          : []),
        {
          href: "/contractors",
          label: "Гүйцэтгэгчид",
          match: (p: string) => p.startsWith("/contractors"),
        },
      ];

  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
      <div className="flex h-14 items-center gap-6 px-4">
        <Link href="/" className="font-semibold tracking-tight">
          CPMS{" "}
          <span className="text-muted-foreground font-normal">· Хяналт</span>
        </Link>

        <nav className="flex items-center gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                item.match(pathname)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {/* v2-д хэн нэвтэрснийг серверээс уншина — гүйцэтгэгчийн хувьд
              компанийн нэр гарах нь тэр өөрийн эрхээ таних гол шинж. */}
          {SHOW_V2_UI
            ? me && (
                <span className="text-muted-foreground hidden sm:inline">
                  {me.name}
                </span>
              )
            : role && (
                <span className="text-muted-foreground hidden sm:inline">
                  {ROLE_LABEL[role]}
                </span>
              )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // v2 горимд token устгаад дахин ачаална; v1-д зөвхөн role.
              if (SHOW_V2_UI) {
                clearSession();
                window.location.href = "/";

                return;
              }
              logout();
            }}
          >
            <LogOut className="size-4" /> Гарах
          </Button>
        </div>
      </div>
    </header>
  );
}
