import { render } from "solid-js/web";
import { ActionLink, Button, Field, StateMessage } from "../index";
import "../styles/index.css";
import "./showcase.css";

function Showcase() {
  return (
    <main class="showcase">
      <section class="showcase-section" aria-labelledby="showcase-actions">
        <h1 id="showcase-actions">Actions</h1>
        <div class="showcase-row">
          <Button content="主要操作" options={{ variant: "primary" }} />
          <Button content="次要操作" options={{ variant: "secondary" }} />
          <Button content="危险操作" options={{ variant: "danger" }} />
          <Button content="处理中..." options={{ state: "loading" }} />
          <ActionLink content="站内导航" href="#field" options={{}} />
        </div>
      </section>

      <section
        id="field"
        class="showcase-section"
        aria-labelledby="showcase-field"
      >
        <h2 id="showcase-field">Field</h2>
        <Field
          control={<input id="showcase-title" value="组件标题" />}
          controlId="showcase-title"
          label="标题"
        />
      </section>

      <section class="showcase-section" aria-labelledby="showcase-messages">
        <h2 id="showcase-messages">State messages</h2>
        <StateMessage content="加载中..." kind="loading" />
        <StateMessage content="当前没有内容" kind="empty" />
        <StateMessage content="内容加载失败" kind="error" />
        <StateMessage content="保存成功" kind="success" />
      </section>
    </main>
  );
}

const root = document.getElementById("desktop-ui-showcase");
if (root === null) {
  throw new Error("desktop-ui showcase root is missing");
}
render(() => <Showcase />, root);
