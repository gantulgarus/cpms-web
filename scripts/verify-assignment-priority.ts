import { workItems as workItemsApi } from "../lib/api/endpoints";
import { matchesWorkSearch, sortWorkPlan } from "../lib/work-sequence";
import assert from "node:assert/strict";
import { loadAssignmentWork, compareAssignmentStart, isUnassignedWork } from "../lib/assignment-priority";
import { handleMock } from "../lib/mock/handler";
import { getDb, MOCK_IDS } from "../lib/mock/store";
import type { ListEnvelope, WorkCatalogEntry, WorkItem } from "../lib/api/types";

async function main() {
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return Response.json({ data: [], meta: { total: 0, page: 2, pageSize: 25 } });
  };
  try {
    await workItemsApi.listForBlock("test-block", { sort: "workCode", subgroupNumber: "2.3", workTypeGroupId: "test-group", page: 2, pageSize: 25 });
    const url = new URL(requestedUrl, "http://localhost");
    assert.equal(url.searchParams.get("sort"), "workCode", "Overview code sorting must reach the actual API request");
    assert.equal(url.searchParams.get("subgroupNumber"), "2.3", "Subgroup selection must reach the actual API request");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("workTypeGroupId"), "test-group");
    console.log("PASS: work-code sort, subgroup and pagination are sent to the API.");
  } finally {
    globalThis.fetch = originalFetch;
  }

  handleMock("POST", ["auth", "login"], "", { email: "admin@cpms.test", password: "x" });
  const calls: number[] = [];
  const items = await loadAssignmentWork(async (page) => {
    calls.push(page);
    const response = handleMock("GET", ["blocks", MOCK_IDS.blockId, "work-items"], `?page=${page}&pageSize=200`, undefined);
    assert.equal(response.status, 200);
    return response.body as ListEnvelope<WorkItem>;
  });
  assert.equal(items.length, getDb().workItems.filter((w) => w.blockId === MOCK_IDS.blockId).length);
  assert.ok(calls.length > 1);
  const original = items[0];
  const early = { ...original, id: "early", plannedStartDate: "2026-01-01", contractor: null };
  const late = { ...original, id: "late", plannedStartDate: "2026-12-01", contractor: null };
  const undated = { ...original, id: "undated", plannedStartDate: undefined, contractor: null };
  const all = await loadAssignmentWork(async (page) => ({ data: page === 1 ? [late, undated] : [early], meta: { total: 3, page, pageSize: 2 } }));
  assert.deepEqual(all.sort(compareAssignmentStart).map((w) => w.id), ["early", "late", "undated"]);
  assert.equal(isUnassignedWork({ ...early, status: "not_started" }), true);
  assert.equal(isUnassignedWork({ ...early, contractor: { id: "existing", name: "Existing" } }), false);
  assert.equal(isUnassignedWork({ ...early, status: "completed" }), false);
  assert.equal(isUnassignedWork({ ...early, status: "cancelled" }), false);
  await assert.rejects(loadAssignmentWork(async (page) => ({ data: [early], meta: { total: 2, page, pageSize: 1 } })), /бүрэн/);
  await assert.rejects(loadAssignmentWork(async (page) => ({ data: [early], meta: { total: page === 1 ? 2 : 3, page, pageSize: 1 } })), /өөрчлөгдсөн/);
  await assert.rejects(loadAssignmentWork(async (page) => { if (page > 1) throw new Error("network"); return { data: [late], meta: { total: 2, page, pageSize: 1 } }; }), /network/);
  const response = handleMock("GET", ["work-catalog"], "", undefined);
  const catalog = (response.body as { data: WorkCatalogEntry[] }).data;
  const sameName = catalog.filter((entry) => entry.name === "Цутгалтын ажил" && entry.workTypeId);
  assert.ok(sameName.length >= 2);
  const firstEntry = sameName[0];
  const secondEntry = sameName[1];
  const firstWork = {
    ...original, workTypeId: firstEntry.workTypeId!,
    workType: { id: firstEntry.workTypeId!, name: firstEntry.name, groupName: firstEntry.groupName },
    location: { ...original.location, path: "А блок › 5-р давхар › А1" },
  };
  const secondWork = {
    ...firstWork, workTypeId: secondEntry.workTypeId!,
    workType: { id: secondEntry.workTypeId!, name: secondEntry.name, groupName: secondEntry.groupName },
  };
  assert.equal(matchesWorkSearch(firstWork, firstEntry.systemCode.toLowerCase(), firstEntry), true);
  assert.equal(matchesWorkSearch(secondWork, firstEntry.systemCode, secondEntry), false, "Same-name jobs are distinguished by their own catalog codes");
  assert.equal(matchesWorkSearch(firstWork, `${firstEntry.systemCode} 5-р А1`, firstEntry), true);
  assert.equal(matchesWorkSearch(firstWork, `${firstEntry.systemCode} 6-р`, firstEntry), false);
  assert.equal(matchesWorkSearch(firstWork, firstEntry.typeName, firstEntry), true);
  assert.equal(matchesWorkSearch(firstWork, firstEntry.subgroupNumber, firstEntry), true);
  assert.equal(matchesWorkSearch(original, original.workType.name), true, "Older work without catalog metadata can still be found by name");
  const floorLocations = [
    { id: "floor-10", blockId: original.blockId, parentId: null, level: "floor" as const, name: "10-р давхар", path: "А блок › 10-р давхар", sequenceNumber: 10 },
    { id: "floor-2", blockId: original.blockId, parentId: null, level: "floor" as const, name: "2-р давхар", path: "А блок › 2-р давхар", sequenceNumber: 2 },
  ];
  const lowCode = { ...firstEntry, systemCode: "WT-000002" };
  const highCode = { ...secondEntry, systemCode: "WT-000010" };
  const lowOnUpperFloor = { ...firstWork, id: "low-upper", locationId: "floor-10", workType: { ...firstWork.workType, groupName: "Z бүлэг" }, location: { ...firstWork.location, path: "А блок › 10-р давхар" }, plannedStartDate: "2027-12-01" };
  const lowOnLowerFloor = { ...lowOnUpperFloor, id: "low-lower", locationId: "floor-2", location: { ...firstWork.location, path: "А блок › 2-р давхар" } };
  const highOnLowerFloor = { ...secondWork, id: "high-lower", locationId: "floor-2", workType: { ...secondWork.workType, groupName: "A бүлэг" }, plannedStartDate: "2026-01-01" };
  const withoutCode = { ...original, id: "without-code", code: undefined, workTypeId: "legacy-type" };
  const unsorted = [withoutCode, highOnLowerFloor, lowOnUpperFloor, lowOnLowerFloor];
  const ordered = sortWorkPlan(unsorted, [lowCode, highCode], floorLocations);
  assert.deepEqual(ordered.map((work) => work.id), ["low-lower", "low-upper", "high-lower", "without-code"], "Code takes priority over group, floor and dates, with uncoded work last");
  assert.equal(unsorted[0].id, "without-code", "Sorting preserves the query cache array");
  const manyRows = Array.from({ length: 35 }, (_, index) => ({ ...lowOnUpperFloor, id: `low-${index}`, locationId: `unit-${index}`, location: { ...lowOnUpperFloor.location, path: `А блок › ${index + 1} тоот` } }));
  const allPages = sortWorkPlan([highOnLowerFloor, ...manyRows], [lowCode, highCode], []);
  assert.equal(allPages.at(-1)?.id, "high-lower", "Code order is applied across page boundaries");
  console.log("PASS: work-plan codes sort numerically across pages, then by floor, with legacy uncoded work last.");
  console.log("PASS: all pages loaded; earliest work on later page sorts first; undated last; assigned/finished excluded; partial, duplicate, changed and failed pages rejected.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
