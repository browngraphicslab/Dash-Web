import { Mark, ResolvedPos } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc } from "../../../../fields/Doc";
import { LinkDocPreview } from "../LinkDocPreview";
import { FormattedTextBox } from "./FormattedTextBox";
import './FormattedTextBoxComment.scss';
import { schema } from "./schema_rts";

export function findOtherUserMark(marks: Mark[]): Mark | undefined { return marks.find(m => m.attrs.userid && m.attrs.userid !== Doc.CurrentUserEmail); }
export function findUserMark(marks: Mark[]): Mark | undefined { return marks.find(m => m.attrs.userid); }
export function findLinkMark(marks: Mark[]): Mark | undefined { return marks.find(m => m.type === schema.marks.linkAnchor); }
export function findStartOfMark(rpos: ResolvedPos, view: EditorView, finder: (marks: Mark[]) => Mark | undefined) {
    let before = 0, nbef = rpos.nodeBefore;
    while (nbef && finder(nbef.marks)) {
        before += nbef.nodeSize;
        rpos = view.state.doc.resolve(rpos.pos - nbef.nodeSize);
        rpos && (nbef = rpos.nodeBefore);
    }
    return before;
}
export function findEndOfMark(rpos: ResolvedPos, view: EditorView, finder: (marks: Mark[]) => Mark | undefined) {
    let after = 0, naft = rpos.nodeAfter;
    while (naft && finder(naft.marks)) {
        after += naft.nodeSize;
        rpos = view.state.doc.resolve(rpos.pos + naft.nodeSize);
        rpos && (naft = rpos.nodeAfter);
    }
    return after;
}

// this view appears when clicking on text that has a hyperlink which is configured to show a preview of its target.
// this will also display metadata information about text when the view is configured to display things like other people who authored text.
// 
export class FormattedTextBoxComment {
    static tooltip: HTMLElement;
    static tooltipText: HTMLElement;
    static startUserMarkRegion: number;
    static endUserMarkRegion: number;
    static userMark: Mark;
    static textBox: FormattedTextBox | undefined;

    constructor(view: any) {
        if (!FormattedTextBoxComment.tooltip) {
            const tooltip = FormattedTextBoxComment.tooltip = document.createElement("div");
            const tooltipText = FormattedTextBoxComment.tooltipText = document.createElement("div");
            tooltip.className = "FormattedTextBox-tooltip";
            tooltipText.className = "FormattedTextBox-tooltipText";
            tooltip.style.display = "none";
            tooltip.appendChild(tooltipText);
            tooltip.onpointerdown = (e: PointerEvent) => {
                const { textBox, startUserMarkRegion, endUserMarkRegion, userMark } = FormattedTextBoxComment;
                false && startUserMarkRegion !== undefined && textBox?.adoptAnnotation(startUserMarkRegion, endUserMarkRegion, userMark);
                e.stopPropagation();
                e.preventDefault();
            };
            document.getElementById("root")?.appendChild(tooltip);
        }
    }
    public static Hide() {
        FormattedTextBoxComment.textBox = undefined;
        FormattedTextBoxComment.tooltip.style.display = "none";
    }
    public static saveMarkRegion(textBox: any, start: number, end: number, mark: Mark) {
        FormattedTextBoxComment.textBox = textBox;
        FormattedTextBoxComment.startUserMarkRegion = start;
        FormattedTextBoxComment.endUserMarkRegion = end;
        FormattedTextBoxComment.userMark = mark;
        FormattedTextBoxComment.tooltip.style.display = "";
    }

    static showCommentbox(view: EditorView, nbef: number) {
        const state = view.state;
        // These are in screen coordinates
        const start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
        // The box in which the tooltip is positioned, to use as base
        const box = (document.getElementsByClassName("mainView-container") as any)[0].getBoundingClientRect();
        // Find a center-ish x position from the selection endpoints (when crossing lines, end may be more to the left)
        const left = Math.max((start.left + end.left) / 2, start.left + 3);
        FormattedTextBoxComment.tooltip.style.left = (left - box.left) + "px";
        FormattedTextBoxComment.tooltip.style.bottom = (box.bottom - start.top) + "px";
        FormattedTextBoxComment.tooltip.style.display = "";
    }

    static update(view: EditorView, lastState?: EditorState, hrefs: string = "") {
        if (FormattedTextBoxComment.textBox && (hrefs || !lastState?.doc.eq(view.state.doc) || !lastState?.selection.eq(view.state.selection))) {
            FormattedTextBoxComment.setupPreview(view, FormattedTextBoxComment.textBox, hrefs ? hrefs.trim().split(" ") : undefined);
        }
    }

    static setupPreview(view: EditorView, textBox: FormattedTextBox, hrefs?: string[]) {
        const state = view.state;
        // this section checks to see if the insertion point is over text entered by a different user.  If so, it sets ths comment text to indicate the user and the modification date
        if (state.selection.$from) {
            const nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            const naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            const noselection = state.selection.$from === state.selection.$to;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            const mark = child && findOtherUserMark(child.marks);
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                FormattedTextBoxComment.saveMarkRegion(textBox, state.selection.$from.pos - nbef, state.selection.$from.pos + naft, mark);
            }
            if (mark && child && ((nbef && naft) || !noselection)) {
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " on " + (new Date(mark.attrs.modified * 1000)).toLocaleString();
                FormattedTextBoxComment.showCommentbox(view, nbef);
            } else FormattedTextBoxComment.Hide();
        }

        // this checks if the selection is a hyperlink.  If so, it displays the target doc's text for internal links, and the url of the target for external links. 
        if (state.selection.$from && hrefs) {
            const nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            const naft = findEndOfMark(state.selection.$from, view, findLinkMark) || nbef;
            nbef && naft && LinkDocPreview.SetLinkInfo({
                docProps: textBox.props,
                linkSrc: textBox.rootDoc,
                location: ((pos) => [pos.left, pos.top + 25])(view.coordsAtPos(state.selection.from - nbef)),
                hrefs,
                showHeader: true
            });
        }
    }

    destroy() { }
}