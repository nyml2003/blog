import { definePage } from "../../../solid/page";
import { Heading, Select } from "../../../mobile-ui/atoms";
import { BottomNav, Field } from "../../../mobile-ui/molecules";
import {
  mobileSettingsPageContent,
  useMobileSettings,
} from "../logic/settings";
import { MobileNav } from "../components";
import "../../styles/app.css";

function SettingsPage() {
  const settings = useMobileSettings();
  const content = mobileSettingsPageContent();

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

definePage(SettingsPage);
