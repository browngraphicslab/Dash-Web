import { Plugin, EditorState } from "prosemirror-state";
import './FormattedTextBoxComment.scss';
import { ResolvedPos, Mark } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../../new_fields/Doc";
import { schema } from "../../util/RichTextSchema";
import { DocServer } from "../../DocServer";
import { Utils } from "../../../Utils";
import { StrCast } from "../../../new_fields/Types";
import { FormattedTextBox } from "./FormattedTextBox";

export let formattedTextBoxCommentPlugin = new Plugin({
    view(editorView) { return new FormattedTextBoxComment(editorView); }
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


export class FormattedTextBoxComment {
    static tooltip: HTMLElement;
    static tooltipText: HTMLElement;
    static start: number;
    static end: number;
    static mark: Mark;
    static opened: boolean;
    static textBox: FormattedTextBox | undefined;
    constructor(view: any) {
        if (!FormattedTextBoxComment.tooltip) {
            const root = document.getElementById("root");
            let input = document.createElement("input");
            input.type = "checkbox";
            FormattedTextBoxComment.tooltip = document.createElement("div");
            FormattedTextBoxComment.tooltipText = document.createElement("div");
            FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipText);
            FormattedTextBoxComment.tooltip.className = "FormattedTextBox-tooltip";
            FormattedTextBoxComment.tooltip.style.pointerEvents = "all";
            FormattedTextBoxComment.tooltip.appendChild(input);
            FormattedTextBoxComment.tooltip.onpointerdown = (e: PointerEvent) => {
                let keep = e.target && (e.target as any).type === "checkbox" ? true : false;
                FormattedTextBoxComment.opened = keep || !FormattedTextBoxComment.opened;
                FormattedTextBoxComment.textBox && FormattedTextBoxComment.start !== undefined && FormattedTextBoxComment.textBox.setAnnotation(
                    FormattedTextBoxComment.start, FormattedTextBoxComment.end, FormattedTextBoxComment.mark,
                    FormattedTextBoxComment.opened, keep);
            };
            root && root.appendChild(FormattedTextBoxComment.tooltip);
        }
        this.update(view, undefined);
    }

    public static Hide() {
        FormattedTextBoxComment.textBox = undefined;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "none");
    }
    public static SetState(textBox: any, opened: boolean, start: number, end: number, mark: Mark) {
        FormattedTextBoxComment.textBox = textBox;
        FormattedTextBoxComment.start = start;
        FormattedTextBoxComment.end = end;
        FormattedTextBoxComment.mark = mark;
        FormattedTextBoxComment.opened = opened;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "");
    }

    update(view: EditorView, lastState?: EditorState) {
        let state = view.state;
        // Don't do anything if the document/selection didn't change
        if (lastState && lastState.doc.eq(state.doc) &&
            lastState.selection.eq(state.selection)) return;

        if (!FormattedTextBoxComment.textBox || !FormattedTextBoxComment.textBox.props.isSelected()) return;
        let set = "none";
        if (FormattedTextBoxComment.textBox && state.selection.$from) {
            let nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            let naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            const spos = state.selection.$from.pos - nbef;
            const epos = state.selection.$from.pos + naft;
            let child = state.selection.$from.nodeBefore;
            let mark = child && findOtherUserMark(child.marks);
            let noselection = view.state.selection.$from === view.state.selection.$to;
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                FormattedTextBoxComment.SetState(this, mark.attrs.opened, spos, epos, mark);
            }
            if (mark && child && nbef && naft) {
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " " + mark.attrs.modified;
                // These are in screen coordinates
                // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
                let start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
                // The box in which the tooltip is positioned, to use as base
                let box = (document.getElementById("main-div") as any).getBoundingClientRect();
                // Find a center-ish x position from the selection endpoints (when
                // crossing lines, end may be more to the left)
                let left = Math.max((start.left + end.left) / 2, start.left + 3);
                FormattedTextBoxComment.tooltip.style.left = (left - box.left) + "px";
                FormattedTextBoxComment.tooltip.style.bottom = (box.bottom - start.top) + "px";
                set = "";
            }
        }
        if (set === "none" && state.selection.$from) {
            FormattedTextBoxComment.textBox = undefined;
            let nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            let naft = findEndOfMark(state.selection.$from, view, findLinkMark);
            let child = state.selection.$from.nodeBefore;
            let mark = child && findLinkMark(child.marks);
            if (mark && child && nbef && naft) {
                FormattedTextBoxComment.tooltipText.textContent = "link : " + (mark.attrs.title || mark.attrs.href);
                if (mark.attrs.href.indexOf(Utils.prepend("/doc/")) === 0) {
                    let docTarget = mark.attrs.href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    docTarget && DocServer.GetRefField(docTarget).then(linkDoc =>
                        (linkDoc as Doc) && (FormattedTextBoxComment.tooltipText.textContent = "link :" + StrCast((linkDoc as Doc).title)));
                }
                // These are in screen coordinates
                // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
                let start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
                // The box in which the tooltip is positioned, to use as base
                let box = (document.getElementById("main-div") as any).getBoundingClientRect();
                // Find a center-ish x position from the selection endpoints (when
                // crossing lines, end may be more to the left)
                let left = Math.max((start.left + end.left) / 2, start.left + 3);
                FormattedTextBoxComment.tooltip.style.left = (left - box.left) + "px";
                FormattedTextBoxComment.tooltip.style.bottom = (box.bottom - start.top) + "px";
                set = "";
            }
        }
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = set);
    }

    destroy() { FormattedTextBoxComment.tooltip.style.display = "none"; }
}
