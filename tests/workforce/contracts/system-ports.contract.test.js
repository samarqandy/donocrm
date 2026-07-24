"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { FOCUSED_PORTS, assertFocusedPorts } = require("../../../src/modules/workforce/application/ports");
const { fixture, FIXED_CLOCK } = require("../helpers/applicationFixture");

test("focused catalog exposes exactly 18 ports and 32 methods", () => {
  assert.equal(FOCUSED_PORTS.length, 18);
  assert.equal(FOCUSED_PORTS.reduce((count, port) => count + port.methods.length, 0), 32);
  assert.equal(new Set(FOCUSED_PORTS.map((port) => port.id)).size, 18);
});

test("clock and ID ports satisfy deterministic exact contracts", () => {
  const { deps } = fixture();
  assert.equal(deps.clock.now(), FIXED_CLOCK);
  const ids = [
    deps.idGenerator.nextId("teacher"),
    deps.idGenerator.nextId("teacher_working_hour"),
  ];
  assert.equal(new Set(ids).size, 2);
  assert.ok(ids.every((id) => typeof id === "string" && id.length > 0));
});

test("composition rejects missing focused methods before use-case execution", () => {
  const { deps } = fixture();
  assert.doesNotThrow(() => assertFocusedPorts(deps));
  assert.throws(
    () => assertFocusedPorts({ ...deps, clock: {} }),
    /WorkforceClockPortV1\.now must be a function/,
  );
});
