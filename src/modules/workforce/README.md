# Workforce module

Migration stage: WF-EXT-01 — structure and composition registration only.

This directory is the approved source root for the Workforce bounded context. The
context owns Teacher business profiles, lifecycle, working-hour availability, and
stable Teacher references as defined by the approved Workforce module definition.

No Domain, Application, Infrastructure, or HTTP implementation exists at this
increment. Empty layer directories are intentionally absent. WF-EXT-02 adds
characterization fixtures; WF-EXT-03 may add the first approved public Application
facade and focused ports after its own evidence passes.

Runtime authority remains the frozen legacy path. This directory contains no route,
adapter, SQL, schema, provider, environment, migration selector, or legacy
`AppService`/`AppRepository` dependency.
