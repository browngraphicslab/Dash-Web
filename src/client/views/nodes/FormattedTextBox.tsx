import { action, IReactionDisposer, reaction } from "mobx";
import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { EditorState, Plugin, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { FieldWaiting, Opt } from "../../../fields/Field";
import { KeyStore } from "../../../fields/KeyStore";
import { RichTextField } from "../../../fields/RichTextField";
import { inpRules } from "../../util/RichTextRules";
import { schema } from "../../util/RichTextSchema";
import { TooltipTextMenu } from "../../util/TooltipTextMenu";
import { ContextMenu } from "../../views/ContextMenu";
import { Main } from "../Main";
import { FieldView, FieldViewProps } from "./FieldView";
import "./FormattedTextBox.scss";
import React = require("react");
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
export class FormattedTextBox extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") {
        return FieldView.LayoutString(FormattedTextBox, fieldStr);
    }
    private _ref: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _inputReactionDisposer: Opt<IReactionDisposer>;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.onChange = this.onChange.bind(this);
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this.FieldDoc.SetDataOnPrototype(
                this.FieldKey,
                JSON.stringify(state.toJSON()),
                RichTextField
            );
            // doc.SetData(fieldKey, JSON.stringify(state.toJSON()), RichTextField);
        }
    };

    get FieldDoc() { return this.props.fieldKey === KeyStore.Archives ? Main.Instance._textDoc! : this.props.doc; }
    get FieldKey() { return this.props.fieldKey === KeyStore.Archives ? KeyStore.Data : this.props.fieldKey; }

    componentDidMount() {
        const config = {
            schema,
            inpRules, //these currently don't do anything, but could eventually be helpful
            plugins: [
                history(),
                keymap({ "Mod-z": undo, "Mod-y": redo }),
                keymap(baseKeymap),
                this.tooltipMenuPlugin(),
                new Plugin({
                    props: {
                        attributes: { class: "ProseMirror-example-setup-style" }
                    }
                })
            ]
        };

        if (this.props.fieldKey === KeyStore.Archives) {
            this._inputReactionDisposer = reaction(() => Main.Instance._textDoc && Main.Instance._textDoc.Id,
                () => {
                    if (this._editorView)
                        this._editorView!.destroy();

                    this.setupEditor(config);
                }
            )
        }

        this._reactionDisposer = reaction(
            () => {
                const field = this.FieldDoc.GetT(this.FieldKey, RichTextField);
                return field && field != FieldWaiting ? field.Data : undefined;
            },
            field => {
                if (field && this._editorView) {
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
        let field = this.FieldDoc.GetT(this.FieldKey, RichTextField);
        if (field && field != FieldWaiting && field.Data) {
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
            this.props.select();
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
    }

    shouldComponentUpdate() {
        return false;
    }

    @action
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const { fieldKey, doc } = this.props;
        doc.SetOnPrototype(fieldKey, new RichTextField(e.target.value));
        // doc.SetData(fieldKey, e.target.value, RichTextField);
    }
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && this.props.isSelected() && !e.altKey) {
            e.stopPropagation();
        }
        if (e.buttons === 1 && this.props.fieldKey !== KeyStore.Archives)
            e.preventDefault();
    };
    onPointerUp = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && this.props.isSelected() && !e.altKey) {
            e.stopPropagation();
        }
        if (this.props.fieldKey !== KeyStore.Archives) {
            e.preventDefault();
            Main.Instance.SetTextDoc(this.props.doc, this._ref.current!);
        }
    };

    onFocused = (e: React.FocusEvent): void => {
        if (this.props.fieldKey !== KeyStore.Archives) {
            Main.Instance.SetTextDoc(this.props.doc, this._ref.current!);
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
    };

    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
    };

    tooltipMenuPlugin() {
        return new Plugin({
            view(_editorView) {
                return new TooltipTextMenu(_editorView);
            }
        });
    }
    onKeyPress(e: React.KeyboardEvent) {
        e.stopPropagation();
        // stop propagation doesn't seem to stop propagation of native keyboard events.
        // so we set a flag on the native event that marks that the event's been handled.
        // (e.nativeEvent as any).DASHFormattedTextBoxHandled = true;
    }
    render() {
        return (
            <div
                className="formattedTextBox-cont"
                onKeyDown={this.onKeyPress}
                onKeyPress={this.onKeyPress}
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
