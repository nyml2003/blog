import assert from "node:assert/strict";
import test from "node:test";
import {
  insertExpectedRoute,
  insertRegistryEntry,
  type ScaffoldIo,
  type ScaffoldSpec,
  planScaffoldPage,
  writeScaffold,
} from "../src/scaffold.ts";
import { alwaysExists, fixtureRegistrations } from "./fixtures.ts";

const spec: ScaffoldSpec = {
  platform: "mobile",
  id: "mobile-about",
  title: "关于",
  alias: "/m/about",
};

const fixturePaths = {
  registry: "pages.registry.ts",
  frozenRoutes: "tests/frozen.test.ts",
} as const;

function memoryIo(files: Record<string, string>): ScaffoldIo & {
  written: Map<string, string>;
} {
  const written = new Map<string, string>();
  return {
    written,
    read: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`io.read: ${path} 不存在`);
      return content;
    },
    write: (path, content) => {
      written.set(path, content);
      files[path] = content;
    },
    exists: (path) => files[path] !== undefined,
    format: () => undefined,
  };
}

test("plan builds mobile scaffold files that satisfy entry guards", () => {
  const { plan, issues } = planScaffoldPage(
    spec,
    fixtureRegistrations,
    alwaysExists,
  );
  assert.deepEqual(issues, []);
  assert.ok(plan);
  assert.equal(plan.files[0].path, "bootstrap/mobile/about.tsx");
  assert.match(plan.files[0].content, /app\.css";/);
  assert.match(plan.files[0].content, /mountMobilePage\([^;]+\);/);
  assert.equal(plan.files[1].path, "mobile/pages/about/page.tsx");
  assert.doesNotMatch(plan.files[1].content, /MobilePageContext/);
  assert.equal(plan.registration.bootstrap, true);
});

test("plan builds desktop scaffold files with identity wiring", () => {
  const { plan, issues } = planScaffoldPage(
    {
      platform: "desktop",
      id: "desktop-about",
      title: "关于",
      alias: "/about/index.html",
    },
    fixtureRegistrations,
    alwaysExists,
  );
  assert.deepEqual(issues, []);
  assert.ok(plan);
  assert.match(
    plan.files[0].content,
    /mountDesktopPage\(\(context\) => createDesktopAboutPage\(context\)\);/,
  );
  assert.equal(plan.registration.bootstrap, false);
});

test("plan rejects invalid specs and registry conflicts", () => {
  const invalid: readonly ScaffoldSpec[] = [
    {
      platform: "mobile",
      id: "Mobile_About",
      title: "关于",
      alias: "/m/about",
    },
    {
      platform: "mobile",
      id: "desktop-about",
      title: "关于",
      alias: "/m/about",
    },
    {
      platform: "mobile",
      id: "mobile-about",
      title: "My Blog",
      alias: "/m/about",
    },
    { platform: "mobile", id: "mobile-about", title: "关于", alias: "m/about" },
  ];
  for (const candidate of invalid) {
    const { plan, issues } = planScaffoldPage(
      candidate,
      fixtureRegistrations,
      alwaysExists,
    );
    assert.ok(issues.length > 0, JSON.stringify(candidate));
    assert.equal(plan, undefined);
  }

  const duplicate = planScaffoldPage(
    { platform: "mobile", id: "mobile-home", title: "重复", alias: "/m/other" },
    fixtureRegistrations,
    alwaysExists,
  );
  assert.ok(duplicate.issues.some((issue) => issue.includes("id-unique")));

  const shadow = planScaffoldPage(
    {
      platform: "desktop",
      id: "desktop-about",
      title: "关于",
      alias: "/mobile/pages/home/index.html",
    },
    fixtureRegistrations,
    alwaysExists,
  );
  assert.ok(
    shadow.issues.some((issue) => issue.includes("alias-output-path-conflict")),
  );
});

test("registry insertion keeps platform grouping", () => {
  const source = `export const pageRegistry = [
  {
    id: "desktop-home",
    platform: "desktop",
  },
  {
    id: "mobile-home",
    platform: "mobile",
  },
] as const;
`;
  const desktopEntry = `  {\n    id: "desktop-new",\n    platform: "desktop",\n  },`;
  const patched = insertRegistryEntry(source, desktopEntry, "desktop");
  assert.ok(
    patched.indexOf('id: "desktop-new"') < patched.indexOf('id: "mobile-home"'),
  );

  const mobileEntry = `  {\n    id: "mobile-new",\n    platform: "mobile",\n  },`;
  const patchedMobile = insertRegistryEntry(patched, mobileEntry, "mobile");
  assert.ok(
    patchedMobile.indexOf('id: "mobile-new"') >
      patchedMobile.indexOf('id: "mobile-home"'),
  );
});

test("frozen route insertion lands after the last same-platform row", () => {
  const fixture = `const expectedRoutes = [
  ["/", "desktop/pages/public-home/index.html"],
  ["/m/", "mobile/pages/home/index.html"],
] as const;
`;
  const patched = insertExpectedRoute(
    fixture,
    `  ["/m/about", "mobile/pages/about/index.html"],`,
    "mobile",
  );
  assert.ok(patched.indexOf('"/m/about"') > patched.indexOf('"/m/"'));
});

test("writeScaffold refuses existing targets and writes nothing", () => {
  const { plan } = planScaffoldPage(spec, fixtureRegistrations, alwaysExists);
  assert.ok(plan);
  const io = memoryIo({
    [fixturePaths.registry]: "export const pageRegistry = [];\n",
    [fixturePaths.frozenRoutes]: "const expectedRoutes = [];\n",
    "bootstrap/mobile/about.tsx": "已存在",
  });
  const result = writeScaffold(plan, io, fixturePaths);
  assert.ok(
    result.issues.some((issue) => issue.includes("bootstrap/mobile/about.tsx")),
  );
  assert.equal(io.written.size, 0);
});
