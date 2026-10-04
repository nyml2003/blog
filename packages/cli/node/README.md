# @fluvient-loom/node

Node host adapters for the `@fluvient-loom/port` protocol: fetch-based
network, timers scheduler, operation ids, and in-memory persistence
(sync plus async shape) used as the Node-side default and as a test fake.

```ts
import {
  createMemoryAsyncPersistence,
  createMemoryPersistence,
  createNodeScheduler,
} from "@fluvient-loom/node";

const scheduler = createNodeScheduler(); // Node globals
const persistence = createMemoryPersistence({ theme: "dark" });
```

The memory adapters are host-neutral by construction and seed from an
optional initial record; the async variant composes the sync port through
`asAsyncPersistence` instead of duplicating it.

The package is currently consumed through the workspace. It is not published.
