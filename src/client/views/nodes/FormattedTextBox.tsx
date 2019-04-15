import { action, IReactionDisposer, reaction } from "mobx";
import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { RichTextField } from "../../../fields/RichTextField";
import { inpRules } from "../../util/RichTextRules";
import { Schema } from "prosemirror-model";
import { schema } from "../../util/RichTextSchema";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { ContextMenu } from "../../views/ContextMenu";
import { Main } from "../Main";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");
import { undoItem } from "prosemirror-menu";
import buildKeymap from "../../util/ProsemirrorKeymap";
import { TextField } from "../../../fields/TextField";
import { KeyStore } from "../../../fields/KeyStore";
const { buildMenuItems } = require("prosemirror-example-setup");
const { menuBar } = require("prosemirror-menu");

// FormattedTextBox: Displays an editable plain text node that maps to a specified Key of a Document
//
//  HTML Markup:  <FormattedTextBox Doc={Document's ID} FieldKey={Key's name + "Key"}
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

export interface FormattedTextBoxOverlay {
    isOverlay?: boolean;
}

export class FormattedTextBox extends React.Component<(FieldViewProps & FormattedTextBoxOverlay)> {
    public static LayoutString(fieldStr: string = "DataKey") {
        return FieldView.LayoutString(FormattedTextBox, fieldStr);
    }
    private _ref: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _inputReactionDisposer: Opt<IReactionDisposer>;
    private _proxyReactionDisposer: Opt<IReactionDisposer>;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.onChange = this.onChange.bind(this);
    }

    _applyingChange: boolean = false;

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this._applyingChange = true;
            this.props.Document.SetDataOnPrototype(
                this.props.fieldKey,
                JSON.stringify(state.toJSON()),
                RichTextField
            );
            this.props.Document.SetDataOnPrototype(KeyStore.DocumentText, state.doc.textBetween(0, state.doc.content.size, "\n\n"), TextField);
            this._applyingChange = false;
            // doc.SetData(fieldKey, JSON.stringify(state.toJSON()), RichTextField);
        }
    }

    componentDidMount() {
        const config = {
            schema,
            inpRules, //these currently don't do anything, but could eventually be helpful
            plugins: this.props.isOverlay ? [
                history(),
                keymap(buildKeymap(schema)),
                keymap(baseKeymap),
                this.tooltipMenuPlugin(),
                new Plugin({
                    props: {
                        attributes: { class: "ProseMirror-example-setup-style" }
                    }
                })
            ] : [
                    history(),
                    keymap({ "Mod-z": undo, "Mod-y": redo }),
                    keymap(baseKeymap),
                ]
        };

        if (this.props.isOverlay) {
            this._inputReactionDisposer = reaction(() => Main.Instance._textDoc && Main.Instance._textDoc.Id,
                () => {
                    if (this._editorView) {
                        this._editorView.destroy();
                    }

                    this.setupEditor(config);
                }
            );
        } else {
            this._proxyReactionDisposer = reaction(() => this.props.isSelected(),
                () => this.props.isSelected() && Main.Instance.SetTextDoc(this.props.Document, this.props.fieldKey, this._ref.current!, this.props.ScreenToLocalTransform()));
        }

        this._reactionDisposer = reaction(
            () => {
                const field = this.props.Document ? this.props.Document.GetT(this.props.fieldKey, RichTextField) : undefined;
                return field && field !== FieldWaiting ? field.Data : undefined;
            },
            field => {
                if (field && this._editorView && !this._applyingChange) {
                    this._editorView.updateState(
                        EditorState.fromJSON(config, JSON.parse(field))
                    );
                }
            }
        );
        this.setupEditor(config);
    }

    private setupEditor(config: any) {
        let state: EditorState;
        let field = this.props.Document ? this.props.Document.GetT(this.props.fieldKey, RichTextField) : undefined;
        if (field && field !== FieldWaiting && field.Data) {
            state = EditorState.fromJSON(config, JSON.parse(field.Data));
        } else {
            state = EditorState.create(config);
        }
        if (this._ref.current) {
            this._editorView = new EditorView(this._ref.current, {
                state,
                dispatchTransaction: this.dispatchTransaction
            });
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
    }

    shouldComponentUpdate() {
        return false;
    }

    @action
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const { fieldKey, Document } = this.props;
        Document.SetOnPrototype(fieldKey, new RichTextField(e.target.value));
        // doc.SetData(fieldKey, e.target.value, RichTextField);
    }
    onPointerDown = (e: React.PointerEvent): void => {
        console.log("pointer down");
        if (e.button === 1 && this.props.isSelected() && !e.altKey && !e.ctrlKey && !e.metaKey) {
            console.log("first");
            e.stopPropagation();
        }
        if (e.button === 2) {
            console.log("second");
            e.preventDefault();
        }
    }
    onPointerUp = (e: React.PointerEvent): void => {
        console.log("pointer up");
        if (e.buttons === 1 && this.props.isSelected() && !e.altKey) {
            e.stopPropagation();
        }
    }

    onFocused = (e: React.FocusEvent): void => {
        if (!this.props.isOverlay) {
            Main.Instance.SetTextDoc(this.props.Document, this.props.fieldKey, this._ref.current!, this.props.ScreenToLocalTransform());
        } else {
            if (this._ref.current) {
                this._ref.current.scrollTop = Main.Instance._textScroll;
            }
        }
    }

    //REPLACE THIS WITH CAPABILITIES SPECIFIC TO THIS TYPE OF NODE
    textCapability = (e: React.MouseEvent): void => { };

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({
            description: "Text Capability",
            event: this.textCapability
        });

        // ContextMenu.Instance.addItem({
        //     description: "Submenu",
        //     items: [
        //         {
        //             description: "item 1", event:
        //     },
        //         {
        //             description: "item 2", event:
        //     }
        //     ]
        // })
        // e.stopPropagation()
    }

    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
    }

    tooltipMenuPlugin() {
        let myprops = this.props;
        return new Plugin({
            view(_editorView) {
                return new TooltipTextMenu(_editorView, myprops);
            }
        });
    }
    onKeyPress(e: React.KeyboardEvent) {
        e.stopPropagation();
        if (e.keyCode === 9) e.preventDefault();
        // stop propagation doesn't seem to stop propagation of native keyboard events.
        // so we set a flag on the native event that marks that the event's been handled.
        // (e.nativeEvent as any).DASHFormattedTextBoxHandled = true;
    }
    render() {
        return (
            <div
                className={`formattedTextBox-cont`}
                onKeyDown={this.onKeyPress}
                onKeyPress={this.onKeyPress}
                onFocus={this.onFocused}
                onPointerUp={this.onPointerUp}
                onPointerDown={this.onPointerDown}
                onContextMenu={this.specificContextMenu}
                // tfs: do we need this event handler
                onWheel={this.onPointerWheel}
                ref={this._ref}
            />
        );
    }
}
