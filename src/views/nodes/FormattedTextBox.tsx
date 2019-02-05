import { action, IReactionDisposer, reaction } from "mobx";
import { baseKeymap } from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { schema } from "prosemirror-schema-basic";
import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Opt } from "../../fields/Field";
import { SelectionManager } from "../../util/SelectionManager";
import "./FormattedTextBox.scss";
import React = require("react")
import { RichTextField } from "../../fields/RichTextField";
import { FieldViewProps, FieldView } from "./FieldView";
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";


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
//  specified Key and assigns it to an HTML input node.  When changes are made tot his node, 
//  this will edit the document and assign the new value to that field.
//
export class FormattedTextBox extends React.Component<FieldViewProps> {

    public static LayoutString() { return FieldView.LayoutString("FormattedTextBox"); }
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
            const { doc, fieldKey } = this.props;
            doc.SetFieldValue(fieldKey, JSON.stringify(state.toJSON()), RichTextField);
        }
    }

    componentDidMount() {
        let state: EditorState;
        const { doc, fieldKey } = this.props;
        const config = {
            schema,
            plugins: [
                history(),
                keymap({ "Mod-z": undo, "Mod-y": redo }),
                keymap(baseKeymap)
            ]
        };

        let field = doc.GetFieldT(fieldKey, RichTextField);
        if (field) {
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
            const field = this.props.doc.GetFieldT(this.props.fieldKey, RichTextField);
            return field ? field.Data : undefined;
        }, (field) => {
            if (field && this._editorView) {
                this._editorView.updateState(EditorState.fromJSON(config, JSON.parse(field)));
            }
        })
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
        const { fieldKey, doc } = this.props;
        doc.SetFieldValue(fieldKey, e.target.value, RichTextField);
    }
    onPointerDown = (e: React.PointerEvent): void => {
        let me = this;
        if (e.buttons === 1 && me.props.documentViewContainer instanceof CollectionFreeFormDocumentView && SelectionManager.IsSelected(me.props.documentViewContainer)) {
            e.stopPropagation();
        }
    }
    render() {
        return (<div className="formattedTextBox-cont"
            style={{
                color: "initial",
                whiteSpace: "initial"
            }}
            onPointerDown={this.onPointerDown}
            ref={this._ref} />)
    }
}