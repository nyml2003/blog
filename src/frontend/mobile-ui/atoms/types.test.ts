import assert from "node:assert/strict";
import test from "node:test";
import type { ButtonProps } from "./button";
import type { CheckboxProps } from "./checkbox";
import type { HeadingProps } from "./heading";
import type { IconButtonProps } from "./icon-button";
import type { InputProps } from "./input";
import type { LabelProps } from "./label";
import type { LinkProps } from "./link";
import type { SelectProps } from "./select";
import type { TextProps } from "./text";
import { defineAtom, type AtomDefaults, type AtomRenderProps } from "./define";

/**
 * 类型即契约的原子测试。
 *
 * 合法样例与非法样例都只在编译期生效：`tsc --noEmit` 把每条 `@ts-expect-error`
 * 当作"此处必须报错"的承诺，一旦有人放宽 Props 类型，typecheck 会因为
 * "未使用的 @ts-expect-error" 而变红。运行时部分只验证 defineAtom 的 defaults 合并。
 */

/** 每个原子一条合法受控组合：这些对象必须能通过类型检查。 */
const validSamples: {
  Button: ButtonProps;
  Checkbox: CheckboxProps;
  Heading: HeadingProps;
  IconButton: IconButtonProps;
  Input: InputProps;
  Label: LabelProps;
  Link: LinkProps;
  Select: SelectProps;
  Text: TextProps;
} = {
  Button: {
    content: "查看结果",
    options: {
      onClick: () => undefined,
      state: "enabled",
      type: "button",
      variant: "primary",
      width: "block",
    },
  },
  Checkbox: {
    checked: true,
    onChange: () => undefined,
    options: { id: "term-1", name: "term", validation: "valid" },
  },
  Heading: { content: "文章", options: { as: "h2", size: "section" } },
  IconButton: {
    ariaLabel: "关闭筛选",
    icon: "×",
    options: { onClick: () => undefined },
  },
  Input: {
    onInput: () => undefined,
    options: {
      describedById: "created-from-help",
      id: "created-from",
      state: "enabled",
      validation: "valid",
    },
    value: "2026-09-06",
  },
  Label: { content: "创建起始", controlId: "created-from", options: {} },
  Link: {
    content: "浏览全部文章",
    href: "/m/articles/index.html",
    options: { variant: "action" },
  },
  Select: {
    content: "全部类型",
    onChange: () => undefined,
    options: { id: "article-type", state: "enabled", validation: "invalid" },
    value: "",
  },
  Text: {
    content: "正文",
    options: { as: "p", size: "body", tone: "muted" },
  },
};

/** 非法用法：每条都必须在编译期被拒绝，不得用 any、`as` 或可选链绕过。 */
const invalidSamples: {
  buttonHref: ButtonProps;
  buttonVariant: ButtonProps;
  checkboxOnChange: CheckboxProps;
  headingSize: HeadingProps;
  iconButtonAriaLabel: IconButtonProps;
  inputOnInput: InputProps;
  inputType: InputProps;
  labelControlId: LabelProps;
  linkHref: LinkProps;
  selectBusinessDataSource: SelectProps;
  selectOnChange: SelectProps;
  textTone: TextProps;
} = {
  buttonHref: {
    content: "查看结果",
    // @ts-expect-error Button 没有 href：导航语义属于 Link。
    href: "/m/articles/index.html",
    options: {},
  },
  buttonVariant: {
    content: "查看结果",
    options: {
      // @ts-expect-error variant 只允许 "primary" | "secondary"。
      variant: "ghost",
    },
  },
  // @ts-expect-error 受控布尔协议要求 Checkbox 必须提供 onChange。
  checkboxOnChange: {
    checked: true,
    options: {},
  },
  headingSize: {
    content: "文章",
    options: {
      // @ts-expect-error size 只允许 "page" | "section" | "card"。
      size: "display",
    },
  },
  // @ts-expect-error 可访问名称 ariaLabel 不可缺省。
  iconButtonAriaLabel: {
    icon: "×",
    options: {},
  },
  // @ts-expect-error 受控值协议要求 Input 必须提供 onInput。
  inputOnInput: {
    options: { id: "created-from" },
    value: "2026-09-06",
  },
  inputType: {
    onInput: () => undefined,
    options: {
      // @ts-expect-error Input 固定 <input type="date">，不接受自定义 type。
      type: "text",
    },
    value: "2026-09-06",
  },
  // @ts-expect-error 控件关联 controlId 不可缺省。
  labelControlId: {
    content: "创建起始",
    options: {},
  },
  // @ts-expect-error Link 必须提供 href。
  linkHref: {
    content: "浏览全部文章",
    options: { variant: "action" },
  },
  selectBusinessDataSource: {
    content: "全部类型",
    onChange: () => undefined,
    // @ts-expect-error Select 不接收业务数据源：选项只能由 content 提供。
    articleTypes: [{ id: "essay", name: "随笔" }],
    options: {},
    value: "",
  },
  // @ts-expect-error 受控值协议要求 Select 必须提供 onChange。
  selectOnChange: {
    content: "全部类型",
    options: {},
    value: "",
  },
  textTone: {
    content: "正文",
    options: {
      // @ts-expect-error tone 只允许 "default" | "muted"。
      tone: "disabled",
    },
  },
};

const atomNames = [
  "Button",
  "Checkbox",
  "Heading",
  "IconButton",
  "Input",
  "Label",
  "Link",
  "Select",
  "Text",
] as const;

test("每个原子都有合法受控组合，且至少有一条被类型拒绝的负样例", () => {
  assert.deepEqual(Object.keys(validSamples).sort(), [...atomNames].sort());
  assert.ok(
    Object.keys(invalidSamples).length >= atomNames.length,
    "负样例数量必须不少于原子数量",
  );
});

test("defineAtom 用 defaults 补全部分传入的 options", () => {
  type ProbeOptions = {
    id: string;
    tone: "default" | "muted";
  };
  type ProbeProps = {
    content: string;
    options: Partial<ProbeOptions>;
  };

  const received: AtomRenderProps<ProbeProps>[] = [];
  const Probe = defineAtom<ProbeProps>({
    name: "Probe",
    defaults: {
      id: undefined,
      tone: "default",
    } as const satisfies AtomDefaults<ProbeProps>,
    render(props) {
      received.push(props);
      return "probe";
    },
  });

  const merged = Probe({ content: "第一次", options: { tone: "muted" } });
  assert.equal(merged, "probe");
  assert.deepEqual(received[0], {
    content: "第一次",
    options: { id: undefined, tone: "muted" },
  });

  Probe({ content: "第二次", options: {} });
  assert.deepEqual(received[1], {
    content: "第二次",
    options: { id: undefined, tone: "default" },
  });
});
