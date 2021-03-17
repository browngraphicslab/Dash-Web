import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { isEqual } from "lodash";
import { action, computed, IReactionDisposer, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap, selectAll } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { inputRules } from 'prosemirror-inputrules';
import { keymap } from "prosemirror-keymap";
import { Fragment, Mark, Node, Slice } from "prosemirror-model";
import { ReplaceStep } from 'prosemirror-transform';
import { EditorState, NodeSelection, Plugin, TextSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { DateField } from '../../../../fields/DateField';
import { AclAdmin, AclEdit, DataSym, Doc, DocListCast, DocListCastAsync, Field, ForceServerWrite, HeightSym, Opt, UpdatingFromServer, WidthSym } from "../../../../fields/Doc";
import { documentSchema } from '../../../../fields/documentSchemas';
import { Id } from '../../../../fields/FieldSymbols';
import { InkTool } from '../../../../fields/InkField';
import { PrefetchProxy } from '../../../../fields/Proxy';
import { RichTextField } from "../../../../fields/RichTextField";
import { RichTextUtils } from '../../../../fields/RichTextUtils';
import { makeInterface } from "../../../../fields/Schema";
import { Cast, DateCast, NumCast, ScriptCast, StrCast } from "../../../../fields/Types";
import { GetEffectiveAcl, TraceMobx } from '../../../../fields/util';
import { addStyleSheet, addStyleSheetRule, clearStyleSheetRules, emptyFunction, numberRange, OmitKeys, returnZero, setupMoveUpEvents, smoothScroll, Utils } from '../../../../Utils';
import { GoogleApiClientUtils, Pulls, Pushes } from '../../../apis/google_docs/GoogleApiClientUtils';
import { DocServer } from "../../../DocServer";
import { Docs, DocUtils } from '../../../documents/Documents';
import { DocumentType } from '../../../documents/DocumentTypes';
import { CurrentUserUtils } from '../../../util/CurrentUserUtils';
import { DictationManager } from '../../../util/DictationManager';
import { DocumentManager } from '../../../util/DocumentManager';
import { DragManager } from "../../../util/DragManager";
import { makeTemplate } from '../../../util/DropConverter';
import { SelectionManager } from "../../../util/SelectionManager";
import { SnappingManager } from '../../../util/SnappingManager';
import { undoBatch, UndoManager } from "../../../util/UndoManager";
import { CollectionFreeFormView } from '../../collections/collectionFreeForm/CollectionFreeFormView';
import { CollectionStackingView } from '../../collections/CollectionStackingView';
import { ContextMenu } from '../../ContextMenu';
import { ContextMenuProps } from '../../ContextMenuItem';
import { ViewBoxAnnotatableComponent } from "../../DocComponent";
import { DocumentButtonBar } from '../../DocumentButtonBar';
import { LightboxView } from '../../LightboxView';
import { AnchorMenu } from '../../pdf/AnchorMenu';
import { StyleProp } from '../../StyleProvider';
import { AudioBox } from '../AudioBox';
import { FieldView, FieldViewProps } from "../FieldView";
import { LinkDocPreview } from '../LinkDocPreview';
import { DashDocCommentView } from "./DashDocCommentView";
import { DashDocView } from "./DashDocView";
import { DashFieldView } from "./DashFieldView";
import { EquationView } from "./EquationView";
import { FootnoteView } from "./FootnoteView";
import "./FormattedTextBox.scss";
import { findLinkMark, FormattedTextBoxComment } from './FormattedTextBoxComment';
import { OrderedListView } from "./OrderedListView";
import { buildKeymap, updateBullets } from "./ProsemirrorExampleTransfer";
import { removeMarkWithAttrs } from "./prosemirrorPatches";
import { RichTextMenu, RichTextMenuPlugin } from './RichTextMenu';
import { RichTextRules } from "./RichTextRules";
import { schema } from "./schema_rts";
import { SummaryView } from "./SummaryView";
import applyDevTools = require("prosemirror-dev-tools");

import React = require("react");
const translateGoogleApi = require("translate-google-api");

export interface FormattedTextBoxProps {
    makeLink?: () => Opt<Doc>;  // bcz: hack: notifies the text document when the container has made a link.  allows the text doc to react and setup a hyeprlink for any selected text
    hideOnLeave?: boolean;  // used by DocumentView for setting caption's hide on leave (bcz: would prefer to have caption-hideOnLeave field set or something similar)
    xMargin?: number;   // used to override document's settings for xMargin --- see CollectionCarouselView
    yMargin?: number;
    noSidebar?: boolean;
    dontSelectOnLoad?: boolean; // suppress selecting the text box when loaded
}
export const GoogleRef = "googleDocId";

type RichTextDocument = makeInterface<[typeof documentSchema]>;
const RichTextDocument = makeInterface(documentSchema);

type PullHandler = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends ViewBoxAnnotatableComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(FormattedTextBox, fieldStr); }
    public static blankState = () => EditorState.create(FormattedTextBox.Instance.config);
    public static get DefaultLayout() {
        return Cast(Doc.UserDoc().defaultTextLayout, Doc, null) || StrCast(Doc.UserDoc().defaultTextLayout, null);
    }
    public static Instance: FormattedTextBox;
    public static LiveTextUndo: UndoManager.Batch | undefined;
    static _highlights: string[] = ["Audio Tags", "Text from Others", "Todo Items", "Important Items", "Disagree Items", "Ignore Items"];
    static _highlightStyleSheet: any = addStyleSheet();
    static _bulletStyleSheet: any = addStyleSheet();
    static _userStyleSheet: any = addStyleSheet();
    static _canAnnotate = true;
    static _hadSelection: boolean = false;
    private _ref: React.RefObject<HTMLDivElement> = React.createRef();
    private _scrollRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _editorView: Opt<EditorView>;
    private _applyingChange: string = "";
    private _searchIndex = 0;
    private _lastTimedMark: Mark | undefined = undefined;
    private _cachedLinks: Doc[] = [];
    private _undoTyping?: UndoManager.Batch;
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _recordingStart: number = 0;
    private _ignoreScroll = false;
    private _lastText = "";
    private _focusSpeed: Opt<number>;
    private _keymap: any = undefined;
    private _rules: RichTextRules | undefined;
    private _forceUncollapse = true; // if the cursor doesn't move between clicks, then the selection will disappear for some reason.  This flags the 2nd click as happening on a selection which allows bullet points to toggle
    private _forceDownNode: Node | undefined;
    private _downEvent: any;
    private _downX = 0;
    private _downY = 0;
    private _break = false;
    public ProseRef?: HTMLDivElement;
    public get EditorView() { return this._editorView; }
    public get SidebarKey() { return this.fieldKey + "-sidebar"; }

    @computed get sidebarWidthPercent() { return StrCast(this.layoutDoc._sidebarWidthPercent, "0%"); }
    @computed get sidebarColor() { return StrCast(this.layoutDoc.sidebarColor, StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], "#e4e4e4")); }
    @computed get autoHeight() { return this.layoutDoc._autoHeight && !this.props.ignoreAutoHeight; }
    @computed get textHeight() { return NumCast(this.rootDoc[this.fieldKey + "-height"]); }
    @computed get scrollHeight() { return NumCast(this.rootDoc[this.fieldKey + "-scrollHeight"]); }
    @computed get sidebarHeight() { return NumCast(this.rootDoc[this.SidebarKey + "-height"]); }
    @computed get titleHeight() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.HeaderMargin) || 0; }
    @computed get _recording() { return this.dataDoc?.audioState === "recording"; }
    set _recording(value) { this.dataDoc.audioState = value ? "recording" : undefined; }
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
                new Plugin({ props: { attributes: { class: "ProseMirror-example-setup-style" } } }),
                new Plugin({ view(editorView) { return new FormattedTextBoxComment(editorView); } })
            ]
        };
    }

    public static FocusedBox: FormattedTextBox | undefined;
    public static PasteOnLoad: ClipboardEvent | undefined;
    public static SelectOnLoad = "";
    public static DontSelectInitialText = false; // whether initial text should be selected or not
    public static SelectOnLoadChar = "";
    public static IsFragment(html: string) { return html.indexOf("data-pm-slice") !== -1; }
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
        return url.startsWith(document.location.origin) ? new URL(url).pathname.split("doc/").lastElement() : ""; // docid
    }

    constructor(props: any) {
        super(props);
        FormattedTextBox.Instance = this;
        this.updateHighlights();
        this._recordingStart = Date.now();
    }

    // removes all hyperlink anchors for the removed linkDoc
    // TODO: bcz: Argh... if a section of text has multiple anchors, this should just remove the intended one. 
    // but since removing one anchor from the list of attr anchors isn't implemented, this will end up removing nothing.
    public RemoveLinkFromDoc(linkDoc?: Doc) {
        this.unhighlightSearchTerms();
        const state = this._editorView?.state;
        const a1 = linkDoc?.anchor1 as Doc;
        const a2 = linkDoc?.anchor2 as Doc;
        if (state && a1 && a2 && this._editorView) {
            this.removeDocument(a1);
            this.removeDocument(a2);
            var allFoundLinkAnchors: any[] = [];
            state.doc.nodesBetween(0, state.doc.nodeSize - 2, (node: any, pos: number, parent: any) => {
                const foundLinkAnchors = findLinkMark(node.marks)?.attrs.allAnchors.filter((a: any) => a.anchorId === a1[Id] || a.anchorId === a2[Id]) || [];
                allFoundLinkAnchors = foundLinkAnchors.length ? foundLinkAnchors : allFoundLinkAnchors;
                return true;
            });
            if (allFoundLinkAnchors.length) {
                this._editorView.dispatch(removeMarkWithAttrs(state.tr, 0, state.doc.nodeSize - 2, state.schema.marks.linkAnchor, { allAnchors: allFoundLinkAnchors }));

                this.setupEditor(this.config, this.fieldKey);
            }
        }
    }
    // removes all the specified link references from the selection. 
    // NOTE: as above, this won't work correctly if there are marks with overlapping but not exact sets of link references.
    public RemoveAnchorFromSelection(allAnchors: { href: string, title: string, linkId: string, targetId: string }[]) {
        const state = this._editorView?.state;
        if (state && this._editorView) {
            this._editorView.dispatch(removeMarkWithAttrs(state.tr, state.selection.from, state.selection.to, state.schema.marks.link, { allAnchors }));
            this.setupEditor(this.config, this.fieldKey);
        }
    }

    getAnchor = () => this.makeLinkAnchor(undefined, "add:right", undefined, "Anchored Selection");

    @action
    setupAnchorMenu = () => {
        AnchorMenu.Instance.Status = "marquee";
        AnchorMenu.Instance.Highlight = action((color: string, isLinkButton: boolean) => {
            this._editorView?.state && RichTextMenu.Instance.insertHighlight(color, this._editorView.state, this._editorView?.dispatch);
            return undefined;
        });
        /**
         * This function is used by the PDFmenu to create an anchor highlight and a new linked text annotation.  
         * It also initiates a Drag/Drop interaction to place the text annotation.
         */
        AnchorMenu.Instance.StartDrag = action(async (e: PointerEvent, ele: HTMLElement) => {
            e.preventDefault();
            e.stopPropagation();
            const targetCreator = (annotationOn?: Doc) => {
                const target = CurrentUserUtils.GetNewTextDoc("Note linked to " + this.rootDoc.title, 0, 0, 100, 100, undefined, annotationOn);
                FormattedTextBox.SelectOnLoad = target[Id];
                return target;
            };

            DragManager.StartAnchorAnnoDrag([ele], new DragManager.AnchorAnnoDragData(this.props.docViewPath().lastElement(), this.getAnchor, targetCreator), e.pageX, e.pageY);
        });
        const coordsB = this._editorView!.coordsAtPos(this._editorView!.state.selection.to);
        this.props.isSelected(true) && AnchorMenu.Instance.jumpTo(coordsB.left, coordsB.bottom);
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);

            const tsel = this._editorView.state.selection.$from;
            tsel.marks().filter(m => m.type === this._editorView!.state.schema.marks.user_mark).map(m => AudioBox.SetScrubTime(Math.max(0, m.attrs.modified * 1000)));
            const curText = state.doc.textBetween(0, state.doc.content.size, " \n");
            const curTemp = this.layoutDoc.resolvedDataDoc ? Cast(this.layoutDoc[this.props.fieldKey], RichTextField) : undefined;               // the actual text in the text box
            const curProto = Cast(Cast(this.dataDoc.proto, Doc, null)?.[this.fieldKey], RichTextField, null);              // the default text inherited from a prototype
            const curLayout = this.rootDoc !== this.layoutDoc ? Cast(this.layoutDoc[this.fieldKey], RichTextField, null) : undefined; // the default text stored in a layout template
            const json = JSON.stringify(state.toJSON());
            const effectiveAcl = GetEffectiveAcl(this.dataDoc);

            const removeSelection = (json: string | undefined) => json?.indexOf("\"storedMarks\"") === -1 ?
                json?.replace(/"selection":.*/, "") : json?.replace(/"selection":"\"storedMarks\""/, "\"storedMarks\"");

            if (effectiveAcl === AclEdit || effectiveAcl === AclAdmin) {
                let unchanged = true;
                if (this._applyingChange !== this.fieldKey && removeSelection(json) !== removeSelection(curProto?.Data)) {
                    this._applyingChange = this.fieldKey;
                    (curText !== Cast(this.dataDoc[this.fieldKey], RichTextField)?.Text) && (this.dataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now())));
                    if ((!curTemp && !curProto) || curText || json.includes("dash")) { // if no template, or there's text that didn't come from the layout template, write it to the document. (if this is driven by a template, then this overwrites the template text which is intended)
                        if (removeSelection(json) !== removeSelection(curLayout?.Data)) {
                            !curText && tx.storedMarks?.filter(m => m.type.name === "pFontSize").map(m => Doc.UserDoc().fontSize = this.layoutDoc._fontSize = (m.attrs.fontSize + "px"));
                            !curText && tx.storedMarks?.filter(m => m.type.name === "pFontFamily").map(m => Doc.UserDoc().fontFamily = this.layoutDoc._fontFamily = m.attrs.fontFamily);
                            this.dataDoc[this.props.fieldKey] = new RichTextField(json, curText);
                            this.dataDoc[this.props.fieldKey + "-noTemplate"] = true;//(curTemp?.Text || "") !== curText; // mark the data field as being split from the template if it has been edited
                            ScriptCast(this.layoutDoc.onTextChanged, null)?.script.run({ this: this.layoutDoc, self: this.rootDoc, text: curText });
                            unchanged = false;
                        }
                    } else { // if we've deleted all the text in a note driven by a template, then restore the template data
                        this.dataDoc[this.props.fieldKey] = undefined;
                        this._editorView.updateState(EditorState.fromJSON(this.config, JSON.parse((curProto || curTemp).Data)));
                        this.dataDoc[this.props.fieldKey + "-noTemplate"] = undefined; // mark the data field as not being split from any template it might have
                        unchanged = false;
                    }
                    this._applyingChange = "";
                    if (!unchanged) {
                        this.updateTitle();
                        this.tryUpdateScrollHeight();
                    }
                }
            } else {
                const jsonstring = Cast(this.dataDoc[this.fieldKey], RichTextField)?.Data!;
                if (jsonstring) {
                    const json = JSON.parse(jsonstring);
                    json.selection = state.toJSON().selection;
                    this._editorView.updateState(EditorState.fromJSON(this.config, json));
                }
            }
            if (window.getSelection()?.isCollapsed) AnchorMenu.Instance.fadeOut(true);
        }
    }

    // for inserting timestamps 
    insertTime = () => {
        let linkTime;
        let linkAnchor;
        DocListCast(this.dataDoc.links).forEach((l, i) => {
            const anchor = (l.anchor1 as Doc).annotationOn ? l.anchor1 as Doc : (l.anchor2 as Doc).annotationOn ? (l.anchor2 as Doc) : undefined;
            if (anchor && (anchor.annotationOn as Doc).audioState === "recording") {
                linkTime = NumCast(anchor._timecodeToShow /* audioStart */);
                linkAnchor = anchor;
            }
        });
        if (this._editorView && linkTime) {
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

            const path = (this._editorView.state.selection.$from as any).path;
            if (linkAnchor && path[path.length - 3].type !== this._editorView.state.schema.nodes.code_block) {
                const time = linkTime + Date.now() / 1000 - this._recordingStart / 1000;
                this._break = false;
                const from = state.selection.from;
                const value = this._editorView.state.schema.nodes.audiotag.create({ timeCode: time, audioId: linkAnchor[Id] });
                const replaced = this._editorView.state.tr.insert(from - 1, value);
                this._editorView.dispatch(replaced.setSelection(new TextSelection(replaced.doc.resolve(from + 1))));
            }
        }
    }

    updateTitle = () => {
        if (!this.props.dontRegisterView &&  // (this.props.Document.isTemplateForField === "text" || !this.props.Document.isTemplateForField) && // only update the title if the data document's data field is changing
            StrCast(this.dataDoc.title).startsWith("-") && this._editorView && !this.dataDoc["title-custom"] &&
            (Doc.LayoutFieldKey(this.rootDoc) === this.fieldKey || this.fieldKey === "text")) {
            let node = this._editorView.state.doc;
            while (node.firstChild && node.firstChild.type.name !== "text") node = node.firstChild;
            const str = node.textContent;
            this.dataDoc.title = "-" + str.substr(0, Math.min(40, str.length)) + (str.length > 40 ? "..." : "");
        }
    }

    // needs a better API for taking in a set of words with target documents instead of just one target
    hyperlinkTerms = (terms: string[], target: Doc) => {
        if (this._editorView && (this._editorView as any).docView && terms.some(t => t)) {
            const res1 = terms.filter(t => t).map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
            let tr = this._editorView.state.tr;
            const flattened1: TextSelection[] = [];
            res1.map(r => r.map(h => flattened1.push(h)));
            flattened1.forEach((flat, i) => {
                const flattened: TextSelection[] = [];
                const res = terms.filter(t => t).map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
                res.map(r => r.map(h => flattened.push(h)));
                this._searchIndex = ++this._searchIndex > flattened.length - 1 ? 0 : this._searchIndex;
                const anchor = Docs.Create.TextanchorDocument();
                const alink = DocUtils.MakeLink({ doc: anchor }, { doc: target }, "automatic")!;
                const allAnchors = [{ href: Utils.prepend("/doc/" + anchor[Id]), title: "a link", anchorId: anchor[Id] }];
                const link = this._editorView!.state.schema.marks.linkAnchor.create({ allAnchors, title: "auto link", location });
                tr = tr.addMark(flattened[i].from, flattened[i].to, link);
            });
            this._editorView.dispatch(tr);
        }
    }
    highlightSearchTerms = (terms: string[], backward: boolean) => {
        if (this._editorView && (this._editorView as any).docView && terms.some(t => t)) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            const res = terms.filter(t => t).map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
            const length = res[0].length;
            let tr = this._editorView.state.tr;
            const flattened: TextSelection[] = [];
            res.map(r => r.map(h => flattened.push(h)));
            this._searchIndex = ++this._searchIndex > flattened.length - 1 ? 0 : this._searchIndex;
            if (backward === true) {
                if (this._searchIndex > 1) {
                    this._searchIndex += -2;
                }
                else if (this._searchIndex === 1) {
                    this._searchIndex = length - 1;
                }
                else if (this._searchIndex === 0 && length !== 1) {
                    this._searchIndex = length - 2;
                }

            }

            const lastSel = Math.min(flattened.length - 1, this._searchIndex);
            flattened.forEach((h: TextSelection, ind: number) => tr = tr.addMark(h.from, h.to, ind === lastSel ? activeMark : mark));
            flattened[lastSel] && this._editorView.dispatch(tr.setSelection(new TextSelection(tr.doc.resolve(flattened[lastSel].from), tr.doc.resolve(flattened[lastSel].to))).scrollIntoView());
        }
    }

    unhighlightSearchTerms = () => {
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
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.annoDragData) de.complete.annoDragData.dropDocCreator = this.getAnchor;
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
                target._fitToBox = true;
                const node = schema.nodes.dashDoc.create({
                    width: target[WidthSym](), height: target[HeightSym](),
                    title: "dashDoc",
                    docid: target[Id],
                    float: "right"
                });
                const view = this._editorView!;
                view.dispatch(view.state.tr.insert(view.posAtCoords({ left: de.x, top: de.y })!.pos, node));
                e.stopPropagation();
            } // otherwise, fall through to outer collection to handle drop
        }
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
            const regexp = new RegExp(find.replace("*", ""), "i");
            if (regexp) {
                while (ep && (foundAt = node.textContent.slice(index).search(regexp)) > -1) {
                    const sel = new TextSelection(pm.state.doc.resolve(ep.from + index + foundAt + 1), pm.state.doc.resolve(ep.from + index + foundAt + find.length + 1));
                    ret.push(sel);
                    index = index + foundAt + find.length;
                }
            }
        } else {
            node.content.forEach((child, i) => ret = ret.concat(this.findInNode(pm, child, find)));
        }
        return ret;
    }

    updateHighlights = () => {
        clearStyleSheetRules(FormattedTextBox._userStyleSheet);
        if (FormattedTextBox._highlights.indexOf("Audio Tags") === -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "audiotag", { display: "none" }, "");
        }
        if (FormattedTextBox._highlights.indexOf("Text from Others") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-remote", { background: "yellow" });
        }
        if (FormattedTextBox._highlights.indexOf("My Text") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UM-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { background: "moccasin" });
        }
        if (FormattedTextBox._highlights.indexOf("Todo Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UT-" + "todo", { outline: "black solid 1px" });
        }
        if (FormattedTextBox._highlights.indexOf("Important Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UT-" + "important", { "font-size": "larger" });
        }
        if (FormattedTextBox._highlights.indexOf("Disagree Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UT-" + "disagree", { "text-decoration": "line-through" });
        }
        if (FormattedTextBox._highlights.indexOf("Ignore Items") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "UT-" + "ignore", { "font-size": "1" });
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
            () => setTimeout(action(() => {
                const prevWidth = this.sidebarWidth();
                this.layoutDoc._showSidebar = ((this.layoutDoc._sidebarWidthPercent = StrCast(this.layoutDoc._sidebarWidthPercent, "0%") === "0%" ? "50%" : "0%")) !== "0%";
                this.layoutDoc._width = this.layoutDoc._showSidebar ? NumCast(this.layoutDoc._width) * 2 : Math.max(20, NumCast(this.layoutDoc._width) - prevWidth);
            })), false);
    }
    sidebarMove = (e: PointerEvent, down: number[], delta: number[]) => {
        const bounds = this._ref.current!.getBoundingClientRect();
        this.layoutDoc._sidebarWidthPercent = "" + 100 * Math.max(0, (1 - (e.clientX - bounds.left) / bounds.width)) + "%";
        this.layoutDoc._showSidebar = this.layoutDoc._sidebarWidthPercent !== "0%";
        e.preventDefault();
        return false;
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;

        const changeItems: ContextMenuProps[] = [];
        changeItems.push({ description: "plain", event: undoBatch(() => Doc.setNativeView(this.rootDoc)), icon: "eye" });
        const noteTypesDoc = Cast(Doc.UserDoc()["template-notes"], Doc, null);
        DocListCast(noteTypesDoc?.data).forEach(note => {
            changeItems.push({
                description: StrCast(note.title), event: undoBatch(() => {
                    Doc.setNativeView(this.rootDoc);
                    DocUtils.makeCustomViewClicked(this.rootDoc, Docs.Create.TreeDocument, StrCast(note.title), note);
                }), icon: "eye"
            });
        });
        !Doc.UserDoc().noviceMode && changeItems.push({ description: "FreeForm", event: () => DocUtils.makeCustomViewClicked(this.rootDoc, Docs.Create.FreeformDocument, "freeform"), icon: "eye" });
        const highlighting: ContextMenuProps[] = [];
        const noviceHighlighting = ["Audio Tags", "My Text", "Text from Others"];
        const expertHighlighting = [...noviceHighlighting, "Important Items", "Ignore Items", "Disagree Items", "By Recent Minute", "By Recent Hour"];
        (Doc.UserDoc().noviceMode ? noviceHighlighting : expertHighlighting).forEach(option =>
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

        const uicontrols: ContextMenuProps[] = [];
        uicontrols.push({ description: `${FormattedTextBox._canAnnotate ? "Hide" : "Show"} Annotation Bar`, event: () => FormattedTextBox._canAnnotate = !FormattedTextBox._canAnnotate, icon: "expand-arrows-alt" });
        uicontrols.push({ description: !this.Document._noSidebar ? "Hide Sidebar Handle" : "Show Sidebar Handle", event: () => this.layoutDoc._noSidebar = !this.layoutDoc._noSidebar, icon: "expand-arrows-alt" });
        uicontrols.push({ description: `${this.layoutDoc._showAudio ? "Hide" : "Show"} Dictation Icon`, event: () => this.layoutDoc._showAudio = !this.layoutDoc._showAudio, icon: "expand-arrows-alt" });
        uicontrols.push({ description: "Show Highlights...", noexpand: true, subitems: highlighting, icon: "hand-point-right" });
        !Doc.UserDoc().noviceMode && uicontrols.push({
            description: "Broadcast Message", event: () => DocServer.GetRefField("rtfProto").then(proto =>
                proto instanceof Doc && (proto.BROADCAST_MESSAGE = Cast(this.rootDoc[this.fieldKey], RichTextField)?.Text)), icon: "expand-arrows-alt"
        });
        cm.addItem({ description: "UI Controls...", subitems: uicontrols, icon: "asterisk" });

        const appearance = cm.findByDescription("Appearance...");
        const appearanceItems = appearance && "subitems" in appearance ? appearance.subitems : [];
        appearanceItems.push({ description: "Change Perspective...", noexpand: true, subitems: changeItems, icon: "external-link-alt" });
        // this.rootDoc.isTemplateDoc && appearanceItems.push({ description: "Make Default Layout", event: async () => Doc.UserDoc().defaultTextLayout = new PrefetchProxy(this.rootDoc), icon: "eye" });
        !Doc.UserDoc().noviceMode && appearanceItems.push({
            description: "Make Default Layout", event: () => {
                if (!this.layoutDoc.isTemplateDoc) {
                    const title = StrCast(this.rootDoc.title);
                    this.rootDoc.title = "text";
                    this.rootDoc.isTemplateDoc = makeTemplate(this.rootDoc, true, title);
                } else if (!this.rootDoc.isTemplateDoc) {
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
                        this.rootDoc.backgroundColor = Cast(this.layoutDoc.backgroundColor, "string", null);
                    }, 10);
                }
                Doc.UserDoc().defaultTextLayout = new PrefetchProxy(this.rootDoc);
                Doc.AddDocToList(Cast(Doc.UserDoc()["template-notes"], Doc, null), "data", this.rootDoc);
            }, icon: "eye"
        });
        cm.addItem({ description: "Appearance...", subitems: appearanceItems, icon: "eye" });

        const options = cm.findByDescription("Options...");
        const optionItems = options && "subitems" in options ? options.subitems : [];
        optionItems.push({ description: !this.Document._singleLine ? "Make Single Line" : "Make Multi Line", event: () => this.layoutDoc._singleLine = !this.layoutDoc._singleLine, icon: "expand-arrows-alt" });
        optionItems.push({ description: `${this.Document._autoHeight ? "Lock" : "Auto"} Height`, event: () => this.layoutDoc._autoHeight = !this.layoutDoc._autoHeight, icon: "plus" });
        !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "eye" });
        this._downX = this._downY = Number.NaN;
    }

    recordDictation = () => {
        DictationManager.Controls.listen({
            interimHandler: this.setDictationContent,
            continuous: { indefinite: false },
        }).then(results => {
            if (results && [DictationManager.Controls.Infringed].includes(results)) {
                DictationManager.Controls.stop();
            }
        });
    }
    stopDictation = (abort: boolean) => DictationManager.Controls.stop(!abort);

    setDictationContent = (value: string) => {
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
            const from = state.selection.from;
            this._break = false;
            if (this.props.Document.recordingStart) {
                const recordingStart = DateCast(this.props.Document.recordingStart)?.date.getTime();
                value = "" + (mark.attrs.modified * 1000 - recordingStart) / 1000 + value;
            }
            const tr = state.tr.insertText(value).addMark(from, from + value.length + 1, mark);
            this._editorView.dispatch(tr.setSelection(TextSelection.create(tr.doc, from, from + value.length + 1)));
        }
    }

    makeLinkAnchor(anchorDoc?: Doc, location?: string, targetHref?: string, title?: string) {
        const state = this._editorView?.state;
        if (state) {
            const sel = state.selection;
            const splitter = state.schema.marks.splitter.create({ id: Utils.GenerateGuid() });
            let tr = state.tr.addMark(sel.from, sel.to, splitter);
            if (sel.from !== sel.to) {
                const anchor = anchorDoc ?? Docs.Create.TextanchorDocument();
                const href = targetHref ?? Utils.prepend("/doc/" + anchor[Id]);
                if (anchor !== anchorDoc) this.addDocument(anchor);
                tr.doc.nodesBetween(sel.from, sel.to, (node: any, pos: number, parent: any) => {
                    if (node.firstChild === null && node.marks.find((m: Mark) => m.type.name === schema.marks.splitter.name)) {
                        const allAnchors = [{ href, title, anchorId: anchor[Id] }];
                        allAnchors.push(...(node.marks.find((m: Mark) => m.type.name === schema.marks.linkAnchor.name)?.attrs.allAnchors ?? []));
                        const link = state.schema.marks.linkAnchor.create({ allAnchors, title, location });
                        tr = tr.addMark(pos, pos + node.nodeSize, link);
                    }
                });
                this.dataDoc[ForceServerWrite] = this.dataDoc[UpdatingFromServer] = true;  // need to allow permissions for adding links to readonly/augment only documents
                this._editorView!.dispatch(tr.removeMark(sel.from, sel.to, splitter));
                this.dataDoc[UpdatingFromServer] = this.dataDoc[ForceServerWrite] = false;
                Doc.GetProto(anchor).title = this._editorView?.state.doc.textBetween(sel.from, sel.to);
                return anchor;
            }
            return anchorDoc ?? this.rootDoc;
        }
        return anchorDoc ?? this.rootDoc;
    }

    scrollFocus = (doc: Doc, smooth: boolean) => {
        const anchorId = doc[Id];
        const findAnchorFrag = (frag: Fragment, editor: EditorView) => {
            const nodes: Node[] = [];
            let hadStart = start !== 0;
            frag.forEach((node, index) => {
                const examinedNode = findAnchorNode(node, editor);
                if (examinedNode?.node.textContent) {
                    nodes.push(examinedNode.node);
                    !hadStart && (start = index + examinedNode.start);
                    hadStart = true;
                }
            });
            return { frag: Fragment.fromArray(nodes), start };
        };
        const findAnchorNode = (node: Node, editor: EditorView) => {
            if (!node.isText) {
                const content = findAnchorFrag(node.content, editor);
                return { node: node.copy(content.frag), start: content.start };
            }
            const marks = [...node.marks];
            const linkIndex = marks.findIndex(mark => mark.type === editor.state.schema.marks.linkAnchor);
            return linkIndex !== -1 && marks[linkIndex].attrs.allAnchors.find((item: { href: string }) => anchorId === item.href.replace(/.*\/doc\//, "")) ? { node, start: 0 } : undefined;
        };

        let start = 0;
        if (this._editorView && anchorId) {
            const editor = this._editorView;
            const ret = findAnchorFrag(editor.state.doc.content, editor);

            if (ret.frag.size > 2 && ret.start >= 0) {
                smooth && (this._focusSpeed = 500);
                let selection = TextSelection.near(editor.state.doc.resolve(ret.start)); // default to near the start
                if (ret.frag.firstChild) {
                    selection = TextSelection.between(editor.state.doc.resolve(ret.start), editor.state.doc.resolve(ret.start + ret.frag.firstChild.nodeSize)); // bcz: looks better to not have the target selected
                }
                editor.dispatch(editor.state.tr.setSelection(new TextSelection(selection.$from, selection.$from)).scrollIntoView());
                const escAnchorId = anchorId[0] >= '0' && anchorId[0] <= '9' ? `\\3${anchorId[0]} ${anchorId.substr(1)}` : anchorId;
                addStyleSheetRule(FormattedTextBox._highlightStyleSheet, `${escAnchorId}`, { background: "yellow" });
                setTimeout(() => this._focusSpeed = undefined, this._focusSpeed);
                setTimeout(() => clearStyleSheetRules(FormattedTextBox._highlightStyleSheet), Math.max(this._focusSpeed || 0, 1500));
            }
        }

        return this._focusSpeed;
    }

    // if the scroll height has changed and we're in autoHeight mode, then we need to update the textHeight component of the doc.
    // Since we also monitor all component height changes, this will update the document's height.
    resetNativeHeight = (scrollHeight: number) => {
        const nh = this.layoutDoc.isTemplateForField ? 0 : NumCast(this.layoutDoc._nativeHeight);
        this.rootDoc[this.fieldKey + "-height"] = scrollHeight + this.titleHeight;
        if (nh) this.layoutDoc._nativeHeight = scrollHeight;
    }

    componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.
        this.props.contentsActive?.(this.active);
        this._cachedLinks = DocListCast(this.Document.links);
        this._disposers.autoHeight = reaction(() => ({ scrollHeight: this.scrollHeight, autoHeight: this.autoHeight, width: NumCast(this.layoutDoc._width) }),
            ({ width, autoHeight, scrollHeight }) => width && autoHeight && this.resetNativeHeight(scrollHeight)
        );
        this._disposers.componentHeights = reaction(  // set the document height when one of the component heights changes and autoHeight is on
            () => ({ sidebarHeight: this.sidebarHeight, textHeight: this.textHeight, autoHeight: this.autoHeight }),
            ({ sidebarHeight, textHeight, autoHeight }) => autoHeight && this.props.setHeight(Math.max(sidebarHeight, textHeight)));
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
                    this.dataDoc[GoogleRef] && this.dataDoc.googleDocUnchanged && runInAction(() => instance.isAnimatingFetch = true);
                }
            }
        );
        this._disposers.editorState = reaction(
            () => {
                const whichDoc = !this.dataDoc || !this.layoutDoc ? undefined :
                    this.dataDoc?.[this.props.fieldKey + "-noTemplate"] || !this.layoutDoc[this.props.fieldKey] ?
                        this.dataDoc : this.layoutDoc;
                return !whichDoc ? undefined : { data: Cast(whichDoc[this.props.fieldKey], RichTextField, null), str: StrCast(whichDoc[this.props.fieldKey]) };
            },
            incomingValue => {
                if (this._editorView && this._applyingChange !== this.fieldKey) {
                    if (incomingValue?.data) {
                        const updatedState = JSON.parse(incomingValue.data.Data);
                        if (JSON.stringify(this._editorView.state.toJSON()) !== JSON.stringify(updatedState)) {
                            this._editorView.updateState(EditorState.fromJSON(this.config, updatedState));
                            this.tryUpdateScrollHeight();
                        }
                    } else if (incomingValue?.str) {
                        selectAll(this._editorView.state, tx => this._editorView?.dispatch(tx.insertText(incomingValue.str)));
                    }
                }
            },
        );
        this._disposers.pullDoc = reaction(
            () => this.props.Document[Pulls],
            () => {
                if (!DocumentButtonBar.hasPulledHack) {
                    DocumentButtonBar.hasPulledHack = true;
                    this.pullFromGoogleDoc(this.dataDoc.googleDocUnchanged ? this.checkState : this.updateState);
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

        this.setupEditor(this.config, this.props.fieldKey);

        this._disposers.search = reaction(() => Doc.IsSearchMatch(this.rootDoc),
            search => search ? this.highlightSearchTerms([Doc.SearchQuery()], search.searchMatch < 0) : this.unhighlightSearchTerms(),
            { fireImmediately: Doc.IsSearchMatchUnmemoized(this.rootDoc) ? true : false });

        this._disposers.selected = reaction(() => this.props.isSelected(),
            action((selected) => {
                this._recording = false;
                if (RichTextMenu.Instance?.view === this._editorView && !selected) {
                    RichTextMenu.Instance?.updateMenu(undefined, undefined, undefined);
                }
            }));

        if (!this.props.dontRegisterView) {
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
        }
        var quickScroll: string | undefined = "";
        this._disposers.scroll = reaction(() => NumCast(this.layoutDoc._scrollTop),
            pos => {
                if (!this._ignoreScroll && this._scrollRef.current) {
                    const viewTrans = quickScroll ?? StrCast(this.Document._viewTransition);
                    const durationMiliStr = viewTrans.match(/([0-9]*)ms/);
                    const durationSecStr = viewTrans.match(/([0-9.]*)s/);
                    const duration = durationMiliStr ? Number(durationMiliStr[1]) : durationSecStr ? Number(durationSecStr[1]) * 1000 : 0;
                    if (duration) {
                        smoothScroll(duration, this._scrollRef.current, Math.abs(pos || 0));
                    } else {
                        this._scrollRef.current.scrollTo({ top: pos });
                    }
                }
            }, { fireImmediately: true }
        );
        quickScroll = undefined;
        this.tryUpdateScrollHeight();
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
                    dataDoc.googleDocUnchanged = pushSuccess;
                    DocumentButtonBar.Instance.startPushOutcome(pushSuccess);
                }
            };
            const undo = () => {
                if (exportState && reference) {
                    const content: GoogleApiClientUtils.Docs.Content = {
                        text: exportState.text,
                        requests: []
                    };
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
        exportState && UndoManager.RunInBatch(() => handler(exportState, dataDoc), Pulls);
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
            this.dataDoc["title-custom"] = true;
            dataDoc.googleDocUnchanged = true;
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
            dataDoc.googleDocUnchanged = unchanged;
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
            const link = view.state.schema.mark(view.state.schema.marks.linkAnchor, { allLinks, location: "add:right", title, docref: true });
            marks.splice(linkIndex === -1 ? 0 : linkIndex, 1, link);
            return node.mark(marks);
        }
    }

    isActiveTab(el: Element | null | undefined) {
        while (el && el !== document.body) {
            if (getComputedStyle(el).display === "none") return false;
            el = el.parentNode as any;
        }
        return true;
    }

    richTextMenuPlugin() {
        const self = this;
        return new Plugin({
            view(newView) {
                runInAction(() => self.props.isSelected(true) && RichTextMenu.Instance && (RichTextMenu.Instance.view = newView));
                return new RichTextMenuPlugin({ editorProps: this.props });
            }
        });
    }
    setupEditor(config: any, fieldKey: string) {
        const curText = Cast(this.dataDoc[this.props.fieldKey], RichTextField, null);
        const rtfField = Cast((!curText?.Text && this.layoutDoc[this.props.fieldKey]) || this.dataDoc[fieldKey], RichTextField);
        if (this.ProseRef) {
            const self = this;
            this._editorView?.destroy();
            this._editorView = new EditorView(this.ProseRef, {
                state: rtfField?.Data ? EditorState.fromJSON(config, JSON.parse(rtfField.Data)) : EditorState.create(config),
                handleScrollToSelection: (editorView) => {
                    const docPos = editorView.coordsAtPos(editorView.state.selection.from);
                    const viewRect = self._ref.current!.getBoundingClientRect();
                    const scrollRef = self._scrollRef.current;
                    if ((docPos.top < viewRect.top || docPos.top > viewRect.bottom) && scrollRef) {
                        const scrollPos = scrollRef.scrollTop + (docPos.top - viewRect.top) * self.props.ScreenToLocalTransform().Scale;
                        if (this._focusSpeed !== undefined) {
                            scrollPos && smoothScroll(this._focusSpeed, scrollRef, scrollPos);
                        } else {
                            scrollRef.scrollTo({ top: scrollPos });
                        }
                    }
                    return true;
                },
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    dashComment(node, view, getPos) { return new DashDocCommentView(node, view, getPos); },
                    dashDoc(node, view, getPos) { return new DashDocView(node, view, getPos, self); },
                    dashField(node, view, getPos) { return new DashFieldView(node, view, getPos, self); },
                    equation(node, view, getPos) { return new EquationView(node, view, getPos, self); },
                    summary(node, view, getPos) { return new SummaryView(node, view, getPos); },
                    ordered_list(node, view, getPos) { return new OrderedListView(); },
                    footnote(node, view, getPos) { return new FootnoteView(node, view, getPos); }
                },
                clipboardTextSerializer: this.clipboardTextSerializer,
                handlePaste: this.handlePaste,
            });
            const startupText = !rtfField && this._editorView && Field.toString(this.dataDoc[fieldKey] as Field);
            if (startupText) {
                const { state: { tr }, dispatch } = this._editorView;
                dispatch(tr.insertText(startupText));
            }
            (this._editorView as any).TextView = this;
        }

        const selectOnLoad = this.rootDoc[Id] === FormattedTextBox.SelectOnLoad && (!LightboxView.LightboxDoc || LightboxView.IsLightboxDocView(this.props.docViewPath()));
        if (selectOnLoad && !this.props.dontRegisterView && !this.props.dontSelectOnLoad && this.isActiveTab(this.ProseRef)) {
            FormattedTextBox.SelectOnLoad = "";
            this.props.select(false);
            if (FormattedTextBox.SelectOnLoadChar && this._editorView) {
                const $from = this._editorView.state.selection.anchor ? this._editorView.state.doc.resolve(this._editorView.state.selection.anchor - 1) : undefined;
                const mark = schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(Date.now() / 1000) });
                const curMarks = this._editorView.state.storedMarks ?? $from?.marksAcross(this._editorView.state.selection.$head) ?? [];
                const storedMarks = [...curMarks.filter(m => m.type !== mark.type), mark];
                const tr = this._editorView.state.tr.setStoredMarks(storedMarks).insertText(FormattedTextBox.SelectOnLoadChar, this._editorView.state.doc.content.size - 1, this._editorView.state.doc.content.size).setStoredMarks(storedMarks);
                this._editorView.dispatch(tr.setSelection(new TextSelection(tr.doc.resolve(tr.doc.content.size))));
                FormattedTextBox.SelectOnLoadChar = "";
            } else if (curText?.Text && !FormattedTextBox.DontSelectInitialText) {
                selectAll(this._editorView!.state, this._editorView?.dispatch);
                this.startUndoTypingBatch();
            }
            FormattedTextBox.DontSelectInitialText = false;
        }
        selectOnLoad && this._editorView!.focus();
        // add user mark for any first character that was typed since the user mark that gets set in KeyPress won't have been called yet.
        if (!this._editorView!.state.storedMarks?.some(mark => mark.type === schema.marks.user_mark)) {
            this._editorView!.state.storedMarks = [...(this._editorView!.state.storedMarks ?? []), schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(Date.now() / 1000) })];
        }
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        this.endUndoTypingBatch();
        this.unhighlightSearchTerms();
        this._editorView?.destroy();
        RichTextMenu.Instance?.TextView === this && RichTextMenu.Instance.updateMenu(undefined, undefined, undefined);
        FormattedTextBoxComment.tooltip && (FormattedTextBoxComment.tooltip.style.display = "none");
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this.tryUpdateScrollHeight(); // if a doc a fitwidth doc is being viewed in different context (eg freeform & lightbox), then it will have conflicting heights.  so when the doc is clicked on, we want to make sure it has the appropriate height for the selected view.
        if ((e.target as any).tagName === "AUDIOTAG") {
            e.preventDefault();
            e.stopPropagation();
            const time = (e.target as any)?.dataset?.timecode || 0;
            const audioid = (e.target as any)?.dataset?.audioid || 0;
            DocServer.GetRefField(audioid).then(anchor => {
                if (anchor instanceof Doc) {
                    const audiodoc = anchor.annotationOn as Doc;
                    audiodoc._triggerAudio = Number(time);
                    !DocumentManager.Instance.getDocumentView(audiodoc) && this.props.addDocTab(audiodoc, "add:bottom");
                }
            });
        }
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
        this._downEvent = true;
        FormattedTextBoxComment.textBox = this;
        if (e.button === 0 && (this.props.rootSelected(true) || this.props.isSelected(true)) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.clientX < this.ProseRef!.getBoundingClientRect().right) { // stop propagation if not in sidebar
                // bcz: Change. drag selecting requires that preventDefault is NOT called.  This used to happen in DocumentView,
                //      but that's changed, so this shouldn't be needed.
                //e.stopPropagation();  // if the text box is selected, then it consumes all down events
                document.addEventListener("pointerup", this.onSelectEnd);
                document.addEventListener("pointermove", this.onSelectMove);
            }
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
    }
    onSelectMove = (e: PointerEvent) => e.stopPropagation();
    onSelectEnd = (e: PointerEvent) => {
        document.removeEventListener("pointerup", this.onSelectEnd);
        document.removeEventListener("pointermove", this.onSelectMove);
    }
    onPointerUp = (e: React.PointerEvent): void => {
        if (!this._editorView?.state.selection.empty && FormattedTextBox._canAnnotate) this.setupAnchorMenu();
        if (!this._downEvent) return;
        this._downEvent = false;
        if ((e.nativeEvent as any).formattedHandled) {
            console.log("handled");
        }
        if (!(e.nativeEvent as any).formattedHandled && this.active(true)) {
            const editor = this._editorView!;
            const pcords = editor.posAtCoords({ left: e.clientX, top: e.clientY });
            !this.props.isSelected(true) && editor.dispatch(editor.state.tr.setSelection(new TextSelection(editor.state.doc.resolve(pcords?.pos || 0))));
            let target = (e.target as any).parentElement; // hrefs are stored on the database of the <a> node that wraps the hyerlink <span>
            while (target && !target.dataset?.targethrefs) target = target.parentElement;
            FormattedTextBoxComment.update(this, editor, undefined, target?.dataset?.targethrefs);
        }
        (e.nativeEvent as any).formattedHandled = true;

        if (e.buttons === 1 && this.props.isSelected(true) && !e.altKey) {
            e.stopPropagation();
        }
    }
    @action
    onDoubleClick = (e: React.MouseEvent): void => {
        FormattedTextBoxComment.textBox = this;
        if (e.button === 0 && this.props.isSelected(true) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.clientX < this.ProseRef!.getBoundingClientRect().right) { // stop propagation if not in sidebar
                e.stopPropagation();  // if the text box is selected, then it consumes all click events
            }
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
        FormattedTextBoxComment.Hide();

        (e.nativeEvent as any).formattedHandled = true;

        if (e.buttons === 1 && this.props.isSelected(true) && !e.altKey) {
            e.stopPropagation();
        }
    }
    @action
    onFocused = (e: React.FocusEvent): void => {
        FormattedTextBox.FocusedBox = this;
        //applyDevTools.applyDevTools(this._editorView);

        // see if we need to preserve the insertion point
        const prosediv = this.ProseRef?.children?.[0] as any;
        const keeplocation = prosediv?.keeplocation;
        prosediv && (prosediv.keeplocation = undefined);
        const pos = this._editorView?.state.selection.$from.pos || 1;
        keeplocation && setTimeout(() => this._editorView?.dispatch(this._editorView?.state.tr.setSelection(TextSelection.create(this._editorView.state.doc, pos))));

        this._editorView && RichTextMenu.Instance?.updateMenu(this._editorView, undefined, this.props);
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        // if a text note is selected and scrollable, stop event to prevent, say, outer collection from zooming.
        if ((this.props.rootSelected(true) || this.props.isSelected(true)) || e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
            e.stopPropagation();
        }
    }
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
                const boundsRect = lastNode?.getBoundingClientRect();
                if (e.clientX > boundsRect.left && e.clientX < boundsRect.right &&
                    e.clientY > boundsRect.bottom) { // if we clicked below the last prosemirror div, then set the selection to be the end of the document
                    this._editorView?.focus();
                    this._editorView!.dispatch(this._editorView!.state.tr.setSelection(TextSelection.create(this._editorView!.state.doc, this._editorView!.state.doc.content.size)));
                }
            } else if ([this._editorView!.state.schema.nodes.ordered_list, this._editorView!.state.schema.nodes.listItem].includes(node?.type) &&
                node !== (this._editorView!.state.selection as NodeSelection)?.node && pcords) {
                this._editorView!.dispatch(this._editorView!.state.tr.setSelection(NodeSelection.create(this._editorView!.state.doc, pcords.pos)));
            }
        }
        if ((e.nativeEvent as any).formattedHandled) {
            e.stopPropagation();
            return;
        }
        this.props.isSelected(true) && ((e.nativeEvent as any).formattedHandled = true);

        if (this.props.isSelected(true)) { // if text box is selected, then it consumes all click events
            // e.stopPropagation();  // bcz: not sure why this was here.  We need to allow the DocumentView to get clicks to process doubleClicks
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
                        const tr = this._editorView.state.tr.setNodeMarkup(clickPos.pos, listNode.type, { ...listNode.attrs, visibility: !listNode.attrs.visibility });
                        this._editorView.dispatch(tr.setSelection(TextSelection.create(tr.doc, clickPos.pos)));
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
                if (!(e as any).formattedHandled) {
                    originalUpHandler(e);
                    (e as any).formattedHandled = true;
                } else {
                    console.log("prehandled");
                }
            };
            view.root.addEventListener("mouseup", view.mouseDown.up);
        }
    }
    startUndoTypingBatch() {
        !this._undoTyping && (this._undoTyping = UndoManager.StartBatch("undoTyping"));
    }
    public endUndoTypingBatch() {
        const wasUndoing = this._undoTyping;
        this._undoTyping?.end();
        this._undoTyping = undefined;
        return wasUndoing;
    }
    onBlur = (e: any) => {
        if (RichTextMenu.Instance?.view === this._editorView && !this.props.isSelected(true)) {
            RichTextMenu.Instance?.updateMenu(undefined, undefined, undefined);
        }
        FormattedTextBox._hadSelection = window.getSelection()?.toString() !== "";
        this.endUndoTypingBatch();

        FormattedTextBox.LiveTextUndo?.end();
        FormattedTextBox.LiveTextUndo = undefined;

        const state = this._editorView!.state;
        const curText = state.doc.textBetween(0, state.doc.content.size, " \n");
        if (this.layoutDoc.sidebarViewType === "translation" && !this.fieldKey.includes("translation") && curText.endsWith(" ") && curText !== this._lastText) {
            try {
                translateGoogleApi(curText, { from: "en", to: "es", }).then((result1: any) => {
                    setTimeout(() => translateGoogleApi(result1[0], { from: "es", to: "en", }).then((result: any) => {
                        this.dataDoc[this.fieldKey + "-translation"] = result1 + "\r\n\r\n" + result[0];
                    }), 1000);
                });
            } catch (e) { console.log(e.message); }
            this._lastText = curText;
        }
    }
    onKeyDown = (e: React.KeyboardEvent) => {
        // single line text boxes need to pass through tab/enter/backspace so that their containers can respond (eg, an outline container)
        if (this.rootDoc._singleLine && ((e.key === "Backspace" && !this.dataDoc[this.fieldKey]?.Text) || ["Tab", "Enter"].includes(e.key))) {
            return;
        }
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
        e.stopPropagation();
        switch (e.key) {
            case "Escape":
                this._editorView!.dispatch(state.tr.setSelection(TextSelection.create(state.doc, state.selection.from, state.selection.from)));
                (document.activeElement as any).blur?.();
                SelectionManager.DeselectAll();
                RichTextMenu.Instance.updateMenu(undefined, undefined, undefined);
                return;
            case "Enter": this.insertTime();
            case "Tab": e.preventDefault(); break;
            default: if (this._lastTimedMark?.attrs.userid === Doc.CurrentUserEmail) break;
            case " ":
                this._editorView!.dispatch(this._editorView!.state.tr.removeStoredMark(schema.marks.user_mark.create({}))
                    .addStoredMark(schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.floor(Date.now() / 1000) })));
        }
        this.startUndoTypingBatch();
    }
    ondrop = (e: React.DragEvent) => {
        this._editorView!.dispatch(updateBullets(this._editorView!.state.tr, this._editorView!.state.schema));
        e.stopPropagation(); // drag n drop of text within text note will generate a new note if not caughst, as will dragging in from outside of Dash.
    }
    onScroll = (e: React.UIEvent) => {
        if (!LinkDocPreview.LinkInfo && this._scrollRef.current) {
            this._ignoreScroll = true;
            this.layoutDoc._scrollTop = this._scrollRef.current.scrollTop;
            this._ignoreScroll = false;
        }
    }
    tryUpdateScrollHeight() {
        if (!LightboxView.LightboxDoc || LightboxView.IsLightboxDocView(this.props.docViewPath())) {
            const proseHeight = this.ProseRef?.scrollHeight || 0;
            const scrollHeight = this.ProseRef && Math.min(NumCast(this.layoutDoc.docMaxAutoHeight, proseHeight), proseHeight);
            if (scrollHeight && this.props.renderDepth && !this.props.dontRegisterView) {  // if top === 0, then the text box is growing upward (as the overlay caption) which doesn't contribute to the height computation
                const setScrollHeight = () => this.rootDoc[this.fieldKey + "-scrollHeight"] = scrollHeight;
                if (this.rootDoc === this.layoutDoc.doc || this.layoutDoc.resolvedDataDoc) {
                    setScrollHeight();
                } else setTimeout(setScrollHeight, 10); // if we have a template that hasn't been resolved yet, we can't set the height or we'd be setting it on the unresolved template.  So set a timeout and hope its arrived...
            }
        }
    }
    fitToBox = () => this.props.Document._fitToBox;
    sidebarContentScaling = () => (this.props.scaling?.() || 1) * NumCast(this.layoutDoc._viewScale, 1);
    sidebarAddDocument = (doc: Doc | Doc[]) => this.addDocument(doc, this.SidebarKey);
    sidebarMoveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean) => this.moveDocument(doc, targetCollection, addDocument, this.SidebarKey);
    sidebarRemDocument = (doc: Doc | Doc[]) => this.removeDocument(doc, this.SidebarKey);
    setSidebarHeight = (height: number) => this.rootDoc[this.SidebarKey + "-height"] = height;
    sidebarWidth = () => Number(this.sidebarWidthPercent.substring(0, this.sidebarWidthPercent.length - 1)) / 100 * this.props.PanelWidth();
    sidebarScreenToLocal = () => this.props.ScreenToLocalTransform().translate(-(this.props.PanelWidth() - this.sidebarWidth()) / (this.props.scaling?.() || 1), 0).scale(1 / NumCast(this.layoutDoc._viewScale, 1));

    @computed get audioHandle() {
        return <div className="formattedTextBox-dictation" onClick={action(e => this._recording = !this._recording)} >
            <FontAwesomeIcon className="formattedTextBox-audioFont" style={{ color: this._recording ? "red" : "blue", transitionDelay: "0.6s", opacity: this._recording ? 1 : 0.25, }} icon={"microphone"} size="sm" />
        </div>;
    }
    @computed get sidebarHandle() {
        TraceMobx();
        const annotated = DocListCast(this.dataDoc[this.SidebarKey]).filter(d => d?.author).length;
        return (!annotated && !this.active()) ? (null) : <div className="formattedTextBox-sidebar-handle" onPointerDown={this.sidebarDown}
            style={{
                left: `max(0px, calc(100% - ${this.sidebarWidthPercent} ${this.sidebarWidth() ? "- 5px" : "- 10px"}))`,
                background: this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.WidgetColor + (annotated ? ":annotated" : ""))
            }} />;
    }
    @computed get sidebarCollection() {
        const renderComponent = (tag: string) => {
            const ComponentTag = tag === "freeform" ? CollectionFreeFormView : tag === "translation" ? FormattedTextBox : CollectionStackingView;
            return <ComponentTag
                {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                NativeWidth={returnZero}
                NativeHeight={returnZero}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.sidebarWidth}
                xMargin={0}
                yMargin={0}
                chromeStatus={"enabled"}
                scaleField={this.SidebarKey + "-scale"}
                isAnnotationOverlay={false}
                select={emptyFunction}
                active={this.annotationsActive}
                scaling={this.sidebarContentScaling}
                whenActiveChanged={this.whenActiveChanged}
                removeDocument={this.sidebarRemDocument}
                moveDocument={this.sidebarMoveDocument}
                addDocument={this.sidebarAddDocument}
                CollectionView={undefined}
                ScreenToLocalTransform={this.sidebarScreenToLocal}
                renderDepth={this.props.renderDepth + 1}
                setHeight={this.setSidebarHeight}
                fitContentsToDoc={this.fitToBox}
                noSidebar={true}
                fieldKey={this.layoutDoc.sidebarViewType === "translation" ? `${this.fieldKey}-translation` : this.SidebarKey} />;
        };
        return <div className={"formattedTextBox-sidebar" + (CurrentUserUtils.SelectedTool !== InkTool.None ? "-inking" : "")}
            style={{ width: `${this.sidebarWidthPercent}`, backgroundColor: `${this.sidebarColor}` }}>
            {renderComponent(StrCast(this.layoutDoc.sidebarViewType))}
        </div>;
    }
    render() {
        TraceMobx();
        const selected = this.props.isSelected();
        const active = this.active();
        const scale = this.props.hideOnLeave ? 1 : (this.props.scaling?.() || 1) * NumCast(this.layoutDoc._viewScale, 1);
        const rounded = StrCast(this.layoutDoc.borderRounding) === "100%" ? "-rounded" : "";
        const interactive = (CurrentUserUtils.SelectedTool === InkTool.None || SnappingManager.GetIsDragging()) && (this.layoutDoc.z || this.props.layerProvider?.(this.layoutDoc) !== false);
        if (!selected && FormattedTextBoxComment.textBox === this) setTimeout(FormattedTextBoxComment.Hide);
        const minimal = this.props.ignoreAutoHeight;
        const margins = NumCast(this.layoutDoc._yMargin, this.props.yMargin || 0);
        const selPad = Math.min(margins, 10);
        const padding = Math.max(margins + ((selected && !this.layoutDoc._singleLine) || minimal ? -selPad : 0), 0);
        const selPaddingClass = selected && !this.layoutDoc._singleLine && margins >= 10 ? "-selected" : "";
        return (
            <div className="formattedTextBox-cont"
                style={{
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    width: `${100 / scale}%`,
                    height: `${100 / scale}%`,
                    // overflowY: this.layoutDoc._autoHeight ? "hidden" : undefined,
                    ...this.styleFromLayoutString(scale)   // this converts any expressions in the format string to style props.  e.g., <FormattedTextBox height='{this._headerHeight}px' >
                }}>
                <div className={`formattedTextBox-cont`} ref={this._ref}
                    style={{
                        overflow: this.autoHeight ? "hidden" : undefined,
                        height: this.props.height || (this.autoHeight && this.props.renderDepth ? "max-content" : undefined),
                        background: this.props.background ? this.props.background : StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor)),
                        color: this.props.color ? this.props.color : StrCast(this.layoutDoc[this.props.fieldKey + "-color"], this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Color)),
                        pointerEvents: interactive ? undefined : "none",
                        fontSize: this.props.fontSize || Cast(this.layoutDoc._fontSize, "string", null),
                        fontWeight: Cast(this.layoutDoc._fontWeight, "number", null),
                        fontFamily: StrCast(this.layoutDoc._fontFamily, "inherit"),
                    }}
                    onContextMenu={this.specificContextMenu}
                    onKeyDown={this.onKeyDown}
                    onFocus={this.onFocused}
                    onClick={this.onClick}
                    onPointerMove={e => this.hitBulletTargets(e.clientX, e.clientY, e.shiftKey, true)}
                    onBlur={this.onBlur}
                    onPointerUp={this.onPointerUp}
                    onPointerDown={this.onPointerDown}
                    onMouseUp={this.onMouseUp}
                    onWheel={this.onPointerWheel}
                    onDoubleClick={this.onDoubleClick}
                >
                    <div className={`formattedTextBox-outer${selected ? "-selected" : ""}`} ref={this._scrollRef}
                        style={{
                            width: `calc(100% - ${this.sidebarWidthPercent})`,
                            pointerEvents: !active && !SnappingManager.GetIsDragging() ? "none" : undefined,
                            overflow: this.layoutDoc._singleLine ? "hidden" : undefined,
                        }}
                        onScroll={this.onScroll} onDrop={this.ondrop} >
                        <div className={minimal ? "formattedTextBox-minimal" : `formattedTextBox-inner${rounded}${selPaddingClass}`} ref={this.createDropTarget}
                            style={{
                                padding: this.layoutDoc._textBoxPadding ? StrCast(this.layoutDoc._textBoxPadding) : `${padding}px`,
                                pointerEvents: !active && !SnappingManager.GetIsDragging() ? (this.layoutDoc.isLinkButton ? "none" : undefined) : undefined
                            }}
                        />
                    </div>
                    {(this.props.noSidebar || this.Document._noSidebar) || !this.layoutDoc._showSidebar || this.sidebarWidthPercent === "0%" ? (null) : this.sidebarCollection}
                    {(this.props.noSidebar || this.Document._noSidebar) || this.Document._singleLine ? (null) : this.sidebarHandle}
                    {!this.layoutDoc._showAudio ? (null) : this.audioHandle}
                </div>
            </div>
        );
    }
}
