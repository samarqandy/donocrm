"use strict";

function port(id, name, methods) {
  return Object.freeze({ id, name, methods: Object.freeze([...methods]) });
}

const DOMAIN_PORTS = Object.freeze([
  port("WF-PORT-OWN-01", "TeacherAggregateRepositoryV1", [
    "findById", "insert", "replaceProfile", "setStatus",
  ]),
  port("WF-PORT-OWN-02", "TeacherWorkingHourRepositoryV1", [
    "list", "findById", "findOverlap", "insert", "deleteById",
  ]),
]);

module.exports = { DOMAIN_PORTS };
