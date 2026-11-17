export type WorkLocationLevel = "block" | "floor" | "unit";

export function inferWorkLocation(entry: {
  name: string;
  locationDescription: string | null;
  floorDescription: string | null;
}): WorkLocationLevel | null {
  const normalize = (value: string | null) => (value ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const name = normalize(entry.name);
  const scope = normalize(entry.floorDescription);
  const location = normalize(entry.locationDescription);
  const unit = /айл(ын|ийн|уудын|ууд)/.test(`${name} ${location}`);
  const whole = /^(барилга бүхэлдээ|гадна ажил|суурь|дээвэр)$/.test(scope);
  const floor = /давхар|зоорь|техник/.test(scope);
  const namedFloor = /техник|зоор|\d+\s*-?\s*р?\s*давхар/.test(name);
  // Conflicting apartment/basement or whole-building/floor evidence needs review.
  if (whole) return unit || namedFloor ? null : "block";
  if (unit) return floor && !/^(зоорь|зоорийн давхар|техник|техникийн давхарт)$/.test(scope) ? "unit" : null;
  // Room names do not tell us whether this is an apartment or shared room.
  if (/ариун цэврийн|гал тогоо|паркет|обой|ванн|угаалтуур|суултуур|өрөө тусгаарлах|дотор хаалга/.test(name)) return null;
  if (floor) return "floor";
  if (/^(барилга бүхэлдээ|гадна ажил|суурь|дээвэр)$/.test(location)) return "block";
  return null;
}

export function matchesCatalogFloor(
  entry: { floorDescription: string | null },
  location: { id: string; level: string; parentId: string | null; name: string; sequenceNumber: number },
  locations: { id: string; level: string; parentId: string | null; name: string; sequenceNumber: number }[],
): boolean {
  if (location.level === "block") return true;
  const floor = location.level === "floor" ? location : locations.find((candidate) => candidate.id === location.parentId);
  if (!floor || floor.level !== "floor") return false;
  const scope = (entry.floorDescription ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  const name = floor.name.toLocaleLowerCase();
  const number = name.includes("техник") ? Infinity : name.includes("зоор") ? 0 : floor.sequenceNumber;
  if (/^зоор(ь|ийн давхар)$/.test(scope)) return number === 0;
  if (/^техник(ийн давхарт)?$/.test(scope)) return number === Infinity;
  if (scope === "зоорь, техник") return number === 0 || number === Infinity;
  const range = scope.match(/^(зоорь|зоорийн давхар|\d+(?:-р давхар)?)-(техник|\d+(?:-р давхар)?)$/);
  if (range) {
    const low = range[1].startsWith("зоор") ? 0 : Number.parseInt(range[1]);
    const high = range[2] === "техник" ? Infinity : Number.parseInt(range[2]);
    return number >= low && number <= high;
  }
  const single = scope.match(/^(\d+)-р давхар$/);
  if (single) return number === Number(single[1]);
  return true;
}
