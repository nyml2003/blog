import { render } from "solid-js/web";
import { Heading, Select } from "../../../mobile-ui/atoms";
import { BottomNav, Field } from "../../../mobile-ui/molecules";
import {
  mobileSettingsPageContent as content,
  useMobileSettings,
} from "../logic/settings";
import { MobileNav } from "../components/ui";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../styles/shell.css";
import "../../styles/layout.css";
import "../../styles/components.css";
import "../../styles/shelf.css";
import "../../styles/filter.css";
import "../../styles/detail.css";
import "../../styles/article-body.css";
import "../../styles/pages.css";
import "../../../mobile-ui/styles/themes.css";
import "../../../mobile-ui/styles/atoms.css";
import "../../../mobile-ui/styles/molecules.css";

function SettingsPage() {
  const settings = useMobileSettings();

  return (
    <div class="mobile-shell">
      <MobileNav active="settings" />
      <main id="main" class="mobile-main">
        <header class="page-heading">
          <Heading
            content={content.title}
            options={{ as: "h1", size: "page" }}
          />
        </header>
        <div class="settings-fields">
          <Field
            label={content.themeLabel}
            content={
              <Select
                items={settings.options.themes}
                value={settings.settings().theme}
                onChange={settings.selectTheme}
                options={{ name: "theme" }}
              />
            }
          />
          <Field
            label={content.fontLabel}
            content={
              <Select
                items={settings.options.fonts}
                value={settings.settings().font}
                onChange={settings.selectFont}
                options={{ name: "font" }}
              />
            }
          />
        </div>
      </main>
      <BottomNav
        items={content.navigation}
        activeId={content.activeNavigationId}
        ariaLabel={content.navigationLabel}
      />
    </div>
  );
}

const app = document.getElementById("app");
if (app) render(() => <SettingsPage />, app);
