import { Plugin, EditorState, TextSelection } from "prosemirror-state"
import './FormattedTextBoxComment.scss'
import { DragManager } from "../../util/DragManager";
import { ResolvedPos, Mark } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../../new_fields/Doc";

export let selectionSizePlugin = new Plugin({
    view(editorView) { return new SelectionSizeTooltip(editorView); }
})
export function findOtherUserMark(marks: Mark[]): Mark | undefined {
    return marks.find(m => m.attrs.userid && m.attrs.userid !== Doc.CurrentUserEmail);
}
export function findUserMark(marks: Mark[]): Mark | undefined {
    return marks.find(m => m.attrs.userid);
}
export function findStartOfMark(rpos: ResolvedPos, view: EditorView, finder: (marks: Mark[]) => Mark | undefined) {
    let before = 0;
    let nbef = rpos.nodeBefore;
    while (nbef && finder(nbef.marks)) {
        before += nbef.nodeSize;
        rpos = view.state.doc.resolve(rpos.pos - nbef.nodeSize);
        rpos && (nbef = rpos.nodeBefore);
    }
    return before;
}
export function findEndOfMark(rpos: ResolvedPos, view: EditorView, finder: (marks: Mark[]) => Mark | undefined) {
    let after = 0;
    let naft = rpos.nodeAfter;
    while (naft && finder(naft.marks)) {
        after += naft.nodeSize;
        rpos = view.state.doc.resolve(rpos.pos + naft.nodeSize);
        rpos && (naft = rpos.nodeAfter);
    }
    return after;
}

export class SelectionSizeTooltip {
    static tooltip: any;
    constructor(view: any) {
        if (!SelectionSizeTooltip.tooltip) {
            SelectionSizeTooltip.tooltip = document.createElement("div");
            SelectionSizeTooltip.tooltip.className = "FormattedTextBox-tooltip";
            DragManager.Root().appendChild(SelectionSizeTooltip.tooltip);
        }

        this.update(view, undefined);
    }


    update(view: EditorView, lastState?: EditorState) {
        let state = view.state;
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        if (state.selection.$from) {
            let nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            let naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            let child = state.selection.$from.nodeBefore;
            let mark = child && findOtherUserMark(child.marks);
            if (mark && child && nbef && naft && mark.attrs.opened && SelectionSizeTooltip.tooltip.offsetParent) {
                SelectionSizeTooltip.tooltip.textContent = mark.attrs.userid;
                // These are in screen coordinates
                let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
                // The box in which the tooltip is positioned, to use as base
                let box = SelectionSizeTooltip.tooltip.offsetParent.getBoundingClientRect();
                // Find a center-ish x position from the selection endpoints (when
                // crossing lines, end may be more to the left)
                let left = Math.max((start.left + end.left) / 2, start.left + 3);
                SelectionSizeTooltip.tooltip.style.left = (left - box.left) + "px";
                SelectionSizeTooltip.tooltip.style.bottom = (box.bottom - start.top) + "px";
            }
        }
    }

    destroy() { SelectionSizeTooltip.tooltip.style.display = "none" }
}
