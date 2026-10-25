"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useSyncExternalStore } from "react";

import { request } from "@/lib/api/client";
import type { ListEnvelope, Uuid } from "@/lib/api/types";

export interface ProjectSummary {
  id: Uuid;
  companyId: Uuid;
  companyName?: string;
  name: string;
  code?: string | null;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status: string;
}

/** Сонгосон төслийг хадгална — хэрэглэгч бүрд, хөтөч дээр. */
const PROJECT_KEY = "cpms.projectId";

/** Ижил цонхон дотор өөрчлөлт мэдэгдэх өөрийн үйл явдал. */
const PROJECT_EVENT = "cpms:project-change";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(PROJECT_EVENT, onChange);
  window.addEventListener("storage", onChange);

  return () => {
    window.removeEventListener(PROJECT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readSelected(): string | null {
  try {
    return window.localStorage.getItem(PROJECT_KEY);
  } catch {
    return null;
  }
}

/**
 * Идэвхтэй төслийг серверээс олж авна.
 *
 * Төслийн ID нь орчин бүрд өөр (mock-д `prj-inel-01`, MySQL-д UUID). Хатуу
 * бичвэл mock-оос жинхэнэ backend руу шилжихэд шууд эвдэрдэг. Хэрэглэгч
 * «Төслүүд» хуудаснаас сонгосон бол түүнийг, эс бөгөөс эхнийхийг авна —
 * сонгосон төсөл устсан бол чимээгүй эхний төсөл рүү буцна.
 */
export function useProject() {
  const query = useQuery({
    queryKey: ["projects"],
    queryFn: () => request<ListEnvelope<ProjectSummary>>("GET", "/projects"),
    staleTime: 5 * 60_000,
  });

  const selectedId = useSyncExternalStore(subscribe, readSelected, () => null);
  const projects = query.data?.data ?? [];

  const select = useCallback((id: Uuid) => {
    try {
      window.localStorage.setItem(PROJECT_KEY, id);
    } catch {
      // Хувийн горимд `localStorage` алдаа өгдөг — сонголт санагдахгүй.
    }
    // Ижил цонхонд `storage` event дуудагддаггүй тул гараар мэдэгдэнэ.
    window.dispatchEvent(new Event(PROJECT_EVENT));
  }, []);

  return {
    project: projects.find((p) => p.id === selectedId) ?? projects[0] ?? null,
    projects,
    select,
    isLoading: query.isLoading,
    error: query.error,
  };
}
