"use client";

/**
 * Дээд эгнээ — баруун дээд буланд хэрэглэгчийн цэс.
 *
 * ЯАГААД ХАЖУУГИЙН САМБАР ХАНГАЛТГҮЙ ВЭ: хэрэглэгчийн нэр тэнд ХАМГИЙН
 * ДООД талд, цэснүүдийн ард байсан. Самбарыг хураахад огт алга болдог.
 * «Би хэн болж нэвтэрсэн бэ» гэдэг нь эрх шалгах бүрт асуудаг асуулт —
 * ялангуяа нэг компьютер дээр хэд хэдэн инженер ээлжлэн ордог талбай
 * дээр.
 *
 * ЗӨВХӨН ТОМ ДЭЛГЭЦЭД. Утсан дээр хажуугийн самбарын өөрийн толгой
 * аль хэдийн байдаг тул хоёр эгнээ давхарлах нь зай дэмий иднэ.
 */
import Link from "next/link";
import { LogOut, User as UserIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/lib/api/v2/use-me";
import { clearSession } from "@/lib/auth";

export function AppTopbar() {
  const { me } = useMe();

  if (!me) return null;

  return (
    <header className="bg-background/80 sticky top-0 z-30 hidden h-14 shrink-0 items-center justify-end gap-3 border-b px-6 backdrop-blur md:flex">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors"
          aria-label="Хэрэглэгчийн цэс"
        >
          <Avatar name={me.name} />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.name}</span>
            {/*
              Албан тушаал нь ҮҮРГЭЭС өөр: «Гэрээний мэргэжилтэн» гэж
              ажилладаг хүн системд «хяналтын инженер» эрхтэй байж болно.
              Албан тушаал бичигдээгүй бол үүргийг харуулна — хоосон
              мөр үлдээх нь утгагүй.
            */}
            <span className="text-muted-foreground block truncate text-xs">
              {me.position ?? me.roleLabel}
            </span>
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          {/*
            `DropdownMenuLabel` нь Base UI-ийн `Menu.GroupLabel` — ТЭР НЬ
            `Menu.Group` дотор байх ЁСТОЙ, эс бөгөөс ажиллах үед
            «MenuGroupContext is missing» гэж унана. Шошго ба түүний
            тайлбарлаж буй мөрүүдийг нэг бүлэгт хийнэ.
          */}
          <DropdownMenuGroup>
            <DropdownMenuLabel className="font-normal">
              <div className="truncate text-sm font-medium">{me.name}</div>
              <div className="text-muted-foreground truncate text-xs">{me.email}</div>
              {/* Эрхийг ҮРГЭЛЖ харуулна — албан тушаалтай давхцсан ч гэсэн.
                  «Юу хийж чадах вэ» гэдгийг тодорхойлдог нь энэ. */}
              <div className="text-muted-foreground mt-1 truncate text-xs">
                Эрх: {me.roleLabel}
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem render={<Link href="/profile" />}>
              <UserIcon className="size-4" /> Профайл
            </DropdownMenuItem>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              clearSession();
              window.location.href = "/";
            }}
          >
            <LogOut className="size-4" /> Гарах
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

/**
 * Нэрний эхний үсгээр тойрог.
 *
 * Зураг байхгүй тул үсэг — хоосон дүрсээс хавьгүй таниулахуйц.
 * «Б.Батбаяр» → «Б», «Ц.Хулан» → «Ц».
 */
function Avatar({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
      {letter}
    </span>
  );
}
