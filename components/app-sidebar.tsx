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
  CalendarClock,
  AlertTriangle,
  Building2,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderKanban,
  PackageSearch,
  Truck,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { isObserver } from "@/lib/domain";

import { Button } from "@/components/ui/button";
import { queue } from "@/lib/api/endpoints";
import { useMe } from "@/lib/api/use-me";
import { useProject } from "@/lib/api/use-project";
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
  const { project, projects } = useProject();

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
    queryKey: ["queue-counts", project?.id],
    queryFn: () => queue.counts(project!.id),
    enabled: Boolean(project?.id),
    refetchInterval: 60_000,
  });

  const pending = (counts.data?.inspection ?? 0) + (counts.data?.returned ?? 0);
  const isRep = me?.role === "contractor";

  /*
   * ЗӨВХӨН ХАРАХ ҮҮРЭГ (захирал).
   *
   * Юу ч батлахгүй тул «Дараалал», «Хугацаа сунгалт», «Бетон захиалга»
   * гэсэн ҮЙЛДЛИЙН цэснүүд түүнд утгагүй — дарвал хоосон эсвэл
   * хийх зүйлгүй жагсаалт гарна. Явц, зардлын цэс нь үлдэнэ.
   *
   * Эх сурвалж нь СЕРВЕРИЙН эрх, үүргийн нэр биш: эрх өөрчлөгдвөл цэс
   * дагаж өөрчлөгдөнө.
   */
  const observer = isObserver(me);

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
        /*
         * Дараалал нь «НАДААС юу хүлээж байна» гэсэн жагсаалт. Юу ч
         * батлахгүй хүнд энэ нь хэзээ ч хоосрохгүй жагсаалт болно —
         * анхаарал татаад хийх зүйл өгөхгүй.
         */
        ...(observer
          ? []
          : [
              {
                href: "/queue",
                label: me?.canInspect ? "Шалгах, батлах ажлууд" : me?.canCheck ? "Миний шалгах ажлууд" : "Анхаарах ажлууд",
                icon: ListChecks,
                match: (p: string) => p.startsWith("/queue"),
                badge: pending || undefined,
              },
            ]),
        {
          href: isRep ? "/my-work" : "/blocks",
          label: isRep ? "Миний ажлууд" : "Блокууд",
          icon: Building2,
          match: (p) => (isRep ? p.startsWith("/my-work") : p.startsWith("/blocks")) || p.startsWith("/work-items"),
        },
        ...(isRep ? [{
          href: "/blocks",
          label: "Барилгууд",
          icon: Building2,
          match: (p: string) => p.startsWith("/blocks"),
        }] : []),
        {
          href: "/issues",
          label: "Саатал",
          icon: AlertOctagon,
          match: (p) => p.startsWith("/issues"),
        },
        /*
         * Сунгалтын хүсэлт нь ТУСДАА цэс — дараалалд нуувал ерөнхий
         * инженер түүнийг хэзээ ч олохгүй, хүсэлт хариугүй хэвээр үлдэнэ.
         */
        ...(me?.canApproveExtensions || me?.canReportProgress
          ? [
              {
                href: "/extensions",
                label: "Хугацаа сунгалт",
                icon: CalendarClock,
                match: (p: string) => p.startsWith("/extensions"),
              },
            ]
          : []),
        /*
         * Бетон захиалга нь ӨДӨР ТУТМЫН ажил — «Ажил» бүлэгт байна.
         * Тохиргоо руу нуувал талбайн инженер олохгүй.
         *
         * ГҮЙЦЭТГЭГЧИД ХАРАГДАХГҮЙ: бетон бол захиалагчийн зардал тул
         * сервер 403 буцаадаг. Цэсэнд үлдээвэл дарах бүрт алдаа гарах
         * бөгөөд хэрэглэгч систем эвдэрсэн гэж бодно.
         */
        ...(isRep || observer
          ? []
          : [
              {
                href: "/concrete-orders",
                label: "Бетон захиалга",
                icon: Truck,
                match: (p: string) => p.startsWith("/concrete-orders"),
              },
              /*
               * Материалын захиалга нь бетоноос ТУСДАА цэс.
               *
               * Хоёрын маягт өөр: бетон нь нэг цутгалт (огноо, цаг,
               * марк, помп), материал нь олон мөр. Нэг цэс дотор
               * нуувал талбайн инженер аль нь юу болохыг санахгүй.
               */
              {
                href: "/material-orders",
                label: "Материалын захиалга",
                icon: PackageSearch,
                match: (p: string) => p.startsWith("/material-orders"),
              },
            ]),
      ],
    },
    {
      title: "Тайлан",
      items: [
        /*
         * Тохиролцоо нь АКТТАЙ хамт байх ёстой — хоёр нь нэг гинж: гэрээний
         * нэгж үнэ дээр акт тогтдог.
         *
         * Урьд нь «Тохиргоо» бүлэгт байсан тул хэрэглэгч олдоггүй байв:
         * тохиролцоо нь өдөр тутмын ажил, тохиргоо биш.
         */
        ...(me?.canManageContractors || me?.canApproveExtensions || observer
          ? [
              {
                href: "/agreements",
                label: "Тохиролцооны хуудас",
                icon: FileText,
                match: (p: string) => p.startsWith("/agreements"),
              },
            ]
          : []),
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
    // Ганц төсөлтэй үед сонгох юм алга — зөвхөн үүсгэх эрхтэй хүнд хэрэгтэй.
    ...(me?.canManageProjects || projects.length > 1
      ? [
          {
            href: "/projects",
            label: "Төслүүд",
            icon: FolderKanban,
            match: (p: string) => p.startsWith("/projects"),
          },
        ]
      : []),
    ...(me?.canManageContractors
      ? [
          {
            href: "/contractors",
            label: "Гүйцэтгэгчид",
            icon: Users,
            match: (p: string) => p.startsWith("/contractors"),
          },
        ]
      : []),
    ...(me?.canManageReferenceData
      ? [
          /*
           * Төсөв оруулах нь блокийн БҮХ мөрийг сольж гүйцэтгэлийг
           * устгадаг — лавлах сан засахтай ижил түвшний эрх.
           */
          {
            href: "/imports",
            label: "Төсөв оруулах",
            icon: FileUp,
            match: (p: string) => p.startsWith("/imports"),
          },
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
        <Link href="/">
          <BrandMark />
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
          <Link href="/" onClick={closeMobile} className="min-w-0">
            <BrandMark collapsed={collapsed} />
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

        {/*
          Том дэлгэцэд НУУГДАНА — дээд эгнээний хэрэглэгчийн цэс түүнийг
          орлоно. Утсан дээр дээд эгнээ байхгүй тул энд үлдэнэ.
        */}
        <div className="space-y-1 border-t px-2 py-3 md:hidden">
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
