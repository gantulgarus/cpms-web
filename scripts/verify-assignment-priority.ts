import { matchesWorkSearch, sortWorkSequence } from "../lib/work-sequence";
import assert from "node:assert/strict";
import { loadAssignmentWork, compareAssignmentStart, isUnassignedWork } from "../lib/assignment-priority";
import { handleMock } from "../lib/mock/handler";
import { getDb, MOCK_IDS } from "../lib/mock/store";
import type { ListEnvelope, WorkCatalogEntry, WorkItem } from "../lib/api/types";

async function main() {
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
  const groupOrder = [{ id: "foundation", name: "Foundation", sequenceNumber: 1 }, { id: "frame", name: "Frame", sequenceNumber: 2 }];
  const foundation = { ...late, id: "foundation-work", workType: { ...late.workType, groupName: "Foundation" } };
  const frame = { ...early, id: "frame-work", contractor: { id: "assigned", name: "Assigned" }, workType: { ...early.workType, groupName: "Frame" } };
  const unknown = { ...early, id: "unknown-work", workType: { ...early.workType, groupName: "Unknown" } };
  assert.deepEqual(sortWorkSequence([unknown, frame, foundation], groupOrder, []).map((w) => w.id), [foundation.id, frame.id, unknown.id]);
  assert.equal(sortWorkSequence([frame, foundation], groupOrder, []).length, 2, "Assigned work remains visible");
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
  console.log("PASS: all pages loaded; earliest work on later page sorts first; undated last; assigned/finished excluded; partial, duplicate, changed and failed pages rejected.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
