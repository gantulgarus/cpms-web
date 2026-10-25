"use client";

import { useEffect, useState } from "react";

import { ApiLoginScreen } from "@/components/api-login-screen";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { request } from "@/lib/api/client";
import { clearSession, getToken, onUnauthorized } from "@/lib/auth";

type Session =
  /** Хараахан шалгаагүй — юу ч харуулахгүй, эс бөгөөс дэлгэц анивчина. */
  { state: "checking" } | { state: "signed-out" } | { state: "signed-in" };

/**
 * Апп-ыг нэвтрэлтийн ард хаана.
 *
 * Token байхаас гадна тэр нь СЕРВЕР ДЭЭР хүчинтэй эсэхийг шалгана.
 * Зөвхөн localStorage-д token байгааг шалгах нь хангалтгүй: `migrate:fresh`
 * хийхэд серверийн token устдаг ч хөтөч дээрх нь үлддэг. Тэр үед хэрэглэгч
 * дотогш орчихоод дуудлага бүр 401 авдаг байсан.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session>({ state: "checking" });

  useEffect(() => {
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

  if (session.state === "checking") return null;
  if (session.state === "signed-out") {
    return <ApiLoginScreen onSuccess={() => setSession({ state: "signed-in" })} />;
  }

  /*
   * Хажуугийн навигац.
   *
   * Дээд эгнээ нь долоон цэс багтаахаа больсон бөгөөд тайлан нэмэгдэх тусам
   * дордох байв. Sidebar нь цэсийг БҮЛЭГЛЭХ боломж өгнө: өдөр тутмын ажил
   * дээд талд, сард нэг удаа нээдэг тохиргоо доод талд.
   */
  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <AppSidebar />
      {/*
       * Өргөний хязгаарлалтгүй — дэлгэцийн БҮТЭН өргөнийг эзэлнэ.
       *
       * Урьд нь `max-w-6xl` (1152px) байсан нь хорин гаруй баганатай ажлын
       * нэгжийн хүснэгтийг том дэлгэц дээр ч хэвтээ гүйлгэхэд хүргэж, зөв
       * талын багана (хугацаа, гүйцэтгэгч, төлөв) харагдахгүй байв. Зайг
       * хажуугийн цэс өөрөө тогтоож өгнө.
       */}
      {/*
       * Дээд эгнээ нь ҮНДСЭН хэсгийн дотор — хажуугийн самбарын БАРУУН
       * талд. Бүтэн өргөнөөр тавибал лого ба хэрэглэгчийн нэр хоёр
       * нэг эгнээнд орж, хураагддаг самбартай зөрчилдөнө.
       */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppTopbar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
