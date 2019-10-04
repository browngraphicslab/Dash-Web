import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile, faTextHeight, faUpload } from '@fortawesome/free-solid-svg-icons';
import _ from "lodash";
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { inputRules } from 'prosemirror-inputrules';
import { keymap } from "prosemirror-keymap";
import { Fragment, Mark, Node, Node as ProsNode, NodeType, Slice } from "prosemirror-model";
import { EditorState, NodeSelection, Plugin, TextSelection, Transaction } from "prosemirror-state";
import { ReplaceStep } from 'prosemirror-transform';
import { EditorView } from "prosemirror-view";
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCastAsync, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { Copy, Id } from '../../../new_fields/FieldSymbols';
import { RichTextField } from "../../../new_fields/RichTextField";
import { RichTextUtils } from '../../../new_fields/RichTextUtils';
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { Cast, DateCast, NumCast, StrCast } from "../../../new_fields/Types";
import { numberRange, timenow, Utils } from '../../../Utils';
import { GoogleApiClientUtils, Pulls, Pushes } from '../../apis/google_docs/GoogleApiClientUtils';
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { DictationManager } from '../../util/DictationManager';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorExampleTransfer";
import { inpRules } from "../../util/RichTextRules";
import { FootnoteView, ImageResizeView, DashDocView, OrderedListView, schema, SummarizedView } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocComponent } from "../DocComponent";
import { DocumentButtonBar } from '../DocumentButtonBar';
import { DocumentDecorations } from '../DocumentDecorations';
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import { FormattedTextBoxComment, formattedTextBoxCommentPlugin } from './FormattedTextBoxComment';
import React = require("react");

library.add(faEdit);
library.add(faSmile, faTextHeight, faUpload);

export interface FormattedTextBoxProps {
    hideOnLeave?: boolean;
    height?: string;
    color?: string;
    outer_div?: (domminus: HTMLElement) => void;
    firstinstance?: boolean;
}

const richTextSchema = createSchema({
    documentText: "string"
});

export const GoogleRef = "googleDocId";

type RichTextDocument = makeInterface<[typeof richTextSchema]>;
const RichTextDocument = makeInterface(richTextSchema);

type PullHandler = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends DocComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string = "data") {
        return FieldView.LayoutString(FormattedTextBox, fieldStr);
    }
    public static blankState = () => EditorState.create(FormattedTextBox.Instance.config);
    public static Instance: FormattedTextBox;
    private static _toolTipTextMenu: TooltipTextMenu | undefined = undefined;
    private _ref: React.RefObject<HTMLDivElement> = React.createRef();
    private _proseRef?: HTMLDivElement;
    private _editorView: Opt<EditorView>;
    private _applyingChange: boolean = false;
    private _linkClicked = "";
    private _nodeClicked: any;
    private _undoTyping?: UndoManager.Batch;
    private _searchReactionDisposer?: Lambda;
    private _scrollToRegionReactionDisposer: Opt<IReactionDisposer>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _textReactionDisposer: Opt<IReactionDisposer>;
    private _heightReactionDisposer: Opt<IReactionDisposer>;
    private _rulesReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
    private _pullReactionDisposer: Opt<IReactionDisposer>;
    private _pushReactionDisposer: Opt<IReactionDisposer>;
    private dropDisposer?: DragManager.DragDropDisposer;

    @observable private _fontSize = 13;
    @observable private _fontFamily = "Arial";
    @observable private _fontAlign = "";
    @observable private _entered = false;
    public static SelectOnLoad = "";
    public static IsFragment(html: string) {
        return html.indexOf("data-pm-slice") !== -1;
    }
    public static GetHref(html: string): string {
        let parser = new DOMParser();
        let parsedHtml = parser.parseFromString(html, 'text/html');
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

    public static getToolTip() {
        return this._toolTipTextMenu;
    }

    @undoBatch
    public setFontColor(color: string) {
        let view = this._editorView!;
        if (view.state.selection.from === view.state.selection.to) return false;
        if (view.state.selection.to - view.state.selection.from > view.state.doc.nodeSize - 3) {
            this.props.Document.color = color;
        }
        let colorMark = view.state.schema.mark(view.state.schema.marks.pFontColor, { color: color });
        view.dispatch(view.state.tr.addMark(view.state.selection.from, view.state.selection.to, colorMark));
        return true;
    }

    constructor(props: FieldViewProps) {
        super(props);
        FormattedTextBox.Instance = this;
    }

    public get CurrentDiv(): HTMLDivElement { return this._ref.current!; }

    @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.dataDoc, this.props.fieldKey); }

    @computed get dataDoc() { return this.props.DataDoc && this.props.Document.isTemplate ? this.props.DataDoc : Doc.GetProto(this.props.Document); }

    // this should be internal to prosemirror, but is needed
    // here to make sure that footnote view nodes in the overlay editor
    // get removed when they're not selected.

    syncNodeSelection(view: any, sel: any) {
        if (sel instanceof NodeSelection) {
            var desc = view.docView.descAt(sel.from);
            if (desc !== view.lastSelectedViewDesc) {
                if (view.lastSelectedViewDesc) {
                    view.lastSelectedViewDesc.deselectNode();
                    view.lastSelectedViewDesc = null;
                }
                if (desc) { desc.selectNode(); }
                view.lastSelectedViewDesc = desc;
            }
        } else {
            if (view.lastSelectedViewDesc) {
                view.lastSelectedViewDesc.deselectNode();
                view.lastSelectedViewDesc = null;
            }
        }
    }

    linkOnDeselect: Map<string, string> = new Map();

    doLinkOnDeselect() {
        Array.from(this.linkOnDeselect.entries()).map(entry => {
            let key = entry[0];
            let value = entry[1];
            let id = Utils.GenerateDeterministicGuid(this.dataDoc[Id] + key);
            DocServer.GetRefField(value).then(doc => {
                DocServer.GetRefField(id).then(linkDoc => {
                    this.dataDoc[key] = doc || Docs.Create.FreeformDocument([], { title: value, width: 500, height: 500 }, value);
                    DocUtils.Publish(this.dataDoc[key] as Doc, value, this.props.addDocument, this.props.removeDocument);
                    if (linkDoc) { (linkDoc as Doc).anchor2 = this.dataDoc[key] as Doc; }
                    else DocUtils.MakeLink({ doc: this.dataDoc, ctx: this.props.ContainingCollectionDoc }, { doc: this.dataDoc[key] as Doc }, "Ref:" + value, "link to named target", id);
                });
            });
        });
        this.linkOnDeselect.clear();
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            let metadata = tx.selection.$from.marks().find((m: Mark) => m.type === schema.marks.metadata);
            if (metadata) {
                let range = tx.selection.$from.blockRange(tx.selection.$to);
                let text = range ? tx.doc.textBetween(range.start, range.end) : "";
                let textEndSelection = tx.selection.to;
                for (; textEndSelection < range!.end && text[textEndSelection - range!.start] !== " "; textEndSelection++) { }
                text = text.substr(0, textEndSelection - range!.start);
                text = text.split(" ")[text.split(" ").length - 1];
                let split = text.split("::");
                if (split.length > 1 && split[1]) {
                    let key = split[0];
                    let value = split[split.length - 1];
                    this.linkOnDeselect.set(key, value);

                    let id = Utils.GenerateDeterministicGuid(this.dataDoc[Id] + key);
                    const link = this._editorView.state.schema.marks.link.create({ href: `http://localhost:1050/doc/${id}`, location: "onRight", title: value });
                    const mval = this._editorView.state.schema.marks.metadataVal.create();
                    let offset = (tx.selection.to === range!.end - 1 ? -1 : 0);
                    tx = tx.addMark(textEndSelection - value.length + offset, textEndSelection, link).addMark(textEndSelection - value.length + offset, textEndSelection, mval);
                    this.dataDoc[key] = value;
                }
            }
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this.syncNodeSelection(this._editorView, this._editorView.state.selection); // bcz: ugh -- shouldn't be needed but without this the overlay view's footnote popup doesn't get deselected
            if (state.selection.empty && FormattedTextBox._toolTipTextMenu && tx.storedMarks) {
                FormattedTextBox._toolTipTextMenu.mark_key_pressed(tx.storedMarks);
            }

            this._applyingChange = true;
            this.extensionDoc && (this.extensionDoc.text = state.doc.textBetween(0, state.doc.content.size, "\n\n"));
            this.extensionDoc && (this.extensionDoc.lastModified = new DateField(new Date(Date.now())));
            this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()));
            this._applyingChange = false;
            this.updateTitle();
            this.tryUpdateHeight();
        }
    }

    updateTitle = () => {
        if (StrCast(this.dataDoc.title).startsWith("-") && this._editorView && !this.Document.customTitle) {
            let str = this._editorView.state.doc.textContent;
            let titlestr = str.substr(0, Math.min(40, str.length));
            this.dataDoc.title = "-" + titlestr + (str.length > 40 ? "..." : "");
        }
    }

    public highlightSearchTerms = (terms: String[]) => {
        if (this._editorView && (this._editorView as any).docView) {
            const doc = this._editorView.state.doc;
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            doc.nodesBetween(0, doc.content.size, (node: ProsNode, pos: number, parent: ProsNode, index: number) => {
                if (node.isLeaf && node.isText && node.text) {
                    let nodeText: String = node.text;
                    let tokens = nodeText.split(" ");
                    let start = pos;
                    tokens.forEach((word) => {
                        if (terms.includes(word) && this._editorView) {
                            this._editorView.dispatch(this._editorView.state.tr.addMark(start, start + word.length, mark).removeStoredMark(mark));
                        }
                        start += word.length + 1;
                    });
                }
            });
        }
    }

    public unhighlightSearchTerms = () => {
        if (this._editorView && (this._editorView as any).docView) {
            const doc = this._editorView.state.doc;
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            doc.nodesBetween(0, doc.content.size, (node: ProsNode, pos: number, parent: ProsNode, index: number) => {
                if (node.isLeaf && node.isText && node.text) {
                    if (node.marks.includes(mark) && this._editorView) {
                        this._editorView.dispatch(this._editorView.state.tr.removeMark(pos, pos + node.nodeSize, mark));
                    }
                }
            });
        }
    }
    setAnnotation = (start: number, end: number, mark: Mark, opened: boolean, keep: boolean = false) => {
        let view = this._editorView!;
        let mid = view.state.doc.resolve(Math.round((start + end) / 2));
        let nmark = view.state.schema.marks.user_mark.create({ ...mark.attrs, userid: keep ? Doc.CurrentUserEmail : mark.attrs.userid, opened: opened });
        view.dispatch(view.state.tr.removeMark(start, end, nmark).addMark(start, end, nmark).setSelection(new TextSelection(mid)));
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
        this._proseRef = ele;
        this.dropDisposer && this.dropDisposer();
        ele && (this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } }));
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        // We're dealing with a link to a document
        if (de.data instanceof DragManager.EmbedDragData) {
            let target = de.data.embeddableSourceDoc;
            // We're dealing with an internal document drop
            const link = DocUtils.MakeLink({ doc: this.dataDoc, ctx: this.props.ContainingCollectionDoc }, { doc: target }, "ImgRef:" + target.title);
            let node: Node<any>;
            if (de.data.urlField && link) {
                let url: string = de.data.urlField.url.href;
                let model: NodeType = [".mov", ".mp4"].includes(url) ? schema.nodes.video : schema.nodes.image;
                node = model.create({ src: url, docid: link[Id] })
            } else {
                node = schema.nodes.dashDoc.create({
                    width: target[WidthSym](), height: target[HeightSym](),
                    title: "dashDoc", docid: target[Id],
                    float: "none"
                });
            }
            let pos = this._editorView!.posAtCoords({ left: de.x, top: de.y });
            link && this._editorView!.dispatch(this._editorView!.state.tr.insert(pos!.pos, node));
            this.tryUpdateHeight();
            e.stopPropagation();
        } else if (de.data instanceof DragManager.DocumentDragData) {
            const draggedDoc = de.data.draggedDocuments.length && de.data.draggedDocuments[0];
            if (draggedDoc && draggedDoc.type === DocumentType.TEXT && !Doc.AreProtosEqual(draggedDoc, this.props.Document)) {
                if (de.mods === "AltKey") {
                    if (draggedDoc.data instanceof RichTextField) {
                        Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new RichTextField(draggedDoc.data.Data);
                        e.stopPropagation();
                    }
                } else if (de.mods === "CtrlKey") {
                    draggedDoc.isTemplate = true;
                    if (typeof (draggedDoc.layout) === "string") {
                        let layoutDelegateToOverrideFieldKey = Doc.MakeDelegate(draggedDoc);
                        layoutDelegateToOverrideFieldKey.layout = StrCast(layoutDelegateToOverrideFieldKey.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${this.props.fieldKey}"}`);
                        this.props.Document.layout = layoutDelegateToOverrideFieldKey;
                    } else {
                        this.props.Document.layout = draggedDoc.layout instanceof Doc ? draggedDoc.layout : draggedDoc;
                    }
                }
                e.stopPropagation();
            }
        }
    }

    recordKeyHandler = (e: KeyboardEvent) => {
        if (SelectionManager.SelectedDocuments().length && this.props.Document === SelectionManager.SelectedDocuments()[0].props.Document) {
            if (e.key === "R" && e.altKey) {
                e.stopPropagation();
                e.preventDefault();
                this.recordBullet();
            }
        }
    }

    recordBullet = async () => {
        let completedCue = "end session";
        let results = await DictationManager.Controls.listen({
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
            let state = this._editorView.state;
            let from = state.selection.from;
            let to = state.selection.to;
            this._editorView.dispatch(state.tr.insertText(value, from, to));
            state = this._editorView.state;
            let updated = TextSelection.create(state.doc, from, from + value.length);
            this._editorView.dispatch(state.tr.setSelection(updated));
        }
    }

    nextBullet = (pos: number) => {
        if (this._editorView) {
            let frag = Fragment.fromArray(this.newListItems(2));
            let slice = new Slice(frag, 2, 2);
            let state = this._editorView.state;
            this._editorView.dispatch(state.tr.step(new ReplaceStep(pos, pos, slice)));
            pos += 4;
            state = this._editorView.state;
            this._editorView.dispatch(state.tr.setSelection(TextSelection.create(this._editorView.state.doc, pos, pos)));
        }
    }

    private newListItems = (count: number) => {
        return numberRange(count).map(x => schema.nodes.list_item.create(undefined, schema.nodes.paragraph.create()));
    }

    _keymap: any = undefined;
    @computed get config() {
        this._keymap = buildKeymap(schema);
        (schema as any).Document = this.props.Document;
        return {
            schema,
            plugins: [
                inputRules(inpRules),
                this.tooltipTextMenuPlugin(),
                history(),
                keymap(this._keymap),
                keymap(baseKeymap),
                // this.tooltipLinkingMenuPlugin(),
                new Plugin({
                    props: {
                        attributes: { class: "ProseMirror-example-setup-style" }
                    }
                }),
                formattedTextBoxCommentPlugin
            ]
        };
    }

    componentDidMount() {
        this.pullFromGoogleDoc(this.checkState);
        this.dataDoc[GoogleRef] && this.dataDoc.unchanged && runInAction(() => DocumentDecorations.Instance.isAnimatingFetch = true);

        this._reactionDisposer = reaction(
            () => {
                const field = this.dataDoc ? Cast(this.dataDoc[this.props.fieldKey], RichTextField) : undefined;
                return field ? field.Data : RichTextUtils.Initialize();
            },
            incomingValue => {
                if (this._editorView && !this._applyingChange) {
                    let updatedState = JSON.parse(incomingValue);
                    this._editorView.updateState(EditorState.fromJSON(this.config, updatedState));
                    this.tryUpdateHeight();
                }
            }
        );

        this._pullReactionDisposer = reaction(
            () => this.props.Document[Pulls],
            () => {
                if (!DocumentButtonBar.hasPulledHack) {
                    DocumentButtonBar.hasPulledHack = true;
                    let unchanged = this.dataDoc.unchanged;
                    this.pullFromGoogleDoc(unchanged ? this.checkState : this.updateState);
                }
            }
        );

        this._pushReactionDisposer = reaction(
            () => this.props.Document[Pushes],
            () => {
                if (!DocumentButtonBar.hasPushedHack) {
                    DocumentButtonBar.hasPushedHack = true;
                    this.pushToGoogleDoc();
                }
            }
        );

        this._heightReactionDisposer = reaction(
            () => this.props.Document[WidthSym](),
            () => this.tryUpdateHeight()
        );

        this._textReactionDisposer = reaction(
            () => this.extensionDoc,
            () => {
                if (this.dataDoc.text || this.dataDoc.lastModified) {
                    this.extensionDoc.text = this.dataDoc.text;
                    this.extensionDoc.lastModified = DateCast(this.dataDoc.lastModified)[Copy]();
                    this.dataDoc.text = undefined;
                    this.dataDoc.lastModified = undefined;
                }
            }, { fireImmediately: true });


        this.setupEditor(this.config, this.dataDoc, this.props.fieldKey);

        this._searchReactionDisposer = reaction(() => {
            return StrCast(this.props.Document.search_string);
        }, searchString => {
            if (searchString) {
                this.highlightSearchTerms([searchString]);
            }
            else {
                this.unhighlightSearchTerms();
            }
        }, { fireImmediately: true });


        this._rulesReactionDisposer = reaction(() => {
            let ruleProvider = this.props.ruleProvider;
            let heading = NumCast(this.props.Document.heading);
            if (ruleProvider instanceof Doc) {
                return {
                    align: StrCast(ruleProvider["ruleAlign_" + heading], ""),
                    font: StrCast(ruleProvider["ruleFont_" + heading], "Arial"),
                    size: NumCast(ruleProvider["ruleSize_" + heading], 13)
                };
            }
            return undefined;
        },
            action((rules: any) => {
                this._fontFamily = rules ? rules.font : "Arial";
                this._fontSize = rules ? rules.size : 13;
                rules && setTimeout(() => {
                    const view = this._editorView!;
                    if (this._proseRef) {
                        let n = new NodeSelection(view.state.doc.resolve(0));
                        if (this._editorView!.state.doc.textContent === "") {
                            view.dispatch(view.state.tr.setSelection(new TextSelection(view.state.doc.resolve(0), view.state.doc.resolve(2))).
                                replaceSelectionWith(this._editorView!.state.schema.nodes.paragraph.create({ align: rules.align }), true));
                        } else if (n.node && n.node.type === view.state.schema.nodes.paragraph) {
                            view.dispatch(view.state.tr.setNodeMarkup(0, n.node.type, { ...n.node.attrs, align: rules.align }));
                        }
                        this.tryUpdateHeight();
                    }
                }, 0);
            }), { fireImmediately: true }
        );
        this._scrollToRegionReactionDisposer = reaction(
            () => StrCast(this.props.Document.scrollToLinkID),
            async (scrollToLinkID) => {
                let findLinkFrag = (frag: Fragment, editor: EditorView) => {
                    const nodes: Node[] = [];
                    frag.forEach((node, index) => {
                        let examinedNode = findLinkNode(node, editor);
                        if (examinedNode && examinedNode.textContent) {
                            nodes.push(examinedNode);
                            start += index;
                        }
                    });
                    return { frag: Fragment.fromArray(nodes), start: start };
                };
                let findLinkNode = (node: Node, editor: EditorView) => {
                    if (!node.isText) {
                        const content = findLinkFrag(node.content, editor);
                        return node.copy(content.frag);
                    }
                    const marks = [...node.marks];
                    const linkIndex = marks.findIndex(mark => mark.type === editor.state.schema.marks.link);
                    return linkIndex !== -1 && scrollToLinkID === marks[linkIndex].attrs.href.replace(/.*\/doc\//, "") ? node : undefined;
                };

                let start = -1;
                if (this._editorView && scrollToLinkID) {
                    let editor = this._editorView;
                    let ret = findLinkFrag(editor.state.doc.content, editor);

                    if (ret.frag.size > 2) {
                        let selection = TextSelection.near(editor.state.doc.resolve(ret.start)); // default to near the start
                        if (ret.frag.firstChild) {
                            selection = TextSelection.between(editor.state.doc.resolve(ret.start + 2), editor.state.doc.resolve(ret.start + ret.frag.firstChild.nodeSize)); // bcz: looks better to not have the target selected
                        }
                        editor.dispatch(editor.state.tr.setSelection(new TextSelection(selection.$from, selection.$from)).scrollIntoView());
                        const mark = editor.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
                        setTimeout(() => editor.dispatch(editor.state.tr.addMark(selection.from, selection.to, mark)), 0);
                        setTimeout(() => this.unhighlightSearchTerms(), 2000);
                    }
                    this.props.Document.scrollToLinkID = undefined;
                }

            },
            { fireImmediately: true }
        );

        setTimeout(() => this.tryUpdateHeight(), 0);
    }

    pushToGoogleDoc = async () => {
        this.pullFromGoogleDoc(async (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => {
            let modes = GoogleApiClientUtils.Docs.WriteMode;
            let mode = modes.Replace;
            let reference: Opt<GoogleApiClientUtils.Docs.Reference> = Cast(this.dataDoc[GoogleRef], "string");
            if (!reference) {
                mode = modes.Insert;
                reference = { title: StrCast(this.dataDoc.title) };
            }
            let redo = async () => {
                if (this._editorView && reference) {
                    let content = await RichTextUtils.GoogleDocs.Export(this._editorView.state);
                    let response = await GoogleApiClientUtils.Docs.write({ reference, content, mode });
                    response && (this.dataDoc[GoogleRef] = response.documentId);
                    let pushSuccess = response !== undefined && !("errors" in response);
                    dataDoc.unchanged = pushSuccess;
                    DocumentButtonBar.Instance.startPushOutcome(pushSuccess);
                }
            };
            let undo = () => {
                if (!exportState) {
                    return;
                }
                let content: GoogleApiClientUtils.Docs.Content = {
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
        let dataDoc = this.dataDoc;
        let documentId = StrCast(dataDoc[GoogleRef]);
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
            dataDoc.data = new RichTextField(JSON.stringify(exportState.state.toJSON()));
            setTimeout(() => {
                if (this._editorView) {
                    let state = this._editorView.state;
                    let end = state.doc.content.size - 1;
                    this._editorView.dispatch(state.tr.setSelection(TextSelection.create(state.doc, end, end)));
                }
            }, 0);
            dataDoc.title = exportState.title;
            this.Document.customTitle = true;
            dataDoc.unchanged = true;
        } else {
            delete dataDoc[GoogleRef];
        }
        DocumentButtonBar.Instance.startPullOutcome(pullSuccess);
    }

    checkState = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => {
        if (exportState && this._editorView) {
            let equalContent = _.isEqual(this._editorView.state.doc, exportState.state.doc);
            let equalTitles = dataDoc.title === exportState.title;
            let unchanged = equalContent && equalTitles;
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
        let cbe = event as ClipboardEvent;
        const pdfDocId = cbe.clipboardData && cbe.clipboardData.getData("dash/pdfOrigin");
        const pdfRegionId = cbe.clipboardData && cbe.clipboardData.getData("dash/pdfRegion");
        if (pdfDocId && pdfRegionId) {
            DocServer.GetRefField(pdfDocId).then(pdfDoc => {
                DocServer.GetRefField(pdfRegionId).then(pdfRegion => {
                    if ((pdfDoc instanceof Doc) && (pdfRegion instanceof Doc)) {
                        setTimeout(async () => {
                            let targetAnnotations = await DocListCastAsync(Doc.fieldExtensionDoc(pdfDoc, "data").annotations);// bcz: NO... this assumes the pdf is using its 'data' field.  need to have the PDF's view handle updating its own annotations
                            targetAnnotations && targetAnnotations.push(pdfRegion);
                        });

                        let link = DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: pdfRegion, ctx: pdfDoc }, "note on " + pdfDoc.title, "pasted PDF link");
                        if (link) {
                            cbe.clipboardData!.setData("dash/linkDoc", link[Id]);
                            let linkId = link[Id];
                            let frag = addMarkToFrag(slice.content, (node: Node) => addLinkMark(node, StrCast(pdfDoc.title), linkId));
                            slice = new Slice(frag, slice.openStart, slice.openEnd);
                            var tr = view.state.tr.replaceSelection(slice);
                            view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
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
            const link = view.state.schema.mark(view.state.schema.marks.link, { href: `http://localhost:1050/doc/${linkId}`, location: "onRight", title: title, docref: true });
            marks.splice(linkIndex === -1 ? 0 : linkIndex, 1, link);
            return node.mark(marks);
        }
    }

    private setupEditor(config: any, doc: Doc, fieldKey: string) {
        let field = doc ? Cast(doc[fieldKey], RichTextField) : undefined;
        let startup = StrCast(doc.documentText);
        startup = startup.startsWith("@@@") ? startup.replace("@@@", "") : "";
        if (!field && doc) {
            let text = StrCast(doc[fieldKey]);
            if (text) {
                startup = text;
            } else if (Cast(doc[fieldKey], "number")) {
                startup = NumCast(doc[fieldKey], 99).toString();
            }
        }
        if (this._proseRef) {
            let self = this;
            this._editorView && this._editorView.destroy();
            this._editorView = new EditorView(this._proseRef, {
                state: field && field.Data ? EditorState.fromJSON(config, JSON.parse(field.Data)) : EditorState.create(config),
                handleScrollToSelection: (editorView) => {
                    let ref = editorView.domAtPos(editorView.state.selection.from);
                    let refNode = ref.node as any;
                    while (refNode && !("getBoundingClientRect" in refNode)) refNode = refNode.parentElement;
                    let r1 = refNode && refNode.getBoundingClientRect();
                    let r3 = self._ref.current!.getBoundingClientRect();
                    r1 && (self._ref.current!.scrollTop += (r1.top - r3.top) * self.props.ScreenToLocalTransform().Scale);
                    return true;
                },
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    dashDoc(node, view, getPos) { return new DashDocView(node, view, getPos, self.props.addDocTab); },
                    image(node, view, getPos) { return new ImageResizeView(node, view, getPos, self.props.addDocTab); },
                    star(node, view, getPos) { return new SummarizedView(node, view, getPos); },
                    ordered_list(node, view, getPos) { return new OrderedListView(); },
                    footnote(node, view, getPos) { return new FootnoteView(node, view, getPos); }
                },
                clipboardTextSerializer: this.clipboardTextSerializer,
                handlePaste: this.handlePaste,
            });
            if (startup) {
                Doc.GetProto(doc).documentText = undefined;
                this._editorView.dispatch(this._editorView.state.tr.insertText(startup));
            }
        }

        let selectOnLoad = this.props.Document[Id] === FormattedTextBox.SelectOnLoad;
        if (selectOnLoad) {
            FormattedTextBox.SelectOnLoad = "";
            this.props.select(false);
        }
        this._editorView!.focus();
        // add user mark for any first character that was typed since the user mark that gets set in KeyPress won't have been called yet.
        this._editorView!.state.storedMarks = [...(this._editorView!.state.storedMarks ? this._editorView!.state.storedMarks : []), schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: timenow() })];
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
        this._scrollToRegionReactionDisposer && this._scrollToRegionReactionDisposer();
        this._rulesReactionDisposer && this._rulesReactionDisposer();
        this._reactionDisposer && this._reactionDisposer();
        this._proxyReactionDisposer && this._proxyReactionDisposer();
        this._textReactionDisposer && this._textReactionDisposer();
        this._pushReactionDisposer && this._pushReactionDisposer();
        this._pullReactionDisposer && this._pullReactionDisposer();
        this._heightReactionDisposer && this._heightReactionDisposer();
        this._searchReactionDisposer && this._searchReactionDisposer();
        this._editorView && this._editorView.destroy();
    }
    public static firstTarget: () => void;
    onPointerDown = (e: React.PointerEvent): void => {
        if ((e.nativeEvent as any).formattedHandled) return;
        (e.nativeEvent as any).formattedHandled = true;
        let pos = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
        pos && (this._nodeClicked = this._editorView!.state.doc.nodeAt(pos.pos));
        if (this.props.onClick && e.button === 0) {
            e.preventDefault();
        }
        if (e.button === 0 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
        FormattedTextBox.firstTarget = () => {  // this is here to support nested text boxes.  when that happens, the click event will propagate through prosemirror to the outer editor.  In RichTextSchema, the outer editor calls this function to revert the focus/selection
            if (pos && pos.pos > 0) {
                let node = this._editorView!.state.doc.nodeAt(pos.pos);
                if (!node || (node.type !== this._editorView!.state.schema.nodes.dashDoc && node.type !== this._editorView!.state.schema.nodes.image &&
                    pos.pos !== this._editorView!.state.selection.from)) {
                    this._editorView!.dispatch(this._editorView!.state.tr.setSelection(new TextSelection(this._editorView!.state.doc.resolve(pos!.pos))));
                    this._editorView!.focus();
                }
            }
        }
    }

    onPointerUp = (e: React.PointerEvent): void => {
        FormattedTextBoxComment.textBox = this;
        if (e.buttons === 1 && this.props.isSelected() && !e.altKey) {
            e.stopPropagation();
        }
    }

    @action
    onFocused = (e: React.FocusEvent): void => {
        document.removeEventListener("keypress", this.recordKeyHandler);
        document.addEventListener("keypress", this.recordKeyHandler);
        this.tryUpdateHeight();
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        // if a text note is not selected and scrollable, this prevents us from being able to scroll and zoom out at the same time
        if (this.props.isSelected() || e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
            e.stopPropagation();
        }
    }

    onClick = (e: React.MouseEvent): void => {
        let ctrlKey = e.ctrlKey;
        if (e.button === 0 && ((!this.props.isSelected() && !e.ctrlKey) || (this.props.isSelected() && e.ctrlKey)) && !e.metaKey && e.target) {
            let href = (e.target as any).href;
            let location: string;
            if ((e.target as any).attributes.location) {
                location = (e.target as any).attributes.location.value;
            }
            for (let parent = (e.target as any).parentNode; !href && parent; parent = parent.parentNode) {
                href = parent.childNodes[0].href ? parent.childNodes[0].href : parent.href;
            }
            let pcords = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
            let node = pcords && this._editorView!.state.doc.nodeAt(pcords.pos);
            if (node) {
                let link = node.marks.find(m => m.type === this._editorView!.state.schema.marks.link);
                if (link && !(link.attrs.docref && link.attrs.title)) {  // bcz: getting hacky.  this indicates that we clicked on a PDF excerpt quotation.  In this case, we don't want to follow the link (we follow only the actual hyperlink for the quotation which is handled above).
                    href = link && link.attrs.href;
                    location = link && link.attrs.location;
                }
            }
            if (href) {
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    this._linkClicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    if (this._linkClicked) {
                        DocServer.GetRefField(this._linkClicked).then(async linkDoc =>
                            (linkDoc instanceof Doc) &&
                            DocumentManager.Instance.FollowLink(linkDoc, this.props.Document, document => this.props.addDocTab(document, undefined, location ? location : "inTab"), false));
                        e.stopPropagation();
                        e.preventDefault();
                    }
                } else {
                    let webDoc = Docs.Create.WebDocument(href, { x: NumCast(this.props.Document.x, 0) + NumCast(this.props.Document.width, 0), y: NumCast(this.props.Document.y) });
                    this.props.addDocument && this.props.addDocument(webDoc);
                    this._linkClicked = webDoc[Id];
                }
                e.stopPropagation();
                e.preventDefault();
            }

        }
        // this hackiness handles clicking on the list item bullets to do expand/collapse.  the bullets are ::before pseudo elements so there's no real way to hit test against them.
        if (this.props.isSelected() && e.nativeEvent.offsetX < 40) {
            let pos = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
            if (pos && pos.pos > 0) {
                let node = this._editorView!.state.doc.nodeAt(pos.pos);
                let node2 = node && node.type === schema.nodes.paragraph ? this._editorView!.state.doc.nodeAt(pos.pos - 1) : undefined;
                if (node === this._nodeClicked && node2 && (node2.type === schema.nodes.ordered_list || node2.type === schema.nodes.list_item)) {
                    let hit = this._editorView!.domAtPos(pos.pos).node as any;
                    let beforeEle = document.querySelector("." + hit.className) as Element;
                    let before = beforeEle ? window.getComputedStyle(beforeEle, ':before') : undefined;
                    let beforeWidth = before ? Number(before.getPropertyValue('width').replace("px", "")) : undefined;
                    if (beforeWidth && e.nativeEvent.offsetX < beforeWidth) {
                        let ol = this._editorView!.state.doc.nodeAt(pos.pos - 2) ? this._editorView!.state.doc.nodeAt(pos.pos - 2) : undefined;
                        if (ol && ol.type === schema.nodes.ordered_list && !e.shiftKey) {
                            this._editorView!.dispatch(this._editorView!.state.tr.setSelection(new NodeSelection(this._editorView!.state.doc.resolve(pos.pos - 2))));
                        } else {
                            this._editorView!.dispatch(this._editorView!.state.tr.setNodeMarkup(pos.pos - 1, node2.type, { ...node2.attrs, visibility: !node2.attrs.visibility }));
                        }
                    }
                }
            }
        }
        this._editorView!.focus();
        if (this._linkClicked) {
            this._linkClicked = "";
            e.preventDefault();
            e.stopPropagation();
        }
    }
    onMouseDown = (e: React.MouseEvent): void => {
        if (!this.props.isSelected()) { // preventing default allows the onClick to be generated instead of being swallowed by the text box itself
            e.preventDefault(); // bcz: this would normally be in OnPointerDown - however, if done there, no mouse move events will be generated which makes transititioning to GoldenLayout's drag interactions impossible
        }
    }

    tooltipTextMenuPlugin() {
        let myprops = this.props;
        let self = FormattedTextBox;
        return new Plugin({
            view(_editorView) {
                return self._toolTipTextMenu = new TooltipTextMenu(_editorView, myprops);
            }
        });
    }

    tooltipLinkingMenuPlugin() {
        let myprops = this.props;
        return new Plugin({
            view(_editorView) {
                return new TooltipLinkingMenu(_editorView, myprops);
            }
        });
    }
    onBlur = (e: any) => {
        document.removeEventListener("keypress", this.recordKeyHandler);
        if (this._undoTyping) {
            this._undoTyping.end();
            this._undoTyping = undefined;
        }
        this.doLinkOnDeselect();
    }
    onKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            SelectionManager.DeselectAll();
        }
        e.stopPropagation();
        if (e.key === "Tab" || e.key === "Enter") {
            e.preventDefault();
        }
        this._editorView!.dispatch(this._editorView!.state.tr.removeStoredMark(schema.marks.user_mark.create({})).addStoredMark(schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: timenow() })));

        if (!this._undoTyping) {
            this._undoTyping = UndoManager.StartBatch("undoTyping");
        }
    }

    @action
    tryUpdateHeight() {
        const ChromeHeight = this.props.ChromeHeight;
        let sh = this._ref.current ? this._ref.current.scrollHeight : 0;
        if (!this.props.Document.isAnimating && this.props.Document.autoHeight && sh !== 0) {
            let nh = this.props.Document.isTemplate ? 0 : NumCast(this.dataDoc.nativeHeight, 0);
            let dh = NumCast(this.props.Document.height, 0);
            this.props.Document.height = Math.max(10, (nh ? dh / nh * sh : sh) + (ChromeHeight ? ChromeHeight() : 0));
            this.dataDoc.nativeHeight = nh ? sh : undefined;
        }
    }

    render() {
        let style = "hidden";
        let rounded = StrCast(this.props.Document.borderRounding) === "100%" ? "-rounded" : "";
        let interactive: "all" | "none" = InkingControl.Instance.selectedTool || this.props.Document.isBackground
            ? "none" : "all";
        Doc.UpdateDocumentExtensionForField(this.dataDoc, this.props.fieldKey);
        return (
            <div className={`formattedTextBox-cont-${style}`} ref={this._ref}
                style={{
                    overflowY: this.props.Document.autoHeight ? "hidden" : "auto",
                    height: this.props.Document.autoHeight ? "max-content" : this.props.height ? this.props.height : undefined,
                    background: this.props.hideOnLeave ? "rgba(0,0,0 ,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered || this.props.isSelected() || Doc.IsBrushed(this.props.Document) ? 1 : 0.1) : 1,
                    color: this.props.color ? this.props.color : this.props.hideOnLeave ? "white" : "inherit",
                    pointerEvents: interactive,
                    fontSize: this._fontSize,
                    fontFamily: this._fontFamily,
                }}
                onKeyDown={this.onKeyPress}
                onFocus={this.onFocused}
                onClick={this.onClick}
                onBlur={this.onBlur}
                onPointerUp={this.onPointerUp}
                onPointerDown={this.onPointerDown}
                onMouseDown={this.onMouseDown}
                onWheel={this.onPointerWheel}
                onPointerEnter={action(() => this._entered = true)}
                onPointerLeave={action(() => this._entered = false)}
            >
                <div className={`formattedTextBox-inner${rounded}`} style={{ whiteSpace: "pre-wrap", pointerEvents: ((this.props.Document.isButton || this.props.onClick) && !this.props.isSelected()) ? "none" : undefined }} ref={this.createDropTarget} />
            </div>
        );
    }
}
