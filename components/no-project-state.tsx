"use client";

import Link from "next/link";

import { EmptyState } from "@/components/states";
import { useMe } from "@/lib/api/use-me";

/**
 * Сервер дээр төсөл огт байхгүй үед.
 *
 * Урьд нь энэ үед «Блок үүсгэх» товч ЧИМЭЭГҮЙ идэвхгүй байж, шалтгаан нь
 * дэлгэц дээр огт харагддаггүй байв.
 */
export function NoProjectState() {
  const { me } = useMe();

  return (
    <EmptyState
      title="Төсөл алга"
      description={
        me?.canManageProjects
          ? "Блок үүсгэхийн өмнө эхлээд төсөл үүсгэнэ үү."
          : "Төсөл бүртгэгдээгүй байна. Системийн админд хандана уу."
      }
      action={
        me?.canManageProjects && (
          <Link
            href="/projects"
            className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          >
            Төсөл үүсгэх
          </Link>
        )
      }
    />
  );
}
