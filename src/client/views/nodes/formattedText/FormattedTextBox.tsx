import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile, faTextHeight, faUpload } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { isEqual } from "lodash";
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap, selectAll } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { inputRules } from 'prosemirror-inputrules';
import { keymap } from "prosemirror-keymap";
import { Fragment, Mark, Node, Slice, Schema } from "prosemirror-model";
import { EditorState, NodeSelection, Plugin, TextSelection, Transaction } from "prosemirror-state";
import { ReplaceStep } from 'prosemirror-transform';
import { EditorView } from "prosemirror-view";
import { DateField } from '../../../../fields/DateField';
import { DataSym, Doc, DocListCast, DocListCastAsync, Field, HeightSym, Opt, WidthSym, AclSym } from "../../../../fields/Doc";
import { documentSchema } from '../../../../fields/documentSchemas';
import applyDevTools = require("prosemirror-dev-tools");
import { removeMarkWithAttrs } from "./prosemirrorPatches";
import { Id } from '../../../../fields/FieldSymbols';
import { InkTool } from '../../../../fields/InkField';
import { PrefetchProxy } from '../../../../fields/Proxy';
import { RichTextField } from "../../../../fields/RichTextField";
import { RichTextUtils } from '../../../../fields/RichTextUtils';
import { createSchema, makeInterface } from "../../../../fields/Schema";
import { Cast, DateCast, NumCast, StrCast, ScriptCast } from "../../../../fields/Types";
import { TraceMobx, OVERRIDE_ACL } from '../../../../fields/util';
import { addStyleSheet, addStyleSheetRule, clearStyleSheetRules, emptyFunction, numberRange, returnOne, returnZero, Utils, setupMoveUpEvents } from '../../../../Utils';
import { GoogleApiClientUtils, Pulls, Pushes } from '../../../apis/google_docs/GoogleApiClientUtils';
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from '../../../documents/Documents';
import { DocumentType } from '../../../documents/DocumentTypes';
import { DictationManager } from '../../../util/DictationManager';
import { DragManager } from "../../../util/DragManager";
import { makeTemplate } from '../../../util/DropConverter';
import buildKeymap, { updateBullets } from "./ProsemirrorExampleTransfer";
import RichTextMenu from './RichTextMenu';
import { RichTextRules } from "./RichTextRules";

//import { DashDocView } from "./DashDocView";
import { DashDocView } from "./RichTextSchema";

import { DashDocCommentView } from "./DashDocCommentView";
import { DashFieldView } from "./DashFieldView";
import { SummaryView } from "./SummaryView";
import { OrderedListView } from "./OrderedListView";
import { FootnoteView } from "./FootnoteView";

import { schema } from "./schema_rts";
import { SelectionManager } from "../../../util/SelectionManager";
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { CollectionFreeFormView } from '../../collections/collectionFreeForm/CollectionFreeFormView';
import { ContextMenu } from '../../ContextMenu';
import { ContextMenuProps } from '../../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from "../../DocComponent";
import { DocumentButtonBar } from '../../DocumentButtonBar';
import { AudioBox } from '../AudioBox';
import { FieldView, FieldViewProps } from "../FieldView";
import "./FormattedTextBox.scss";
import { FormattedTextBoxComment, formattedTextBoxCommentPlugin, findLinkMark } from './FormattedTextBoxComment';
import React = require("react");
import { DocumentManager } from '../../../util/DocumentManager';

library.add(faEdit);
library.add(faSmile, faTextHeight, faUpload);

export interface FormattedTextBoxProps {
    makeLink?: () => Opt<Doc>;  // bcz: hack: notifies the text document when the container has made a link.  allows the text doc to react and setup a hyeprlink for any selected text
    hideOnLeave?: boolean;  // used by DocumentView for setting caption's hide on leave (bcz: would prefer to have caption-hideOnLeave field set or something similar)
    xMargin?: number;   // used to override document's settings for xMargin --- see CollectionCarouselView
    yMargin?: number;
}
export const GoogleRef = "googleDocId";

type RichTextDocument = makeInterface<[typeof documentSchema]>;
const RichTextDocument = makeInterface(documentSchema);

type PullHandler = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends ViewBoxAnnotatableComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(FormattedTextBox, fieldStr); }
    public static blankState = () => EditorState.create(FormattedTextBox.Instance.config);
    public static Instance: FormattedTextBox;
    public ProseRef?: HTMLDivElement;
    public get EditorView() { return this._editorView; }
    private _ref: React.RefObject<HTMLDivElement> = React.createRef();
    private _scrollRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _editorView: Opt<EditorView>;
    private _applyingChange: boolean = false;
    private _searchIndex = 0;
    private _cachedLinks: Doc[] = [];
    private _undoTyping?: UndoManager.Batch;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _dropDisposer?: DragManager.DragDropDisposer;

    @computed get _recording() { return this.dataDoc.audioState === "recording"; }
    set _recording(value) { this.dataDoc.audioState = value ? "recording" : undefined; }

    @observable private _entered = false;

    public static FocusedBox: FormattedTextBox | undefined;
    public static SelectOnLoad = "";
    public static PasteOnLoad: ClipboardEvent | undefined;
    public static SelectOnLoadChar = "";
    public static IsFragment(html: string) {
        return html.indexOf("data-pm-slice") !== -1;
    }
    public static GetHref(html: string): string {
        const parser = new DOMParser();
        const parsedHtml = parser.parseFromString(html, 'text/html');
        if (parsedHtml.body.childNodes.length === 1 && parsedHtml.body.childNodes[0].childNodes.length === 1 &&
            (parsedHtml.body.childNodes[0].childNodes[0] as any).href) {
            return (parsedHtml.body.childNodes[0].childNodes[0] as any).href;
        }
        return "";
    }
    public static GetDocFromUrl(url: string) {
        if (url.startsWith(document.location.origin)) {
            const split = new URL(url).pathname.split("doc/");
            const docid = split[split.length - 1];
            return docid;
        }
        return "";
    }

    @undoBatch
    public setFontColor(color: string) {
        const view = this._editorView!;
        if (view.state.selection.from === view.state.selection.to) return false;
        if (view.state.selection.to - view.state.selection.from > view.state.doc.nodeSize - 3) {
            this.layoutDoc.color = color;
        }
        const colorMark = view.state.schema.mark(view.state.schema.marks.pFontColor, { color: color });
        view.dispatch(view.state.tr.addMark(view.state.selection.from, view.state.selection.to, colorMark));
        return true;
    }

    constructor(props: any) {
        super(props);
        FormattedTextBox.Instance = this;
        this.updateHighlights();
    }

    public get CurrentDiv(): HTMLDivElement { return this._ref.current!; }

    // removes all hyperlink anchors for the removed linkDoc
    // TODO: bcz: Argh... if a section of text has multiple anchors, this should just remove the intended one. 
    // but since removing one anchor from the list of attr anchors isn't implemented, this will end up removing nothing.
    public RemoveLinkFromDoc(linkDoc?: Doc) {
        const state = this._editorView?.state;
        if (state && linkDoc && this._editorView) {
            var allLinks: any[] = [];
            state.doc.nodesBetween(0, state.doc.nodeSize - 2, (node: any, pos: number, parent: any) => {
                const foundMark = findLinkMark(node.marks);
                const newHrefs = foundMark?.attrs.allLinks.filter((a: any) => a.href.includes(linkDoc[Id])) || [];
                allLinks = newHrefs.length ? newHrefs : allLinks;
                return true;
            });
            if (allLinks.length) {
                this._editorView.dispatch(removeMarkWithAttrs(state.tr, 0, state.doc.nodeSize - 2, state.schema.marks.linkAnchor, { allLinks }));
            }
        }
    }
    // removes all the specified link referneces from the selection. 
    // NOTE: as above, this won't work correctly if there are marks with overlapping but not exact sets of link references.
    public RemoveLinkFromSelection(allLinks: { href: string, title: string, linkId: string, targetId: string }[]) {
        const state = this._editorView?.state;
        if (state && this._editorView) {
            this._editorView.dispatch(removeMarkWithAttrs(state.tr, state.selection.from, state.selection.to, state.schema.marks.link, { allLinks }));
        }
    }

    linkOnDeselect: Map<string, string> = new Map();

    doLinkOnDeselect() {

        Array.from(this.linkOnDeselect.entries()).map(entry => {
            const key = entry[0];
            const value = entry[1];

            const id = Utils.GenerateDeterministicGuid(this.dataDoc[Id] + key);
            DocServer.GetRefField(value).then(doc => {
                DocServer.GetRefField(id).then(linkDoc => {
                    this.dataDoc[key] = doc || Docs.Create.FreeformDocument([], { title: value, _width: 500, _height: 500 }, value);
                    DocUtils.Publish(this.dataDoc[key] as Doc, value, this.props.addDocument, this.props.removeDocument);
                    if (linkDoc) {
                        (linkDoc as Doc).anchor2 = this.dataDoc[key] as Doc;
                    } else {
                        DocUtils.MakeLink({ doc: this.rootDoc }, { doc: this.dataDoc[key] as Doc }, "portal link", "link to named target", id);
                    }
                });
            });
        });

        this.linkOnDeselect.clear();
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const metadata = tx.selection.$from.marks().find((m: Mark) => m.type === schema.marks.metadata);
            if (metadata) {
                const range = tx.selection.$from.blockRange(tx.selection.$to);
                let text = range ? tx.doc.textBetween(range.start, range.end) : "";
                let textEndSelection = tx.selection.to;
                for (; textEndSelection < range!.end && text[textEndSelection - range!.start] !== " "; textEndSelection++) { }
                text = text.substr(0, textEndSelection - range!.start);
                text = text.split(" ")[text.split(" ").length - 1];
                const split = text.split("::");
                if (split.length > 1 && split[1]) {
                    const key = split[0];
                    const value = split[split.length - 1];
                    this.linkOnDeselect.set(key, value);

                    const id = Utils.GenerateDeterministicGuid(this.dataDoc[Id] + key);
                    const allLinks = [{ href: Utils.prepend("/doc/" + id), title: value, targetId: id }];
                    const link = this._editorView.state.schema.marks.linkAnchor.create({ allLinks, location: "onRight", title: value });
                    const mval = this._editorView.state.schema.marks.metadataVal.create();
                    const offset = (tx.selection.to === range!.end - 1 ? -1 : 0);
                    tx = tx.addMark(textEndSelection - value.length + offset, textEndSelection, link).addMark(textEndSelection - value.length + offset, textEndSelection, mval);
                    this.dataDoc[key] = value;
                }
            }
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            (tx.storedMarks && !this._editorView.state.storedMarks) && (this._editorView.state.storedMarks = tx.storedMarks);

            const tsel = this._editorView.state.selection.$from;
            tsel.marks().filter(m => m.type === this._editorView!.state.schema.marks.user_mark).map(m => AudioBox.SetScrubTime(Math.max(0, m.attrs.modified * 1000)));
            const curText = state.doc.textBetween(0, state.doc.content.size, " \n");
            const curTemp = Cast(this.layoutDoc[this.props.fieldKey + "-textTemplate"], RichTextField);               // the actual text in the text box
            const curProto = Cast(Cast(this.dataDoc.proto, Doc, null)?.[this.fieldKey], RichTextField, null);              // the default text inherited from a prototype
            const curLayout = this.rootDoc !== this.layoutDoc ? Cast(this.layoutDoc[this.fieldKey], RichTextField, null) : undefined; // the default text stored in a layout template
            const json = JSON.stringify(state.toJSON());
            if (!this.dataDoc[AclSym]) {
                if (!this._applyingChange && json.replace(/"selection":.*/, "") !== curProto?.Data.replace(/"selection":.*/, "")) {
                    this._applyingChange = true;
                    (curText !== Cast(this.dataDoc[this.fieldKey], RichTextField)?.Text) && (this.dataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now())));
                    if ((!curTemp && !curProto) || curText || curLayout?.Data.includes("dash")) { // if no template, or there's text that didn't come from the layout template, write it to the document. (if this is driven by a template, then this overwrites the template text which is intended)
                        if (json !== curLayout?.Data) {
                            !curText && tx.storedMarks?.map(m => m.type.name === "pFontSize" && (Doc.UserDoc().fontSize = this.layoutDoc._fontSize = m.attrs.fontSize));
                            !curText && tx.storedMarks?.map(m => m.type.name === "pFontFamily" && (Doc.UserDoc().fontFamily = this.layoutDoc._fontFamily = m.attrs.fontFamily));
                            this.dataDoc[this.props.fieldKey] = new RichTextField(json, curText);
                            this.dataDoc[this.props.fieldKey + "-noTemplate"] = (curTemp?.Text || "") !== curText; // mark the data field as being split from the template if it has been edited
                            ScriptCast(this.layoutDoc.onTextChanged, null)?.script.run({ this: this.layoutDoc, self: this.rootDoc, text: curText });
                        }
                    } else { // if we've deleted all the text in a note driven by a template, then restore the template data
                        this.dataDoc[this.props.fieldKey] = undefined;
                        this._editorView.updateState(EditorState.fromJSON(this.config, JSON.parse((curProto || curTemp).Data)));
                        this.dataDoc[this.props.fieldKey + "-noTemplate"] = undefined; // mark the data field as not being split from any template it might have
                    }
                    this._applyingChange = false;
                }
            } else {
                const json = JSON.parse(Cast(this.dataDoc[this.fieldKey], RichTextField)?.Data!);
                json.selection = state.toJSON().selection;
                this._editorView.updateState(EditorState.fromJSON(this.config, json));
            }
            this.updateTitle();
            this.tryUpdateHeight();
        }
    }

    updateTitle = () => {
        if ((this.props.Document.isTemplateForField === "text" || !this.props.Document.isTemplateForField) && // only update the title if the data document's data field is changing
            StrCast(this.dataDoc.title).startsWith("-") && this._editorView && !this.rootDoc.customTitle) {
            let node = this._editorView.state.doc;
            while (node.firstChild) node = node.firstChild;
            const str = node.textContent;
            const titlestr = str.substr(0, Math.min(40, str.length));
            this.dataDoc.title = "-" + titlestr + (str.length > 40 ? "..." : "");
        }
    }

    // needs a better API for taking in a set of words with target documents instead of just one target
    public hyperlinkTerms = (terms: string[], target: Doc) => {
        if (this._editorView && (this._editorView as any).docView && terms.some(t => t)) {
            const res = terms.filter(t => t).map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
            const tr = this._editorView.state.tr;
            const flattened: TextSelection[] = [];
            res.map(r => r.map(h => flattened.push(h)));
            const lastSel = Math.min(flattened.length - 1, this._searchIndex);
            this._searchIndex = ++this._searchIndex > flattened.length - 1 ? 0 : this._searchIndex;
            const alink = DocUtils.MakeLink({ doc: this.rootDoc }, { doc: target }, "automatic")!;
            const allLinks = [{ href: Utils.prepend("/doc/" + alink[Id]), title: "a link", targetId: target[Id], linkId: alink[Id] }];
            const link = this._editorView.state.schema.marks.linkAnchor.create({ allLinks, title: "a link", location });
            this._editorView.dispatch(tr.addMark(flattened[lastSel].from, flattened[lastSel].to, link));
        }
    }
    public highlightSearchTerms = (terms: string[]) => {
        if (this._editorView && (this._editorView as any).docView && terms.some(t => t)) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            const res = terms.filter(t => t).map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
            let tr = this._editorView.state.tr;
            const flattened: TextSelection[] = [];
            res.map(r => r.map(h => flattened.push(h)));
            const lastSel = Math.min(flattened.length - 1, this._searchIndex);
            flattened.forEach((h: TextSelection, ind: number) => tr = tr.addMark(h.from, h.to, ind === lastSel ? activeMark : mark));
            this._searchIndex = ++this._searchIndex > flattened.length - 1 ? 0 : this._searchIndex;
            this._editorView.dispatch(tr.setSelection(new TextSelection(tr.doc.resolve(flattened[lastSel].from), tr.doc.resolve(flattened[lastSel].to))).scrollIntoView());
        }
    }

    public unhighlightSearchTerms = () => {
        if (window.screen.width < 600) null;
        else if (this._editorView && (this._editorView as any).docView) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            const end = this._editorView.state.doc.nodeSize - 2;
            this._editorView.dispatch(this._editorView.state.tr.removeMark(0, end, mark).removeMark(0, end, activeMark));
        }
        if (FormattedTextBox.PasteOnLoad) {
            const pdfDocId = FormattedTextBox.PasteOnLoad.clipboardData?.getData("dash/pdfOrigin");
            const pdfRegionId = FormattedTextBox.PasteOnLoad.clipboardData?.getData("dash/pdfRegion");
            FormattedTextBox.PasteOnLoad = undefined;
            setTimeout(() => pdfDocId && pdfRegionId && this.addPdfReference(pdfDocId, pdfRegionId, undefined), 10);
        }
    }
    adoptAnnotation = (start: number, end: number, mark: Mark) => {
        const view = this._editorView!;
        const nmark = view.state.schema.marks.user_mark.create({ ...mark.attrs, userid: Doc.CurrentUserEmail });
        view.dispatch(view.state.tr.removeMark(start, end, nmark).addMark(start, end, nmark));
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
        this.ProseRef = ele;
        this._dropDisposer?.();
        ele && (this._dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this), this.layoutDoc));
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        const dragData = de.complete.docDragData;
        if (dragData) {
            const draggedDoc = dragData.draggedDocuments.length && dragData.draggedDocuments[0];
            // replace text contents whend dragging with Alt
            if (draggedDoc && draggedDoc.type === DocumentType.RTF && !Doc.AreProtosEqual(draggedDoc, this.props.Document) && de.altKey) {
                if (draggedDoc.data instanceof RichTextField) {
                    Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new RichTextField(draggedDoc.data.Data, draggedDoc.data.Text);
                    e.stopPropagation();
                }
                // embed document when dragg marked as embed
            } else if (de.embedKey) {
                const target = dragData.droppedDocuments[0];
                // const link = DocUtils.MakeLink({ doc: this.dataDoc, ctx: this.props.ContainingCollectionDoc }, { doc: target }, "Embedded Doc:" + target.title);
                // if (link) {
                target._fitToBox = true;
                const node = schema.nodes.dashDoc.create({
                    width: target[WidthSym](), height: target[HeightSym](),
                    title: "dashDoc", docid: target[Id],
                    float: "right"
                });
                const view = this._editorView!;
                view.dispatch(view.state.tr.insert(view.posAtCoords({ left: de.x, top: de.y })!.pos, node));
                this.tryUpdateHeight();
                e.stopPropagation();
                // }
            } // otherwise, fall through to outer collection to handle drop
        } else if (de.complete.linkDragData) {
            de.complete.linkDragData.linkDropCallback = this.linkDrop;
        }
    }
    linkDrop = (data: DragManager.LinkDragData) => {
        const linkDoc = data.linkDocument!;
        const anchor1Title = linkDoc.anchor1 instanceof Doc ? StrCast(linkDoc.anchor1.title) : "-untitled-";
        const anchor1Id = linkDoc.anchor1 instanceof Doc ? linkDoc.anchor1[Id] : "";
        this.makeLinkToSelection(linkDoc[Id], anchor1Title, "onRight", anchor1Id);
    }

    getNodeEndpoints(context: Node, node: Node): { from: number, to: number } | null {
        let offset = 0;

        if (context === node) return { from: offset, to: offset + node.nodeSize };

        if (node.isBlock) {
            // tslint:disable-next-line: prefer-for-of
            for (let i = 0; i < (context.content as any).content.length; i++) {
                const result = this.getNodeEndpoints((context.content as any).content[i], node);
                if (result) {
                    return {
                        from: result.from + offset + (context.type.name === "doc" ? 0 : 1),
                        to: result.to + offset + (context.type.name === "doc" ? 0 : 1)
                    };
                }
                offset += (context.content as any).content[i].nodeSize;
            }
            return null;
        } else {
            return null;
        }
    }


    //Recursively finds matches within a given node
    findInNode(pm: EditorView, node: Node, find: string) {
        let ret: TextSelection[] = [];

        if (node.isTextblock) {
            let index = 0, foundAt;
            const ep = this.getNodeEndpoints(pm.state.doc, node);
            while (ep && (foundAt = node.textContent.slice(index).search(RegExp(find, "i"))) > -1) {
                const sel = new TextSelection(pm.state.doc.resolve(ep.from + index + foundAt + 1), pm.state.doc.resolve(ep.from + index + foundAt + find.length + 1));
                ret.push(sel);
                index = index + foundAt + find.length;
            }
        } else {
            node.content.forEach((child, i) => ret = ret.concat(this.findInNode(pm, child, find)));
        }
        return ret;
    }
    static _highlights: string[] = ["Text from Others", "Todo Items", "Important Items", "Disagree Items", "Ignore Items"];

    updateHighlights = () => {
        clearStyleSheetRules(FormattedTextBox._userStyleSheet);
        if (FormattedTextBox._highlights.indexOf("Text from Others") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-remote", { background: "yellow" });
        }
        if (FormattedTextBox._highlights.indexOf("My Text") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { background: "moccasin" });
        }
        if (FormattedTextBox._highlights.indexOf("Todo Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userTag-" + "todo", { outline: "black solid 1px" });
        }
        if (FormattedTextBox._highlights.indexOf("Important Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userTag-" + "important", { "font-size": "larger" });
        }
        if (FormattedTextBox._highlights.indexOf("Disagree Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userTag-" + "disagree", { "text-decoration": "line-through" });
        }
        if (FormattedTextBox._highlights.indexOf("Ignore Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userTag-" + "ignore", { "font-size": "1" });
        }
        if (FormattedTextBox._highlights.indexOf("By Recent Minute") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            const min = Math.round(Date.now() / 1000 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-min-" + (min - i), { opacity: ((10 - i - 1) / 10).toString() }));
            setTimeout(() => this.updateHighlights());
        }
        if (FormattedTextBox._highlights.indexOf("By Recent Hour") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            const hr = Math.round(Date.now() / 1000 / 60 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-hr-" + (hr - i), { opacity: ((10 - i - 1) / 10).toString() }));
        }
    }

    sidebarDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, this.sidebarMove, emptyFunction,
            () => (this.layoutDoc._sidebarWidthPercent = StrCast(this.layoutDoc._sidebarWidthPercent, "0%") === "0%" ? "25%" : "0%"));
    }
    sidebarMove = (e: PointerEvent, down: number[], delta: number[]) => {
        const bounds = this.CurrentDiv.getBoundingClientRect();
        this.layoutDoc._sidebarWidthPercent = "" + 100 * (1 - (e.clientX - bounds.left) / bounds.width) + "%";
        return false;
    }
    @undoBatch
    @action
    toggleNativeDimensions = () => {
        Doc.toggleNativeDimensions(this.layoutDoc, this.props.ContentScaling(), this.props.NativeWidth(), this.props.NativeHeight());
    }

    public static get DefaultLayout(): Doc | string | undefined {
        return Cast(Doc.UserDoc().defaultTextLayout, Doc, null) || StrCast(Doc.UserDoc().defaultTextLayout, null);
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;

        const appearance = ContextMenu.Instance.findByDescription("Appearance...");
        const appearanceItems = appearance && "subitems" in appearance ? appearance.subitems : [];

        const changeItems: ContextMenuProps[] = [];
        const noteTypesDoc = Cast(Doc.UserDoc()["template-notes"], Doc, null);
        DocListCast(noteTypesDoc?.data).forEach(note => {
            changeItems.push({
                description: StrCast(note.title), event: undoBatch(() => {
                    Doc.setNativeView(this.rootDoc);
                    DocUtils.makeCustomViewClicked(this.rootDoc, Docs.Create.TreeDocument, StrCast(note.title), note);
                }), icon: "eye"
            });
        });
        changeItems.push({ description: "FreeForm", event: () => DocUtils.makeCustomViewClicked(this.rootDoc, Docs.Create.FreeformDocument, "freeform"), icon: "eye" });
        appearanceItems.push({ description: "Change Perspective...", subitems: changeItems, icon: "external-link-alt" });
        const uicontrols: ContextMenuProps[] = [];
        uicontrols.push({ description: "Toggle Sidebar", event: () => this.layoutDoc._showSidebar = !this.layoutDoc._showSidebar, icon: "expand-arrows-alt" });
        uicontrols.push({ description: "Toggle Dictation Icon", event: () => this.layoutDoc._showAudio = !this.layoutDoc._showAudio, icon: "expand-arrows-alt" });
        uicontrols.push({ description: "Toggle Menubar", event: () => this.toggleMenubar(), icon: "expand-arrows-alt" });
        !Doc.UserDoc().noviceMode && uicontrols.push({
            description: "Broadcast Message", event: () => DocServer.GetRefField("rtfProto").then(proto =>
                proto instanceof Doc && (proto.BROADCAST_MESSAGE = Cast(this.rootDoc[this.fieldKey], RichTextField)?.Text)), icon: "expand-arrows-alt"
        });

        appearanceItems.push({ description: "UI Controls...", subitems: uicontrols, icon: "asterisk" });
        this.rootDoc.isTemplateDoc && appearanceItems.push({ description: "Make Default Layout", event: async () => Doc.UserDoc().defaultTextLayout = new PrefetchProxy(this.rootDoc), icon: "eye" });
        Doc.UserDoc().defaultTextLayout && appearanceItems.push({ description: "Reset default note style", event: () => Doc.UserDoc().defaultTextLayout = undefined, icon: "eye" });
        appearanceItems.push({
            description: "Convert to be a template style", event: () => {
                if (!this.layoutDoc.isTemplateDoc) {
                    const title = StrCast(this.rootDoc.title);
                    this.rootDoc.title = "text";
                    this.rootDoc.isTemplateDoc = makeTemplate(this.rootDoc, true, title);
                } else {
                    const title = StrCast(this.rootDoc.title);
                    this.rootDoc.title = "text";
                    this.rootDoc.layout = (this.layoutDoc as Doc).layout as string;
                    this.rootDoc.title = this.layoutDoc.isTemplateForField as string;
                    this.rootDoc.isTemplateDoc = false;
                    this.rootDoc.isTemplateForField = "";
                    this.rootDoc.layoutKey = "layout";
                    this.rootDoc.isTemplateDoc = makeTemplate(this.rootDoc, true, title);
                    setTimeout(() => {
                        this.rootDoc._autoHeight = this.layoutDoc._autoHeight; // autoHeight, width and height
                        this.rootDoc._width = this.layoutDoc._width || 300;  // are stored on the template, since we're getting rid of the old template
                        this.rootDoc._height = this.layoutDoc._height || 200;  // we need to copy them over to the root.  This should probably apply to all '_' fields
                        this.rootDoc._backgroundColor = Cast(this.layoutDoc._backgroundColor, "string", null);
                    }, 10);
                }
                Doc.AddDocToList(Cast(Doc.UserDoc()["template-notes"], Doc, null), "data", this.rootDoc);
            }, icon: "eye"
        });
        !appearance && ContextMenu.Instance.addItem({ description: "Appearance...", subitems: appearanceItems, icon: "eye" });

        const funcs: ContextMenuProps[] = [];

        //funcs.push({ description: `${this.Document._autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc._autoHeight = !this.layoutDoc._autoHeight, icon: "plus" });
        funcs.push({ description: (!this.layoutDoc._nativeWidth || !this.layoutDoc._nativeHeight ? "Freeze" : "Unfreeze") + " Aspect", event: this.toggleNativeDimensions, icon: "snowflake" });
        funcs.push({ description: "Toggle Single Line", event: () => this.layoutDoc._singleLine = !this.layoutDoc._singleLine, icon: "expand-arrows-alt" });

        const highlighting: ContextMenuProps[] = [];
        ["My Text", "Text from Others", "Todo Items", "Important Items", "Ignore Items", "Disagree Items", "By Recent Minute", "By Recent Hour"].forEach(option =>
            highlighting.push({
                description: (FormattedTextBox._highlights.indexOf(option) === -1 ? "Highlight " : "Unhighlight ") + option, event: () => {
                    e.stopPropagation();
                    if (FormattedTextBox._highlights.indexOf(option) === -1) {
                        FormattedTextBox._highlights.push(option);
                    } else {
                        FormattedTextBox._highlights.splice(FormattedTextBox._highlights.indexOf(option), 1);
                    }
                    this.updateHighlights();
                }, icon: "expand-arrows-alt"
            }));
        funcs.push({ description: "highlighting...", subitems: highlighting, icon: "hand-point-right" });

        ContextMenu.Instance.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
        this._downX = this._downY = Number.NaN;
    }

    recordDictation = () => {
        DictationManager.Controls.listen({
            interimHandler: this.setCurrentBulletContent,
            continuous: { indefinite: false },
        }).then(results => {
            if (results && [DictationManager.Controls.Infringed].includes(results)) {
                DictationManager.Controls.stop();
            }
            //this._editorView!.focus();
        });
    }
    stopDictation = (abort: boolean) => { DictationManager.Controls.stop(!abort); };

    @action
    toggleMenubar = () => {
        this.layoutDoc._chromeStatus = this.layoutDoc._chromeStatus === "disabled" ? "enabled" : "disabled";
    }

    recordBullet = async () => {
        const completedCue = "end session";
        const results = await DictationManager.Controls.listen({
            interimHandler: this.setCurrentBulletContent,
            continuous: { indefinite: false },
            terminators: [completedCue, "bullet", "next"]
        });
        if (results && [DictationManager.Controls.Infringed, completedCue].includes(results)) {
            DictationManager.Controls.stop();
            return;
        }
        this.nextBullet(this._editorView!.state.selection.to);
        setTimeout(this.recordBullet, 2000);
    }

    setCurrentBulletContent = (value: string) => {
        if (this._editorView) {
            const state = this._editorView.state;
            const now = Date.now();
            let mark = schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(now / 1000) });
            if (!this._break && state.selection.to !== state.selection.from) {
                for (let i = state.selection.from; i <= state.selection.to; i++) {
                    const pos = state.doc.resolve(i);
                    const um = Array.from(pos.marks()).find(m => m.type === schema.marks.user_mark);
                    if (um) {
                        mark = um;
                        break;
                    }
                }
            }
            const recordingStart = DateCast(this.props.Document.recordingStart).date.getTime();
            this._break = false;
            value = "" + (mark.attrs.modified * 1000 - recordingStart) / 1000 + value;
            const from = state.selection.from;
            const inserted = state.tr.insertText(value).addMark(from, from + value.length + 1, mark);
            this._editorView.dispatch(inserted.setSelection(TextSelection.create(inserted.doc, from, from + value.length + 1)));
        }
    }

    nextBullet = (pos: number) => {
        if (this._editorView) {
            const frag = Fragment.fromArray(this.newListItems(2));
            if (this._editorView.state.doc.resolve(pos).depth >= 2) {
                const slice = new Slice(frag, 2, 2);
                let state = this._editorView.state;
                this._editorView.dispatch(state.tr.step(new ReplaceStep(pos, pos, slice)));
                pos += 4;
                state = this._editorView.state;
                this._editorView.dispatch(state.tr.setSelection(TextSelection.create(this._editorView.state.doc, pos, pos)));
            }
        }
    }

    private newListItems = (count: number) => {
        return numberRange(count).map(x => schema.nodes.list_item.create(undefined, schema.nodes.paragraph.create()));
    }

    _keymap: any = undefined;
    _rules: RichTextRules | undefined;
    @computed get config() {
        this._keymap = buildKeymap(schema, this.props);
        this._rules = new RichTextRules(this.props.Document, this);
        return {
            schema,
            plugins: [
                inputRules(this._rules.inpRules),
                this.richTextMenuPlugin(),
                history(),
                keymap(this._keymap),
                keymap(baseKeymap),
                new Plugin({
                    props: {
                        attributes: { class: "ProseMirror-example-setup-style" }
                    }
                }),
                formattedTextBoxCommentPlugin
            ]
        };
    }

    makeLinkToSelection(linkId: string, title: string, location: string, targetId: string, targetHref?: string) {
        const state = this._editorView?.state;
        if (state) {
            const href = targetHref ?? Utils.prepend("/doc/" + linkId);
            const sel = state.selection;
            const splitter = state.schema.marks.splitter.create({ id: Utils.GenerateGuid() });
            let tr = state.tr.addMark(sel.from, sel.to, splitter);
            sel.from !== sel.to && tr.doc.nodesBetween(sel.from, sel.to, (node: any, pos: number, parent: any) => {
                if (node.firstChild === null && node.marks.find((m: Mark) => m.type.name === schema.marks.splitter.name)) {
                    const allLinks = [{ href, title, targetId, linkId }];
                    allLinks.push(...(node.marks.find((m: Mark) => m.type.name === schema.marks.linkAnchor.name)?.attrs.allLinks ?? []));
                    const link = state.schema.marks.linkAnchor.create({ allLinks, title, location, linkId });
                    tr = tr.addMark(pos, pos + node.nodeSize, link);
                }
            });
            OVERRIDE_ACL(true);
            this._editorView!.dispatch(tr.removeMark(sel.from, sel.to, splitter));
            OVERRIDE_ACL(false);
        }
    }
    componentDidMount() {
        this._cachedLinks = DocListCast(this.Document.links);
        this._disposers.links = reaction(() => DocListCast(this.Document.links), // if a link is deleted, then remove all hyperlinks that reference it from the text's marks
            newLinks => {
                this._cachedLinks.forEach(l => !newLinks.includes(l) && this.RemoveLinkFromDoc(l));
                this._cachedLinks = newLinks;
            });
        this._disposers.buttonBar = reaction(
            () => DocumentButtonBar.Instance,
            instance => {
                if (instance) {
                    this.pullFromGoogleDoc(this.checkState);
                    this.dataDoc[GoogleRef] && this.dataDoc.unchanged && runInAction(() => instance.isAnimatingFetch = true);
                }
            }
        );
        this._disposers.linkMaker = reaction(
            () => this.props.makeLink?.(),
            (linkDoc: Opt<Doc>) => {
                if (linkDoc) {
                    const anchor2Title = linkDoc.anchor2 instanceof Doc ? StrCast(linkDoc.anchor2.title) : "-untitled-";
                    const anchor2Id = linkDoc.anchor2 instanceof Doc ? linkDoc.anchor2[Id] : "";
                    this.makeLinkToSelection(linkDoc[Id], anchor2Title, "onRight", anchor2Id);
                }
            },
            { fireImmediately: true }
        );
        this._disposers.editorState = reaction(
            () => {
                if (this.dataDoc[this.props.fieldKey + "-noTemplate"] || !this.layoutDoc[this.props.fieldKey + "-textTemplate"]) {
                    return Cast(this.dataDoc[this.props.fieldKey], RichTextField, null)?.Data;
                }
                return Cast(this.layoutDoc[this.props.fieldKey + "-textTemplate"], RichTextField, null)?.Data;
            },
            incomingValue => {
                if (incomingValue !== undefined && this._editorView && !this._applyingChange) {
                    const updatedState = JSON.parse(incomingValue);
                    if (JSON.stringify(this._editorView.state.toJSON()) !== JSON.stringify(updatedState)) {
                        this._editorView.updateState(EditorState.fromJSON(this.config, updatedState));
                        this.tryUpdateHeight();
                    }
                }
            }
        );
        this._disposers.pullDoc = reaction(
            () => this.props.Document[Pulls],
            () => {
                if (!DocumentButtonBar.hasPulledHack) {
                    DocumentButtonBar.hasPulledHack = true;
                    const unchanged = this.dataDoc.unchanged;
                    this.pullFromGoogleDoc(unchanged ? this.checkState : this.updateState);
                }
            }
        );
        this._disposers.pushDoc = reaction(
            () => this.props.Document[Pushes],
            () => {
                if (!DocumentButtonBar.hasPushedHack) {
                    DocumentButtonBar.hasPushedHack = true;
                    this.pushToGoogleDoc();
                }
            }
        );
        this._disposers.autoHeight = reaction(
            () => [this.layoutDoc[WidthSym](), this.layoutDoc._autoHeight],
            () => setTimeout(() => this.tryUpdateHeight(), 0)
        );
        this._disposers.height = reaction(
            () => this.layoutDoc[HeightSym](),
            action(height => {
                if (height <= 20 && height < NumCast(this.layoutDoc._delayAutoHeight, 20)) {
                    this.layoutDoc._delayAutoHeight = height;
                }
            })
        );

        this.setupEditor(this.config, this.props.fieldKey);

        this._disposers.search = reaction(() => this.rootDoc.searchMatch,
            search => search ? this.highlightSearchTerms([Doc.SearchQuery()]) : this.unhighlightSearchTerms(),
            { fireImmediately: true });

        this._disposers.record = reaction(() => this._recording,
            () => {
                if (this._recording) {
                    setTimeout(action(() => {
                        this.stopDictation(true);
                        setTimeout(() => this.recordDictation(), 500);
                    }), 500);
                } else setTimeout(() => this.stopDictation(true), 0);
            }
        );
        this._disposers.scrollToRegion = reaction(
            () => StrCast(this.layoutDoc.scrollToLinkID),
            async (scrollToLinkID) => {
                const findLinkFrag = (frag: Fragment, editor: EditorView) => {
                    const nodes: Node[] = [];
                    frag.forEach((node, index) => {
                        const examinedNode = findLinkNode(node, editor);
                        if (examinedNode?.textContent) {
                            nodes.push(examinedNode);
                            start += index;
                        }
                    });
                    return { frag: Fragment.fromArray(nodes), start: start };
                };
                const findLinkNode = (node: Node, editor: EditorView) => {
                    if (!node.isText) {
                        const content = findLinkFrag(node.content, editor);
                        return node.copy(content.frag);
                    }
                    const marks = [...node.marks];
                    const linkIndex = marks.findIndex(mark => mark.type === editor.state.schema.marks.linkAnchor);
                    return linkIndex !== -1 && marks[linkIndex].attrs.allLinks.find((item: { href: string }) => scrollToLinkID === item.href.replace(/.*\/doc\//, "")) ? node : undefined;
                };

                let start = 0;
                if (this._editorView && scrollToLinkID) {
                    const editor = this._editorView;
                    const ret = findLinkFrag(editor.state.doc.content, editor);

                    if (ret.frag.size > 2 && ret.start >= 0) {
                        let selection = TextSelection.near(editor.state.doc.resolve(ret.start)); // default to near the start
                        if (ret.frag.firstChild) {
                            selection = TextSelection.between(editor.state.doc.resolve(ret.start), editor.state.doc.resolve(ret.start + ret.frag.firstChild.nodeSize)); // bcz: looks better to not have the target selected
                        }
                        editor.dispatch(editor.state.tr.setSelection(new TextSelection(selection.$from, selection.$from)).scrollIntoView());
                        const mark = editor.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
                        setTimeout(() => editor.dispatch(editor.state.tr.addMark(selection.from, selection.to, mark)), 0);
                        setTimeout(() => this.unhighlightSearchTerms(), 2000);
                    }
                    Doc.SetInPlace(this.layoutDoc, "scrollToLinkID", undefined, false);
                }

            },
            { fireImmediately: true }
        );
        this._disposers.scroll = reaction(() => NumCast(this.layoutDoc._scrollTop),
            pos => this._scrollRef.current && this._scrollRef.current.scrollTo({ top: pos }), { fireImmediately: true }
        );

        setTimeout(() => this.tryUpdateHeight(NumCast(this.layoutDoc.limitHeight, 0)));
    }

    pushToGoogleDoc = async () => {
        this.pullFromGoogleDoc(async (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => {
            const modes = GoogleApiClientUtils.Docs.WriteMode;
            let mode = modes.Replace;
            let reference: Opt<GoogleApiClientUtils.Docs.Reference> = Cast(this.dataDoc[GoogleRef], "string");
            if (!reference) {
                mode = modes.Insert;
                reference = { title: StrCast(this.dataDoc.title) };
            }
            const redo = async () => {
                if (this._editorView && reference) {
                    const content = await RichTextUtils.GoogleDocs.Export(this._editorView.state);
                    const response = await GoogleApiClientUtils.Docs.write({ reference, content, mode });
                    response && (this.dataDoc[GoogleRef] = response.documentId);
                    const pushSuccess = response !== undefined && !("errors" in response);
                    dataDoc.unchanged = pushSuccess;
                    DocumentButtonBar.Instance.startPushOutcome(pushSuccess);
                }
            };
            const undo = () => {
                if (!exportState) {
                    return;
                }
                const content: GoogleApiClientUtils.Docs.Content = {
                    text: exportState.text,
                    requests: []
                };
                if (reference && content) {
                    GoogleApiClientUtils.Docs.write({ reference, content, mode });
                }
            };
            UndoManager.AddEvent({ undo, redo });
            redo();
        });
    }

    pullFromGoogleDoc = async (handler: PullHandler) => {
        const dataDoc = this.dataDoc;
        const documentId = StrCast(dataDoc[GoogleRef]);
        let exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>;
        if (documentId) {
            exportState = await RichTextUtils.GoogleDocs.Import(documentId, dataDoc);
        }
        UndoManager.RunInBatch(() => handler(exportState, dataDoc), Pulls);
    }

    updateState = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => {
        let pullSuccess = false;
        if (exportState !== undefined) {
            pullSuccess = true;
            dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(exportState.state.toJSON()));
            setTimeout(() => {
                if (this._editorView) {
                    const state = this._editorView.state;
                    const end = state.doc.content.size - 1;
                    this._editorView.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end, end)));
                }
            }, 0);
            dataDoc.title = exportState.title;
            this.rootDoc.customTitle = true;
            dataDoc.unchanged = true;
        } else {
            delete dataDoc[GoogleRef];
        }
        DocumentButtonBar.Instance.startPullOutcome(pullSuccess);
    }

    checkState = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => {
        if (exportState && this._editorView) {
            const equalContent = isEqual(this._editorView.state.doc, exportState.state.doc);
            const equalTitles = dataDoc.title === exportState.title;
            const unchanged = equalContent && equalTitles;
            dataDoc.unchanged = unchanged;
            DocumentButtonBar.Instance.setPullState(unchanged);
        }
    }

    clipboardTextSerializer = (slice: Slice): string => {
        let text = "", separated = true;
        const from = 0, to = slice.content.size;
        slice.content.nodesBetween(from, to, (node, pos) => {
            if (node.isText) {
                text += node.text!.slice(Math.max(from, pos) - pos, to - pos);
                separated = false;
            } else if (!separated && node.isBlock) {
                text += "\n";
                separated = true;
            } else if (node.type.name === "hard_break") {
                text += "\n";
            }
        }, 0);
        return text;
    }

    sliceSingleNode(slice: Slice) {
        return slice.openStart === 0 && slice.openEnd === 0 && slice.content.childCount === 1 ? slice.content.firstChild : null;
    }

    handlePaste = (view: EditorView, event: Event, slice: Slice): boolean => {
        const cbe = event as ClipboardEvent;
        const pdfDocId = cbe.clipboardData?.getData("dash/pdfOrigin");
        const pdfRegionId = cbe.clipboardData?.getData("dash/pdfRegion");
        return pdfDocId && pdfRegionId && this.addPdfReference(pdfDocId, pdfRegionId, slice) ? true : false;
    }

    addPdfReference = (pdfDocId: string, pdfRegionId: string, slice?: Slice) => {
        const view = this._editorView!;
        if (pdfDocId && pdfRegionId) {
            DocServer.GetRefField(pdfDocId).then(pdfDoc => {
                DocServer.GetRefField(pdfRegionId).then(pdfRegion => {
                    if ((pdfDoc instanceof Doc) && (pdfRegion instanceof Doc)) {
                        setTimeout(async () => {
                            const targetField = Doc.LayoutFieldKey(pdfDoc);
                            const targetAnnotations = await DocListCastAsync(pdfDoc[DataSym][targetField + "-annotations"]);// bcz: better to have the PDF's view handle updating its own annotations
                            if (targetAnnotations) targetAnnotations.push(pdfRegion);
                            else Doc.AddDocToList(pdfDoc[DataSym], targetField + "-annotations", pdfRegion);
                        });

                        const link = DocUtils.MakeLink({ doc: this.rootDoc }, { doc: pdfRegion }, "PDF pasted");
                        if (link) {
                            const linkId = link[Id];
                            const quote = view.state.schema.nodes.blockquote.create();
                            quote.content = addMarkToFrag(slice?.content || view.state.doc.content, (node: Node) => addLinkMark(node, StrCast(pdfDoc.title), linkId));
                            const newSlice = new Slice(Fragment.from(quote), slice?.openStart || 0, slice?.openEnd || 0);
                            if (slice) {
                                view.dispatch(view.state.tr.replaceSelection(newSlice).scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
                            } else {
                                selectAll(view.state, (tx: Transaction) => view.dispatch(tx.replaceSelection(newSlice).scrollIntoView()));

                            }
                        }
                    }
                });
            });
            return true;
        }
        return false;


        function addMarkToFrag(frag: Fragment, marker: (node: Node) => Node) {
            const nodes: Node[] = [];
            frag.forEach(node => nodes.push(marker(node)));
            return Fragment.fromArray(nodes);
        }


        function addLinkMark(node: Node, title: string, linkId: string) {
            if (!node.isText) {
                const content = addMarkToFrag(node.content, (node: Node) => addLinkMark(node, title, linkId));
                return node.copy(content);
            }
            const marks = [...node.marks];
            const linkIndex = marks.findIndex(mark => mark.type.name === "link");
            const allLinks = [{ href: Utils.prepend(`/doc/${linkId}`), title, linkId }];
            const link = view.state.schema.mark(view.state.schema.marks.linkAnchor, { allLinks, location: "onRight", title, docref: true });
            marks.splice(linkIndex === -1 ? 0 : linkIndex, 1, link);
            return node.mark(marks);
        }
    }

    private setupEditor(config: any, fieldKey: string) {
        const curText = Cast(this.dataDoc[this.props.fieldKey], RichTextField, null);
        const useTemplate = !curText?.Text && this.layoutDoc[this.props.fieldKey + "-textTemplate"];
        const rtfField = Cast((useTemplate && this.layoutDoc[this.props.fieldKey + "-textTemplate"]) || this.dataDoc[fieldKey], RichTextField);
        if (this.ProseRef) {
            const self = this;
            this._editorView?.destroy();
            this._editorView = new EditorView(this.ProseRef, {
                state: rtfField?.Data ? EditorState.fromJSON(config, JSON.parse(rtfField.Data)) : EditorState.create(config),
                handleScrollToSelection: (editorView) => {
                    const docPos = editorView.coordsAtPos(editorView.state.selection.from);
                    const viewRect = self._ref.current!.getBoundingClientRect();
                    if (docPos.top < viewRect.top || docPos.top > viewRect.bottom) {
                        docPos && (self._scrollRef.current!.scrollTop += (docPos.top - viewRect.top) * self.props.ScreenToLocalTransform().Scale);
                    }
                    return true;
                },
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    dashComment(node, view, getPos) { return new DashDocCommentView(node, view, getPos); },
                    dashDoc(node, view, getPos) { return new DashDocView(node, view, getPos, self); },
                    dashField(node, view, getPos) { return new DashFieldView(node, view, getPos, self); },
                    summary(node, view, getPos) { return new SummaryView(node, view, getPos); },
                    ordered_list(node, view, getPos) { return new OrderedListView(); },
                    footnote(node, view, getPos) { return new FootnoteView(node, view, getPos); }
                },
                clipboardTextSerializer: this.clipboardTextSerializer,
                handlePaste: this.handlePaste,
            });
            !Doc.UserDoc().noviceMode && applyDevTools.applyDevTools(this._editorView);
            const startupText = !rtfField && this._editorView && Field.toString(this.dataDoc[fieldKey] as Field);
            if (startupText) {
                const { state: { tr }, dispatch } = this._editorView;
                dispatch(tr.insertText(startupText));
            }
            (this._editorView as any).TextView = this;
        }

        const selectOnLoad = this.rootDoc[Id] === FormattedTextBox.SelectOnLoad;
        if (selectOnLoad && !this.props.dontRegisterView) {
            FormattedTextBox.SelectOnLoad = "";
            this.props.select(false);
            FormattedTextBox.SelectOnLoadChar && this._editorView!.dispatch(this._editorView!.state.tr.insertText(FormattedTextBox.SelectOnLoadChar));
            FormattedTextBox.SelectOnLoadChar = "";

        }
        (selectOnLoad /* || !rtfField?.Text*/) && this._editorView!.focus();
        // add user mark for any first character that was typed since the user mark that gets set in KeyPress won't have been called yet.
        if (!this._editorView!.state.storedMarks || !this._editorView!.state.storedMarks.some(mark => mark.type === schema.marks.user_mark)) {
            this._editorView!.state.storedMarks = [...(this._editorView!.state.storedMarks ? this._editorView!.state.storedMarks : []), schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(Date.now() / 1000) })];
        }
    }
    getFont(font: string) {
        switch (font) {
            case "Arial": return schema.marks.arial.create();
            case "Times New Roman": return schema.marks.timesNewRoman.create();
            case "Georgia": return schema.marks.georgia.create();
            case "Comic Sans MS": return schema.marks.comicSans.create();
            case "Tahoma": return schema.marks.tahoma.create();
            case "Impact": return schema.marks.impact.create();
            case "ACrimson Textrial": return schema.marks.crimson.create();
        }
        return schema.marks.arial.create();
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        this._editorView?.destroy();
    }

    static _downEvent: any;
    _downX = 0;
    _downY = 0;
    _break = false;
    _collapsed = false;
    onPointerDown = (e: React.PointerEvent): void => {
        if (this._recording && !e.ctrlKey && e.button === 0) {
            this.stopDictation(true);
            this._break = true;
            const state = this._editorView!.state;
            const to = state.selection.to;
            const updated = TextSelection.create(state.doc, to, to);
            this._editorView!.dispatch(this._editorView!.state.tr.setSelection(updated).insertText("\n", to));
            e.preventDefault();
            e.stopPropagation();
            if (this._recording) setTimeout(() => this.recordDictation(), 500);
        }
        this._downX = e.clientX;
        this._downY = e.clientY;
        this.doLinkOnDeselect();
        FormattedTextBox._downEvent = true;
        FormattedTextBoxComment.textBox = this;
        if (this.props.onClick && e.button === 0 && !this.props.isSelected(false)) {
            e.preventDefault();
        }
        if (e.button === 0 && this.props.isSelected(true) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.clientX < this.ProseRef!.getBoundingClientRect().right) { // stop propagation if not in sidebar
                e.stopPropagation();  // if the text box is selected, then it consumes all down events
            }
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
    }

    onPointerUp = (e: React.PointerEvent): void => {
        if (!FormattedTextBox._downEvent) return;
        FormattedTextBox._downEvent = false;
        if (!(e.nativeEvent as any).formattedHandled) {
            const editor = this._editorView!;
            FormattedTextBoxComment.textBox = this;
            const pcords = editor.posAtCoords({ left: e.clientX, top: e.clientY });
            !this.props.isSelected(true) && editor.dispatch(editor.state.tr.setSelection(new TextSelection(editor.state.doc.resolve(pcords?.pos || 0))));
            FormattedTextBoxComment.update(editor, undefined, (e.target as any)?.className === "prosemirror-dropdownlink" ? (e.target as any).href : "");
        }
        (e.nativeEvent as any).formattedHandled = true;

        if (e.buttons === 1 && this.props.isSelected(true) && !e.altKey) {
            e.stopPropagation();
        }
    }

    @action
    onDoubleClick = (e: React.MouseEvent): void => {

        this.doLinkOnDeselect();
        FormattedTextBox._downEvent = true;
        FormattedTextBoxComment.textBox = this;
        if (this.props.onClick && e.button === 0 && !this.props.isSelected(false)) {
            e.preventDefault();
        }
        if (e.button === 0 && this.props.isSelected(true) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.clientX < this.ProseRef!.getBoundingClientRect().right) { // stop propagation if not in sidebar
                e.stopPropagation();  // if the text box is selected, then it consumes all down events
            }
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
        FormattedTextBoxComment.Hide();
        if (FormattedTextBoxComment.linkDoc) {
            if (FormattedTextBoxComment.linkDoc.type !== DocumentType.LINK) {
                this.props.addDocTab(FormattedTextBoxComment.linkDoc, e.ctrlKey ? "inTab" : "onRight");
            } else {
                DocumentManager.Instance.FollowLink(FormattedTextBoxComment.linkDoc, this.props.Document,
                    (doc: Doc, followLinkLocation: string) => this.props.addDocTab(doc, e.ctrlKey ? "inTab" : followLinkLocation));
            }
        }

        (e.nativeEvent as any).formattedHandled = true;

        if (e.buttons === 1 && this.props.isSelected(true) && !e.altKey) {
            e.stopPropagation();
        }
    }

    @action
    onFocused = (e: React.FocusEvent): void => {
        FormattedTextBox.FocusedBox = this;
        this.tryUpdateHeight();

        // see if we need to preserve the insertion point
        const prosediv = this.ProseRef?.children?.[0] as any;
        const keeplocation = prosediv?.keeplocation;
        prosediv && (prosediv.keeplocation = undefined);
        const pos = this._editorView?.state.selection.$from.pos || 1;
        keeplocation && setTimeout(() => this._editorView?.dispatch(this._editorView?.state.tr.setSelection(TextSelection.create(this._editorView.state.doc, pos))));
        const coords = !Number.isNaN(this._downX) ? { left: this._downX, top: this._downY, bottom: this._downY, right: this._downX } : this._editorView?.coordsAtPos(pos);

        // jump rich text menu to this textbox
        const bounds = this._ref.current?.getBoundingClientRect();
        if (bounds && this.layoutDoc._chromeStatus !== "disabled") {
            const x = Math.min(Math.max(bounds.left, 0), window.innerWidth - RichTextMenu.Instance.width);
            let y = Math.min(Math.max(0, bounds.top - RichTextMenu.Instance.height - 50), window.innerHeight - RichTextMenu.Instance.height);
            if (coords && coords.left > x && coords.left < x + RichTextMenu.Instance.width && coords.top > y && coords.top < y + RichTextMenu.Instance.height + 50) {
                y = Math.min(bounds.bottom, window.innerHeight - RichTextMenu.Instance.height);
            }
            setTimeout(() => window.document.activeElement === this.ProseRef?.children[0] && RichTextMenu.Instance.jumpTo(x, y), 250);
        }
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        // if a text note is not selected and scrollable, this prevents us from being able to scroll and zoom out at the same time
        if (this.props.isSelected(true) || e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
            e.stopPropagation();
        }
    }

    static _bulletStyleSheet: any = addStyleSheet();
    static _userStyleSheet: any = addStyleSheet();
    _forceUncollapse = true; // if the cursor doesn't move between clicks, then the selection will disappear for some reason.  This flags the 2nd click as happening on a selection which allows bullet points to toggle
    _forceDownNode: Node | undefined;
    onClick = (e: React.MouseEvent): void => {
        if (Math.abs(e.clientX - this._downX) > 4 || Math.abs(e.clientY - this._downY) > 4) {
            this._forceDownNode = undefined;
            return;
        }
        if (!this._forceUncollapse || (this._editorView!.root as any).getSelection().isCollapsed) { // this is a hack to allow the cursor to be placed at the end of a document when the document ends in an inline dash comment.  Apparently Chrome on Windows has a bug/feature which breaks this when clicking after the end of the text.
            const pcords = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
            const node = pcords && this._editorView!.state.doc.nodeAt(pcords.pos); // get what prosemirror thinks the clicked node is (if it's null, then we didn't click on any text)
            if (pcords && node?.type === this._editorView!.state.schema.nodes.dashComment) {
                this._editorView!.dispatch(this._editorView!.state.tr.setSelection(TextSelection.create(this._editorView!.state.doc, pcords.pos + 2)));
                e.preventDefault();
            }
            if (!node && this.ProseRef) {
                const lastNode = this.ProseRef.children[this.ProseRef.children.length - 1].children[this.ProseRef.children[this.ProseRef.children.length - 1].children.length - 1]; // get the last prosemirror div
                if (e.clientY > lastNode?.getBoundingClientRect().bottom) { // if we clicked below the last prosemirror div, then set the selection to be the end of the document
                    this._editorView!.dispatch(this._editorView!.state.tr.setSelection(TextSelection.create(this._editorView!.state.doc, this._editorView!.state.doc.content.size)));
                }
            } else if ([this._editorView!.state.schema.nodes.ordered_list, this._editorView!.state.schema.nodes.listItem].includes(node?.type) &&
                node !== (this._editorView!.state.selection as NodeSelection)?.node && pcords) {
                this._editorView!.dispatch(this._editorView!.state.tr.setSelection(NodeSelection.create(this._editorView!.state.doc, pcords.pos)));
            }
        }
        if ((e.nativeEvent as any).formattedHandled) { e.stopPropagation(); return; }
        (e.nativeEvent as any).formattedHandled = true;

        if (this.props.isSelected(true)) { // if text box is selected, then it consumes all click events
            e.stopPropagation();
            this.hitBulletTargets(e.clientX, e.clientY, !this._editorView?.state.selection.empty || this._forceUncollapse, false, this._forceDownNode, e.shiftKey);
        }
        this._forceUncollapse = !(this._editorView!.root as any).getSelection().isCollapsed;
        this._forceDownNode = (this._editorView!.state.selection as NodeSelection)?.node;
    }

    // this hackiness handles clicking on the list item bullets to do expand/collapse.  the bullets are ::before pseudo elements so there's no real way to hit test against them.
    hitBulletTargets(x: number, y: number, collapse: boolean, highlightOnly: boolean, downNode: Node | undefined = undefined, selectOrderedList: boolean = false) {
        this._forceUncollapse = false;
        clearStyleSheetRules(FormattedTextBox._bulletStyleSheet);
        const clickPos = this._editorView!.posAtCoords({ left: x, top: y });
        let olistPos = clickPos?.pos;
        if (clickPos && olistPos && this.props.isSelected(true)) {
            const clickNode = this._editorView?.state.doc.nodeAt(olistPos);
            const nodeBef = this._editorView?.state.doc.nodeAt(Math.max(0, olistPos - 1));
            olistPos = nodeBef?.type === this._editorView?.state.schema.nodes.ordered_list ? olistPos - 1 : olistPos;
            let $olistPos = this._editorView?.state.doc.resolve(olistPos);
            let olistNode = (nodeBef !== null || clickNode?.type === this._editorView?.state.schema.nodes.list_item) && olistPos === clickPos?.pos ? clickNode : nodeBef;
            if (olistNode?.type === this._editorView?.state.schema.nodes.list_item) {
                if ($olistPos && ($olistPos as any).path.length > 3) {
                    olistNode = $olistPos.parent;
                    $olistPos = this._editorView?.state.doc.resolve(($olistPos as any).path[($olistPos as any).path.length - 4]);
                }
            }
            const listPos = this._editorView?.state.doc.resolve(clickPos.pos);
            const listNode = this._editorView?.state.doc.nodeAt(clickPos.pos);
            if (olistNode && olistNode.type === this._editorView?.state.schema.nodes.ordered_list && listNode) {
                if (!highlightOnly) {
                    if (selectOrderedList || (!collapse && listNode.attrs.visibility)) {
                        this._editorView.dispatch(this._editorView.state.tr.setSelection(new NodeSelection(selectOrderedList ? $olistPos! : listPos!)));
                    } else if (!listNode.attrs.visibility || downNode === listNode) {
                        this._editorView.dispatch(this._editorView.state.tr.setNodeMarkup(clickPos.pos, listNode.type, { ...listNode.attrs, visibility: !listNode.attrs.visibility }));
                        this._editorView.dispatch(this._editorView.state.tr.setSelection(TextSelection.create(this._editorView.state.doc, clickPos.pos)));
                    }
                }
                addStyleSheetRule(FormattedTextBox._bulletStyleSheet, olistNode.attrs.mapStyle + olistNode.attrs.bulletStyle + ":hover:before", { background: "lightgray" });
            }
        }
    }
    onMouseUp = (e: React.MouseEvent): void => {
        e.stopPropagation();

        const view = this._editorView as any;
        // this interposes on prosemirror's upHandler to prevent prosemirror's up from invoked multiple times when there
        // are nested prosemirrors.  We only want the lowest level prosemirror to be invoked.
        if (view.mouseDown) {
            const originalUpHandler = view.mouseDown.up;
            view.root.removeEventListener("mouseup", originalUpHandler);
            view.mouseDown.up = (e: MouseEvent) => {
                !(e as any).formattedHandled && originalUpHandler(e);
                // e.stopPropagation();
                (e as any).formattedHandled = true;
            };
            view.root.addEventListener("mouseup", view.mouseDown.up);
        }
    }

    richTextMenuPlugin() {
        return new Plugin({
            view(newView) {
                RichTextMenu.Instance && RichTextMenu.Instance.changeView(newView);
                return RichTextMenu.Instance;
            }
        });
    }

    public startUndoTypingBatch() {
        this._undoTyping = UndoManager.StartBatch("undoTyping");
    }

    public endUndoTypingBatch() {
        const wasUndoing = this._undoTyping;
        if (this._undoTyping) {
            this._undoTyping.end();
            this._undoTyping = undefined;
        }
        return wasUndoing;
    }
    public static HadSelection: boolean = false;
    onBlur = (e: any) => {
        FormattedTextBox.HadSelection = window.getSelection()?.toString() !== "";
        //DictationManager.Controls.stop(false);
        this.endUndoTypingBatch();
        this.doLinkOnDeselect();

        // move the richtextmenu offscreen
        if (!RichTextMenu.Instance.Pinned) RichTextMenu.Instance.delayHide();
    }

    _lastTimedMark: Mark | undefined = undefined;
    onKeyPress = (e: React.KeyboardEvent) => {
        if (e.altKey) {
            e.preventDefault();
            return;
        }
        const state = this._editorView!.state;
        if (!state.selection.empty && e.key === "%") {
            this._rules!.EnteringStyle = true;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (state.selection.empty || !this._rules!.EnteringStyle) {
            this._rules!.EnteringStyle = false;
        }
        if (e.key === "Escape") {
            this._editorView!.dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from)));
            (document.activeElement as any).blur?.();
            SelectionManager.DeselectAll();
        }
        e.stopPropagation();
        if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
        }
        const mark = e.key !== " " && this._lastTimedMark ? this._lastTimedMark : schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(Date.now() / 1000) });
        this._lastTimedMark = mark;
        // this._editorView!.dispatch(this._editorView!.state.tr.removeStoredMark(schema.marks.user_mark.create({})).addStoredMark(mark));

        if (!this._undoTyping) {
            this.startUndoTypingBatch();
        }
    }

    ondrop = (eve: React.DragEvent) => {
        this._editorView!.dispatch(updateBullets(this._editorView!.state.tr, this._editorView!.state.schema));
        eve.stopPropagation(); // drag n drop of text within text note will generate a new note if not caughst, as will dragging in from outside of Dash.
    }
    onscrolled = (ev: React.UIEvent) => {
        this.layoutDoc._scrollTop = this._scrollRef.current!.scrollTop;
    }
    @action
    tryUpdateHeight(limitHeight?: number) {
        let scrollHeight = this._ref.current?.scrollHeight;
        if (this.props.renderDepth && this.layoutDoc._autoHeight && !this.props.ignoreAutoHeight && scrollHeight) {  // if top === 0, then the text box is growing upward (as the overlay caption) which doesn't contribute to the height computation
            scrollHeight = scrollHeight * NumCast(this.layoutDoc._viewScale, 1);
            if (limitHeight && scrollHeight > limitHeight) {
                scrollHeight = limitHeight;
                this.layoutDoc.limitHeight = undefined;
                this.layoutDoc._autoHeight = false;
            }
            const nh = this.layoutDoc.isTemplateForField ? 0 : NumCast(this.layoutDoc._nativeHeight, 0);
            const dh = NumCast(this.rootDoc._height, 0);
            const newHeight = Math.max(10, (nh ? dh / nh * scrollHeight : scrollHeight) + (this.props.ChromeHeight ? this.props.ChromeHeight() : 0));
            if (this.rootDoc !== this.layoutDoc.doc && !this.layoutDoc.resolvedDataDoc) {
                // if we have a template that hasn't been resolved yet, we can't set the height or we'd be setting it on the unresolved template.  So set a timeout and hope its arrived...
                console.log("Delayed height adjustment...");
                setTimeout(() => {
                    this.rootDoc._height = newHeight;
                    this.layoutDoc._nativeHeight = nh ? scrollHeight : undefined;
                }, 10);
            } else {
                this.layoutDoc._height = newHeight;
                this.layoutDoc._nativeHeight = nh ? scrollHeight : undefined;
            }
        }
    }

    @computed get sidebarWidthPercent() { return StrCast(this.layoutDoc._sidebarWidthPercent, "0%"); }
    sidebarWidth = () => Number(this.sidebarWidthPercent.substring(0, this.sidebarWidthPercent.length - 1)) / 100 * this.props.PanelWidth();
    sidebarScreenToLocal = () => this.props.ScreenToLocalTransform().translate(-(this.props.PanelWidth() - this.sidebarWidth()) / this.props.ContentScaling(), 0);
    @computed get sidebarColor() { return StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], "transparent")); }
    render() {
        TraceMobx();
        const scale = this.props.ContentScaling() * NumCast(this.layoutDoc._viewScale, 1);
        const rounded = StrCast(this.layoutDoc.borderRounding) === "100%" ? "-rounded" : "";
        const interactive = Doc.GetSelectedTool() === InkTool.None && !this.layoutDoc.isBackground;
        if (this.props.isSelected()) {
            setTimeout(() => this._editorView && RichTextMenu.Instance.updateFromDash(this._editorView, undefined, this.props), 0);
        } else if (FormattedTextBoxComment.textBox === this) {
            setTimeout(() => FormattedTextBoxComment.Hide(), 0);
        }
        const selPad = this.props.isSelected() ? -10 : 0;
        const selclass = this.props.isSelected() ? "-selected" : "";
        return (
            <div className={"formattedTextBox-cont"}
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: `${100 / scale}%`,
                    height: `calc(${100 / scale}% - ${this.props.ChromeHeight?.() || 0}px)`,
                    ...this.styleFromLayoutString(scale)
                }}>
                <div className={`formattedTextBox-cont`} ref={this._ref}
                    style={{
                        overflow: this.layoutDoc._autoHeight ? "hidden" : undefined,
                        width: "100%",
                        height: this.props.height ? this.props.height : this.layoutDoc._autoHeight && this.props.renderDepth ? "max-content" : undefined,
                        background: Doc.UserDoc().renderStyle === "comic" ? "transparent" : this.props.background ? this.props.background : StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], this.props.hideOnLeave ? "rgba(0,0,0 ,0.4)" : ""),
                        opacity: this.props.hideOnLeave ? (this._entered ? 1 : 0.1) : 1,
                        color: this.props.color ? this.props.color : StrCast(this.layoutDoc[this.props.fieldKey + "-color"], this.props.hideOnLeave ? "white" : "inherit"),
                        pointerEvents: interactive ? undefined : "none",
                        fontSize: Cast(this.layoutDoc._fontSize, "number", null),
                        fontFamily: StrCast(this.layoutDoc._fontFamily, "inherit"),
                        transition: "opacity 1s"
                    }}
                    onContextMenu={this.specificContextMenu}
                    onKeyDown={this.onKeyPress}
                    onFocus={this.onFocused}
                    onClick={this.onClick}
                    onPointerMove={e => this.hitBulletTargets(e.clientX, e.clientY, e.shiftKey, true)}
                    onBlur={this.onBlur}
                    onPointerUp={this.onPointerUp}
                    onPointerDown={this.onPointerDown}
                    onMouseUp={this.onMouseUp}
                    onWheel={this.onPointerWheel}
                    onPointerEnter={action(() => this._entered = true)}
                    onPointerLeave={action((e: React.PointerEvent<HTMLDivElement>) => {
                        this._entered = false;
                        const target = document.elementFromPoint(e.nativeEvent.x, e.nativeEvent.y);
                        for (let child: any = target; child; child = child?.parentElement) {
                            if (child === this._ref.current!) {
                                this._entered = true;
                            }
                        }
                    })}
                    onDoubleClick={this.onDoubleClick}
                >
                    <div className={`formattedTextBox-outer`} ref={this._scrollRef}
                        style={{ width: `calc(100% - ${this.sidebarWidthPercent})`, pointerEvents: !this.props.isSelected() ? "none" : undefined }}
                        onScroll={this.onscrolled} onDrop={this.ondrop} >
                        <div className={`formattedTextBox-inner${rounded}${selclass}`} ref={this.createDropTarget}
                            style={{
                                padding: this.layoutDoc._textBoxPadding ? StrCast(this.layoutDoc._textBoxPadding) : `${Math.max(0, NumCast(this.layoutDoc._yMargin, this.props.yMargin || 0) + selPad)}px  ${NumCast(this.layoutDoc._xMargin, this.props.xMargin || 0) + selPad}px`,
                                pointerEvents: !this.props.isSelected() ? ((this.layoutDoc.isLinkButton || this.props.onClick) ? "none" : "all") : undefined
                            }}
                        />
                    </div>
                    {!this.layoutDoc._showSidebar ? (null) : this.sidebarWidthPercent === "0%" ?
                        <div className="formattedTextBox-sidebar-handle" onPointerDown={this.sidebarDown} /> :
                        <div className={"formattedTextBox-sidebar" + (Doc.GetSelectedTool() !== InkTool.None ? "-inking" : "")}
                            style={{ width: `${this.sidebarWidthPercent}`, backgroundColor: `${this.sidebarColor}` }}>
                            <CollectionFreeFormView {...this.props}
                                PanelHeight={this.props.PanelHeight}
                                PanelWidth={this.sidebarWidth}
                                NativeHeight={returnZero}
                                NativeWidth={returnZero}
                                scaleField={this.annotationKey + "-scale"}
                                annotationsKey={this.annotationKey}
                                isAnnotationOverlay={false}
                                focus={this.props.focus}
                                isSelected={this.props.isSelected}
                                select={emptyFunction}
                                active={this.annotationsActive}
                                ContentScaling={returnOne}
                                whenActiveChanged={this.whenActiveChanged}
                                removeDocument={this.removeDocument}
                                moveDocument={this.moveDocument}
                                addDocument={this.addDocument}
                                CollectionView={undefined}
                                ScreenToLocalTransform={this.sidebarScreenToLocal}
                                renderDepth={this.props.renderDepth + 1}
                                ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                            </CollectionFreeFormView>
                            <div className="formattedTextBox-sidebar-handle" onPointerDown={this.sidebarDown} />
                        </div>}
                    {!this.layoutDoc._showAudio ? (null) :
                        <div className="formattedTextBox-dictation"
                            onPointerDown={e => {
                                runInAction(() => this._recording = !this._recording);
                                setTimeout(() => this._editorView!.focus(), 500);
                                e.stopPropagation();
                            }} >
                            <FontAwesomeIcon className="formattedTextBox-audioFont"
                                style={{ color: this._recording ? "red" : "blue", opacity: this._recording ? 1 : 0.5, display: this.props.isSelected() ? "" : "none" }} icon={"microphone"} size="sm" />
                        </div>}
                </div>
            </div>
        );
    }
}
