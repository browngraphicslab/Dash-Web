import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile, faTextHeight, faUpload } from '@fortawesome/free-solid-svg-icons';
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { Fragment, Node, Node as ProsNode, NodeType, Slice } from "prosemirror-model";
import { EditorState, Plugin, Transaction, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCast, Opt, WidthSym } from "../../../new_fields/Doc";
import { Copy, Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { RichTextField, ToPlainText, FromPlainText } from "../../../new_fields/RichTextField";
import { BoolCast, Cast, NumCast, StrCast, DateCast } from "../../../new_fields/Types";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { Utils } from '../../../Utils';
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorExampleTransfer";
import { inpRules } from "../../util/RichTextRules";
import { ImageResizeView, schema, SummarizedView } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");
import { GoogleApiClientUtils, Pulls, Pushes } from '../../apis/google_docs/GoogleApiClientUtils';
import { DocumentDecorations } from '../DocumentDecorations';
import { DictationManager } from '../../util/DictationManager';
import { ReplaceStep } from 'prosemirror-transform';
import { DocumentType } from '../../documents/DocumentTypes';

library.add(faEdit);
library.add(faSmile, faTextHeight, faUpload);

export const Blank = `{"doc":{"type":"doc","content":[]},"selection":{"type":"text","anchor":0,"head":0}}`;

export interface FormattedTextBoxProps {
    isOverlay?: boolean;
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

type PullHandler = (exportState: GoogleApiClientUtils.ReadResult, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends DocComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string = "data") {
        return FieldView.LayoutString(FormattedTextBox, fieldStr);
    }
    public static Instance: FormattedTextBox;
    private _ref: React.RefObject<HTMLDivElement>;
    private _proseRef?: HTMLDivElement;
    private _editorView: Opt<EditorView>;
    private static _toolTipTextMenu: TooltipTextMenu | undefined = undefined;
    private _applyingChange: boolean = false;
    private _linkClicked = "";
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _searchReactionDisposer?: Lambda;
    private _textReactionDisposer: Opt<IReactionDisposer>;
    private _heightReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
    private pullReactionDisposer: Opt<IReactionDisposer>;
    private pushReactionDisposer: Opt<IReactionDisposer>;
    private dropDisposer?: DragManager.DragDropDisposer;
    public get CurrentDiv(): HTMLDivElement { return this._ref.current!; }
    @observable _entered = false;

    @observable public static InputBoxOverlay?: FormattedTextBox = undefined;
    public static InputBoxOverlayScroll: number = 0;
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
        let self = this;
        if (this._editorView!.state.selection.from === this._editorView!.state.selection.to) return false;
        if (this._editorView!.state.selection.to - this._editorView!.state.selection.from > this._editorView!.state.doc.nodeSize - 3) {
            this.props.Document.color = color;
        }
        let colorMark = this._editorView!.state.schema.mark(this._editorView!.state.schema.marks.pFontColor, { color: color });
        this._editorView!.dispatch(this._editorView!.state.tr.addMark(this._editorView!.state.selection.from,
            this._editorView!.state.selection.to, colorMark));
        return true;
    }

    constructor(props: FieldViewProps) {
        super(props);
        FormattedTextBox.Instance = this;
        this._ref = React.createRef();
        if (this.props.isOverlay) {
            DragManager.StartDragFunctions.push(() => FormattedTextBox.InputBoxOverlay = undefined);
        }

        document.addEventListener("paste", this.paste);
    }

    @computed get extensionDoc() { return Doc.resolvedFieldDataDoc(this.dataDoc, this.props.fieldKey, "dummy"); }

    @computed get dataDoc() { return this.props.DataDoc && (BoolCast(this.props.Document.isTemplate) || BoolCast(this.props.DataDoc.isTemplate) || this.props.DataDoc.layout === this.props.Document) ? this.props.DataDoc : Doc.GetProto(this.props.Document); }


    paste = (e: ClipboardEvent) => {
        if (e.clipboardData && this._editorView) {
            // let pdfPasteText = `${Utils.GenerateDeterministicGuid("pdf paste")}`;
            // for (let i = 0; i < e.clipboardData.items.length; i++) {
            //     let item = e.clipboardData.items.item(i);
            //     console.log(item)
            //     if (item.type === "text/plain") {
            //         console.log("plain")
            //         item.getAsString((text) => {
            //             let pdfPasteIndex = text.indexOf(pdfPasteText);
            //             if (pdfPasteIndex > -1) {
            //                 let insertText = text.substr(0, pdfPasteIndex);
            //                 const tx = this._editorView!.state.tr.insertText(insertText);
            //                 // tx.setSelection(new Selection(tx.))
            //                 const state = this._editorView!.state;
            //                 this._editorView!.dispatch(tx);
            //                 if (FormattedTextBox._toolTipTextMenu) {
            //                     // this._toolTipTextMenu.makeLinkWithState(state)
            //                 }
            //                 e.stopPropagation();
            //                 e.preventDefault();
            //             }
            //         });
            //     }
            // }
        }
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            FormattedTextBox._toolTipTextMenu && (FormattedTextBox._toolTipTextMenu.HackToFixTextSelectionGlitch = true);
            this._editorView.updateState(state);
            FormattedTextBox._toolTipTextMenu && (FormattedTextBox._toolTipTextMenu.HackToFixTextSelectionGlitch = false);
            if (state.selection.empty && FormattedTextBox._toolTipTextMenu) {
                const marks = tx.storedMarks;
                if (marks) { FormattedTextBox._toolTipTextMenu.mark_key_pressed(marks); }
            }

            this._applyingChange = true;
            const fieldkey = "preview";
            if (this.extensionDoc) this.extensionDoc.text = state.doc.textBetween(0, state.doc.content.size, "\n\n");
            if (this.extensionDoc) this.extensionDoc.lastModified = new DateField(new Date(Date.now()));
            this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()));
            this._applyingChange = false;
            let title = StrCast(this.dataDoc.title);
            if (title && title.startsWith("-") && this._editorView && !this.Document.customTitle) {
                let str = this._editorView.state.doc.textContent;
                let titlestr = str.substr(0, Math.min(40, str.length));
                this.dataDoc.title = "-" + titlestr + (str.length > 40 ? "..." : "");
            }
        }
    }

    public highlightSearchTerms = (terms: String[]) => {
        if (this._editorView && (this._editorView as any).docView) {
            const fieldkey = "preview";
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
            //     const fieldkey = 'search_string';
            //     if (Object.keys(this.props.Document).indexOf(fieldkey) !== -1) {
            //         this.props.Document[fieldkey] = undefined;
            //     }
            //     else this.props.Document.proto![fieldkey] = undefined;
            // }
        }
    }

    protected createDropTarget = (ele: HTMLDivElement) => {
        this._proseRef = ele;
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (ele) {
            this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        // We're dealing with a link to a document
        if (de.data instanceof DragManager.EmbedDragData && de.data.urlField) {
            // We're dealing with an internal document drop
            let url = de.data.urlField.url.href;
            let model: NodeType = (url.includes(".mov") || url.includes(".mp4")) ? schema.nodes.video : schema.nodes.image;
            this._editorView!.dispatch(this._editorView!.state.tr.insert(0, model.create({ src: url })));
            e.stopPropagation();
        } else if (de.data instanceof DragManager.DocumentDragData) {
            const draggedDoc = de.data.draggedDocuments.length && de.data.draggedDocuments[0];
            if (draggedDoc && draggedDoc.type === DocumentType.TEXT && StrCast(draggedDoc.layout) != "") {
                this.props.Document.layout = draggedDoc;
                draggedDoc.isTemplate = true;
                e.stopPropagation();
            }
        }
    }

    recordKeyHandler = (e: KeyboardEvent) => {
        if (this.props.Document !== SelectionManager.SelectedDocuments()[0].props.Document) {
            return;
        }
        if (e.key === "R" && e.altKey) {
            e.stopPropagation();
            e.preventDefault();
            this.recordBullet();
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
        let listItems: any[] = [];
        for (let i = 0; i < count; i++) {
            listItems.push(schema.nodes.list_item.create(undefined, schema.nodes.paragraph.create()));
        }
        return listItems;
    }

    componentDidMount() {
        const config = {
            schema,
            inpRules, //these currently don't do anything, but could eventually be helpful
            plugins: this.props.isOverlay ? [
                this.tooltipTextMenuPlugin(),
                history(),
                keymap(buildKeymap(schema)),
                keymap(baseKeymap),
                // this.tooltipLinkingMenuPlugin(),
                new Plugin({
                    props: {
                        attributes: { class: "ProseMirror-example-setup-style" }
                    }
                })
            ] : [
                    history(),
                    keymap(buildKeymap(schema)),
                    keymap(baseKeymap),
                ]
        };

        if (!this.props.isOverlay) {
            this._proxyReactionDisposer = reaction(() => this.props.isSelected(),
                () => {
                    if (this.props.isSelected()) {
                        FormattedTextBox.InputBoxOverlay = this;
                        FormattedTextBox.InputBoxOverlayScroll = this._ref.current!.scrollTop;
                    }
                }, { fireImmediately: true });
        }

        this.pullFromGoogleDoc(this.checkState);
        this.dataDoc[GoogleRef] && this.dataDoc.unchanged && runInAction(() => DocumentDecorations.Instance.isAnimatingFetch = true);

        this._reactionDisposer = reaction(
            () => {
                const field = this.dataDoc ? Cast(this.dataDoc[this.props.fieldKey], RichTextField) : undefined;
                return field ? field.Data : Blank;
            },
            incomingValue => {
                if (this._editorView && !this._applyingChange) {
                    let updatedState = JSON.parse(incomingValue);
                    this._editorView.updateState(EditorState.fromJSON(config, updatedState));
                    this.tryUpdateHeight();
                }
            }
        );

        this.pullReactionDisposer = reaction(
            () => this.props.Document[Pulls],
            () => {
                if (!DocumentDecorations.hasPulledHack) {
                    DocumentDecorations.hasPulledHack = true;
                    let unchanged = this.dataDoc.unchanged;
                    this.pullFromGoogleDoc(unchanged ? this.checkState : this.updateState);
                }
            }
        );

        this.pushReactionDisposer = reaction(
            () => this.props.Document[Pushes],
            () => {
                if (!DocumentDecorations.hasPushedHack) {
                    DocumentDecorations.hasPushedHack = true;
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
        this.setupEditor(config, this.dataDoc, this.props.fieldKey);

        this._searchReactionDisposer = reaction(() => {
            return StrCast(this.props.Document.search_string);
        }, searchString => {
            const fieldkey = 'preview';
            let preview = false;
            // if (!this._editorView && Object.keys(this.props.Document).indexOf(fieldkey) !== -1) {
            //     preview = true;
            // }
            if (searchString) {
                this.highlightSearchTerms([searchString]);
            }
            else {
                this.unhighlightSearchTerms();
            }
        }, { fireImmediately: true });
        setTimeout(() => this.tryUpdateHeight(), 0);
    }

    pushToGoogleDoc = async () => {
        this.pullFromGoogleDoc(async (exportState: GoogleApiClientUtils.ReadResult, dataDoc: Doc) => {
            let modes = GoogleApiClientUtils.WriteMode;
            let mode = modes.Replace;
            let reference: Opt<GoogleApiClientUtils.Reference> = Cast(this.dataDoc[GoogleRef], "string");
            if (!reference) {
                mode = modes.Insert;
                reference = { service: GoogleApiClientUtils.Service.Documents, title: StrCast(this.dataDoc.title) };
            }
            let redo = async () => {
                let data = Cast(this.dataDoc.data, RichTextField);
                if (this._editorView && reference && data) {
                    let content = data[ToPlainText]();
                    let response = await GoogleApiClientUtils.Docs.write({ reference, content, mode });
                    response && (this.dataDoc[GoogleRef] = response.documentId);
                    let pushSuccess = response !== undefined && !("errors" in response);
                    dataDoc.unchanged = pushSuccess;
                    DocumentDecorations.Instance.startPushOutcome(pushSuccess);
                }
            };
            let undo = () => {
                let content = exportState.body;
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
        let exportState: GoogleApiClientUtils.ReadResult = {};
        if (documentId) {
            exportState = await GoogleApiClientUtils.Docs.read({ identifier: documentId });
        }
        UndoManager.RunInBatch(() => handler(exportState, dataDoc), Pulls);
    }

    updateState = (exportState: GoogleApiClientUtils.ReadResult, dataDoc: Doc) => {
        let pullSuccess = false;
        if (exportState !== undefined && exportState.body !== undefined && exportState.title !== undefined) {
            const data = Cast(dataDoc.data, RichTextField);
            if (data instanceof RichTextField) {
                pullSuccess = true;
                dataDoc.data = new RichTextField(data[FromPlainText](exportState.body));
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
            }
        } else {
            delete dataDoc[GoogleRef];
        }
        DocumentDecorations.Instance.startPullOutcome(pullSuccess);
    }

    checkState = (exportState: GoogleApiClientUtils.ReadResult, dataDoc: Doc) => {
        if (exportState !== undefined && exportState.body !== undefined && exportState.title !== undefined) {
            let data = Cast(dataDoc.data, RichTextField);
            if (data) {
                let storedPlainText = data[ToPlainText]() + "\n";
                let receivedPlainText = exportState.body;
                let storedTitle = dataDoc.title;
                let receivedTitle = exportState.title;
                let unchanged = storedPlainText === receivedPlainText && storedTitle === receivedTitle;
                dataDoc.unchanged = unchanged;
                DocumentDecorations.Instance.setPullState(unchanged);
            }
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
        let docId: string;
        let regionId: string;
        if (!cbe.clipboardData) {
            return false;
        }
        let linkId: string;
        docId = cbe.clipboardData.getData("dash/pdfOrigin");
        regionId = cbe.clipboardData.getData("dash/pdfRegion");
        if (!docId || !regionId) {
            return false;
        }

        DocServer.GetRefField(docId).then(doc => {
            DocServer.GetRefField(regionId).then(region => {
                if (!(doc instanceof Doc) || !(region instanceof Doc)) {
                    return;
                }

                let annotations = DocListCast(region.annotations);
                annotations.forEach(anno => anno.target = this.props.Document);
                let fieldExtDoc = Doc.resolvedFieldDataDoc(doc, "data", "true");
                let targetAnnotations = DocListCast(fieldExtDoc.annotations);
                if (targetAnnotations) {
                    targetAnnotations.push(region);
                    fieldExtDoc.annotations = new List<Doc>(targetAnnotations);
                }

                let link = DocUtils.MakeLink(this.props.Document, region, doc);
                if (link) {
                    cbe.clipboardData!.setData("dash/linkDoc", link[Id]);
                    linkId = link[Id];
                    let frag = addMarkToFrag(slice.content);
                    slice = new Slice(frag, slice.openStart, slice.openEnd);
                    var tr = view.state.tr.replaceSelection(slice);
                    view.dispatch(tr.scrollIntoView().setMeta("paste", true).setMeta("uiEvent", "paste"));
                }
            });
        });

        return true;

        function addMarkToFrag(frag: Fragment) {
            const nodes: Node[] = [];
            frag.forEach(node => nodes.push(addLinkMark(node)));
            return Fragment.fromArray(nodes);
        }
        function addLinkMark(node: Node) {
            if (!node.isText) {
                const content = addMarkToFrag(node.content);
                return node.copy(content);
            }
            const marks = [...node.marks];
            const linkIndex = marks.findIndex(mark => mark.type.name === "link");
            const link = view.state.schema.mark(view.state.schema.marks.link, { href: `http://localhost:1050/doc/${linkId}`, location: "onRight" });
            if (linkIndex !== -1) {
                marks.splice(linkIndex, 1, link);
            } else {
                marks.push(link);
            }
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
            this._editorView = new EditorView(this._proseRef, {
                state: field && field.Data ? EditorState.fromJSON(config, JSON.parse(field.Data)) : EditorState.create(config),
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    image(node, view, getPos) { return new ImageResizeView(node, view, getPos); },
                    star(node, view, getPos) { return new SummarizedView(node, view, getPos); },
                },
                clipboardTextSerializer: this.clipboardTextSerializer,
                handlePaste: this.handlePaste,
            });
            if (startup) {
                Doc.GetProto(doc).documentText = undefined;
                this._editorView.dispatch(this._editorView.state.tr.insertText(startup));
            }
        }

        if (this.props.selectOnLoad) {
            if (!this.props.isOverlay) this.props.select(false);
            else this._editorView!.focus();
        }
    }

    componentWillUnmount() {
        this._editorView && this._editorView.destroy();
        this._reactionDisposer && this._reactionDisposer();
        this._proxyReactionDisposer && this._proxyReactionDisposer();
        this._textReactionDisposer && this._textReactionDisposer();
        this.pushReactionDisposer && this.pushReactionDisposer();
        this.pullReactionDisposer && this.pullReactionDisposer();
        this._heightReactionDisposer && this._heightReactionDisposer();
        this._searchReactionDisposer && this._searchReactionDisposer();
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (this.props.onClick && e.button === 0) {
            e.preventDefault();
        }
        if (e.button === 0 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
            if (FormattedTextBox._toolTipTextMenu && FormattedTextBox._toolTipTextMenu.tooltip) {
                //this._toolTipTextMenu.tooltip.style.opacity = "0";
            }
        }
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
            if (href) {
                if (href.indexOf(Utils.prepend("/doc/")) === 0) {
                    this._linkClicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
                    if (this._linkClicked) {
                        DocServer.GetRefField(this._linkClicked).then(async linkDoc => {
                            if (linkDoc instanceof Doc) {
                                let proto = Doc.GetProto(linkDoc);
                                let targetContext = await Cast(proto.targetContext, Doc);
                                let jumpToDoc = await Cast(linkDoc.anchor2, Doc);
                                if (jumpToDoc) {
                                    if (DocumentManager.Instance.getDocumentView(jumpToDoc)) {

                                        DocumentManager.Instance.jumpToDocument(jumpToDoc, e.altKey, undefined, undefined, NumCast((jumpToDoc === linkDoc.anchor2 ? linkDoc.anchor2Page : linkDoc.anchor1Page)));
                                        return;
                                    }
                                }
                                if (targetContext) {
                                    DocumentManager.Instance.jumpToDocument(targetContext, ctrlKey, false, document => this.props.addDocTab(document, undefined, location ? location : "inTab"));
                                } else if (jumpToDoc) {
                                    DocumentManager.Instance.jumpToDocument(jumpToDoc, ctrlKey, false, document => this.props.addDocTab(document, undefined, location ? location : "inTab"));

                                }
                            }
                        });
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
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
    }
    onPointerUp = (e: React.PointerEvent): void => {
        if (FormattedTextBox._toolTipTextMenu && FormattedTextBox._toolTipTextMenu.tooltip) {
            //this._toolTipTextMenu.tooltip.style.opacity = "1";
        }
        if (e.buttons === 1 && this.props.isSelected() && !e.altKey) {
            e.stopPropagation();
        }
    }

    @action
    onFocused = (e: React.FocusEvent): void => {
        document.removeEventListener("keypress", this.recordKeyHandler);
        document.addEventListener("keypress", this.recordKeyHandler);
        this.tryUpdateHeight();
        if (!this.props.isOverlay) {
            FormattedTextBox.InputBoxOverlay = this;
        } else {
            if (this._ref.current) {
                this._ref.current.scrollTop = FormattedTextBox.InputBoxOverlayScroll;
            }
        }
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        // if a text note is not selected and scrollable, this prevents us from being able to scroll and zoom out at the same time
        if (this.props.isSelected() || e.currentTarget.scrollHeight > e.currentTarget.clientHeight) {
            e.stopPropagation();
        }
    }

    onClick = (e: React.MouseEvent): void => {
        this._proseRef!.focus();
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
        //this.props.Document.tooltip = self._toolTipTextMenu;
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
    }
    public _undoTyping?: UndoManager.Batch;
    onKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            SelectionManager.DeselectAll();
        }
        e.stopPropagation();
        if (e.key === "Tab") e.preventDefault();
        // stop propagation doesn't seem to stop propagation of native keyboard events.
        // so we set a flag on the native event that marks that the event's been handled.
        (e.nativeEvent as any).DASHFormattedTextBoxHandled = true;
        if (StrCast(this.dataDoc.title).startsWith("-") && this._editorView && !this.Document.customTitle) {
            let str = this._editorView.state.doc.textContent;
            let titlestr = str.substr(0, Math.min(40, str.length));
            this.dataDoc.title = "-" + titlestr + (str.length > 40 ? "..." : "");
        }
        if (!this._undoTyping) {
            this._undoTyping = UndoManager.StartBatch("undoTyping");
        }
        this.tryUpdateHeight();
    }

    @action
    tryUpdateHeight() {
        const ChromeHeight = this.props.ChromeHeight;
        let sh = this._ref.current ? this._ref.current.scrollHeight : 0;
        if (!this.props.isOverlay && this.props.Document.autoHeight && sh !== 0) {
            let nh = this.props.Document.isTemplate ? 0 : NumCast(this.dataDoc.nativeHeight, 0);
            let dh = NumCast(this.props.Document.height, 0);
            this.props.Document.height = Math.max(10, (nh ? dh / nh * sh : sh) + (ChromeHeight ? ChromeHeight() : 0));
            this.dataDoc.nativeHeight = nh ? sh : undefined;
        }
    }

    @action
    onPointerEnter = (e: React.PointerEvent) => {
        this._entered = true;
    }
    @action
    onPointerLeave = (e: React.PointerEvent) => {
        this._entered = false;
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        // let subitems: ContextMenuProps[] = [];
        // subitems.push({
        //     description: BoolCast(this.props.Document.autoHeight) ? "Manual Height" : "Auto Height",
        //     event: action(() => Doc.GetProto(this.props.Document).autoHeight = !BoolCast(this.props.Document.autoHeight)), icon: "expand-arrows-alt"
        // });
        // ContextMenu.Instance.addItem({ description: "Text Funcs...", subitems: subitems, icon: "text-height" });
    }


    render() {
        let self = this;
        let style = this.props.isOverlay ? "scroll" : "hidden";
        let rounded = StrCast(this.props.Document.borderRounding) === "100%" ? "-rounded" : "";
        let interactive: "all" | "none" = InkingControl.Instance.selectedTool || this.props.Document.isBackground ||
            (this.props.Document.isButton && !this.props.isSelected()) ? "none" : "all";
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
                    fontSize: "13px"
                }}
                onKeyDown={this.onKeyPress}
                onFocus={this.onFocused}
                onClick={this.onClick}
                onContextMenu={this.specificContextMenu}
                onBlur={this.onBlur}
                onPointerUp={this.onPointerUp}
                onPointerDown={this.onPointerDown}
                onMouseDown={this.onMouseDown}
                onWheel={this.onPointerWheel}
                onPointerEnter={this.onPointerEnter}
                onPointerLeave={this.onPointerLeave}
            >
                <div className={`formattedTextBox-inner${rounded}`} ref={this.createDropTarget} style={{ whiteSpace: "pre-wrap" }} />
            </div>
        );
    }
}
