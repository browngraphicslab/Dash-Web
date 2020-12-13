import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from "@material-ui/core";
import { action, observable } from "mobx";
import { Mark, ResolvedPos } from "prosemirror-model";
import { EditorState, Plugin } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import * as ReactDOM from 'react-dom';
import wiki from "wikijs";
import { Doc, DocCastAsync, Opt, DocListCast } from "../../../../fields/Doc";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../fields/Types";
import { emptyFunction, emptyPath, returnEmptyDoclist, returnEmptyFilter, returnFalse, returnOne, Utils } from "../../../../Utils";
import { DocServer } from "../../../DocServer";
import { Docs } from "../../../documents/Documents";
import { DocumentType } from "../../../documents/DocumentTypes";
import { LinkManager } from "../../../util/LinkManager";
import { Transform } from "../../../util/Transform";
import { undoBatch } from "../../../util/UndoManager";
import { ContentFittingDocumentView } from "../ContentFittingDocumentView";
import { DocumentLinksButton } from "../DocumentLinksButton";
import { DocumentView } from "../DocumentView";
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
    static tooltipInput: HTMLInputElement;
    static start: number;
    static end: number;
    static mark: Mark;
    static textBox: FormattedTextBox | undefined;
    static linkDoc: Doc | undefined;

    static _deleteRef: Opt<HTMLDivElement | null>;
    static _followRef: Opt<HTMLDivElement | null>;
    static _nextRef: Opt<HTMLDivElement | null>;

    static _lastState?: EditorState;
    static _lastView?: EditorView;

    @observable static _hrefInd = 0;
    static _hrefs: string[] | undefined = [];

    constructor(view: any) {
        if (!FormattedTextBoxComment.tooltip) {
            const root = document.getElementById("root");
            FormattedTextBoxComment.tooltipInput = document.createElement("input");
            FormattedTextBoxComment.tooltipInput.type = "checkbox";
            FormattedTextBoxComment.tooltip = document.createElement("div");
            FormattedTextBoxComment.tooltipText = document.createElement("div");
            //FormattedTextBoxComment.tooltipText.style.width = "100%";
            FormattedTextBoxComment.tooltipText.style.height = "100%";
            FormattedTextBoxComment.tooltipText.style.textOverflow = "ellipsis";
            FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipText);
            FormattedTextBoxComment.tooltip.className = "FormattedTextBox-tooltip";
            FormattedTextBoxComment.tooltip.style.pointerEvents = "all";
            FormattedTextBoxComment.tooltip.style.maxWidth = "400px";
            FormattedTextBoxComment.tooltip.style.maxHeight = "235px";
            //FormattedTextBoxComment.tooltip.style.width = "100%";
            FormattedTextBoxComment.tooltip.style.height = "100%";
            FormattedTextBoxComment.tooltip.style.overflow = "hidden";
            FormattedTextBoxComment.tooltip.style.display = "none";
            // FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipInput);
            FormattedTextBoxComment.tooltip.onpointerdown = async (e: PointerEvent) => {
                const keep = e.target && (e.target as any).type === "checkbox" ? true : false;
                const textBox = FormattedTextBoxComment.textBox;
                const linkDoc = FormattedTextBoxComment.linkDoc;
                if (linkDoc && !keep && textBox) {
                    if (linkDoc.author) {
                        if (FormattedTextBoxComment._deleteRef?.contains(e.target as any)) {
                            this.deleteLink();
                        } else if (FormattedTextBoxComment._nextRef?.contains(e.target as any)) {
                            FormattedTextBoxComment.showPreview(FormattedTextBoxComment._lastView!, FormattedTextBoxComment._lastState, FormattedTextBoxComment._hrefs?.[(++FormattedTextBoxComment._hrefInd) % FormattedTextBoxComment._hrefs?.length]);
                        } else {
                            FormattedTextBoxComment.linkDoc = undefined;
                            if (linkDoc.type !== DocumentType.LINK) {
                                textBox.props.addDocTab(linkDoc, e.ctrlKey ? "add" : "add:right");
                            } else {
                                const target = LinkManager.getOppositeAnchor(linkDoc, textBox.dataDoc);
                                target && DocumentView.followLinkClick(linkDoc, textBox.dataDoc, textBox.props, e.shiftKey, e.altKey);
                            }
                        }
                    }
                } else if (textBox && (FormattedTextBoxComment.tooltipText as any).href) {
                    textBox.props.addDocTab(Docs.Create.WebDocument((FormattedTextBoxComment.tooltipText as any).href, { title: (FormattedTextBoxComment.tooltipText as any).href, _fitWidth: true, _width: 200, _height: 400, useCors: true }), "add:right");
                }
                keep && textBox && FormattedTextBoxComment.start !== undefined && textBox.adoptAnnotation(
                    FormattedTextBoxComment.start, FormattedTextBoxComment.end, FormattedTextBoxComment.mark);
                e.stopPropagation();
                e.preventDefault();
            };
            root?.appendChild(FormattedTextBoxComment.tooltip);
        }
    }

    @undoBatch
    deleteLink = action(() => {
        FormattedTextBoxComment.linkDoc ? LinkManager.Instance.deleteLink(FormattedTextBoxComment.linkDoc) : null;
        LinkDocPreview.LinkInfo = undefined;
        DocumentLinksButton.EditLink = undefined;
        FormattedTextBoxComment.Hide();
    });

    public static Hide() {
        FormattedTextBoxComment.textBox = undefined;
        FormattedTextBoxComment.linkDoc = undefined;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "none");
        try {
            ReactDOM.unmountComponentAtNode(FormattedTextBoxComment.tooltipText);
            FormattedTextBoxComment.tooltip.removeChild(FormattedTextBoxComment.tooltipText);
        } catch (e) { }
    }
    public static SetState(textBox: any, start: number, end: number, mark: Mark) {
        FormattedTextBoxComment.textBox = textBox;
        FormattedTextBoxComment.start = start;
        FormattedTextBoxComment.end = end;
        FormattedTextBoxComment.mark = mark;
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "");
    }

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

    static update(view: EditorView, lastState?: EditorState, forceUrl: string = "") {
        // Don't do anything if the document/selection didn't change
        if (!forceUrl && lastState?.doc.eq(view.state.doc) && lastState?.selection.eq(view.state.selection)) {
            return;
        }
        FormattedTextBoxComment._lastState = lastState;
        FormattedTextBoxComment._lastView = view;
        FormattedTextBoxComment._hrefs = forceUrl ? forceUrl.trim().split(" ") : undefined;
        FormattedTextBoxComment._hrefInd = 0;
        FormattedTextBoxComment.linkDoc = undefined;
        FormattedTextBoxComment.showPreview(view, lastState, FormattedTextBoxComment._hrefs?.[FormattedTextBoxComment._hrefInd]);
    }

    static showPreview(view: EditorView, lastState?: EditorState, forceUrl: string = "") {
        const state = view.state;
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
                FormattedTextBoxComment.tooltipText.textContent = mark.attrs.userid + " on " + (new Date(mark.attrs.modified * 1000)).toLocaleString();
                set = "";
                FormattedTextBoxComment.tooltipInput.style.display = "";
            }
        }
        // this checks if the selection is a hyperlink.  If so, it displays the target doc's text for internal links, and the url of the target for external links. 
        if (set === "none" && state.selection.$from) {
            nbef = findStartOfMark(state.selection.$from, view, findLinkMark);
            const naft = findEndOfMark(state.selection.$from, view, findLinkMark) || nbef;
            let child: any = null;
            state.doc.nodesBetween(state.selection.from, state.selection.to, (node: any, pos: number, parent: any) => !child && node.marks.length && (child = node));
            child = child || (nbef && state.selection.$from.nodeBefore);
            const mark = child ? findLinkMark(child.marks) : undefined;
            const href = forceUrl || (!mark?.attrs.docref || naft === nbef) && mark?.attrs.allLinks.find((item: { href: string }) => item.href)?.href;
            if (forceUrl || (href && child && nbef && naft && mark?.attrs.showPreview)) {
                try {
                    ReactDOM.unmountComponentAtNode(FormattedTextBoxComment.tooltipText);
                    FormattedTextBoxComment.tooltip.removeChild(FormattedTextBoxComment.tooltipText);
                } catch (e) { }
                FormattedTextBoxComment.tooltipText = document.createElement("div");
                FormattedTextBoxComment.tooltipText.className = "FormattedTextBoxComment-toolTipText";
                FormattedTextBoxComment.tooltipText.style.width = "100%";
                FormattedTextBoxComment.tooltipText.style.height = "100%";
                FormattedTextBoxComment.tooltipText.style.textOverflow = "ellipsis";
                FormattedTextBoxComment.tooltipText.style.cursor = "pointer";
                FormattedTextBoxComment.tooltipText.textContent = "URL: " + href;
                (FormattedTextBoxComment.tooltipText as any).href = href;
                FormattedTextBoxComment.tooltip.appendChild(FormattedTextBoxComment.tooltipText);

                if (href.startsWith("https://en.wikipedia.org/wiki/")) {
                    wiki().page(href.replace("https://en.wikipedia.org/wiki/", "")).then(page => page.summary().then(summary => FormattedTextBoxComment.tooltipText.textContent = summary.substring(0, 500)));
                } else {
                    FormattedTextBoxComment.tooltipText.style.whiteSpace = "pre";
                    FormattedTextBoxComment.tooltipText.style.overflow = "hidden";
                }
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    const docTarget = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    FormattedTextBoxComment.tooltipText.textContent = "target not found...";
                    (FormattedTextBoxComment.tooltipText as any).href = "";
                    docTarget && DocServer.GetRefField(docTarget).then(async linkDoc => {
                        if (linkDoc instanceof Doc) {
                            (FormattedTextBoxComment.tooltipText as any).href = href;
                            FormattedTextBoxComment.linkDoc = DocListCast(textBox.props.Document.links).find(link => link.anchor1 === textBox.props.Document || link.anchor2 === textBox.props.Document ? link : undefined) || linkDoc;
                            const anchor = FieldValue(Doc.AreProtosEqual(FieldValue(Cast(linkDoc.anchor1, Doc)), textBox.dataDoc) ? Cast(linkDoc.anchor2, Doc) : (Cast(linkDoc.anchor1, Doc)) || linkDoc);
                            const target = anchor?.annotationOn ? await DocCastAsync(anchor.annotationOn) : anchor;
                            if (anchor !== target && anchor && target) {
                                target._scrollPreviewY = NumCast(anchor?.y);
                            }
                            if (target?.author) {
                                FormattedTextBoxComment.showCommentbox("", view, nbef);

                                const title = StrCast(target.title).length > 16 ? StrCast(target.title).substr(0, 16) + "..." : target.title;

                                const docPreview = <div className="FormattedTextBoxComment">
                                    <div className="FormattedTextBoxComment-info">
                                        <div className="FormattedTextBoxComment-title">
                                            {title}
                                            {FormattedTextBoxComment.linkDoc.description === "" ? (null) :
                                                <p className="FormattedTextBoxComment-description"> {StrCast(FormattedTextBoxComment.linkDoc.description)}</p>}
                                        </div>
                                        <div className="wrapper" style={{ float: "right" }}>
                                            {(FormattedTextBoxComment._hrefs?.length || 0) <= 1 ? (null) : <Tooltip title={<><div className="dash-tooltip">Next Link</div></>} placement="top">
                                                <div className="FormattedTextBoxComment-button" ref={(r) => this._nextRef = r}>
                                                    <FontAwesomeIcon className="FormattedTextBoxComment-fa-icon" icon="chevron-right" color="white" size="sm" />
                                                </div>
                                            </Tooltip>}

                                            <Tooltip title={<><div className="dash-tooltip">Delete Link</div></>} placement="top">
                                                <div className="FormattedTextBoxComment-button" ref={(r) => this._deleteRef = r}>
                                                    <FontAwesomeIcon className="FormattedTextBoxComment-fa-icon" icon="trash" color="white" size="sm" />
                                                </div>
                                            </Tooltip>

                                            <Tooltip title={<><div className="dash-tooltip">Follow Link</div></>} placement="top">
                                                <div className="FormattedTextBoxComment-button" ref={(r) => this._followRef = r}>
                                                    <FontAwesomeIcon className="FormattedTextBoxComment-fa-icon" icon="arrow-right" color="white" size="sm" />
                                                </div>
                                            </Tooltip>
                                        </div>
                                    </div>
                                    <div className="FormattedTextBoxComment-preview-wrapper">
                                        <ContentFittingDocumentView
                                            Document={target}
                                            fitDocToPanel={true}
                                            moveDocument={returnFalse}
                                            rootSelected={returnFalse}
                                            ScreenToLocalTransform={Transform.Identity}
                                            parentActive={returnFalse}
                                            addDocument={returnFalse}
                                            removeDocument={returnFalse}
                                            addDocTab={returnFalse}
                                            pinToPres={returnFalse}
                                            dontRegisterView={true}
                                            docFilters={returnEmptyFilter}
                                            docRangeFilters={returnEmptyFilter}
                                            searchFilterDocs={returnEmptyDoclist}
                                            ContainingCollectionDoc={undefined}
                                            ContainingCollectionView={undefined}
                                            renderDepth={-1}
                                            PanelWidth={() => 175} //Math.min(350, NumCast(target._width, 350))}
                                            PanelHeight={() => 175} //Math.min(250, NumCast(target._height, 250))}
                                            focus={emptyFunction}
                                            whenActiveChanged={returnFalse}
                                            bringToFront={returnFalse}
                                            NativeWidth={Doc.NativeWidth(target) ? (() => Doc.NativeWidth(target)) : undefined}
                                            NativeHeight={Doc.NativeHeight(target) ? (() => Doc.NativeHeight(target)) : undefined}
                                        />
                                    </div>
                                </div>;

                                FormattedTextBoxComment.showCommentbox("", view, nbef);

                                ReactDOM.render(docPreview, FormattedTextBoxComment.tooltipText);

                                //FormattedTextBoxComment.tooltip.style.width = "100%";
                                FormattedTextBoxComment.tooltip.style.height = "100%";
                            }
                        }
                    });
                }
                set = "";
            }
        }
        FormattedTextBoxComment.showCommentbox(set, view, nbef);
    }

    destroy() { }
}