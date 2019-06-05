import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faSmile } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { baseKeymap } from "prosemirror-commands";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Doc, Field, Opt, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { RichTextField } from "../../../new_fields/RichTextField";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { DocServer } from "../../DocServer";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import buildKeymap from "../../util/ProsemirrorKeymap";
import { inpRules } from "../../util/RichTextRules";
import { ImageResizeView, schema } from "../../util/RichTextSchema";
import { SelectionManager } from "../../util/SelectionManager";
import { TooltipLinkingMenu } from "../../util/TooltipLinkingMenu";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { ContextMenu } from "../../views/ContextMenu";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");
import { DocUtils } from '../../documents/Documents';

library.add(faEdit);
library.add(faSmile);

// FormattedTextBox: Displays an editable plain text node that maps to a specified Key of a Document
//
//  HTML Markup:  <FormattedTextBox Doc={Document's ID} FieldKey={Key's name}
//
//  In Code, the node's HTML is specified in the document's parameterized structure as:
//        document.SetField(KeyStore.Layout,  "<FormattedTextBox doc={doc} fieldKey={<KEYNAME>Key} />");
//  and the node's binding to the specified document KEYNAME as:
//        document.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.<KEYNAME>]));
//  The Jsx parser at run time will bind:
//        'fieldKey' property to the Key stored in LayoutKeys
//    and 'doc' property to the document that is being rendered
//
//  When rendered() by React, this extracts the TextController from the Document stored at the
//  specified Key and assigns it to an HTML input node.  When changes are made to this node,
//  this will edit the document and assign the new value to that field.
//]

export interface FormattedTextBoxProps {
    isOverlay?: boolean;
    hideOnLeave?: boolean;
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
    private _gotDown: boolean = false;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _inputReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;
    public get CurrentDiv(): HTMLDivElement { return this._ref.current!; }

    @observable public static InputBoxOverlay?: FormattedTextBox = undefined;
    public static InputBoxOverlayScroll: number = 0;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this._proseRef = React.createRef();
        if (this.props.isOverlay) {
            DragManager.StartDragFunctions.push(() => FormattedTextBox.InputBoxOverlay = undefined);
        }
    }

    _applyingChange: boolean = false;

    _lastState: any = undefined;
    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._lastState = this._editorView.state.apply(tx);
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

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.props.Document;

            DocUtils.MakeLink(sourceDoc, destDoc);
            de.data.droppedDocuments.push(destDoc);
            e.stopPropagation();
        }
    }

    componentDidMount() {
        if (this._ref.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._ref.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
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

        const config2 = {

        };

        if (this.props.isOverlay) {
            this._inputReactionDisposer = reaction(() => FormattedTextBox.InputBoxOverlay,
                () => {
                    if (this._editorView) {
                        this._editorView.destroy();
                    }
                    this.setupEditor(config, this.props.Document);// MainOverlayTextBox.Instance.TextDoc); // bcz: not sure why, but the order of events is such that this.props.Document hasn't updated yet, so without forcing the editor to the MainOverlayTextBox, it will display the previously focused textbox
                }
            );
        } else {
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
                return field ? field.Data : undefined;
            },
            field => field && this._editorView && !this._applyingChange &&
                this._editorView.updateState(EditorState.fromJSON(config, JSON.parse(field)))
        );
        this.setupEditor(config, this.props.Document);
    }

    private setupEditor(config: any, doc?: Doc) {
        let field = doc ? Cast(doc[this.props.fieldKey], RichTextField) : undefined;
        if (this._proseRef.current) {
            this._editorView = new EditorView(this._proseRef.current, {
                state: field && field.Data ? EditorState.fromJSON(config, JSON.parse(field.Data)) : EditorState.create(config),
                dispatchTransaction: this.dispatchTransaction,
                nodeViews: {
                    image(node, view, getPos) { return new ImageResizeView(node, view, getPos); }
                }
            });
            let text = StrCast(this.props.Document.documentText);
            if (text.startsWith("@@@")) {
                this.props.Document.proto!.documentText = undefined;
                this._editorView.dispatch(this._editorView.state.tr.insertText(text.replace("@@@", "")));
            }
        }

        if (this.props.selectOnLoad) {
            this.props.select(false);
            this._editorView!.focus();
        }
    }

    componentWillUnmount() {
        if (this._editorView) {
            this._editorView.destroy();
        }
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        if (this._inputReactionDisposer) {
            this._inputReactionDisposer();
        }
        if (this._proxyReactionDisposer) {
            this._proxyReactionDisposer();
        }
        if (this._dropDisposer) {
            this._dropDisposer();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.button === 0 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            e.stopPropagation();
            if (this._toolTipTextMenu && this._toolTipTextMenu.tooltip) {
                this._toolTipTextMenu.tooltip.style.opacity = "0";
            }
        }
        let ctrlKey = e.ctrlKey;
        if (e.button === 0 && ((!this.props.isSelected() && !e.ctrlKey) || (this.props.isSelected() && e.ctrlKey)) && !e.metaKey && e.target) {
            let href = (e.target as any).href;
            for (let parent = (e.target as any).parentNode; !href && parent; parent = parent.parentNode) {
                href = parent.childNodes[0].href;
            }
            if (href) {
                if (href.indexOf(DocServer.prepend("/doc/")) === 0) {
                    let docid = href.replace(DocServer.prepend("/doc/"), "").split("?")[0];
                    DocServer.GetRefField(docid).then(f => {
                        (f instanceof Doc) && DocumentManager.Instance.jumpToDocument(f, ctrlKey, document => this.props.addDocTab(document, "inTab"))
                    });
                }
                e.stopPropagation();
                e.preventDefault();
            }

        }
        if (e.button === 2 || (e.button === 0 && e.ctrlKey)) {
            this._gotDown = true;
            e.preventDefault();
        }
    }
    onPointerUp = (e: React.PointerEvent): void => {
        if (this._toolTipTextMenu && this._toolTipTextMenu.tooltip) {
            this._toolTipTextMenu.tooltip.style.opacity = "1";
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

    _toolTipTextMenu: TooltipTextMenu | undefined = undefined;
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
    }

    @observable
    _entered = false;
    @action
    onPointerEnter = (e: React.PointerEvent) => {
        this._entered = true;
    }
    @action
    onPointerLeave = (e: React.PointerEvent) => {
        this._entered = false;
    }
    render() {
        let style = this.props.isOverlay ? "scroll" : "hidden";
        let rounded = NumCast(this.props.Document.borderRounding) < 0 ? "-rounded" : "";
        let interactive = InkingControl.Instance.selectedTool ? "" : "interactive";
        return (
            <div className={`formattedTextBox-cont-${style}`} ref={this._ref}
                style={{
                    background: this.props.hideOnLeave ? "rgba(0,0,0,0.4)" : undefined,
                    opacity: this.props.hideOnLeave ? (this._entered || this.props.isSelected() || this.props.Document.libraryBrush ? 1 : 0.1) : 1,
                    color: this.props.hideOnLeave ? "white" : "initial",
                    pointerEvents: interactive ? "all" : "none",
                }}
                // onKeyDown={this.onKeyPress}
                onKeyPress={this.onKeyPress}
                onFocus={this.onFocused}
                onClick={this.onClick}
                onBlur={this.onBlur}
                onPointerUp={this.onPointerUp}
                onPointerDown={this.onPointerDown}
                onMouseDown={this.onMouseDown}
                onContextMenu={this.specificContextMenu}
                // tfs: do we need this event handler
                onWheel={this.onPointerWheel}
                onPointerEnter={this.onPointerEnter}
                onPointerLeave={this.onPointerLeave}
            >
                <div className={`formattedTextBox-inner${rounded}`} style={{ whiteSpace: "pre-wrap", pointerEvents: this.props.Document.isButton && !this.props.isSelected() ? "none" : "all" }} ref={this._proseRef} />
            </div>
        );
    }
}
