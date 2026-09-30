import { Heading, Link, Text } from "@fluvient-loom/mobile-h5-solid-atoms";

export interface PageHeaderProps {
  readonly title: string;
  readonly brand: string;
  readonly brandHref: string;
}

export function PageHeader(props: PageHeaderProps) {
  return (
    <header class="m-page-header">
      <Link
        content={
          <>
            <Text
              content="FIELD NOTES"
              options={{ tone: "accent", size: "meta" }}
            />
            <strong>{props.brand}</strong>
          </>
        }
        href={props.brandHref}
        options={{}}
      />
      <Heading content={props.title} options={{ as: "h1", size: "page" }} />
    </header>
  );
}
