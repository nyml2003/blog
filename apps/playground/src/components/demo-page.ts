/**
 * <demo-page> — a full-screen page container (scrolling + slot). Styling
 * and lifecycle stay autonomous; the host shows/hides it (hidden attr)
 * and fills the slot. The nursery form of the page-module contract.
 */
export class DemoPage extends HTMLElement {
  connectedCallback(): void {
    if (this.shadowRoot !== null) return;
    const shadow = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        position: absolute;
        inset: 0;
        /* Explicit sizing: the popover UA style sets height/width to
           fit-content, which defeats the inset stretch. */
        width: 100%;
        height: 100%;
        overflow-y: auto;
        overscroll-behavior: none;
        padding: 20px 16px 40px;
        /* Popover UA defaults (border, canvas background) must go: the
           border shows as a stray frame and a transparent background lets
           the sheet beneath shine through. The page owns an opaque
           background matching the body's. */
        border: none;
        background: #f4f2ee;
      }
      @media (prefers-color-scheme: dark) {
        :host { background: #15171c; }
      }
      :host([hidden]) { display: none; }
    `;
    shadow.append(style, document.createElement("slot"));
  }
}

customElements.define("demo-page", DemoPage);

declare global {
  interface HTMLElementTagNameMap {
    "demo-page": DemoPage;
  }
}
