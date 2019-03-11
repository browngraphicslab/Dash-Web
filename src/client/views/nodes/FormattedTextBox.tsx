import { action, IReactionDisposer, reaction } from "mobx";
import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { schema } from "../../util/RichTextSchema";
import { EditorState, Transaction, } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Opt, FieldWaiting } from "../../../fields/Field";
import "./FormattedTextBox.scss";
import React = require("react")
import { RichTextField } from "../../../fields/RichTextField";
import { FieldViewProps, FieldView } from "./FieldView";
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { TooltipTextMenu } from "../../util/TooltipTextMenu"
import { ContextMenu } from "../../views/ContextMenu";




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

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(FormattedTextBox, fieldStr) }
    private _ref: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _reactionDisposer: Opt<IReactionDisposer>;

    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.onChange = this.onChange.bind(this);
    }

    dispatchTransaction = (tx: Transaction) => {
        if (this._editorView) {
            const state = this._editorView.state.apply(tx);
            this._editorView.updateState(state);
            this.props.doc.SetData(this.props.fieldKey, JSON.stringify(state.toJSON()), RichTextField);
        }
    }

    componentDidMount() {
        let state: EditorState;
        const config = {
            schema,
            plugins: [
                history(),
                keymap({ "Mod-z": undo, "Mod-y": redo }),
                keymap(baseKeymap),
                this.tooltipMenuPlugin()
            ]
        };

        let field = this.props.doc.GetT(this.props.fieldKey, RichTextField);
        if (field && field != FieldWaiting) {
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

        this._reactionDisposer = reaction(() => {
            const field = this.props.doc.GetT(this.props.fieldKey, RichTextField);
            return field && field != FieldWaiting ? field.Data : undefined;
        }, (field) => {
            if (field && this._editorView) {
                this._editorView.updateState(EditorState.fromJSON(config, JSON.parse(field)));
            }
        })
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
    }

    shouldComponentUpdate() {
        return false;
    }

    @action
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.props.doc.SetData(this.props.fieldKey, e.target.value, RichTextField);
    }
    onPointerDown = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && this.props.isSelected()) {
            e.stopPropagation();
        }
    }

    //REPLACE THIS WITH CAPABILITIES SPECIFIC TO THIS TYPE OF NODE
    textCapability = (e: React.MouseEvent): void => {
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        ContextMenu.Instance.addItem({ description: "Text Capability", event: this.textCapability });
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
        return new Plugin({
            view(_editorView) {
                return new TooltipTextMenu(_editorView)
            }
        })
    }

    onKeyPress(e: React.KeyboardEvent) {
        e.stopPropagation();
    }
    render() {
        return (<div className="formattedTextBox-cont"
            onKeyPress={this.onKeyPress}
            onPointerDown={this.onPointerDown}
            onContextMenu={this.specificContextMenu}
            onWheel={this.onPointerWheel}
            ref={this._ref} />)
    }
}