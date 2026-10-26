import assert from "node:assert/strict";
import { handleMock } from "../lib/mock/handler";
import { getDb, MOCK_IDS } from "../lib/mock/store";
import type { MyWorkEnvelope, ReportingState, WorkItem } from "../lib/api/types";

const db = getDb();
const list = (query = "", projectId = MOCK_IDS.projectId): MyWorkEnvelope => {
  const res = handleMock("GET", ["projects", projectId, "my-work"], query, undefined);
  assert.equal(res.status, 200);
  return res.body as MyWorkEnvelope;
};
let first = list("?pageSize=1");
assert.equal(first.data.length, 1);
assert.ok(first.meta.total > 1);
assert.equal(first.counts.ready, first.meta.total);
assert.equal(Object.values(first.counts).reduce((a, b) => a + b, 0), db.workItems.length);
const ready = list("?pageSize=200");
for (const row of ready.data) {
  assert.equal(row.reportingState, "ready");
  assert.ok(row.reportableQty > 0);
  assert.equal(row.reportableQty, Math.round((row.plannedQty - row.reportedQty) * 1000) / 1000);
}
for (const row of ready.data.slice(0, 10)) {
  const detail = handleMock("GET", ["work-items", row.id], "", undefined).body as { data: WorkItem };
  assert.equal(detail.data.holdPointReason, null);
}
for (const state of ["blocked", "pending", "completed"] as ReportingState[]) {
  const result = list(`?reportingState=${state}&pageSize=200`);
  assert.equal(result.meta.total, result.counts[state]);
  for (const item of result.data) {
    assert.equal(item.reportableQty, 0);
    assert.equal(item.reportingState, state);
    assert.ok(item.reportingReason);
  }
}
const page1 = list("?pageSize=3");
const page2 = list("?pageSize=3&page=2");
assert.ok(page2.data.every((w) => !page1.data.some((a) => a.id === w.id)));
assert.ok((page1.data.at(-1)?.plannedEndDate ?? "9999") <= (page2.data[0]?.plannedEndDate ?? "9999"));
const floor = db.locations.find((l) => l.level === "floor" && l.blockId === MOCK_IDS.blockId)!;
const local = list(`?blockId=${MOCK_IDS.blockId}&locationId=${floor.id}&includeDescendants=true`);
const scope = db.descendants.get(floor.id)!;
assert.ok(local.data.every((w) => w.blockId === MOCK_IDS.blockId && scope.has(w.locationId)));
assert.equal(handleMock("GET", ["projects", MOCK_IDS.projectId, "my-work"], "?pageSize=201", undefined).status, 422);
const contractor = db.contractors.find((c) => c.accessCode && db.workItems.some((w) => w.contractor?.id === c.id))!;
assert.equal(handleMock("POST", ["auth", "contractor-login"], "", { code: contractor.accessCode }).status, 200);
const scoped = list("?pageSize=200");
assert.ok(scoped.data.every((w) => w.contractor?.id === contractor.id));
const scopedBlocked = list("?reportingState=blocked&pageSize=200");
for (const row of scopedBlocked.data) for (const blocker of row.blockingWorkItems) assert.equal(db.byId.get(blocker.id)?.contractor?.id, contractor.id);
const other = db.contractors.find((c) => c.id !== contractor.id)!;
assert.equal(list(`?contractorId=${other.id}`).meta.total, 0);
first = list("?pageSize=1");
if (first.data[0]) {
  const row = first.data[0];
  assert.equal(handleMock("POST", ["work-items", row.id, "progress"], "", { completedQty: row.reportableQty }).status, 201);
  assert.ok(!list("?pageSize=200").data.some((w) => w.id === row.id));
}
console.log("PASS: my-work readiness, reasons, quantity, counts, sorting, pagination, locations, contractor scope, foreign links, and post-submit refresh.");
