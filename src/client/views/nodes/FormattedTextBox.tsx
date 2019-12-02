import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile, faTextHeight, faUpload } from '@fortawesome/free-solid-svg-icons';
import _ from "lodash";
import { action, computed, IReactionDisposer, Lambda, observable, reaction, runInAction, trace } from "mobx";
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
import { Doc, DocListCastAsync, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
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
import { FootnoteView, ImageResizeView, DashDocView, OrderedListView, schema, SummarizedView } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocAnnotatableComponent } from "../DocComponent";
import { DocumentButtonBar } from '../DocumentButtonBar';
import { DocumentDecorations } from '../DocumentDecorations';
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

type RichTextDocument = makeInterface<[typeof richTextSchema, typeof documentSchema]>;
const RichTextDocument = makeInterface(richTextSchema, documentSchema);

type PullHandler = (exportState: Opt<GoogleApiClientUtils.Docs.ImportResult>, dataDoc: Doc) => void;

@observer
export class FormattedTextBox extends DocAnnotatableComponent<(FieldViewProps & FormattedTextBoxProps), RichTextDocument>(RichTextDocument) {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(FormattedTextBox, fieldStr); }
    public static blankState = () => EditorState.create(FormattedTextBox.Instance.config);
    public static Instance: FormattedTextBox;
    public static ToolTipTextMenu: TooltipTextMenu | undefined = undefined;
    private _ref: React.RefObject<HTMLDivElement> = React.createRef();
    private _proseRef?: HTMLDivElement;
    private _editorView: Opt<EditorView>;
    private _applyingChange: boolean = false;
    private _nodeClicked: any;
    private _searchIndex = 0;
    private _undoTyping?: UndoManager.Batch;
    private _searchReactionDisposer?: Lambda;
    private _scrollToRegionReactionDisposer: Opt<IReactionDisposer>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _heightReactionDisposer: Opt<IReactionDisposer>;
    private _rulesReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
    private _pullReactionDisposer: Opt<IReactionDisposer>;
    private _pushReactionDisposer: Opt<IReactionDisposer>;
    private dropDisposer?: DragManager.DragDropDisposer;

    @observable private _ruleFontSize = 0;
    @observable private _ruleFontFamily = "Arial";
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

    public static getToolTip(ev: EditorView) {
        return this.ToolTipTextMenu ? this.ToolTipTextMenu : this.ToolTipTextMenu = new TooltipTextMenu(ev);
    }

    @undoBatch
    public setFontColor(color: string) {
        let view = this._editorView!;
        if (view.state.selection.from === view.state.selection.to) return false;
        if (view.state.selection.to - view.state.selection.from > view.state.doc.nodeSize - 3) {
            this.layoutDoc.color = color;
        }
        let colorMark = view.state.schema.mark(view.state.schema.marks.pFontColor, { color: color });
        view.dispatch(view.state.tr.addMark(view.state.selection.from, view.state.selection.to, colorMark));
        return true;
    }

    constructor(props: any) {
        super(props);
        FormattedTextBox.Instance = this;
    }

    public get CurrentDiv(): HTMLDivElement { return this._ref.current!; }

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

            let tsel = this._editorView.state.selection.$from;
            tsel.marks().filter(m => m.type === this._editorView!.state.schema.marks.user_mark).map(m => AudioBox.SetScrubTime(Math.max(0, m.attrs.modified * 5000 - 1000)));
            this._applyingChange = true;
            this.extensionDoc && (this.extensionDoc.lastModified = new DateField(new Date(Date.now())));
            this.dataDoc[this.props.fieldKey] = new RichTextField(JSON.stringify(state.toJSON()), state.doc.textBetween(0, state.doc.content.size, "\n\n"));
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

    public highlightSearchTerms = (terms: string[]) => {
        if (this._editorView && (this._editorView as any).docView) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            let res = terms.map(term => this.findInNode(this._editorView!, this._editorView!.state.doc, term));
            let tr = this._editorView.state.tr;
            let flattened: TextSelection[] = [];
            res.map(r => r.map(h => flattened.push(h)));
            let lastSel = Math.min(flattened.length - 1, this._searchIndex);
            flattened.forEach((h: TextSelection, ind: number) => tr = tr.addMark(h.from, h.to, ind === lastSel ? activeMark : mark));
            this._searchIndex = ++this._searchIndex > flattened.length - 1 ? 0 : this._searchIndex;
            this._editorView.dispatch(tr.setSelection(new TextSelection(tr.doc.resolve(flattened[lastSel].from), tr.doc.resolve(flattened[lastSel].to))).scrollIntoView());
        }
    }

    public unhighlightSearchTerms = () => {
        if (this._editorView && (this._editorView as any).docView) {
            const mark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight);
            const activeMark = this._editorView.state.schema.mark(this._editorView.state.schema.marks.search_highlight, { selected: true });
            let end = this._editorView.state.doc.nodeSize - 2;
            this._editorView.dispatch(this._editorView.state.tr.removeMark(0, end, mark).removeMark(0, end, activeMark));
        }
    }
    setAnnotation = (start: number, end: number, mark: Mark, opened: boolean, keep: boolean = false) => {
        let view = this._editorView!;
        let nmark = view.state.schema.marks.user_mark.create({ ...mark.attrs, userid: keep ? Doc.CurrentUserEmail : mark.attrs.userid, opened: opened });
        view.dispatch(view.state.tr.removeMark(start, end, nmark).addMark(start, end, nmark));
    }
    protected createDropTarget = (ele: HTMLDivElement) => {
        this._proseRef = ele;
        this.dropDisposer && this.dropDisposer();
        ele && (this.dropDisposer = DragManager.MakeDropTarget(ele, { handlers: { drop: this.drop.bind(this) } }));
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            const draggedDoc = de.data.draggedDocuments.length && de.data.draggedDocuments[0];
            // replace text contents whend dragging with Alt
            if (draggedDoc && draggedDoc.type === DocumentType.TEXT && !Doc.AreProtosEqual(draggedDoc, this.props.Document) && de.mods === "AltKey") {
                if (draggedDoc.data instanceof RichTextField) {
                    Doc.GetProto(this.dataDoc)[this.props.fieldKey] = new RichTextField(draggedDoc.data.Data, draggedDoc.data.Text);
                    e.stopPropagation();
                }
                // apply as template when dragging with Meta
            } else if (draggedDoc && draggedDoc.type === DocumentType.TEXT && !Doc.AreProtosEqual(draggedDoc, this.props.Document) && de.mods === "MetaKey") {
                draggedDoc.isTemplateDoc = true;
                let newLayout = Doc.Layout(draggedDoc);
                if (typeof (draggedDoc.layout) === "string") {
                    newLayout = Doc.MakeDelegate(draggedDoc);
                    newLayout.layout = StrCast(newLayout.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${this.props.fieldKey}"}`);
                }
                this.Document.layoutCustom = newLayout;
                this.Document.layoutKey = "layoutCustom";
                e.stopPropagation();
                // embed document when dragging with a userDropAction or an embedDoc flag set
            } else if (de.data.userDropAction || de.data.embedDoc) {
                let target = de.data.droppedDocuments[0];
                // const link = DocUtils.MakeLink({ doc: this.dataDoc, ctx: this.props.ContainingCollectionDoc }, { doc: target }, "Embedded Doc:" + target.title);
                // if (link) {
                target.fitToBox = true;
                let node = schema.nodes.dashDoc.create({
                    width: target[WidthSym](), height: target[HeightSym](),
                    title: "dashDoc", docid: target[Id],
                    float: "right"
                });
                let view = this._editorView!;
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
                let result = this.getNodeEndpoints((context.content as any).content[i], node);
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
            let index = 0, foundAt, ep = this.getNodeEndpoints(pm.state.doc, node);
            while (ep && (foundAt = node.textContent.slice(index).search(RegExp(find, "i"))) > -1) {
                let sel = new TextSelection(pm.state.doc.resolve(ep.from + index + foundAt + 1), pm.state.doc.resolve(ep.from + index + foundAt + find.length + 1));
                ret.push(sel);
                index = index + foundAt + find.length;
            }
        } else {
            node.content.forEach((child, i) => ret = ret.concat(this.findInNode(pm, child, find)));
        }
        return ret;
    }
    static _highlights: string[] = [];

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
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userTag-" + "ignore", { "font-size": "0" });
        }
        if (FormattedTextBox._highlights.indexOf("By Recent Minute") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            let min = Math.round(Date.now() / 1000 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-min-" + (min - i), { opacity: ((10 - i - 1) / 10).toString() }));
            setTimeout(() => this.updateHighlights());
        }
        if (FormattedTextBox._highlights.indexOf("By Recent Hour") !== -1) {
            addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-" + Doc.CurrentUserEmail.replace(".", "").replace("@", ""), { opacity: "0.1" });
            let hr = Math.round(Date.now() / 1000 / 60 / 60);
            numberRange(10).map(i => addStyleSheetRule(FormattedTextBox._userStyleSheet, "userMark-hr-" + (hr - i), { opacity: ((10 - i - 1) / 10).toString() }));
        }
    }

    toggleSidebar = () => this.props.Document.sidebarWidthPercent = StrCast(this.props.Document.sidebarWidthPercent, "0%") === "0%" ? "25%" : "0%";

    specificContextMenu = (e: React.MouseEvent): void => {
        let funcs: ContextMenuProps[] = [];
        funcs.push({ description: "Toggle Sidebar", event: () => { e.stopPropagation(); this.toggleSidebar(); }, icon: "expand-arrows-alt" });
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
            if (this._editorView.state.doc.resolve(pos).depth >= 2) {
                let slice = new Slice(frag, 2, 2);
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
            () => [this.layoutDoc[WidthSym](), this.layoutDoc.autoHeight],
            () => this.tryUpdateHeight()
        );


        this.setupEditor(this.config, this.dataDoc, this.props.fieldKey);

        this._searchReactionDisposer = reaction(() => {
            return StrCast(this.layoutDoc.search_string);
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
            let heading = NumCast(this.layoutDoc.heading);
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
                this._ruleFontFamily = rules ? rules.font : "Arial";
                this._ruleFontSize = rules ? rules.size : 0;
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
            () => StrCast(this.layoutDoc.scrollToLinkID),
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
                            const extension = Doc.fieldExtensionDoc(pdfDoc, "data");
                            if (extension) {
                                let targetAnnotations = await DocListCastAsync(extension.annotations);// bcz: NO... this assumes the pdf is using its 'data' field.  need to have the PDF's view handle updating its own annotations
                                targetAnnotations && targetAnnotations.push(pdfRegion);
                            }
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
                    if (r1.top < r3.top || r1.top > r3.bottom) {
                        r1 && (self._ref.current!.scrollTop += (r1.top - r3.top) * self.props.ScreenToLocalTransform().Scale);
                    }
                    return true;
                },
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    dashDoc(node, view, getPos) { return new DashDocView(node, view, getPos, self); },
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
            this._editorView!.focus();
        }
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
        this._rulesReactionDisposer && this._rulesReactionDisposer();
        this._reactionDisposer && this._reactionDisposer();
        this._proxyReactionDisposer && this._proxyReactionDisposer();
        this._pushReactionDisposer && this._pushReactionDisposer();
        this._pullReactionDisposer && this._pullReactionDisposer();
        this._heightReactionDisposer && this._heightReactionDisposer();
        this._searchReactionDisposer && this._searchReactionDisposer();
        this._editorView && this._editorView.destroy();
    }
    onPointerDown = (e: React.PointerEvent): void => {
        FormattedTextBoxComment.textBox = this;
        let pos = this._editorView!.posAtCoords({ left: e.clientX, top: e.clientY });
        pos && (this._nodeClicked = this._editorView!.state.doc.nodeAt(pos.pos));
        if (this.props.onClick && e.button === 0) {
            e.preventDefault();
        }
        if (e.button === 0 && this.props.isSelected(true) && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            e.preventDefault();
        }
    }

    onPointerUp = (e: React.PointerEvent): void => {
        if (!(e.nativeEvent as any).formattedHandled) {
            FormattedTextBoxComment.textBox = this;
            FormattedTextBoxComment.update(this._editorView!);
        }
        (e.nativeEvent as any).formattedHandled = true;

        if (e.buttons === 1 && this.props.isSelected(true) && !e.altKey) {
            e.stopPropagation();
        }
    }

    static InputBoxOverlay: FormattedTextBox | undefined;
    @action
    onFocused = (e: React.FocusEvent): void => {
        FormattedTextBox.InputBoxOverlay = this;
        this.tryUpdateHeight();
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

        this.hitBulletTargets(e.clientX, e.clientY, e.nativeEvent.offsetX, e.shiftKey);
        if (this._recording) setTimeout(() => { this.stopDictation(true); setTimeout(() => this.recordDictation(), 500); }, 500);
    }

    // this hackiness handles clicking on the list item bullets to do expand/collapse.  the bullets are ::before pseudo elements so there's no real way to hit test against them.
    hitBulletTargets(x: number, y: number, offsetX: number, select: boolean, highlightOnly = false) {
        clearStyleSheetRules(FormattedTextBox._bulletStyleSheet);
        if (this.props.isSelected(true) && offsetX < 40) {
            let pos = this._editorView!.posAtCoords({ left: x, top: y });
            if (pos && pos.pos > 0) {
                let node = this._editorView!.state.doc.nodeAt(pos.pos);
                let node2 = node?.type === schema.nodes.paragraph ? this._editorView!.state.doc.nodeAt(pos.pos - 1) : undefined;
                if ((node === this._nodeClicked || highlightOnly) && (node2?.type === schema.nodes.ordered_list || node2?.type === schema.nodes.list_item)) {
                    let hit = this._editorView!.domAtPos(pos.pos).node as any;   // let beforeEle = document.querySelector("." + hit.className) as Element;
                    let before = hit ? window.getComputedStyle(hit, ':before') : undefined;
                    let beforeWidth = before ? Number(before.getPropertyValue('width').replace("px", "")) : undefined;
                    if (beforeWidth && offsetX < beforeWidth * .9) {
                        let ol = this._editorView!.state.doc.nodeAt(pos.pos - 2) ? this._editorView!.state.doc.nodeAt(pos.pos - 2) : undefined;
                        if (ol?.type === schema.nodes.ordered_list && select) {
                            if (!highlightOnly) {
                                this._editorView!.dispatch(this._editorView!.state.tr.setSelection(new NodeSelection(this._editorView!.state.doc.resolve(pos.pos - 2))));
                            }
                            addStyleSheetRule(FormattedTextBox._bulletStyleSheet, hit.className + ":before", { background: "lightgray" });
                        } else {
                            if (highlightOnly) {
                                addStyleSheetRule(FormattedTextBox._bulletStyleSheet, hit.className + ":before", { background: "lightgray" });
                            } else {
                                this._editorView!.dispatch(this._editorView!.state.tr.setNodeMarkup(pos.pos - 1, node2.type, { ...node2.attrs, visibility: !node2.attrs.visibility }));
                            }
                        }
                    }
                }
            }
        }
    }
    onMouseUp = (e: React.MouseEvent): void => {
        e.stopPropagation();

        let view = this._editorView as any;
        // this interposes on prosemirror's upHandler to prevent prosemirror's up from invoked multiple times when there 
        // are nested prosemirrors.  We only want the lowest level prosemirror to be invoked.
        if (view.mouseDown) {
            let originalUpHandler = view.mouseDown.up;
            view.root.removeEventListener("mouseup", originalUpHandler);
            view.mouseDown.up = (e: MouseEvent) => {
                !(e as any).formattedHandled && originalUpHandler(e);
                // e.stopPropagation();
                (e as any).formattedHandled = true;
            };
            view.root.addEventListener("mouseup", view.mouseDown.up);
        }
    }

    tooltipTextMenuPlugin() {
        let self = FormattedTextBox;
        return new Plugin({
            view(newView) {
                return self.ToolTipTextMenu = FormattedTextBox.getToolTip(newView);
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
        //DictationManager.Controls.stop(false);
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
        let mark = schema.marks.user_mark.create({ userid: Doc.CurrentUserEmail, modified: Math.round(Date.now() / 1000 / 5) });
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
    tryUpdateHeight() {
        const scrollHeight = this._ref.current?.scrollHeight;
        if (!this.layoutDoc.animateToPos && this.layoutDoc.autoHeight && scrollHeight &&
            getComputedStyle(this._ref.current!.parentElement!).top === "0px") {  // if top === 0, then the text box is growing upward (as the overlay caption) which doesn't contribute to the height computation
            let nh = this.Document.isTemplateField ? 0 : NumCast(this.dataDoc.nativeHeight, 0);
            let dh = NumCast(this.layoutDoc.height, 0);
            this.layoutDoc.height = Math.max(10, (nh ? dh / nh * scrollHeight : scrollHeight) + (this.props.ChromeHeight ? this.props.ChromeHeight() : 0));
            this.dataDoc.nativeHeight = nh ? scrollHeight : undefined;
        }
    }

    @computed get sidebarWidthPercent() { return StrCast(this.props.Document.sidebarWidthPercent, "0%"); }
    @computed get sidebarWidth() { return Number(this.sidebarWidthPercent.substring(0, this.sidebarWidthPercent.length - 1)) / 100 * this.props.PanelWidth(); }
    @computed get annotationsKey() { return "annotations"; }
    render() {
        TraceMobx();
        let rounded = StrCast(this.layoutDoc.borderRounding) === "100%" ? "-rounded" : "";
        let interactive = InkingControl.Instance.selectedTool || this.layoutDoc.isBackground;
        if (this.props.isSelected()) {
            FormattedTextBox.ToolTipTextMenu!.updateFromDash(this._editorView!, undefined, this.props);
        } else if (FormattedTextBoxComment.textBox === this) {
            FormattedTextBoxComment.Hide();
        }
        return (
            <div className={`formattedTextBox-cont`} ref={this._ref}
                style={{
                    height: this.layoutDoc.autoHeight ? "max-content" : this.props.height ? this.props.height : undefined,
                    background: this.props.hideOnLeave ? "rgba(0,0,0 ,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered ? 1 : 0.1) : 1,
                    color: this.props.color ? this.props.color : this.props.hideOnLeave ? "white" : "inherit",
                    pointerEvents: interactive ? "none" : "all",
                    fontSize: this._ruleFontSize ? this._ruleFontSize : NumCast(this.layoutDoc.fontSize, 13),
                    fontFamily: this._ruleFontFamily ? this._ruleFontFamily : StrCast(this.layoutDoc.fontFamily, "Crimson Text"),
                }}
                onContextMenu={this.specificContextMenu}
                onKeyDown={this.onKeyPress}
                onFocus={this.onFocused}
                onClick={this.onClick}
                onPointerMove={e => this.hitBulletTargets(e.clientX, e.clientY, e.nativeEvent.offsetX, e.shiftKey, true)}
                onBlur={this.onBlur}
                onPointerUp={this.onPointerUp}
                onPointerDown={this.onPointerDown}
                onMouseUp={this.onMouseUp}
                onTouchStart={this.onTouchStart}
                onWheel={this.onPointerWheel}
                onPointerEnter={action(() => this._entered = true)}
                onPointerLeave={action(() => this._entered = false)}
            >
                <div className={`formattedTextBox-outer`} style={{ width: `calc(100% - ${this.sidebarWidthPercent})`, }}>
                    <div className={`formattedTextBox-inner${rounded}`} style={{ whiteSpace: "pre-wrap", pointerEvents: ((this.Document.isButton || this.props.onClick) && !this.props.isSelected()) ? "none" : undefined }} ref={this.createDropTarget} />
                </div>
                {this.props.Document.hideSidebar ? (null) : this.sidebarWidthPercent === "0%" ?
                    <div className="formattedTextBox-sidebar-handle" onPointerDown={e => e.stopPropagation()} onClick={e => this.toggleSidebar()} /> :
                    <div className={"formattedTextBox-sidebar" + (InkingControl.Instance.selectedTool !== InkTool.None ? "-inking" : "")}
                        style={{ width: `${this.sidebarWidthPercent}`, backgroundColor: `${StrCast(this.extensionDoc?.backgroundColor, "transparent")}` }}>
                        <CollectionFreeFormView {...this.props}
                            PanelHeight={this.props.PanelHeight}
                            PanelWidth={() => this.sidebarWidth}
                            annotationsKey={this.annotationsKey}
                            isAnnotationOverlay={false}
                            focus={this.props.focus}
                            isSelected={this.props.isSelected}
                            select={emptyFunction}
                            active={this.annotationsActive}
                            ContentScaling={returnOne}
                            whenActiveChanged={this.whenActiveChanged}
                            removeDocument={this.removeDocument}
                            moveDocument={this.moveDocument}
                            addDocument={(doc:Doc) => { doc.hideSidebar = true; return this.addDocument(doc); }}
                            CollectionView={undefined}
                            ScreenToLocalTransform={() => this.props.ScreenToLocalTransform().translate(-(this.props.PanelWidth() - this.sidebarWidth), 0)}
                            ruleProvider={undefined}
                            renderDepth={this.props.renderDepth + 1}
                            ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                            chromeCollapsed={true}>
                        </CollectionFreeFormView>
                        <div className="formattedTextBox-sidebar-handle" onPointerDown={e => e.stopPropagation()} onClick={e => this.toggleSidebar()} />
                    </div>}
                <div className="formattedTextBox-dictation"
                    onClick={e => {
                        this._recording ? this.stopDictation(true) : this.recordDictation();
                        setTimeout(() => this._editorView!.focus(), 500);
                        e.stopPropagation();
                    }} >
                    <FontAwesomeIcon className="formattedTExtBox-audioFont"
                        style={{ color: this._recording ? "red" : "blue", opacity: this._recording ? 1 : 0.5 }} icon={"microphone"} size="sm" />
                </div>
            </div>
        );
    }
}
