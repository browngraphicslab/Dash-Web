import { Plugin, EditorState } from "prosemirror-state";
import './FormattedTextBoxComment.scss';
import { ResolvedPos, Mark } from "prosemirror-model";
import { EditorView } from "prosemirror-view";
import { Doc, WidthSym } from "../../../new_fields/Doc";
import { schema } from "../../util/RichTextSchema";
import { DocServer } from "../../DocServer";
import { Utils, returnTrue, returnFalse, emptyFunction, returnEmptyString, returnOne } from "../../../Utils";
import { StrCast, Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { FormattedTextBox } from "./FormattedTextBox";
import { DocumentManager } from "../../util/DocumentManager";
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentView } from "./DocumentView";
import React = require("react");
import * as ReactDOM from 'react-dom';
import { Transform } from "../../util/Transform";
import { ContentFittingDocumentView } from "./ContentFittingDocumentView";

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
    static linkDoc: Doc | undefined;
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
            FormattedTextBoxComment.tooltip.style.maxWidth = "350px";
            FormattedTextBoxComment.tooltip.style.maxHeight = "250px";
            FormattedTextBoxComment.tooltip.style.width = "100%";
            FormattedTextBoxComment.tooltip.style.height = "100%";
            FormattedTextBoxComment.tooltip.style.overflow = "hidden";
            FormattedTextBoxComment.tooltip.style.display = "none";
            FormattedTextBoxComment.tooltip.appendChild(input);
            FormattedTextBoxComment.tooltip.onpointerdown = (e: PointerEvent) => {
                let keep = e.target && (e.target as any).type === "checkbox" ? true : false;
                const textBox = FormattedTextBoxComment.textBox;
                if (FormattedTextBoxComment.linkDoc && !keep && textBox) {
                    DocumentManager.Instance.FollowLink(FormattedTextBoxComment.linkDoc, textBox.props.Document,
                        (doc: Doc, maxLocation: string) => textBox.props.addDocTab(doc, undefined, e.ctrlKey ? "inTab" : "onRight"));
                }
                FormattedTextBoxComment.opened = keep || !FormattedTextBoxComment.opened;
                textBox && FormattedTextBoxComment.start !== undefined && textBox.setAnnotation(
                    FormattedTextBoxComment.start, FormattedTextBoxComment.end, FormattedTextBoxComment.mark,
                    FormattedTextBoxComment.opened, keep);
                e.stopPropagation();
            };
            root && root.appendChild(FormattedTextBoxComment.tooltip);
        }
        //this.update(view, undefined);
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
            lastState.selection.eq(state.selection)) {
            return;
        }
        FormattedTextBoxComment.linkDoc = undefined;

        const textBox = FormattedTextBoxComment.textBox;
        if (!textBox || !textBox.props) {
            return;
        }
        let set = "none";
        let nbef = 0;
        // this section checks to see if the insertion point is over text entered by a different user.  If so, it sets ths comment text to indicate the user and the modification date
        if (state.selection.$from) {
            nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            let naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            let noselection = view.state.selection.$from === view.state.selection.$to;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            let mark = child && findOtherUserMark(child.marks);
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                FormattedTextBoxComment.SetState(FormattedTextBoxComment.textBox, mark.attrs.opened, state.selection.$from.pos - nbef, state.selection.$from.pos + naft, mark);
            }
            if (mark && child && ((nbef && naft) || !noselection)) {
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " date=" + (new Date(mark.attrs.modified * 5000)).toDateString();
                set = "";
            }
        }
        // this checks if the selection is a hyperlink.  If so, it displays the target doc's text for internal links, and the url of the target for external links. 
        if (set === "none" && state.selection.$from) {
            nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            let naft = findEndOfMark(state.selection.$from, view, findLinkMark);
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            let mark = child && findLinkMark(child.marks);
            if (mark && child && nbef && naft) {
                FormattedTextBoxComment.tooltipText.textContent = "external => " + mark.attrs.href;
                if (mark.attrs.href.indexOf(Utils.prepend("/doc/")) === 0) {
                    let docTarget = mark.attrs.href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    docTarget && DocServer.GetRefField(docTarget).then(linkDoc => {
                        if (linkDoc instanceof Doc) {
                            FormattedTextBoxComment.linkDoc = linkDoc;
                            let target = FieldValue(Doc.AreProtosEqual(FieldValue(Cast(linkDoc.anchor1, Doc)), textBox.props.Document) ? Cast(linkDoc.anchor2, Doc) : Cast(linkDoc.anchor1, Doc));
                            try {
                                ReactDOM.unmountComponentAtNode(FormattedTextBoxComment.tooltipText);
                            } catch (e) {

                            }
                            target && ReactDOM.render(<ContentFittingDocumentView
                                fitToBox={true}
                                Document={target}
                                fieldKey={"data"}
                                moveDocument={returnFalse}
                                getTransform={Transform.Identity}
                                active={returnFalse}
                                setPreviewScript={returnEmptyString}
                                addDocument={returnFalse}
                                removeDocument={returnFalse}
                                ruleProvider={undefined}
                                addDocTab={returnFalse}
                                pinToPres={returnFalse}
                                dontRegisterView={true}
                                renderDepth={1}
                                PanelWidth={() => 350}
                                PanelHeight={() => 250}
                                focus={emptyFunction}
                                whenActiveChanged={returnFalse}
                            />, FormattedTextBoxComment.tooltipText);
                            // let ext = (target && target.type !== DocumentType.PDFANNO && Doc.fieldExtensionDoc(target, "data")) || target; // try guessing that the target doc's data is in the 'data' field.  probably need an 'overviewLayout' and then just display the target Document ....
                            // let text = ext && StrCast(ext.text);
                            // ext && (FormattedTextBoxComment.tooltipText.textContent = (target && target.type === DocumentType.PDFANNO ? "Quoted from " : "") + "=> " + (text || StrCast(ext.title)));
                        }
                    });
                }
                set = "";
            }
        }
        if (set !== "none") {
            // These are in screen coordinates
            // let start = view.coordsAtPos(state.selection.from), end = view.coordsAtPos(state.selection.to);
            let start = view.coordsAtPos(state.selection.from - nbef), end = view.coordsAtPos(state.selection.from - nbef);
            // The box in which the tooltip is positioned, to use as base
            let box = (document.getElementById("mainView-container") as any).getBoundingClientRect();
            // Find a center-ish x position from the selection endpoints (when
            // crossing lines, end may be more to the left)
            let left = Math.max((start.left + end.left) / 2, start.left + 3);
            FormattedTextBoxComment.tooltip.style.left = (left - box.left) + "px";
            FormattedTextBoxComment.tooltip.style.bottom = (box.bottom - start.top) + "px";
        }
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = set);
    }

    destroy() { }//FormattedTextBoxComment.tooltip.style.display = "none"; }
}
