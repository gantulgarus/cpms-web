"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { referenceData } from "./endpoints";

export function useWorkCatalog() {
  const query = useQuery({ queryKey: ["work-catalog"], queryFn: referenceData.catalog });
  const byWorkTypeId = useMemo(() => new Map(
    (query.data?.data ?? []).filter((entry) => entry.workTypeId).map((entry) => [entry.workTypeId!, entry]),
  ), [query.data]);
  return { ...query, byWorkTypeId };
}
