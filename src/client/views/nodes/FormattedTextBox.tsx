import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile, faTextHeight, faUpload } from '@fortawesome/free-solid-svg-icons';
import { isEqual } from "lodash";
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction, trace, _allowStateChangesInsideComputed } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { inputRules } from 'prosemirror-inputrules';
import { keymap } from "prosemirror-keymap";
import { Fragment, Mark, Node, Node as ProsNode, Slice } from "prosemirror-model";
import { EditorState, NodeSelection, Plugin, TextSelection, Transaction } from "prosemirror-state";
import { ReplaceStep } from 'prosemirror-transform';
import { EditorView } from "prosemirror-view";
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCastAsync, Opt, WidthSym, HeightSym, DataSym, Field } from "../../../new_fields/Doc";
import { Copy, Id } from '../../../new_fields/FieldSymbols';
import { RichTextField } from "../../../new_fields/RichTextField";
import { RichTextUtils } from '../../../new_fields/RichTextUtils';
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { numberRange, Utils, addStyleSheet, addStyleSheetRule, clearStyleSheetRules, emptyFunction, returnOne } from '../../../Utils';
import { GoogleApiClientUtils, Pulls, Pushes } from '../../apis/google_docs/GoogleApiClientUtils';
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { DictationManager } from '../../util/DictationManager';
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorExampleTransfer";
import { inpRules } from "../../util/RichTextRules";
import { DashDocCommentView, FootnoteView, ImageResizeView, DashDocView, OrderedListView, schema, SummaryView, DashFieldView } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocAnnotatableComponent, DocAnnotatableProps } from "../DocComponent";
import { DocumentButtonBar } from '../DocumentButtonBar';
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import { FormattedTextBoxComment, formattedTextBoxCommentPlugin } from './FormattedTextBoxComment';
import React = require("react");
import { ContextMenuProps } from '../ContextMenuItem';
import { ContextMenu } from '../ContextMenu';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { documentSchema } from '../../../new_fields/documentSchemas';
import { AudioBox } from './AudioBox';
import { CollectionFreeFormView } from '../collections/collectionFreeForm/CollectionFreeFormView';
import { InkTool } from '../../../new_fields/InkField';
import { TraceMobx } from '../../../new_fields/util';
import RichTextMenu from '../../util/RichTextMenu';

library.add(faEdit);
library.add(faSmile, faTextHeight, faUpload);

export interface FormattedTextBoxProps {
    hideOnLeave?: boolean;
}

const richTextSchema = createSchema({
    documentText: "string"
});

export const GoogleRef = "googleDocId";

type RichTextDocument = makeInterface<[typeof richTextSchema, typeof documentSchema]>;
const RichTextDocument = makeInterface(richTextSchema, documentSchema);

type PullHandler = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends DocAnnotatableComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(FormattedTextBox, fieldStr); }
    public static blankState = () => EditorState.create(FormattedTextBox.Instance.config);
    public static Instance: FormattedTextBox;
    public ProseRef?: HTMLDivElement;
    private _ref: React.RefObject<HTMLDivElement> = React.createRef();
    private _scrollRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _editorView: Opt<EditorView>;
    private _applyingChange: boolean = false;
    private _searchIndex = 0;
    private _sidebarMovement = 0;
    private _lastX = 0;
    private _lastY = 0;
    private _undoTyping?: UndoManager.Batch;
    private _searchReactionDisposer?: Lambda;
    private _scrollToRegionReactionDisposer: Opt<IReactionDisposer>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _heightReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
    private _pullReactionDisposer: Opt<IReactionDisposer>;
    private _pushReactionDisposer: Opt<IReactionDisposer>;
    private _buttonBarReactionDisposer: Opt<IReactionDisposer>;
    private dropDisposer?: DragManager.DragDropDisposer;

    @observable private _entered = false;

    public static FocusedBox: FormattedTextBox | undefined;
    public static SelectOnLoad = "";
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
                    if (linkDoc) { (linkDoc as Doc).anchor2 = this.dataDoc[key] as Doc; }
                    else DocUtils.MakeLink({ doc: this.dataDoc, ctx: this.props.ContainingCollectionDoc }, { doc: this.dataDoc[key] as Doc }, "Ref:" + value, "link to named target", id);
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
                    const link = this._editorView.state.schema.marks.link.create({ href: Utils.prepend("/doc/" + id), location: "onRight", title: value });
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
            tsel.marks().filter(m => m.type === this._editorView!.state.schema.marks.user_mark).map(m => AudioBox.SetScrubTime(Math.max(0, m.attrs.modified * 5000 - 1000)));
            this._applyingChange = true;
            if (!this.props.Document._textTemplate || Doc.GetProto(this.props.Document) === this.dataDoc) {
                this.dataDoc[this.props.fieldKey + "-lastModified"] && (this.dataDoc[this.props.fieldKey + "-backgroundColor"] = "lightGray");
                this.dataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now()));
                this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()), state.doc.textBetween(0, state.doc.content.size, "\n\n"));
            }
            this._applyingChange = false;
            this.updateTitle();
            this.tryUpdateHeight();
        }
    }

    updateTitle = () => {
        if (StrCast(this.dataDoc.title).startsWith("-") && this._editorView && !this.Document.customTitle) {
            const str = this._editorView.state.doc.textContent;
            const titlestr = str.substr(0, Math.min(40, str.length));
            this.dataDoc.title = "-" + titlestr + (str.length > 40 ? "..." : "");
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
        if (this._editorView && (this._editorView as any).docView) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            const end = this._editorView.state.doc.nodeSize - 2;
            this._editorView.dispatch(this._editorView.state.tr.removeMark(0, end, mark).removeMark(0, end, activeMark));
        }
    }
    adoptAnnotation = (start: number, end: number, mark: Mark) => {
        const view = this._editorView!;
        const nmark = view.state.schema.marks.user_mark.create({ ...mark.attrs, userid: Doc.CurrentUserEmail });
        view.dispatch(view.state.tr.removeMark(start, end, nmark).addMark(start, end, nmark));
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
        this.ProseRef = ele;
        this.dropDisposer && this.dropDisposer();
        ele && (this.dropDisposer = DragManager.MakeDropTarget(ele, this.drop.bind(this)));
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.docDragData) {
            const draggedDoc = de.complete.docDragData.draggedDocuments.length && de.complete.docDragData.draggedDocuments[0];
            // replace text contents whend dragging with Alt
            if (draggedDoc && draggedDoc.type === DocumentType.TEXT && !Doc.AreProtosEqual(draggedDoc, this.props.Document) && de.altKey) {
                if (draggedDoc.data instanceof RichTextField) {
                    Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new RichTextField(draggedDoc.data.Data, draggedDoc.data.Text);
                    e.stopPropagation();
                }
                // apply as template when dragging with Meta
            } else if (draggedDoc && draggedDoc.type === DocumentType.TEXT && !Doc.AreProtosEqual(draggedDoc, this.props.Document) && de.metaKey) {
                draggedDoc.isTemplateDoc = true;
                let newLayout = Doc.Layout(draggedDoc);
                if (typeof (draggedDoc.layout) === "string") {
                    newLayout = Doc.MakeDelegate(draggedDoc);
                    newLayout.layout = StrCast(newLayout.layout).replace(/fieldKey={'[^']*'}/, `fieldKey={'${this.props.fieldKey}'}`);
                }
                this.Document.layout_custom = newLayout;
                this.Document.layoutKey = "layout_custom";
                e.stopPropagation();
                // embed document when dragging with a userDropAction or an embedDoc flag set
            } else if (de.complete.docDragData.userDropAction || de.complete.docDragData.embedDoc) {
                const target = de.complete.docDragData.droppedDocuments[0];
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
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-remote", { background: "yellow" });
        }
        if (FormattedTextBox._highlights.indexOf("My Text") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { background: "moccasin" });
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
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            const min = Math.round(Date.now() / 1000 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-min-" + (min - i), { opacity: ((10 - i - 1) / 10).toString() }));
            setTimeout(() => this.updateHighlights());
        }
        if (FormattedTextBox._highlights.indexOf("By Recent Hour") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            const hr = Math.round(Date.now() / 1000 / 60 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-hr-" + (hr - i), { opacity: ((10 - i - 1) / 10).toString() }));
        }
    }

    sidebarDown = (e: React.PointerEvent) => {
        this._lastX = e.clientX;
        this._lastY = e.clientY;
        this._sidebarMovement = 0;
        document.addEventListener("pointermove", this.sidebarMove);
        document.addEventListener("pointerup", this.sidebarUp);
        e.stopPropagation();
        e.preventDefault(); // prevents text from being selected during drag
    }
    sidebarMove = (e: PointerEvent) => {
        const bounds = this.CurrentDiv.getBoundingClientRect();
        this._sidebarMovement += Math.sqrt((e.clientX - this._lastX) * (e.clientX - this._lastX) + (e.clientY - this._lastY) * (e.clientY - this._lastY));
        this.props.Document.sidebarWidthPercent = "" + 100 * (1 - (e.clientX - bounds.left) / bounds.width) + "%";
    }
    sidebarUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.sidebarMove);
        document.removeEventListener("pointerup", this.sidebarUp);
    }

    toggleSidebar = () => this._sidebarMovement < 5 && (this.props.Document.sidebarWidthPercent = StrCast(this.props.Document.sidebarWidthPercent, "0%") === "0%" ? "25%" : "0%");

    specificContextMenu = (e: React.MouseEvent): void => {
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Toggle Sidebar", event: () => { e.stopPropagation(); this.props.Document._showSidebar = !this.props.Document._showSidebar }, icon: "expand-arrows-alt" });
        funcs.push({ description: "Record Bullet", event: () => { e.stopPropagation(); this.recordBullet(); }, icon: "expand-arrows-alt" });
        ["My Text", "Text from Others", "Todo Items", "Important Items", "Ignore Items", "Disagree Items", "By Recent Minute", "By Recent Hour"].forEach(option =>
            funcs.push({
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

        ContextMenu.Instance.addItem({ description: "Text Funcs...", subitems: funcs, icon: "asterisk" });
    }

    @observable _recording = false;

    recordDictation = () => {
        //this._editorView!.focus();
        if (this._recording) return;
        runInAction(() => this._recording = true);
        DictationManager.Controls.listen({
            interimHandler: this.setCurrentBulletContent,
            continuous: { indefinite: false },
        }).then(results => {
            if (results && [DictationManager.Controls.Infringed].includes(results)) {
                DictationManager.Controls.stop();
            }
            this._editorView!.focus();
        });
    }
    stopDictation = (abort: boolean) => {
        runInAction(() => this._recording = false);
        DictationManager.Controls.stop(!abort);
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
            let state = this._editorView.state;
            const from = state.selection.from;
            const to = state.selection.to;
            this._editorView.dispatch(state.tr.insertText(value, from, to));
            state = this._editorView.state;
            const updated = TextSelection.create(state.doc, from, from + value.length);
            this._editorView.dispatch(state.tr.setSelection(updated));
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
    @computed get config() {
        this._keymap = buildKeymap(schema);
        (schema as any).Document = this.props.Document;
        return {
            schema,
            plugins: [
                inputRules(inpRules),
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

    componentDidMount() {
        this._buttonBarReactionDisposer = reaction(
            () => DocumentButtonBar.Instance,
            instance => {
                if (instance) {
                    this.pullFromGoogleDoc(this.checkState);
                    this.dataDoc[GoogleRef] && this.dataDoc.unchanged && runInAction(() => instance.isAnimatingFetch = true);
                }
            }
        );

        this._reactionDisposer = reaction(
            () => {
                const field = Cast(this.props.Document._textTemplate || this.dataDoc[this.props.fieldKey], RichTextField);
                return field ? field.Data : RichTextUtils.Initialize();
            },
            incomingValue => {
                if (this._editorView && !this._applyingChange) {
                    const updatedState = JSON.parse(incomingValue);
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
                    const unchanged = this.dataDoc.unchanged;
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
            () => [this.layoutDoc[WidthSym](), this.layoutDoc._autoHeight],
            () => this.tryUpdateHeight()
        );

        this.setupEditor(this.config, this.props.fieldKey);

        this._searchReactionDisposer = reaction(() => this.layoutDoc.searchMatch,
            search => search ? this.highlightSearchTerms([Doc.SearchQuery()]) : this.unhighlightSearchTerms(),
            { fireImmediately: true });

        this._scrollToRegionReactionDisposer = reaction(
            () => StrCast(this.layoutDoc.scrollToLinkID),
            async (scrollToLinkID) => {
                const findLinkFrag = (frag: Fragment, editor: EditorView) => {
                    const nodes: Node[] = [];
                    frag.forEach((node, index) => {
                        const examinedNode = findLinkNode(node, editor);
                        if (examinedNode && examinedNode.textContent) {
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
                    const linkIndex = marks.findIndex(mark => mark.type === editor.state.schema.marks.link);
                    return linkIndex !== -1 && scrollToLinkID === marks[linkIndex].attrs.href.replace(/.*\/doc\//, "") ? node : undefined;
                };

                let start = -1;
                if (this._editorView && scrollToLinkID) {
                    const editor = this._editorView;
                    const ret = findLinkFrag(editor.state.doc.content, editor);

                    if (ret.frag.size > 2 && ret.start >= 0) {
                        let selection = TextSelection.near(editor.state.doc.resolve(ret.start)); // default to near the start
                        if (ret.frag.firstChild) {
                            selection = TextSelection.between(editor.state.doc.resolve(ret.start + 2), editor.state.doc.resolve(ret.start + ret.frag.firstChild.nodeSize)); // bcz: looks better to not have the target selected
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
            dataDoc.data = new RichTextField(JSON.stringify(exportState.state.toJSON()));
            setTimeout(() => {
                if (this._editorView) {
                    const state = this._editorView.state;
                    const end = state.doc.content.size - 1;
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
        const pdfDocId = cbe.clipboardData && cbe.clipboardData.getData("dash/pdfOrigin");
        const pdfRegionId = cbe.clipboardData && cbe.clipboardData.getData("dash/pdfRegion");
        if (pdfDocId && pdfRegionId) {
            DocServer.GetRefField(pdfDocId).then(pdfDoc => {
                DocServer.GetRefField(pdfRegionId).then(pdfRegion => {
                    if ((pdfDoc instanceof Doc) && (pdfRegion instanceof Doc)) {
                        setTimeout(async () => {
                            const targetField = Doc.LayoutFieldKey(pdfDoc);
                            const targetAnnotations = await DocListCastAsync(pdfDoc[DataSym][targetField + "-annotations"]);// bcz: better to have the PDF's view handle updating its own annotations
                            targetAnnotations?.push(pdfRegion);
                        });

                        const link = DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: pdfRegion, ctx: pdfDoc }, "note on " + pdfDoc.title, "pasted PDF link");
                        if (link) {
                            cbe.clipboardData!.setData("dash/linkDoc", link[Id]);
                            const linkId = link[Id];
                            const frag = addMarkToFrag(slice.content, (node: Node) => addLinkMark(node, StrCast(pdfDoc.title), linkId));
                            slice = new Slice(frag, slice.openStart, slice.openEnd);
                            const tr = view.state.tr.replaceSelection(slice);
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

    private setupEditor(config: any, fieldKey: string) {
        const rtfField = Cast(this.props.Document._textTemplate || this.dataDoc[fieldKey], RichTextField);
        if (this.ProseRef) {
            const self = this;
            this._editorView?.destroy();
            this._editorView = new EditorView(this.ProseRef, {
                state: rtfField?.Data ? EditorState.fromJSON(config, JSON.parse(rtfField.Data)) : EditorState.create(config),
                handleScrollToSelection: (editorView) => {
                    const ref = editorView.domAtPos(editorView.state.selection.from);
                    let refNode = ref.node as any;
                    while (refNode && !("getBoundingClientRect" in refNode)) refNode = refNode.parentElement;
                    const r1 = refNode?.getBoundingClientRect();
                    const r3 = self._ref.current!.getBoundingClientRect();
                    if (r1.top < r3.top || r1.top > r3.bottom) {
                        r1 && (self._scrollRef.current!.scrollTop += (r1.top - r3.top) * self.props.ScreenToLocalTransform().Scale);
                    }
                    return true;
                },
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    dashComment(node, view, getPos) { return new DashDocCommentView(node, view, getPos); },
                    dashField(node, view, getPos) { return new DashFieldView(node, view, getPos, self); },
                    dashDoc(node, view, getPos) { return new DashDocView(node, view, getPos, self); },
                    image(node, view, getPos) { return new ImageResizeView(node, view, getPos, self.props.addDocTab); },
                    summary(node, view, getPos) { return new SummaryView(node, view, getPos); },
                    ordered_list(node, view, getPos) { return new OrderedListView(); },
                    footnote(node, view, getPos) { return new FootnoteView(node, view, getPos); }
                },
                clipboardTextSerializer: this.clipboardTextSerializer,
                handlePaste: this.handlePaste,
            });
            this._editorView.state.schema.Document = this.props.Document;
            const startupText = !rtfField && this._editorView && Field.toString(this.dataDoc[fieldKey] as Field);
            if (startupText) {
                this._editorView.dispatch(this._editorView.state.tr.insertText(startupText));
            }
        }

        const selectOnLoad = this.props.Document[Id] === FormattedTextBox.SelectOnLoad;
        if (selectOnLoad) {
            FormattedTextBox.SelectOnLoad = "";
            this.props.select(false);
        }
        (selectOnLoad /* || !rtfField?.Text*/) && this._editorView!.focus();
        // add user mark for any first character that was typed since the user mark that gets set in KeyPress won't have been called yet.
        this._editorView!.state.storedMarks = [...(this._editorView!.state.storedMarks ? this._editorView!.state.storedMarks : []), schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.round(Date.now() / 1000 / 5) })];
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
        this._reactionDisposer && this._reactionDisposer();
        this._proxyReactionDisposer && this._proxyReactionDisposer();
        this._pushReactionDisposer && this._pushReactionDisposer();
        this._pullReactionDisposer && this._pullReactionDisposer();
        this._heightReactionDisposer && this._heightReactionDisposer();
        this._searchReactionDisposer && this._searchReactionDisposer();
        this._buttonBarReactionDisposer && this._buttonBarReactionDisposer();
        this._editorView && this._editorView.destroy();
    }

    static _downEvent: any;
    onPointerDown = (e: React.PointerEvent): void => {
        this.doLinkOnDeselect();
        FormattedTextBox._downEvent = true;
        FormattedTextBoxComment.textBox = this;
        if (this.props.onClick && e.button === 0) {
            e.preventDefault();
        }
        if (e.button === 0 && this.active(true) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            if (e.clientX < this.ProseRef!.getBoundingClientRect().right) { // don't stop propagation if clicking in the sidebar
                e.stopPropagation();
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
            FormattedTextBoxComment.textBox = this;
            FormattedTextBoxComment.update(this._editorView!);
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

        // jump rich text menu to this textbox
        const { current } = this._ref;
        if (current) {
            const x = Math.min(Math.max(current.getBoundingClientRect().left, 0), window.innerWidth - RichTextMenu.Instance.width);
            const y = this._ref.current!.getBoundingClientRect().top - RichTextMenu.Instance.height - 50;
            RichTextMenu.Instance.jumpTo(x, y);
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

    onClick = (e: React.MouseEvent): void => {
        if ((this._editorView!.root as any).getSelection().isCollapsed) { // this is a hack to allow the cursor to be placed at the end of a document when the document ends in an inline dash comment.  Apparently Chrome on Windows has a bug/feature which breaks this when clicking after the end of the text.
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
            }
        }
        if ((e.nativeEvent as any).formattedHandled) { e.stopPropagation(); return; }
        (e.nativeEvent as any).formattedHandled = true;
        // if (e.button === 0 && ((!this.props.isSelected(true) && !e.ctrlKey) || (this.props.isSelected(true) && e.ctrlKey)) && !e.metaKey && e.target) {
        //     let href = (e.target as any).href;
        //     let location: string;
        //     if ((e.target as any).attributes.location) {
        //         location = (e.target as any).attributes.location.value;
        //     }
        //     let pcords = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
        //     let node = pcords && this._editorView!.state.doc.nodeAt(pcords.pos);
        //     if (node) {
        //         let link = node.marks.find(m => m.type === this._editorView!.state.schema.marks.link);
        //         if (link && !(link.attrs.docref && link.attrs.title)) {  // bcz: getting hacky.  this indicates that we clicked on a PDF excerpt quotation.  In this case, we don't want to follow the link (we follow only the actual hyperlink for the quotation which is handled above).
        //             href = link && link.attrs.href;
        //             location = link && link.attrs.location;
        //         }
        //     }
        //     if (href) {
        //         if (href.indexOf(Utils.prepend("/doc/")) === 0) {
        //             let linkClicked = href.replace(Utils.prepend("/doc/"), "").split("?")[0];
        //             if (linkClicked) {
        //                 DocServer.GetRefField(linkClicked).then(async linkDoc => {
        //                     (linkDoc instanceof Doc) &&
        //                         DocumentManager.Instance.FollowLink(linkDoc, this.props.Document, document => this.props.addDocTab(document, undefined, location ? location : "inTab"), false);
        //                 });
        //             }
        //         } else {
        //             let webDoc = Docs.Create.WebDocument(href, { x: NumCast(this.layoutDoc.x, 0) + NumCast(this.layoutDoc.width, 0), y: NumCast(this.layoutDoc.y) });
        //             this.props.addDocument && this.props.addDocument(webDoc);
        //         }
        //         e.stopPropagation();
        //         e.preventDefault();
        //     }
        // }

        this.hitBulletTargets(e.clientX, e.clientY, e.shiftKey, false);
        if (this._recording) setTimeout(() => { this.stopDictation(true); setTimeout(() => this.recordDictation(), 500); }, 500);
    }

    // this hackiness handles clicking on the list item bullets to do expand/collapse.  the bullets are ::before pseudo elements so there's no real way to hit test against them.
    hitBulletTargets(x: number, y: number, select: boolean, highlightOnly: boolean) {
        clearStyleSheetRules(FormattedTextBox._bulletStyleSheet);
        const pos = this._editorView!.posAtCoords({ left: x, top: y });
        if (pos && this.props.isSelected(true)) {
            // let beforeEle = document.querySelector("." + hit.className) as Element; // const before = hit ? window.getComputedStyle(hit, ':before') : undefined;
            //const node = this._editorView!.state.doc.nodeAt(pos.pos);
            const $pos = this._editorView!.state.doc.resolve(pos.pos);
            let list_node = $pos.node().type === schema.nodes.list_item ? $pos.node() : undefined;
            if ($pos.node().type === schema.nodes.ordered_list) {
                for (let off = 1; off < 100; off++) {
                    const pos = this._editorView!.posAtCoords({ left: x + off, top: y });
                    const node = pos && this._editorView!.state.doc.nodeAt(pos.pos);
                    if (node?.type === schema.nodes.list_item) {
                        list_node = node;
                        break;
                    }
                }
            }
            if (list_node && pos.inside >= 0 && this._editorView!.state.doc.nodeAt(pos.inside)!.attrs.bulletStyle === list_node.attrs.bulletStyle) {
                if (select) {
                    const $olist_pos = this._editorView!.state.doc.resolve($pos.pos - $pos.parentOffset - 1);
                    if (!highlightOnly) {
                        this._editorView!.dispatch(this._editorView!.state.tr.setSelection(new NodeSelection($olist_pos)));
                    }
                    addStyleSheetRule(FormattedTextBox._bulletStyleSheet, list_node.attrs.mapStyle + list_node.attrs.bulletStyle + ":hover:before", { background: "lightgray" });
                } else if (Math.abs(pos.pos - pos.inside) < 2) {
                    if (!highlightOnly) {
                        this._editorView!.dispatch(this._editorView!.state.tr.setNodeMarkup(pos.inside, list_node.type, { ...list_node.attrs, visibility: !list_node.attrs.visibility }));
                        this._editorView!.dispatch(this._editorView!.state.tr.setSelection(TextSelection.create(this._editorView!.state.doc, pos.inside)));
                    }
                    addStyleSheetRule(FormattedTextBox._bulletStyleSheet, list_node.attrs.mapStyle + list_node.attrs.bulletStyle + ":hover:before", { background: "lightgray" });
                }
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
        const self = FormattedTextBox;
        return new Plugin({
            view(newView) {
                RichTextMenu.Instance.changeView(newView);
                return RichTextMenu.Instance;
            }
        });
    }

    onBlur = (e: any) => {
        //DictationManager.Controls.stop(false);
        if (this._undoTyping) {
            this._undoTyping.end();
            this._undoTyping = undefined;
        }
        this.doLinkOnDeselect();

        // move the richtextmenu offscreen
        if (!RichTextMenu.Instance.Pinned && !RichTextMenu.Instance.overMenu) RichTextMenu.Instance.jumpTo(-300, -300);
    }

    _lastTimedMark: Mark | undefined = undefined;
    onKeyPress = (e: React.KeyboardEvent) => {
        if (e.altKey) {
            e.preventDefault();
            return;
        }
        const state = this._editorView!.state;
        if (!state.selection.empty && e.key === "%") {
            state.schema.EnteringStyle = true;
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        if (state.selection.empty || !state.schema.EnteringStyle) {
            state.schema.EnteringStyle = false;
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
        const mark = e.key !== " " && this._lastTimedMark ? this._lastTimedMark : schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.round(Date.now() / 1000 / 5) });
        this._lastTimedMark = mark;
        this._editorView!.dispatch(this._editorView!.state.tr.removeStoredMark(schema.marks.user_mark.create({})).addStoredMark(mark));

        if (!this._undoTyping) {
            this._undoTyping = UndoManager.StartBatch("undoTyping");
        }
        if (this._recording) {
            this.stopDictation(true);
            setTimeout(() => this.recordDictation(), 250);
        }
    }

    @action
    tryUpdateHeight(limitHeight?: number) {
        let scrollHeight = this._ref.current?.scrollHeight;
        if (this.layoutDoc._autoHeight && scrollHeight &&
            getComputedStyle(this._ref.current!.parentElement!).top === "0px") {  // if top === 0, then the text box is growing upward (as the overlay caption) which doesn't contribute to the height computation
            if (limitHeight && scrollHeight > limitHeight) {
                scrollHeight = limitHeight;
                this.layoutDoc.limitHeight = undefined;
                this.layoutDoc._autoHeight = false;
            }
            const nh = this.Document.isTemplateForField ? 0 : NumCast(this.dataDoc._nativeHeight, 0);
            const dh = NumCast(this.layoutDoc._height, 0);
            const newHeight = Math.max(10, (nh ? dh / nh * scrollHeight : scrollHeight) + (this.props.ChromeHeight ? this.props.ChromeHeight() : 0));
            if (Math.abs(newHeight - dh) > 1) { // bcz: Argh!  without this, we get into a React crash if the same document is opened in a freeform view and in the treeview.  no idea why, but after dragging the freeform document, selecting it, and selecting text, it will compute to 1 pixel higher than the treeview which causes a cycle
                this.layoutDoc._height = newHeight;
                this.dataDoc._nativeHeight = nh ? scrollHeight : undefined;
            }
        }
    }

    @computed get sidebarWidthPercent() { return StrCast(this.props.Document.sidebarWidthPercent, "0%"); }
    sidebarWidth = () => { return Number(this.sidebarWidthPercent.substring(0, this.sidebarWidthPercent.length - 1)) / 100 * this.props.PanelWidth(); }
    sidebarScreenToLocal = () => this.props.ScreenToLocalTransform().translate(-(this.props.PanelWidth() - this.sidebarWidth()), 0);
    @computed get sidebarColor() { return StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], StrCast(this.layoutDoc[this.props.fieldKey + "-backgroundColor"], "transparent")); }
    render() {
        TraceMobx();
        const rounded = StrCast(this.layoutDoc.borderRounding) === "100%" ? "-rounded" : "";
        const interactive = InkingControl.Instance.selectedTool || this.layoutDoc.isBackground;
        if (this.props.isSelected()) {
            this._editorView && RichTextMenu.Instance.updateFromDash(this._editorView, undefined, this.props);
        } else if (FormattedTextBoxComment.textBox === this) {
            FormattedTextBoxComment.Hide();
        }
        return (
            <div className={`formattedTextBox-cont`} ref={this._ref}
                style={{
                    height: this.layoutDoc._autoHeight ? "max-content" : undefined,
                    background: this.props.hideOnLeave ? "rgba(0,0,0 ,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered ? 1 : 0.1) : 1,
                    color: this.props.hideOnLeave ? "white" : "inherit",
                    pointerEvents: interactive ? "none" : "all",
                    fontSize: NumCast(this.layoutDoc.fontSize, 13),
                    fontFamily: StrCast(this.layoutDoc.fontFamily, "Crimson Text"),
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
                onPointerLeave={action(() => this._entered = false)}
            >
                <div className={`formattedTextBox-outer`} style={{ width: `calc(100% - ${this.sidebarWidthPercent})`, }} ref={this._scrollRef}>
                    <div className={`formattedTextBox-inner${rounded}`} style={{ whiteSpace: "pre-wrap", pointerEvents: ((this.Document.isButton || this.props.onClick) && !this.props.isSelected()) ? "none" : undefined }} ref={this.createDropTarget} />
                </div>
                {!this.props.Document._showSidebar ? (null) : this.sidebarWidthPercent === "0%" ?
                    <div className="formattedTextBox-sidebar-handle" onPointerDown={this.sidebarDown} onClick={e => this.toggleSidebar()} /> :
                    <div className={"formattedTextBox-sidebar" + (InkingControl.Instance.selectedTool !== InkTool.None ? "-inking" : "")}
                        style={{ width: `${this.sidebarWidthPercent}`, backgroundColor: `${this.sidebarColor}` }}>
                        <CollectionFreeFormView {...this.props}
                            PanelHeight={this.props.PanelHeight}
                            PanelWidth={this.sidebarWidth}
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
                            ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                            chromeCollapsed={true}>
                        </CollectionFreeFormView>
                        <div className="formattedTextBox-sidebar-handle" onPointerDown={this.sidebarDown} onClick={e => this.toggleSidebar()} />
                    </div>}
                <div className="formattedTextBox-dictation"
                    onClick={e => {
                        this._recording ? this.stopDictation(true) : this.recordDictation();
                        setTimeout(() => this._editorView!.focus(), 500);
                        e.stopPropagation();
                    }} >
                    <FontAwesomeIcon className="formattedTExtBox-audioFont"
                        style={{ color: this._recording ? "red" : "blue", opacity: this._recording ? 1 : 0.5, display: this.props.isSelected() ? "" : "none" }} icon={"microphone"} size="sm" />
                </div>
            </div>
        );
    }
}
