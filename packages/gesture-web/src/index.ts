import { ScrollView } from "./scroll-view";
import { StickyListView } from "./sticky-list-view";
import { BottomSheet } from "./bottom-sheet";

customElements.define("scroll-view", ScrollView);
customElements.define("sticky-list-view", StickyListView);
customElements.define("bottom-sheet", BottomSheet);

export { setLogSink, type GestureLogSink } from "./sink";
export { ScrollView } from "./scroll-view";
export { StickyListView } from "./sticky-list-view";
export { BottomSheet, SHEET_POSITION, type SheetState } from "./bottom-sheet";

declare global {
  interface HTMLElementTagNameMap {
    "scroll-view": ScrollView;
    "sticky-list-view": StickyListView;
    "bottom-sheet": BottomSheet;
  }
}
