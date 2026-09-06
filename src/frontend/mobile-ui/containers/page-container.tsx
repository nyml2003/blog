import { createUniqueId, type JSX } from "solid-js";
import { Link } from "../atoms/link";

export type PageContainerProps = {
  header: JSX.Element;
  content: JSX.Element;
  navigation: JSX.Element;
  skipLinkLabel: string;
};

export function PageContainer(props: PageContainerProps) {
  const mainId = createUniqueId();
  return (
    <div class="m-page-container">
      <div class="m-page-skip">
        <Link content={props.skipLinkLabel} href={`#${mainId}`} options={{}} />
      </div>
      <div class="m-page-header-region">{props.header}</div>
      <main id={mainId} class="m-page-main" tabIndex={-1}>
        <div class="m-page-content">{props.content}</div>
      </main>
      <div class="m-page-navigation">{props.navigation}</div>
    </div>
  );
}
