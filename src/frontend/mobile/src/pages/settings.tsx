import { createSignal } from "solid-js";
import { render } from "solid-js/web";
import { Heading, Label, Select } from "../../../mobile-ui/atoms";
import { BottomNav, MobileNav } from "../components/ui";
import {
  applySettings,
  isMobileFont,
  isMobileTheme,
  persistFont,
  persistTheme,
  readAppliedSettings,
} from "../logic/settings";
import "../../styles/tokens.css";
import "../../styles/base.css";
import "../../../mobile-ui/styles/themes.css";
import "../../../mobile-ui/styles/atoms.css";
import "../../styles/shell.css";

function SettingsPage() {
  const root = document.documentElement;
  const [settings, setSettings] = createSignal(readAppliedSettings(root));
  const storage = () => window.localStorage;

  function changeTheme(event: Event & { currentTarget: HTMLSelectElement }) {
    const theme = event.currentTarget.value;
    if (!isMobileTheme(theme)) return;
    const next = { ...settings(), theme };
    setSettings(next);
    applySettings(root, next);
    persistTheme(storage, theme);
  }

  function changeFont(event: Event & { currentTarget: HTMLSelectElement }) {
    const font = event.currentTarget.value;
    if (!isMobileFont(font)) return;
    const next = { ...settings(), font };
    setSettings(next);
    applySettings(root, next);
    persistFont(storage, font);
  }

  return (
    <div class="mobile-shell">
      <MobileNav active="settings" />
      <main id="main" class="mobile-main">
        <Heading
          content="设置"
          options={{ as: "h1", size: "page", id: "settings-title" }}
        />
        <section aria-labelledby="settings-title">
          <p>
            <Label content="主题风格" controlId="mobile-theme" options={{}} />
          </p>
          <Select
            content={
              <>
                <option value="paper">纸张</option>
                <option value="dark">暗色</option>
                <option value="sepia">sepia</option>
              </>
            }
            onChange={changeTheme}
            value={settings().theme}
            options={{ id: "mobile-theme", name: "theme" }}
          />
          <p>
            <Label content="正文字体" controlId="mobile-font" options={{}} />
          </p>
          <Select
            content={
              <>
                <option value="sans">无衬线</option>
                <option value="serif">衬线</option>
                <option value="mono">等宽</option>
              </>
            }
            onChange={changeFont}
            value={settings().font}
            options={{ id: "mobile-font", name: "font" }}
          />
        </section>
      </main>
      <BottomNav active="settings" />
    </div>
  );
}

const app = document.getElementById("app");
if (app) render(() => <SettingsPage />, app);
