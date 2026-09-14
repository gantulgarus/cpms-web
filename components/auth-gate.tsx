"use client";

import { useEffect, useState } from "react";

import { ApiLoginScreen } from "@/components/api-login-screen";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { LoginScreen } from "@/components/login-screen";
import { request } from "@/lib/api/client";
import { clearSession, getToken, onUnauthorized } from "@/lib/auth";
import { SHOW_V2_UI } from "@/lib/config";
import { useRole } from "@/lib/role";

type Session =
  /** Хараахан шалгаагүй — юу ч харуулахгүй, эс бөгөөс дэлгэц анивчина. */
  { state: "checking" } | { state: "signed-out" } | { state: "signed-in" };

/**
 * Апп-ыг нэвтрэлтийн ард хаана.
 *
 * v2 горимд token байхаас гадна тэр нь СЕРВЕР ДЭЭР хүчинтэй эсэхийг шалгана.
 * Зөвхөн localStorage-д token байгааг шалгах нь хангалтгүй: `migrate:fresh`
 * хийхэд серверийн token устдаг ч хөтөч дээрх нь үлддэг. Тэр үед хэрэглэгч
 * дотогш орчихоод дуудлага бүр 401 авдаг байсан.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { role, hydrated } = useRole();
  const [session, setSession] = useState<Session>({ state: "checking" });

  useEffect(() => {
    if (!SHOW_V2_UI) return;

    let cancelled = false;

    const verify = async () => {
      if (!getToken()) {
        if (!cancelled) setSession({ state: "signed-out" });

        return;
      }

      try {
        await request("GET", "/me");
        if (!cancelled) setSession({ state: "signed-in" });
      } catch {
        // 401 бол client.ts аль хэдийн сесс цэвэрлэсэн байна.
        clearSession();
        if (!cancelled) setSession({ state: "signed-out" });
      }
    };

    void verify();

    // Ажиллаж байх үед token хүчингүй болвол шууд нэвтрэх дэлгэц рүү.
    const stop = onUnauthorized(() => setSession({ state: "signed-out" }));

    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  /*
   * v2-д хажуугийн навигац.
   *
   * Дээд эгнээ нь долоон цэс багтаахаа больсон бөгөөд тайлан нэмэгдэх тусам
   * дордох байв. Sidebar нь цэсийг БҮЛЭГЛЭХ боломж өгнө: өдөр тутмын ажил
   * дээд талд, сард нэг удаа нээдэг тохиргоо доод талд.
   *
   * v1 дэлгэцүүд хуучин толгойгоо хэвээр хэрэглэнэ — тэдгээр нь удахгүй
   * хасагдах тул хоёр удаа шилжүүлэх шаардлагагүй.
   */
  const shell = SHOW_V2_UI ? (
    <div className="flex min-h-svh flex-col md:flex-row">
      <AppSidebar />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  ) : (
    <>
      <AppHeader />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );

  if (SHOW_V2_UI) {
    if (session.state === "checking") return null;
    if (session.state === "signed-out") {
      return <ApiLoginScreen onSuccess={() => setSession({ state: "signed-in" })} />;
    }

    return shell;
  }

  if (!hydrated) return null;
  if (!role) return <LoginScreen />;

  return shell;
}
