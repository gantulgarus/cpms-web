"use client";

import { useQuery } from "@tanstack/react-query";

import { request } from "@/lib/api/client";
import type { Uuid } from "@/lib/api/v2/types";

export interface Me {
  id: number | string;
  name: string;
  email: string;
  role: string;
  contractorId: Uuid | null;
  scopeBlockIds: Uuid[];
  /** Гүйцэтгэл мэдээлэх эрхтэй эсэх — серверээс ирнэ. */
  canReportProgress: boolean;
  /** Баталгаажуулах эрхтэй эсэх. */
  canInspect: boolean;
  /** Гүйцэтгэгч бүртгэх, нэвтрэх код олгох эрхтэй эсэх. */
  canManageContractors: boolean;
  /** Хэрэглэгч бүртгэх, үүрэг оноох эрхтэй эсэх. */
  canManageUsers: boolean;
  /** Ажлын төрөл, бүлэг зэрэг лавлах сан засах эрхтэй эсэх. */
  canManageReferenceData: boolean;
  /** Төлөвлөгөөт тоо хэмжээ, хугацаа засах эрхтэй эсэх. */
  canEditPlan: boolean;
}

/**
 * Нэвтэрсэн хэрэглэгч ба түүний эрх.
 *
 * Эрхийг үүргийн жагсаалтаар дэлгэц дээр давхардуулж бодохгүй — сервер
 * `canReportProgress` / `canInspect` гэж шууд хэлнэ. Дүрэм өөрчлөгдвөл нэг
 * газар засна, мөн дэлгэцийн шийдэл backend-ийн шалгалттай хэзээ ч зөрөхгүй.
 */
export function useMe() {
  const query = useQuery({
    queryKey: ["v2-me"],
    queryFn: () => request<{ data: Me }>("GET", "/me").then((r) => r.data),
    staleTime: 5 * 60_000,
  });

  return { me: query.data ?? null, isLoading: query.isLoading };
}
