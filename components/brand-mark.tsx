"use client";

/**
 * Байгууллагын таних тэмдэг.
 *
 * ХОЁР ХУВИЛБАР: бүтэн лого (тэмдэг + «ИНЭЛ» бичиг) ба зөвхөн тэмдэг.
 * Хажуу самбар хураагдсан үед 457×144 харьцаатай бүтэн логог шахвал
 * уншигдахгүй болно — тиймээс дөрвөлжин тэмдэг рүү сольдог.
 *
 * ЦАГААН ТАВЦАН ЯАГААД ХЭРЭГТЭЙ ВЭ: логоны бичиг нь бараг хар өнгөтэй.
 * Харанхуй горимд ил тод дэвсгэр дээр тавибал бичиг нь алга болно.
 * Цагаан тавцан нь хоёр горимд ижил уншигдана — лого бүхий программуудын
 * нийтлэг шийдэл.
 *
 * ЛОГО БАЙХГҮЙ БОЛ ЧИМЭЭГҮЙ ТЕКСТ РҮҮ буцна: файл байхгүй байршуулалтад
 * хөтөч эвдэрсэн зургийн дүрс харуулах нь текстээс дор.
 */
import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/** Орчны хувьсагчаар солино — байршуулалт бүр өөр байгууллагынх байж болно. */
const LOGO_SRC = process.env.NEXT_PUBLIC_LOGO_SRC ?? "/logo.png";

const LOGO_MARK_SRC = process.env.NEXT_PUBLIC_LOGO_MARK_SRC ?? "/logo-mark.png";

const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "Инэл ХХК";

export function BrandMark({
  collapsed = false,
  className,
}: {
  /** Хураасан хажуу самбар — зөвхөн тэмдэг. */
  collapsed?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cn("truncate font-semibold tracking-tight", className)}>
        {collapsed ? "C" : "CPMS"}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md bg-white",
        collapsed ? "size-8 p-1" : "h-8 px-2 py-1",
        className,
      )}
    >
      <Image
        src={collapsed ? LOGO_MARK_SRC : LOGO_SRC}
        alt={BRAND_NAME}
        width={collapsed ? 144 : 457}
        height={144}
        /*
         * Өндрөөр хязгаарлаж, өргөнийг харьцаагаар нь явуулна —
         * хайчлахгүй, сунгахгүй.
         */
        className="h-full w-auto object-contain"
        onError={() => setFailed(true)}
        priority
        unoptimized
      />
    </span>
  );
}
