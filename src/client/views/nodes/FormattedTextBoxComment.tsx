import { Plugin, EditorState } from "prosemirror-state";
import './FormattedTextBoxComment.scss';
import { ResolvedPos, Mark } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../../new_fields/Doc";
import { schema } from "../../util/RichTextSchema";
import { DocServer } from "../../DocServer";
import { Utils } from "../../../Utils";
import { StrCast } from "../../../new_fields/Types";

export let selectionSizePlugin = new Plugin({
    view(editorView) { return new SelectionSizeTooltip(editorView); }
});
export function findOtherUserMark(marks: Mark[]): Mark | undefined {
    return marks.find(m => m.attrs.userid && m.attrs.userid !== Doc.CurrentUserEmail);
}
export function findUserMark(marks: Mark[]): Mark | undefined {
    return marks.find(m => m.attrs.userid);
}
export function findLinkMark(marks: Mark[]): Mark | undefined {
    return marks.find(m => m.type === schema.marks.link);
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
    static tooltip: HTMLElement;
    static tooltipText: HTMLElement;
    static start: number;
    static end: number;
    static mark: Mark;
    static opened: boolean;
    static textBox: any;
    constructor(view: any) {
        if (!SelectionSizeTooltip.tooltip) {
            const root = document.getElementById("root");
            let input = document.createElement("input");
            input.type = "checkbox";
            SelectionSizeTooltip.tooltip = document.createElement("div");
            SelectionSizeTooltip.tooltipText = document.createElement("div");
            SelectionSizeTooltip.tooltip.appendChild(SelectionSizeTooltip.tooltipText);
            SelectionSizeTooltip.tooltip.className = "FormattedTextBox-tooltip";
            SelectionSizeTooltip.tooltip.style.pointerEvents = "all";
            SelectionSizeTooltip.tooltip.appendChild(input);
            SelectionSizeTooltip.tooltip.onpointerdown = (e: PointerEvent) => {
                let keep = e.target && (e.target as any).type === "checkbox";
                SelectionSizeTooltip.opened = keep || !SelectionSizeTooltip.opened;
                SelectionSizeTooltip.textBox && SelectionSizeTooltip.textBox.setAnnotation(
                    SelectionSizeTooltip.start, SelectionSizeTooltip.end, SelectionSizeTooltip.mark,
                    SelectionSizeTooltip.opened, keep);
            };
            root && root.appendChild(SelectionSizeTooltip.tooltip);
        }
        this.update(view, undefined);
    }

    public static Hide() {
        SelectionSizeTooltip.textBox = undefined;
        SelectionSizeTooltip.tooltip && (SelectionSizeTooltip.tooltip.style.display = "none");
    }
    public static SetState(textBox: any, opened: boolean, start: number, end: number, mark: Mark) {
        SelectionSizeTooltip.textBox = textBox;
        SelectionSizeTooltip.start = start;
        SelectionSizeTooltip.end = end;
        SelectionSizeTooltip.mark = mark;
        SelectionSizeTooltip.opened = opened;
        SelectionSizeTooltip.tooltip && (SelectionSizeTooltip.tooltip.style.display = "");
    }

    update(view: EditorView, lastState?: EditorState) {
        let state = view.state;
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        let set = "none"
        if (state.selection.$from) {
            let nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            let naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            const spos = state.selection.$from.pos - nbef;
            const epos = state.selection.$from.pos + naft;
            let child = state.selection.$from.nodeBefore;
            let mark = child && findOtherUserMark(child.marks);
            let noselection = view.state.selection.$from === view.state.selection.$to;
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                SelectionSizeTooltip.SetState(this, mark.attrs.opened, spos, epos, mark);
            }
            if (mark && child && nbef && naft) {
                SelectionSizeTooltip.tooltipText.textContent = mark.attrs.userid + " " + mark.attrs.modified;
                // These are in screen coordinates
                // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
                let start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
                // The box in which the tooltip is positioned, to use as base
                let box = (document.getElementById("main-div") as any).getBoundingClientRect();
                // Find a center-ish x position from the selection endpoints (when
                // crossing lines, end may be more to the left)
                let left = Math.max((start.left + end.left) / 2, start.left + 3);
                SelectionSizeTooltip.tooltip.style.left = (left - box.left) + "px";
                SelectionSizeTooltip.tooltip.style.bottom = (box.bottom - start.top) + "px";
                set = "";
            }
        }
        if (set === "none" && state.selection.$from) {
            SelectionSizeTooltip.textBox = undefined;
            let nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            let naft = findEndOfMark(state.selection.$from, view, findLinkMark);
            let child = state.selection.$from.nodeBefore;
            let mark = child && findLinkMark(child.marks);
            if (mark && child && nbef && naft) {
                SelectionSizeTooltip.tooltipText.textContent = "link : " + (mark.attrs.title || mark.attrs.href);
                if (mark.attrs.href.indexOf(Utils.prepend("/doc/")) === 0) {
                    let docTarget = mark.attrs.href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    docTarget && DocServer.GetRefField(docTarget).then(linkDoc =>
                        (linkDoc as Doc) && (SelectionSizeTooltip.tooltipText.textContent = "link :" + StrCast((linkDoc as Doc)!.title)));
                }
                // These are in screen coordinates
                // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
                let start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
                // The box in which the tooltip is positioned, to use as base
                let box = (document.getElementById("main-div") as any).getBoundingClientRect();
                // Find a center-ish x position from the selection endpoints (when
                // crossing lines, end may be more to the left)
                let left = Math.max((start.left + end.left) / 2, start.left + 3);
                SelectionSizeTooltip.tooltip.style.left = (left - box.left) + "px";
                SelectionSizeTooltip.tooltip.style.bottom = (box.bottom - start.top) + "px";
                set = "";
            }
        }
        SelectionSizeTooltip.tooltip && (SelectionSizeTooltip.tooltip.style.display = set);
    }

    destroy() { SelectionSizeTooltip.tooltip.style.display = "none"; }
}
