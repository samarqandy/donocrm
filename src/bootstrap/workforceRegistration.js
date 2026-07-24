const EMPTY_BINDINGS = Object.freeze([]);

const REGISTRATION = Object.freeze({
  moduleId: "workforce",
  incrementId: "WF-EXT-01",
  lifecycle: "structure_only",
  sourceRoot: "src/modules/workforce",
  publicApplication: null,
  adapterBindings: EMPTY_BINDINGS,
  routeBindings: EMPTY_BINDINGS,
  defaultAuthority: "legacy",
  activation: "disabled",
});

function workforceRegistration() {
  return REGISTRATION;
}

module.exports = { workforceRegistration };
