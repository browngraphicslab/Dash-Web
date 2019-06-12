import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc, Opt } from "../../../new_fields/Doc";
import { Id } from '../../../new_fields/FieldSymbols';
import { RichTextField } from "../../../new_fields/RichTextField";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorKeymap";
import { inpRules } from "../../util/RichTextRules";
import { ImageResizeView, schema } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { UndoManager } from "../../util/UndoManager";
import { ContextMenu } from '../ContextMenu';
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");

library.add(faEdit);
library.add(faSmile);

// FormattedTextBox: Displays an editable plain text node that maps to a specified Key of a Document
//

export interface FormattedTextBoxProps {
    isOverlay?: boolean;
    hideOnLeave?: boolean;
    height?: string;
    color?: string;
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
    private _ref: React.RefObject<HTMLDivElement>;
    private _proseRef: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _toolTipTextMenu: TooltipTextMenu | undefined = undefined;
    private _applyingChange: boolean = false;
    private _linkClicked = "";
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
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
            let start = url.indexOf(window.location.origin);
            let path = url.substr(start, url.length - start);
            let docid = path.replace(DocServer.prepend("/doc/"), "").split("?")[0];
            return docid;
        }
        return "";
    }

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this._proseRef = React.createRef();
        if (this.props.isOverlay) {
            DragManager.StartDragFunctions.push(() => FormattedTextBox.InputBoxOverlay = undefined);
        }
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this._applyingChange = true;
            Doc.SetOnPrototype(this.props.Document, this.props.fieldKey, new RichTextField(JSON.stringify(state.toJSON())));
            Doc.SetOnPrototype(this.props.Document, "documentText", state.doc.textBetween(0, state.doc.content.size, "\n\n"));
            this._applyingChange = false;
            let title = StrCast(this.props.Document.title);
            if (title && title.startsWith("-") && this._editorView) {
                let str = this._editorView.state.doc.textContent;
                let titlestr = str.substr(0, Math.min(40, str.length));
                let target = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
                target.title = "-" + titlestr + (str.length > 40 ? "..." : "");
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
                });
        }

        this._reactionDisposer = reaction(
            () => {
                const field = this.props.Document ? Cast(this.props.Document[this.props.fieldKey], RichTextField) : undefined;
                return field ? field.Data : `{"doc":{"type":"doc","content":[]},"selection":{"type":"text","anchor":0,"head":0}}`;
            },
            field => this._editorView && !this._applyingChange &&
                this._editorView.updateState(EditorState.fromJSON(config, JSON.parse(field)))
        );
        this.setupEditor(config, this.props.Document, this.props.fieldKey);
    }

    private setupEditor(config: any, doc: Doc, fieldKey: string) {
        let field = doc ? Cast(doc[fieldKey], RichTextField) : undefined;
        let startup = StrCast(doc.documentText);
        startup = startup.startsWith("@@@") ? startup.replace("@@@", "") : "";
        if (!startup && !field && doc) {
            startup = StrCast(doc[fieldKey]);
        }
        if (this._proseRef.current) {
            this._editorView = new EditorView(this._proseRef.current, {
                state: field && field.Data ? EditorState.fromJSON(config, JSON.parse(field.Data)) : EditorState.create(config),
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    image(node, view, getPos) { return new ImageResizeView(node, view, getPos); }
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
        }
    }

    componentWillUnmount() {
        if (this._editorView) {
            this._editorView.destroy();
        }
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        if (this._proxyReactionDisposer) {
            this._proxyReactionDisposer();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 0 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
            if (this._toolTipTextMenu && this._toolTipTextMenu.tooltip) {
                this._toolTipTextMenu.tooltip.style.opacity = "0";
            }
        }
        this._linkClicked = "";
        if (e.button === 0 && ((!this.props.isSelected() && !e.ctrlKey) || (this.props.isSelected() && e.ctrlKey)) && !e.metaKey && e.target) {
            let href = (e.target as any).href;
            for (let parent = (e.target as any).parentNode; !href && parent; parent = parent.parentNode) {
                href = parent.childNodes[0].href;
            }
            if (href) {
                if (href.indexOf(DocServer.prepend("/doc/")) === 0) {
                    this._linkClicked = href.replace(DocServer.prepend("/doc/"), "").split("?")[0];
                } else {
                    let webDoc = Docs.WebDocument(href, { x: NumCast(this.props.Document.x, 0) + NumCast(this.props.Document.width, 0), y: NumCast(this.props.Document.y) });
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
        if (this._toolTipTextMenu && this._toolTipTextMenu.tooltip) {
            this._toolTipTextMenu.tooltip.style.opacity = "1";
        }
        let ctrlKey = e.ctrlKey;
        if (this._linkClicked) {
            DocServer.GetRefField(this._linkClicked).then(f => {
                (f instanceof Doc) && DocumentManager.Instance.jumpToDocument(f, ctrlKey, document => this.props.addDocTab(document, "inTab"));
            });
            e.stopPropagation();
            e.preventDefault();
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
        if (this.props.isSelected()) {
            e.stopPropagation();
        }
    }

    onClick = (e: React.MouseEvent): void => {
        this._proseRef.current!.focus();
        if (this._linkClicked) {
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
        let self = this;
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
        if (StrCast(this.props.Document.title).startsWith("-") && this._editorView) {
            let str = this._editorView.state.doc.textContent;
            let titlestr = str.substr(0, Math.min(40, str.length));
            let target = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
            target.title = "-" + titlestr + (str.length > 40 ? "..." : "");
        }
        if (!this._undoTyping) {
            this._undoTyping = UndoManager.StartBatch("undoTyping");
        }
        if (this.props.isOverlay && this.props.Document.autoHeight) {
            let xf = this._ref.current!.getBoundingClientRect();
            let scrBounds = this.props.ScreenToLocalTransform().transformBounds(0, 0, xf.width, xf.height);
            let nh = NumCast(this.props.Document.nativeHeight, 0);
            let dh = NumCast(this.props.Document.height, 0);
            let sh = scrBounds.height;
            this.props.Document.height = nh ? dh / nh * sh : sh;
            this.props.Document.proto!.nativeHeight = nh ? sh : undefined;
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
            event: action(() => this.props.Document.autoHeight = !BoolCast(this.props.Document.autoHeight, false)), icon: "expand-arrows-alt"
        });
        ContextMenu.Instance.addItem({ description: "Text Funcs...", subitems: subitems });
    }
    render() {
        let style = this.props.isOverlay ? "scroll" : "hidden";
        let rounded = NumCast(this.props.Document.borderRounding) < 0 ? "-rounded" : "";
        let interactive = InkingControl.Instance.selectedTool ? "" : "interactive";
        return (
            <div className={`formattedTextBox-cont-${style}`} ref={this._ref}
                style={{
                    height: this.props.height ? this.props.height : undefined,
                    background: this.props.hideOnLeave ? "rgba(0,0,0,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered || this.props.isSelected() || this.props.Document.libraryBrush ? 1 : 0.1) : 1,
                    color: this.props.color ? this.props.color : this.props.hideOnLeave ? "white" : "initial",
                    pointerEvents: interactive ? "all" : "none",
                }}
                onKeyPress={this.onKeyPress}
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
                <div className={`formattedTextBox-inner${rounded}`} style={{ whiteSpace: "pre-wrap", pointerEvents: this.props.Document.isButton && !this.props.isSelected() ? "none" : "all" }} ref={this._proseRef} />
            </div>
        );
    }
}
