import { action, observable } from "mobx";
import { Mark, ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as ReactDOM from 'react-dom';
import { Doc, DocListCast, Opt } from "../../../../fields/Doc";
import { Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { LinkDocPreview } from "../LinkDocPreview";
import { FormattedTextBox } from "./FormattedTextBox";
import './FormattedTextBoxComment.scss';
import { schema } from "./schema_rts";
import React = require("react");

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
    return marks.find(m => m.type === schema.marks.linkAnchor);
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

// this view appears when clicking on text that has a hyperlink which is configured to show a preview of its target.
// this will also display metadata information about text when the view is configured to display things like other people who authored text.
// 

export class FormattedTextBoxComment {
    static tooltip: HTMLElement;
    static tooltipText: HTMLElement;
    static start: number;
    static end: number;
    static mark: Mark;
    static textBox: FormattedTextBox | undefined;

    constructor(view: any) {
        if (!FormattedTextBoxComment.tooltip) {
            const root = document.getElementById("root");
            FormattedTextBoxComment.tooltip = document.createElement("div");
            FormattedTextBoxComment.tooltipText = document.createElement("div");
            FormattedTextBoxComment.tooltipText.style.height = "max-content";
            FormattedTextBoxComment.tooltipText.style.textOverflow = "ellipsis";
            FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipText);
            FormattedTextBoxComment.tooltip.className = "FormattedTextBox-tooltip";
            FormattedTextBoxComment.tooltip.style.display = "none";
            FormattedTextBoxComment.tooltip.onpointerdown = (e: PointerEvent) => {
                const textBox = FormattedTextBoxComment.textBox;
                false && FormattedTextBoxComment.start !== undefined && textBox?.adoptAnnotation(
                    FormattedTextBoxComment.start, FormattedTextBoxComment.end, FormattedTextBoxComment.mark);
                e.stopPropagation();
                e.preventDefault();
            };
            root?.appendChild(FormattedTextBoxComment.tooltip);
        }
    }
    public static Hide() {
        FormattedTextBoxComment.textBox = undefined;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "none");
    }
    public static SetState(textBox: any, start: number, end: number, mark: Mark) {
        FormattedTextBoxComment.textBox = textBox;
        FormattedTextBoxComment.start = start;
        FormattedTextBoxComment.end = end;
        FormattedTextBoxComment.mark = mark;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "");
    }

    @action
    static showCommentbox(set: string, view: EditorView, nbef: number) {
        const state = view.state;
        if (set !== "none") {
            // These are in screen coordinates
            // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
            const start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
            // The box in which the tooltip is positioned, to use as base
            const box = (document.getElementsByClassName("mainView-container") as any)[0].getBoundingClientRect();
            // Find a center-ish x position from the selection endpoints (when
            // crossing lines, end may be more to the left)
            const left = Math.max((start.left + end.left) / 2, start.left + 3);
            FormattedTextBoxComment.tooltip.style.left = (left - box.left) + "px";
            FormattedTextBoxComment.tooltip.style.bottom = (box.bottom - start.top) + "px";
        }
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = set);
    }

    static update(view: EditorView, lastState?: EditorState, hrefs: string = "") {
        if (FormattedTextBoxComment.textBox && (hrefs || !lastState?.doc.eq(view.state.doc) || !lastState?.selection.eq(view.state.selection))) {
            FormattedTextBoxComment.setupPreview(view, FormattedTextBoxComment.textBox, hrefs ? hrefs.trim().split(" ") : undefined);
        }
    }

    static setupPreview(view: EditorView, textBox: FormattedTextBox, hrefs?: string[]) {
        const state = view.state;
        // this section checks to see if the insertion point is over text entered by a different user.  If so, it sets ths comment text to indicate the user and the modification date
        var hide = true;
        if (state.selection.$from) {
            const nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            const naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            const noselection = state.selection.$from === state.selection.$to;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            const mark = child && findOtherUserMark(child.marks);
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                FormattedTextBoxComment.SetState(textBox, state.selection.$from.pos - nbef, state.selection.$from.pos + naft, mark);
            }
            if (mark && child && ((nbef && naft) || !noselection)) {
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " on " + (new Date(mark.attrs.modified * 1000)).toLocaleString();
                FormattedTextBoxComment.showCommentbox("", view, nbef);
                hide = false;
            }
        }
        // this checks if the selection is a hyperlink.  If so, it displays the target doc's text for internal links, and the url of the target for external links. 
        if (hide && state.selection.$from) {
            const nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            const naft = findEndOfMark(state.selection.$from, view, findLinkMark) || nbef;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            child = child || (nbef && state.selection.$from.nodeBefore);
            const mark = child ? findLinkMark(child.marks) : undefined;
            const href = (!mark?.attrs.docref || naft === nbef) && mark?.attrs.allAnchors.find((item: { href: string }) => item.href)?.href;
            if ((href && child && nbef && naft && mark?.attrs.showPreview)) {
                const anchorDoc = href.indexOf(Utils.prepend("/doc/")) === 0 ? href.replace(Utils.prepend("/doc/"), "").split("?")[0] : undefined;
                if (anchorDoc) {
                    DocServer.GetRefField(anchorDoc).then(async anchor =>
                        anchor instanceof Doc && textBox && LinkDocPreview.SetLinkInfo({
                            docprops: textBox.props.docViewPath.lastElement().props,
                            linkSrc: textBox.props.Document,
                            linkDoc: DocListCast(anchor.links)[0],
                            location: ((pos) => [pos.left, pos.top + 25])(view.coordsAtPos(state.selection.from - nbef)),
                            hrefs,
                            showHeader: true
                        })
                    );
                } else if (hrefs?.length) {
                    LinkDocPreview.SetLinkInfo({
                        docprops: textBox.props.docViewPath.lastElement().props,
                        linkSrc: textBox.props.Document,
                        linkDoc: undefined,
                        location: ((pos) => [pos.left, pos.top + 25])(view.coordsAtPos(state.selection.from - nbef)),
                        hrefs,
                        showHeader: true
                    });
                }
            }
        }
        if (hide) FormattedTextBoxComment.Hide();
    }

    destroy() { }
}