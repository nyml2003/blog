import { Heading } from "../atoms/heading";
import { Link } from "../atoms/link";
import { Text } from "../atoms/text";

export type PageHeaderProps = {
  title: string;
  brand: string;
  brandHref: string;
};

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
