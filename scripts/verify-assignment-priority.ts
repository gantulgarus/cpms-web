import { sortWorkSequence } from "../lib/work-sequence";
import assert from "node:assert/strict";
import { loadAssignmentWork, compareAssignmentStart, isUnassignedWork } from "../lib/assignment-priority";
import { handleMock } from "../lib/mock/handler";
import { getDb, MOCK_IDS } from "../lib/mock/store";
import type { ListEnvelope, WorkItem } from "../lib/api/types";

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
  console.log("PASS: all pages loaded; earliest work on later page sorts first; undated last; assigned/finished excluded; partial, duplicate, changed and failed pages rejected.");
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
