"use client";

/**
 * Хажуугийн навигац.
 *
 * ЯАГААД ДЭЭД ЦЭСНЭЭС СОЛИВ: долоон цэс нэг эгнээнд багтахаа больсон бөгөөд
 * тайлан нэмэгдэх тусам улам дордоно. Гэхдээ гол шалтгаан нь зай биш —
 * цэсэнд ӨӨР ТӨРЛИЙН зүйлс холилдсон байв. «Дараалал» бол өдөрт арван удаа
 * нээдэг, «Лавлах сан» бол сард нэг удаа. Нэг эгнээнд байхад аль нь чухал
 * болох нь мэдэгдэхгүй.
 *
 * Бүлэглэснээр өдөр тутмын ажил дээд талд, тохиргоо доод талд байрлана.
 */
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useState, useSyncExternalStore } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  ChevronLeft,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { queue } from "@/lib/api/v2/endpoints";
import { useMe } from "@/lib/api/v2/use-me";
import { useProject } from "@/lib/api/v2/use-project";
import { clearSession } from "@/lib/auth";
import { cn } from "@/lib/utils";

/** Эвхсэн эсэхийг хадгална — хэрэглэгч бүрд нэг л удаа сонгоно. */
const COLLAPSE_KEY = "cpms.sidebar.collapsed";

/** Ижил цонхон дотор өөрчлөлт мэдэгдэх өөрийн үйл явдал. */
const COLLAPSE_EVENT = "cpms:sidebar-collapse";

function subscribeToCollapse(onChange: () => void): () => void {
  window.addEventListener(COLLAPSE_EVENT, onChange);
  // Өөр таб дээр солигдвол мөн дагана.
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(COLLAPSE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match: (path: string) => boolean;
  /** Анхаарал шаардсан тоо — дараалал дээр л утгатай. */
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function AppSidebar() {
  const pathname = usePathname();
  const { me } = useMe();
  const { project } = useProject();

  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * Эвхсэн эсэх нь `localStorage`-д — өөрөөр хэлбэл React-аас ГАДНА.
   *
   * `useEffect`-ээр уншиж `setState` дуудвал нэмэлт зурагдалт үүсгэнэ.
   * `useSyncExternalStore` нь яг ийм зорилгоор байдаг: серверийн зураг
   * (`false`) ба хөтчийн утгыг зөв уялдуулна.
   */
  const collapsed = useSyncExternalStore(
    subscribeToCollapse,
    () => localStorage.getItem(COLLAPSE_KEY) === "1",
    () => false,
  );

  const toggleCollapsed = useCallback(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "0" : "1");
    // Ижил цонхонд `storage` event дуудагддаггүй тул гараар мэдэгдэнэ.
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }, [collapsed]);

  // Хуудас руу шилжихэд утасны цонх хаагдана — эффектээр биш, дарах үед.
  const closeMobile = () => setMobileOpen(false);

  /*
   * Дарааллын тоо.
   *
   * ЯАГААД ЦЭСЭНД ХЭРЭГТЭЙ ВЭ: урьд нь хэрэглэгч «Дараалал» дарж ОРЖ байж
   * хэдэн ажил хүлээж байгааг мэддэг байв. Тоо нь цэсэн дээр байснаар нээх
   * шаардлагагүй болно — өдөр тутмын урсгал богиносно.
   */
  const counts = useQuery({
    queryKey: ["v2-queue-counts", project?.id],
    queryFn: () => queue.counts(project!.id),
    enabled: Boolean(project?.id),
    refetchInterval: 60_000,
  });

  const pending = (counts.data?.inspection ?? 0) + (counts.data?.returned ?? 0);
  const isRep = me?.role === "contractor";

  const groups: NavGroup[] = [
    {
      title: "Өдөр тутам",
      items: [
        {
          href: "/dashboard",
          label: isRep ? "Миний явц" : "Хянах самбар",
          icon: LayoutDashboard,
          match: (p) => p === "/" || p.startsWith("/dashboard"),
        },
        {
          href: "/queue",
          label: "Дараалал",
          icon: ListChecks,
          match: (p) => p.startsWith("/queue"),
          badge: pending || undefined,
        },
        {
          href: "/blocks",
          label: isRep ? "Миний ажлууд" : "Блокууд",
          icon: Building2,
          match: (p) => p.startsWith("/blocks") || p.startsWith("/work-items"),
        },
        {
          href: "/issues",
          label: "Саатал",
          icon: AlertOctagon,
          match: (p) => p.startsWith("/issues"),
        },
      ],
    },
    {
      title: "Тайлан",
      items: [
        {
          href: "/reports",
          label: "Гүйцэтгэлийн акт",
          icon: FileSpreadsheet,
          match: (p) => p.startsWith("/reports"),
        },
      ],
    },
  ];

  // Тохиргооны бүлэг нь эрхээс хамаарна — хоосон бүлэг харуулах нь утгагүй.
  const settings: NavItem[] = [
    ...(me?.canManageContractors
      ? [
          {
            href: "/contractors-v2",
            label: "Гүйцэтгэгчид",
            icon: Users,
            match: (p: string) => p.startsWith("/contractors"),
          },
        ]
      : []),
    ...(me?.canManageReferenceData
      ? [
          {
            href: "/reference",
            label: "Лавлах сан",
            icon: Settings2,
            match: (p: string) => p.startsWith("/reference"),
          },
        ]
      : []),
    ...(me?.canManageUsers
      ? [
          {
            href: "/users",
            label: "Хэрэглэгчид",
            icon: Users,
            match: (p: string) => p.startsWith("/users"),
          },
        ]
      : []),
  ];

  if (settings.length > 0) groups.push({ title: "Тохиргоо", items: settings });

  const width = collapsed ? "md:w-16" : "md:w-60";

  return (
    <>
      {/* Утасны толгой — sidebar нь хажуугаас гарч ирнэ. */}
      <header className="bg-background/80 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Цэс нээх"
          className="hover:bg-accent rounded-md p-1.5"
        >
          <Menu className="size-5" />
        </button>
        <Link href="/" className="font-semibold tracking-tight">
          CPMS
        </Link>
        {pending > 0 && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle className="size-3.5" /> {pending}
          </span>
        )}
      </header>

      {/* Утсан дээрх бүрхүүл — нээлттэй үед л зурагдана. */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Цэс хаах"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={cn(
          // Өргөн (эвхэх) ба байрлал (утасны цонх) хоёулаа хөдөлнө.
          "bg-background z-50 flex flex-col border-r transition-[width,transform] duration-200",
          // Утсан дээр хажуугаас гарч ирэх цонх.
          "fixed inset-y-0 left-0 w-60 -translate-x-full md:translate-x-0",
          mobileOpen && "translate-x-0",
          // Дэлгэц дээр байнга харагдана.
          "md:sticky md:top-0 md:h-svh",
          width,
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <Link href="/" onClick={closeMobile} className="truncate font-semibold tracking-tight">
            {collapsed ? "C" : "CPMS"}
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Хаах"
            className="hover:bg-accent ml-auto rounded-md p-1.5 md:hidden"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Цэс дэлгэх" : "Цэс эвхэх"}
            title={collapsed ? "Дэлгэх" : "Эвхэх"}
            className="hover:bg-accent ml-auto hidden rounded-md p-1.5 md:block"
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-2 py-4">
          {groups.map((group) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="text-muted-foreground mb-1 px-2 text-[11px] font-medium tracking-wide uppercase">
                  {group.title}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = item.match(pathname);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobile}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                        collapsed && "justify-center",
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {item.badge ? (
                        <span
                          className={cn(
                            "rounded-full bg-amber-500/15 text-xs font-medium text-amber-700 tabular-nums",
                            // Эвхсэн үед дүрс дээр жижиг цэг болж харагдана.
                            collapsed
                              ? "absolute translate-x-3 -translate-y-3 px-1"
                              : "px-1.5 py-0.5",
                          )}
                        >
                          {item.badge}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t px-2 py-3">
          {!collapsed && me && (
            <div className="px-2 pb-1">
              <div className="truncate text-sm font-medium">{me.name}</div>
              {/* Гүйцэтгэгчид компанийн нэр нь эрхээ таних гол шинж. */}
              <div className="text-muted-foreground truncate text-xs">{me.roleLabel}</div>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start")}
            title={collapsed ? "Гарах" : undefined}
            onClick={() => {
              clearSession();
              window.location.href = "/";
            }}
          >
            <LogOut className="size-4" />
            {!collapsed && "Гарах"}
          </Button>
        </div>
      </aside>
    </>
  );
}
