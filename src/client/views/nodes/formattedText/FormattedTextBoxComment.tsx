import { Mark, ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as ReactDOM from 'react-dom';
import { Doc, DocCastAsync } from "../../../../fields/Doc";
import { Cast, FieldValue, NumCast } from "../../../../fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, Utils, emptyPath, returnZero, returnOne } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { DocumentManager } from "../../../util/DocumentManager";
import { schema } from "./schema_rts";
import { Transform } from "../../../util/Transform";
import { ContentFittingDocumentView } from "../ContentFittingDocumentView";
import { FormattedTextBox } from "./FormattedTextBox";
import './FormattedTextBoxComment.scss';
import React = require("react");
import { Docs } from "../../../documents/Documents";
import wiki from "wikijs";
import { DocumentType } from "../../../documents/DocumentTypes";

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
    static tooltipInput: HTMLInputElement;
    static start: number;
    static end: number;
    static mark: Mark;
    static textBox: FormattedTextBox | undefined;
    static linkDoc: Doc | undefined;
    constructor(view: any) {
        if (!FormattedTextBoxComment.tooltip) {
            const root = document.getElementById("root");
            FormattedTextBoxComment.tooltipInput = document.createElement("input");
            FormattedTextBoxComment.tooltipInput.type = "checkbox";
            FormattedTextBoxComment.tooltip = document.createElement("div");
            FormattedTextBoxComment.tooltipText = document.createElement("div");
            FormattedTextBoxComment.tooltipText.style.width = "100%";
            FormattedTextBoxComment.tooltipText.style.height = "100%";
            FormattedTextBoxComment.tooltipText.style.textOverflow = "ellipsis";
            FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipText);
            FormattedTextBoxComment.tooltip.className = "FormattedTextBox-tooltip";
            FormattedTextBoxComment.tooltip.style.pointerEvents = "all";
            FormattedTextBoxComment.tooltip.style.maxWidth = "350px";
            FormattedTextBoxComment.tooltip.style.maxHeight = "250px";
            FormattedTextBoxComment.tooltip.style.width = "100%";
            FormattedTextBoxComment.tooltip.style.height = "100%";
            FormattedTextBoxComment.tooltip.style.overflow = "hidden";
            FormattedTextBoxComment.tooltip.style.display = "none";
            FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipInput);
            FormattedTextBoxComment.tooltip.onpointerdown = (e: PointerEvent) => {
                const keep = e.target && (e.target as any).type === "checkbox" ? true : false;
                const textBox = FormattedTextBoxComment.textBox;
                if (FormattedTextBoxComment.linkDoc && !keep && textBox) {
                    if (FormattedTextBoxComment.linkDoc.type !== DocumentType.LINK) {
                        textBox.props.addDocTab(FormattedTextBoxComment.linkDoc, e.ctrlKey ? "inTab" : "onRight");
                    } else {
                        DocumentManager.Instance.FollowLink(FormattedTextBoxComment.linkDoc, textBox.props.Document,
                            (doc: Doc, followLinkLocation: string) => textBox.props.addDocTab(doc, e.ctrlKey ? "inTab" : followLinkLocation));
                    }
                } else if (textBox && (FormattedTextBoxComment.tooltipText as any).href) {
                    textBox.props.addDocTab(Docs.Create.WebDocument((FormattedTextBoxComment.tooltipText as any).href, { title: (FormattedTextBoxComment.tooltipText as any).href, _width: 200, _height: 400, UseCors: true }), "onRight");
                }
                keep && textBox && FormattedTextBoxComment.start !== undefined && textBox.adoptAnnotation(
                    FormattedTextBoxComment.start, FormattedTextBoxComment.end, FormattedTextBoxComment.mark);
                e.stopPropagation();
                e.preventDefault();
            };
            root && root.appendChild(FormattedTextBoxComment.tooltip);
        }
    }

    public static Hide() {
        FormattedTextBoxComment.textBox = undefined;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "none");
        ReactDOM.unmountComponentAtNode(FormattedTextBoxComment.tooltipText);
    }
    public static SetState(textBox: any, start: number, end: number, mark: Mark) {
        FormattedTextBoxComment.textBox = textBox;
        FormattedTextBoxComment.start = start;
        FormattedTextBoxComment.end = end;
        FormattedTextBoxComment.mark = mark;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "");
    }

    static update(view: EditorView, lastState?: EditorState) {
        const state = view.state;
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
        FormattedTextBoxComment.tooltipInput.style.display = "none";
        FormattedTextBoxComment.tooltip.style.width = "";
        FormattedTextBoxComment.tooltip.style.height = "";
        (FormattedTextBoxComment.tooltipText as any).href = "";
        FormattedTextBoxComment.tooltipText.style.whiteSpace = "";
        FormattedTextBoxComment.tooltipText.style.overflow = "";
        // this section checks to see if the insertion point is over text entered by a different user.  If so, it sets ths comment text to indicate the user and the modification date
        if (state.selection.$from) {
            nbef = findStartOfMark(state.selection.$from, view, findOtherUserMark);
            const naft = findEndOfMark(state.selection.$from, view, findOtherUserMark);
            const noselection = view.state.selection.$from === view.state.selection.$to;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            const mark = child && findOtherUserMark(child.marks);
            if (mark && child && (nbef || naft) && (!mark.attrs.opened || noselection)) {
                FormattedTextBoxComment.SetState(FormattedTextBoxComment.textBox, state.selection.$from.pos - nbef, state.selection.$from.pos + naft, mark);
            }
            if (mark && child && ((nbef && naft) || !noselection)) {
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " date=" + (new Date(mark.attrs.modified * 5000)).toDateString();
                set = "";
                FormattedTextBoxComment.tooltipInput.style.display = "";
            }
        }
        // this checks if the selection is a hyperlink.  If so, it displays the target doc's text for internal links, and the url of the target for external links. 
        if (set === "none" && state.selection.$from) {
            nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            const naft = findEndOfMark(state.selection.$from, view, findLinkMark);
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            const mark = child && findLinkMark(child.marks);
            if (mark && child && nbef && naft && mark.attrs.showPreview) {
                FormattedTextBoxComment.tooltipText.textContent = "external => " + mark.attrs.href;
                (FormattedTextBoxComment.tooltipText as any).href = mark.attrs.href;
                if (mark.attrs.href.startsWith("https://en.wikipedia.org/wiki/")) {
                    wiki().page(mark.attrs.href.replace("https://en.wikipedia.org/wiki/", "")).then(page => page.summary().then(summary => FormattedTextBoxComment.tooltipText.textContent = summary.substring(0, 500)));
                } else {
                    FormattedTextBoxComment.tooltipText.style.whiteSpace = "pre";
                    FormattedTextBoxComment.tooltipText.style.overflow = "hidden";
                }
                if (mark.attrs.href.indexOf(Utils.prepend("/doc/")) === 0) {
                    FormattedTextBoxComment.tooltipText.textContent = "target not found...";
                    (FormattedTextBoxComment.tooltipText as any).href = "";
                    const docTarget = mark.attrs.href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    try {
                        ReactDOM.unmountComponentAtNode(FormattedTextBoxComment.tooltipText);
                    } catch (e) { }
                    docTarget && DocServer.GetRefField(docTarget).then(async linkDoc => {
                        if (linkDoc instanceof Doc) {
                            (FormattedTextBoxComment.tooltipText as any).href = mark.attrs.href;
                            FormattedTextBoxComment.linkDoc = linkDoc;
                            const anchor = FieldValue(Doc.AreProtosEqual(FieldValue(Cast(linkDoc.anchor1, Doc)), textBox.dataDoc) ? Cast(linkDoc.anchor2, Doc) : (Cast(linkDoc.anchor1, Doc)) || linkDoc);
                            const target = anchor?.annotationOn ? await DocCastAsync(anchor.annotationOn) : anchor;
                            if (anchor !== target && anchor && target) {
                                target._scrollY = NumCast(anchor?.y);
                            }
                            if (target) {
                                ReactDOM.render(<ContentFittingDocumentView
                                    Document={target}
                                    LibraryPath={emptyPath}
                                    fitToBox={true}
                                    moveDocument={returnFalse}
                                    rootSelected={returnFalse}
                                    ScreenToLocalTransform={Transform.Identity}
                                    parentActive={returnFalse}
                                    addDocument={returnFalse}
                                    removeDocument={returnFalse}
                                    addDocTab={returnFalse}
                                    pinToPres={returnFalse}
                                    dontRegisterView={true}
                                    ContainingCollectionDoc={undefined}
                                    ContainingCollectionView={undefined}
                                    renderDepth={1}
                                    PanelWidth={() => Math.min(350, NumCast(target._width, 350))}
                                    PanelHeight={() => Math.min(250, NumCast(target._height, 250))}
                                    focus={emptyFunction}
                                    whenActiveChanged={returnFalse}
                                    bringToFront={returnFalse}
                                    ContentScaling={returnOne}
                                    NativeWidth={returnZero}
                                    NativeHeight={returnZero}
                                />, FormattedTextBoxComment.tooltipText);
                                FormattedTextBoxComment.tooltip.style.width = NumCast(target._width) ? `${NumCast(target._width)}` : "100%";
                                FormattedTextBoxComment.tooltip.style.height = NumCast(target._height) ? `${NumCast(target._height)}` : "100%";
                            }
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

    destroy() { }
}
