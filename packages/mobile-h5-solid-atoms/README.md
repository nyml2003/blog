# @fluvient-loom/mobile-h5-solid-atoms

Solid.js atom components for Mobile H5 interfaces.

```tsx
import { Button, Text } from "@fluvient-loom/mobile-h5-solid-atoms";
import "@fluvient-loom/mobile-h5-solid-atoms/styles.css";

<Button content={<Text content="Continue" />} />;
```

`solid-js` is a peer dependency. Components use semantic CSS variables with
working light defaults; consumers may override those variables on any theme
container. `Select` can inherit a control id from the optional
`@fluvient-loom/mobile-h5-solid-atoms/field-context` context.

The package is currently consumed through the workspace. It is not published.
