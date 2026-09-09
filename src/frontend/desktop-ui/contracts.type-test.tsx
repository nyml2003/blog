import type {
  ActionLinkProps,
  ButtonProps,
  FieldProps,
  StateMessageProps,
} from "./index";

/**
 * 本文件只参与 `tsc --noEmit`。合法样例与 `@ts-expect-error` 负样例共同冻结
 * 第一批组件的最小 API，不作为运行时测试加载。
 */
const validSamples: {
  ActionLink: ActionLinkProps;
  Button: ButtonProps;
  Field: FieldProps;
  StateMessage: StateMessageProps;
} = {
  ActionLink: {
    content: "发布工作台",
    href: "/admin/workspace/index.html",
    options: { variant: "secondary", width: "content" },
  },
  Button: {
    content: "保存到工作区",
    options: { state: "enabled", type: "submit", variant: "primary" },
  },
  Field: {
    control: <input id="article-title" />,
    controlId: "article-title",
    label: "标题",
  },
  StateMessage: { content: "文章加载失败", kind: "error" },
};

const invalidSamples: {
  buttonHref: ButtonProps;
  buttonVariant: ButtonProps;
  actionLinkHref: ActionLinkProps;
  fieldControlId: FieldProps;
  stateMessageKind: StateMessageProps;
} = {
  buttonHref: {
    content: "返回",
    // @ts-expect-error Button 不接受 href，导航必须使用 ActionLink。
    href: "/",
    options: {},
  },
  buttonVariant: {
    content: "保存",
    options: {
      // @ts-expect-error 未由当前 Desktop 用例证明的 ghost 变体不得提前加入。
      variant: "ghost",
    },
  },
  // @ts-expect-error ActionLink 的导航目标不可缺省。
  actionLinkHref: { content: "返回", options: {} },
  // @ts-expect-error Field 必须显式关联 label 与控件。
  fieldControlId: { control: <input />, label: "标题" },
  stateMessageKind: {
    content: "未知状态",
    // @ts-expect-error 消息 kind 只能来自冻结的四种显示状态。
    kind: "warning",
  },
};

void validSamples;
void invalidSamples;
