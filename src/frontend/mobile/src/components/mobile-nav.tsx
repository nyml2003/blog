import { Link, Text } from "../../../mobile-ui/atoms";
import { mobileHomeHref } from "../../../solid/queries";

/** Mobile 页头壳：跳转链接 + 品牌栏（品牌路径来自后端路由清单）。 */
export function MobileNav(_p: { active: string }) {
  return (
    <>
      <a class="skip-link" href="#main">
        跳到主要内容
      </a>
      <header class="mobile-header">
        <div class="mobile-brand">
          <Link
            content={
              <>
                <Text
                  content="FIELD NOTES"
                  options={{ tone: "accent", size: "meta" }}
                />
                <strong>技术知识库</strong>
              </>
            }
            href={mobileHomeHref()}
            options={{}}
          />
        </div>
      </header>
    </>
  );
}
