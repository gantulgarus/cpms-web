"use client";

import { useQuery } from "@tanstack/react-query";

import { request } from "@/lib/api/client";
import type { ListEnvelope, Uuid } from "@/lib/api/v2/types";

export interface ProjectSummary {
  id: Uuid;
  companyId: Uuid;
  companyName?: string;
  name: string;
  code?: string;
  location?: string;
  status: string;
}

/**
 * Идэвхтэй төслийг серверээс олж авна.
 *
 * Төслийн ID нь орчин бүрд өөр (mock-д `prj-inel-01`, MySQL-д UUID). Хатуу
 * бичвэл mock-оос жинхэнэ backend руу шилжихэд шууд эвдэрдэг. Инэл ХХК-д
 * ганц төсөл байгаа тул эхнийхийг сонгоно — олон болбол энд сонголт нэмнэ.
 */
export function useProject() {
  const query = useQuery({
    queryKey: ["v2-projects"],
    queryFn: () => request<ListEnvelope<ProjectSummary>>("GET", "/projects"),
    staleTime: 5 * 60_000,
  });

  return {
    project: query.data?.data[0] ?? null,
    projects: query.data?.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
