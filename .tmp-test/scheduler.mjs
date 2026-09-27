// src/scheduler.ts
var MAX_DRIVING_MIN = 240;
var REST_MIN = 30;
var MIN = 6e4;
function toSegment(a) {
  const startMs = new Date(a.start).getTime();
  return { startMs, endMs: startMs + a.durationMin * MIN };
}
function sortedTrips(assignments) {
  return assignments.map((a) => ({ ...toSegment(a), id: a.id })).sort((x, y) => x.startMs - y.startMs);
}
function deriveRests(segments) {
  const trips = [...segments].sort((a, b) => a.startMs - b.startMs);
  const rests = [];
  let acc = 0;
  for (let i = 0; i < trips.length; i++) {
    if (i > 0) {
      const gap = trips[i].startMs - trips[i - 1].endMs;
      if (gap >= REST_MIN * MIN) {
        acc = 0;
      }
    }
    const drive = (trips[i].endMs - trips[i].startMs) / MIN;
    if (acc + drive > MAX_DRIVING_MIN + 1e-6) {
      if (i === 0) {
        acc += drive;
        continue;
      }
      rests.push({ startMs: trips[i - 1].endMs, endMs: trips[i - 1].endMs + REST_MIN * MIN });
      acc = drive;
    } else {
      acc += drive;
    }
  }
  return rests;
}
function overlaps(a, b) {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}
function validateCandidate(candidate, others) {
  const errors = [];
  const proposed = {
    startMs: candidate.startMs,
    endMs: candidate.startMs + candidate.durationMin * MIN
  };
  if (!Number.isFinite(candidate.startMs)) {
    return { ok: false, errors: ["\u53D1\u8F66\u65F6\u95F4\u65E0\u6548"] };
  }
  if (candidate.durationMin <= 0) {
    return { ok: false, errors: ["\u9884\u8BA1\u7528\u65F6\u5FC5\u987B\u5927\u4E8E 0"] };
  }
  if (candidate.durationMin > MAX_DRIVING_MIN) {
    errors.push(`\u5355\u8D9F\u9884\u8BA1\u7528\u65F6 ${candidate.durationMin} \u5206\u949F\uFF0C\u8D85\u8FC7\u8FDE\u7EED\u9A7E\u9A76\u4E0A\u9650 ${MAX_DRIVING_MIN} \u5206\u949F\uFF0C\u8BF7\u62C6\u5206\u4EFB\u52A1`);
  }
  const existing = sortedTrips(others);
  for (const trip of existing) {
    if (overlaps(proposed, trip)) {
      errors.push(
        `\u4E0E\u65E2\u6709\u4EFB\u52A1\u65F6\u6BB5\u91CD\u53E0\uFF08${fmt(trip.startMs)}\u2013${fmt(trip.endMs)}\uFF09`
      );
    }
  }
  const mergedTrips = [...existing, { ...proposed, id: candidate.excludeAssignmentId ?? "new" }].sort((a, b) => a.startMs - b.startMs);
  const requiredRests = deriveRests(mergedTrips);
  for (const rest of requiredRests) {
    for (const trip of existing) {
      if (overlaps(rest, trip)) {
        errors.push(
          `\u9700\u5728 ${fmt(rest.startMs)}\u2013${fmt(rest.endMs)} \u4F11\u606F ${REST_MIN} \u5206\u949F\uFF0C\u4F46\u8BE5\u65F6\u6BB5\u5DF2\u6709\u4EFB\u52A1`
        );
      }
    }
    if (overlaps(rest, proposed)) {
      errors.push(
        `\u53D1\u8F66\u524D\u8FDE\u7EED\u9A7E\u9A76\u5C06\u8FBE ${MAX_DRIVING_MIN} \u5206\u949F\uFF0C\u9700\u5728 ${fmt(rest.startMs)}\u2013${fmt(rest.endMs)} \u5148\u4F11\u606F ${REST_MIN} \u5206\u949F`
      );
    }
  }
  if (errors.length > 0) {
    const before = mergedTrips.filter((t) => t.id !== "new" && t.endMs <= proposed.startMs + 1e-6).sort((a, b) => b.endMs - a.endMs)[0];
    let suggested;
    if (before) {
      const acc = accumulatedAfterLastRest(before.endMs, existing);
      const nextCanStart = acc + candidate.durationMin > MAX_DRIVING_MIN + 1e-6 ? before.endMs + REST_MIN * MIN : before.endMs;
      suggested = nextCanStart;
    } else {
      const first = existing[0];
      if (first) suggested = first.startMs;
    }
    return { ok: false, errors, suggestedStartMs: suggested };
  }
  return { ok: true, errors: [], rests: requiredRests };
}
function accumulatedAfterLastRest(atMs, trips) {
  const sorted = [...trips].sort((a, b) => a.startMs - b.startMs);
  let acc = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].endMs > atMs + 1e-6) break;
    if (i > 0 && sorted[i].startMs - sorted[i - 1].endMs >= REST_MIN * MIN) acc = 0;
    acc += (sorted[i].endMs - sorted[i].startMs) / MIN;
  }
  return acc;
}
function planDriverDay(driverId, dayStartMs, assignments) {
  const dayEndMs = dayStartMs + 24 * 60 * MIN;
  const own = assignments.filter((a) => a.driverId === driverId).map((a) => ({ ...toSegment(a), orderId: a.orderId, assignmentId: a.id }));
  const inWindow = own.filter((t) => t.startMs < dayEndMs && t.endMs > dayStartMs);
  const fullRests = deriveRests(own);
  const rests = fullRests.filter((r) => r.startMs < dayEndMs && r.endMs > dayStartMs).map((r) => ({
    startMs: Math.max(r.startMs, dayStartMs),
    endMs: Math.min(r.endMs, dayEndMs)
  }));
  const trips = inWindow.map((t) => ({
    startMs: Math.max(t.startMs, dayStartMs),
    endMs: Math.min(t.endMs, dayEndMs),
    orderId: t.orderId,
    assignmentId: t.assignmentId,
    crossDay: t.startMs < dayStartMs || t.endMs > dayEndMs
  }));
  const drivingMinutes = trips.reduce((sum, t) => sum + (t.endMs - t.startMs) / MIN, 0);
  return { driverId, dayStartMs, trips, rests, drivingMinutes: Math.round(drivingMinutes) };
}
function fmt(ms) {
  const d = new Date(ms);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}
function formatRange(startMs, endMs) {
  return `${fmt(startMs)}\u2013${fmt(endMs)}`;
}
export {
  MAX_DRIVING_MIN,
  REST_MIN,
  deriveRests,
  formatRange,
  planDriverDay,
  validateCandidate
};
