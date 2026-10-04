import { ScrollView } from "./scroll-view.ts";
import { StickyListView } from "./sticky-list-view.ts";
import { BottomSheet } from "./bottom-sheet.ts";

customElements.define("scroll-view", ScrollView);
customElements.define("sticky-list-view", StickyListView);
customElements.define("bottom-sheet", BottomSheet);

export { setLogSink, type GestureLogSink } from "./sink.ts";
export { ScrollView } from "./scroll-view.ts";
export { StickyListView } from "./sticky-list-view.ts";
export { BottomSheet, SHEET_POSITION, type SheetState } from "./bottom-sheet.ts";

declare global {
  interface HTMLElementTagNameMap {
    "scroll-view": ScrollView;
    "sticky-list-view": StickyListView;
    "bottom-sheet": BottomSheet;
  }
}
