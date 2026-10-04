# @fluvient-loom/web

Browser host adapters for the `@fluvient-loom/port` protocol: persistence
(localStorage), document root attributes, history navigation, scheduler
(microtask / timer / animation frame), operation ids, space-time clock, and
viewport scrolling. The fetch-based network adapter (`createFetchNetwork`)
now lives in `@fluvient-loom/net`, built on the shared HTTP kernel in
`@fluvient/core/http`; it runs on web standards in the browser and Node alike.

```ts
import {
  createWebNavigation,
  createWebPersistence,
  createWebScheduler,
} from "@fluvient-loom/web";

const scheduler = createWebScheduler(); // defaults to browser globals
const persistence = createWebPersistence({ storage: localStorage });
```

Every factory accepts optional injections (`Web*Options`) and falls back to
the matching web standard global, throwing with a clear message when neither
exists. Adapters never read globals after construction, so injected fakes
stay hermetic in tests. Failures settle as typed `Result` errors
(`persistence`, `network` kinds with `cancelled`/`timeout` variants); event
subscriptions and timers return `ResourceHandle` for symmetric release.

The package is currently consumed through the workspace. It is not published.
