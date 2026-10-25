"use client";

import { useQuery } from "@tanstack/react-query";

import { request } from "@/lib/api/client";
import type { Uuid } from "@/lib/api/v2/types";

export interface Me {
  id: number | string;
  name: string;
  email: string;
  role: string;
  /** Үүргийн монгол нэр — серверээс ирнэ, дэлгэц давхардуулж бичихгүй. */
  roleLabel: string;
  /**
   * Албан тушаал — ҮҮРГЭЭС ӨӨР.
   *
   * Үүрэг нь эрхийг тодорхойлно («Хяналтын инженер»), албан тушаал нь
   * хүний бодит ажил («Гэрээний мэргэжилтэн»). Б.Сайхантамир нь
   * гэрээний мэргэжилтэн атлаа хяналтын инженерийн эрхтэй.
   */
  position: string | null;
  contractorId: Uuid | null;
  scopeBlockIds: Uuid[];
  /** Гүйцэтгэл мэдээлэх эрхтэй эсэх — серверээс ирнэ. */
  canReportProgress: boolean;
  /** ЭЦСИЙН батлах (2-р шат) эрхтэй эсэх. */
  canInspect: boolean;
  /**
   * 1-Р ШАТ (талбайн шалгалт) хийх эрхтэй эсэх.
   *
   * `canInspect`-ЭЭС ӨРГӨН: талбайн инженер 1-р шатыг хийдэг ч эцсийн
   * батлах эрхгүй. Хоёрыг нэг эрхээр хэмжвэл талбайн инженер шалгах
   * форм огт харахгүй болж, хоёр шаттай урсгал гацна.
   */
  canCheck: boolean;
  /** Гүйцэтгэгч бүртгэх, нэвтрэх код олгох эрхтэй эсэх. */
  canManageContractors: boolean;
  /** Хяналтын инженер оноох эрх — гүйцэтгэгч оноохоос тусдаа. */
  canAssignInspectors: boolean;
  /** Хэрэглэгч бүртгэх, үүрэг оноох эрхтэй эсэх. */
  canManageUsers: boolean;
  /** Ажлын төрөл, бүлэг зэрэг лавлах сан засах эрхтэй эсэх. */
  canManageReferenceData: boolean;
  /** Төлөвлөгөөт тоо хэмжээ, хугацаа засах эрхтэй эсэх. */
  canEditPlan: boolean;
  /**
   * МӨНГӨНИЙ мэдээлэл харах эрх — БАТЛАХААС тусдаа.
   *
   * Захирал юу ч батлахгүй ч тохиролцоо, акт, блокийн тайланг харна.
   * Талбайн инженер эсрэгээрээ: ажил шалгана ч мөнгө харахгүй.
   */
  canSeeMoney: boolean;
  /**
   * Хугацаа сунгалтыг БАТЛАХ эрх.
   *
   * Төслийн менежер ОРООГҮЙ: хуваарийн гулсалтыг хамгийн их нуумаар байдаг
   * хүн нь тэр хуваарийг хариуцдаг хүн.
   */
  canApproveExtensions: boolean;
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
