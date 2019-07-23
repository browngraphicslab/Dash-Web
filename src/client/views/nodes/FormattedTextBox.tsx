import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction, runInAction, computed, Lambda, trace } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { NodeType } from 'prosemirror-model';
import { Node as ProsNode } from "prosemirror-model";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc, Opt } from "../../../new_fields/Doc";
import { Id, Copy } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { RichTextField } from "../../../new_fields/RichTextField";
import { createSchema, listSpec, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, Cast, NumCast, StrCast, DateCast } from "../../../new_fields/Types";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorExampleTransfer";
import { inpRules } from "../../util/RichTextRules";
import { ImageResizeView, schema, SummarizedView } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { ContextMenu } from "../../views/ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { Templates } from '../Templates';
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");
import { For } from 'babel-types';
import { DateField } from '../../../new_fields/DateField';
import { thisExpression } from 'babel-types';
import { Utils } from '../../../Utils';

library.add(faEdit);
library.add(faSmile);

// FormattedTextBox: Displays an editable plain text node that maps to a specified Key of a Document
//

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

type RichTextDocument = makeInterface<[typeof richTextSchema]>;
const RichTextDocument = makeInterface(richTextSchema);

@observer
export class FormattedTextBox extends DocComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string = "data") {
        return FieldView.LayoutString(FormattedTextBox, fieldStr);
    }
    public static Instance: FormattedTextBox;
    private _ref: React.RefObject<HTMLDivElement>;
    private _outerdiv?: (dominus: HTMLElement) => void;
    private _proseRef?: HTMLDivElement;
    private _editorView: Opt<EditorView>;
    private static _toolTipTextMenu: TooltipTextMenu | undefined = undefined;
    private _applyingChange: boolean = false;
    private _linkClicked = "";
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _searchReactionDisposer?: Lambda;
    private _textReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
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
        //if (this.props.firstinstance) {
        FormattedTextBox.Instance = this;
        //}
        if (this.props.outer_div) {
            this._outerdiv = this.props.outer_div;
        }

        this._ref = React.createRef();
        if (this.props.isOverlay) {
            DragManager.StartDragFunctions.push(() => FormattedTextBox.InputBoxOverlay = undefined);
        }
    }

    @computed get extensionDoc() { return Doc.resolvedFieldDataDoc(this.dataDoc, this.props.fieldKey, "dummy"); }

    @computed get dataDoc() { return BoolCast(this.props.Document.isTemplate) && this.props.DataDoc ? this.props.DataDoc : Doc.GetProto(this.props.Document); }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this._applyingChange = true;
            const fieldkey = "preview";
            if (Object.keys(this.dataDoc).indexOf(fieldkey) !== -1) {
                this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()));
                this.dataDoc[this.props.fieldKey + "_text"] = state.doc.textBetween(0, state.doc.content.size, "\n\n");
            }
            else {
                Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()));
                Doc.GetProto(this.dataDoc)[this.props.fieldKey + "_text"] = state.doc.textBetween(0, state.doc.content.size, "\n\n");
            }
            if (this.extensionDoc) this.extensionDoc.text = state.doc.textBetween(0, state.doc.content.size, "\n\n");
            if (this.extensionDoc) this.extensionDoc.lastModified = new DateField(new Date(Date.now()));
            this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()));
            this._applyingChange = false;
            let title = StrCast(this.dataDoc.title);
            if (title && title.startsWith("-") && this._editorView) {
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
                            // else {
                            //     this._editorView.state.tr.addMark(start, start + word.length, mark).removeStoredMark(mark);
                            // }
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
        } else {
            if (de.data instanceof DragManager.DocumentDragData) {
                this.props.Document.layout = de.data.draggedDocuments[0];
                de.data.draggedDocuments[0].isTemplate = true;
                e.stopPropagation();
                // let ldocs = Cast(this.dataDoc.subBulletDocs, listSpec(Doc));
                // if (!ldocs) {
                //     this.dataDoc.subBulletDocs = new List<Doc>([]);
                // }
                // ldocs = Cast(this.dataDoc.subBulletDocs, listSpec(Doc));
                // if (!ldocs) return;
                // if (!ldocs || !ldocs[0] || ldocs[0] instanceof Promise || StrCast((ldocs[0] as Doc).layout).indexOf("CollectionView") === -1) {
                //     ldocs.splice(0, 0, Docs.StackingDocument([], { title: StrCast(this.dataDoc.title) + "-subBullets", x: NumCast(this.props.Document.x), y: NumCast(this.props.Document.y) + NumCast(this.props.Document.height), width: 300, height: 300 }));
                //     this.props.addDocument && this.props.addDocument(ldocs[0] as Doc);
                //     this.props.Document.templates = new List<string>([Templates.Bullet.Layout]);
                //     this.props.Document.isBullet = true;
                // }
                // let stackDoc = (ldocs[0] as Doc);
                // if (de.data.moveDocument) {
                //     de.data.moveDocument(de.data.draggedDocuments[0], stackDoc, (doc) => {
                //         Cast(stackDoc.data, listSpec(Doc))!.push(doc);
                //         return true;
                //     });
                // }
            }
        }
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

        this._reactionDisposer = reaction(
            () => {
                const field = this.dataDoc ? Cast(this.dataDoc[this.props.fieldKey], RichTextField) : undefined;
                return field ? field.Data : `{"doc":{"type":"doc","content":[]},"selection":{"type":"text","anchor":0,"head":0}}`;
            },
            field2 => {
                this._editorView && !this._applyingChange &&
                    this._editorView.updateState(EditorState.fromJSON(config, JSON.parse(field2)));
            }
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
                    star(node, view, getPos) { return new SummarizedView(node, view, getPos); }
                }
            });
            if (startup) {
                Doc.GetProto(doc).documentText = undefined;
                this._editorView.dispatch(this._editorView.state.tr.insertText(startup));
            }
        }

        if (this.props.selectOnLoad) {
            if (!this.props.isOverlay) this.props.select(false);
            else this._editorView!.focus();
            this.tryUpdateHeight();
        }
    }

    componentWillUnmount() {
        this._editorView && this._editorView.destroy();
        this._reactionDisposer && this._reactionDisposer();
        this._proxyReactionDisposer && this._proxyReactionDisposer();
        this._textReactionDisposer && this._textReactionDisposer();
    }

    onPointerDown = (e: React.PointerEvent): void => {
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
        if (StrCast(this.dataDoc.title).startsWith("-") && this._editorView) {
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
        if (this.props.isOverlay && this.props.Document.autoHeight) {
            let self = this;
            let xf = this._ref.current!.getBoundingClientRect();
            let scrBounds = this.props.ScreenToLocalTransform().transformBounds(0, 0, xf.width, xf.height);
            let nh = NumCast(this.dataDoc.nativeHeight, 0);
            let dh = NumCast(this.props.Document.height, 0);
            let sh = scrBounds.height;
            this.props.Document.height = nh ? dh / nh * sh : sh;
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
        let subitems: ContextMenuProps[] = [];
        subitems.push({
            description: BoolCast(this.props.Document.autoHeight, false) ? "Manual Height" : "Auto Height",
            event: action(() => Doc.GetProto(this.props.Document).autoHeight = !BoolCast(this.props.Document.autoHeight, false)), icon: "expand-arrows-alt"
        });
        ContextMenu.Instance.addItem({ description: "Text Funcs...", subitems: subitems });
    }
    render() {
        let self = this;
        let style = this.props.isOverlay ? "scroll" : "hidden";
        let rounded = StrCast(this.props.Document.borderRounding) === "100%" ? "-rounded" : "";
        let interactive = InkingControl.Instance.selectedTool ? "" : "interactive";
        Doc.UpdateDocumentExtensionForField(this.dataDoc, this.props.fieldKey);
        return (
            <div className={`formattedTextBox-cont-${style}`} ref={this._ref}
                style={{
                    height: this.props.height ? this.props.height : undefined,
                    background: this.props.hideOnLeave ? "rgba(0,0,0,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered || this.props.isSelected() || this.props.Document.libraryBrush ? 1 : 0.1) : 1,
                    color: this.props.color ? this.props.color : this.props.hideOnLeave ? "white" : "inherit",
                    pointerEvents: interactive ? "all" : "none",
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
                // tfs: do we need this event handler
                onWheel={this.onPointerWheel}
                onPointerEnter={this.onPointerEnter}
                onPointerLeave={this.onPointerLeave}
            >
                <div className={`formattedTextBox-inner${rounded}`} ref={this.createDropTarget} style={{ whiteSpace: "pre-wrap", pointerEvents: this.props.Document.isButton && !this.props.isSelected() ? "none" : "all" }} />
            </div>
        );
    }
}
