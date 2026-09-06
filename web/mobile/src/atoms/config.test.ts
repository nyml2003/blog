import assert from "node:assert/strict";
import test from "node:test";
import {
  assertOptions,
  assertProps,
  optionValue,
  optionalFunction,
  requireContent,
  requireFunction,
  requireString,
} from "./config";
import {
  Button,
  Checkbox,
  Heading,
  IconButton,
  Input,
  Label,
  Link,
  Select,
  Text,
} from "./index";

const errorPrefix = /C Mobile atom:/;

test("rejects a missing atom option object", () => {
  assert.throws(() => assertOptions("Text", undefined), errorPrefix);
  assert.throws(() => assertOptions("Text", null), errorPrefix);
});

test("rejects a null public props object with the stable atom error", () => {
  assert.throws(() => assertProps("Text", null), errorPrefix);
});

test("rejects missing content and required strings", () => {
  assert.throws(() => requireContent("Button", "content", " "), errorPrefix);
  assert.throws(
    () => requireString("IconButton", "ariaLabel", null),
    errorPrefix,
  );
  assert.throws(() => {
    // @ts-expect-error JavaScript callers can still supply null.
    Text(null);
  }, errorPrefix);
});

test("rejects invalid callbacks without silently removing behavior", () => {
  assert.throws(
    () => requireFunction("Input", "onInput", undefined),
    errorPrefix,
  );
  assert.throws(
    () => optionalFunction("Button", "options.onClick", null),
    errorPrefix,
  );
});

test("rejects invalid visual and state enum values", () => {
  assert.throws(
    () =>
      optionValue(
        "Button",
        "options.state",
        "queued",
        ["enabled", "disabled"],
        "enabled",
      ),
    errorPrefix,
  );
});

test("every atomic entry point rejects a broken public contract before DOM creation", () => {
  assert.throws(() => Button({ content: "", options: {} }), errorPrefix);
  assert.throws(
    () =>
      Checkbox({
        checked: true,
        // @ts-expect-error JavaScript callers can still supply null.
        onChange: null,
        options: {},
      }),
    errorPrefix,
  );
  assert.throws(() => Heading({ content: false, options: {} }), errorPrefix);
  assert.throws(
    () => IconButton({ ariaLabel: "", icon: "x", options: {} }),
    errorPrefix,
  );
  assert.throws(
    () =>
      Input({
        // @ts-expect-error JavaScript callers can still supply null.
        onInput: null,
        options: {},
        value: "",
      }),
    errorPrefix,
  );
  assert.throws(
    () => Label({ content: "Date", controlId: "", options: {} }),
    errorPrefix,
  );
  assert.throws(
    () => Link({ content: "Read", href: "/m", options: { target: "_blank" } }),
    errorPrefix,
  );
  assert.throws(
    () =>
      Select({
        content: "All",
        // @ts-expect-error JavaScript callers can still supply null.
        onChange: null,
        options: {},
        value: "",
      }),
    errorPrefix,
  );
  assert.throws(
    () =>
      Text({
        content: "Text",
        // @ts-expect-error JavaScript callers can still supply null.
        options: null,
      }),
    errorPrefix,
  );
});
