import { IReactionDisposer, observable, runInAction, computed, action } from "mobx";
import { Doc, DocListCast, Field } from "../../../../new_fields/Doc";
import { List } from "../../../../new_fields/List";
import { listSpec } from "../../../../new_fields/Schema";
import { SchemaHeaderField } from "../../../../new_fields/SchemaHeaderField";
import { ComputedField } from "../../../../new_fields/ScriptField";
import { Cast, StrCast } from "../../../../new_fields/Types";
import { DocServer } from "../../../DocServer";
import { CollectionViewType } from "../../collections/CollectionView";
import { FormattedTextBox } from "./FormattedTextBox";
import React = require("react");
import * as ReactDOM from 'react-dom';
import "./DashFieldView.scss";
import { observer } from "mobx-react";


export class DashFieldView {
    _fieldWrapper: HTMLDivElement; // container for label and value

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        this._fieldWrapper = document.createElement("div");
        this._fieldWrapper.style.width = node.attrs.width;
        this._fieldWrapper.style.height = node.attrs.height;
        this._fieldWrapper.style.fontWeight = "bold";
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.display = "inline-block";
        this._fieldWrapper.onkeypress = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeydown = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onkeyup = function (e: any) { e.stopPropagation(); };
        this._fieldWrapper.onmousedown = function (e: any) { e.stopPropagation(); };

        ReactDOM.render(<DashFieldViewInternal
            fieldKey={node.attrs.fieldKey}
            docid={node.attrs.docid}
            width={node.attrs.width}
            height={node.attrs.height}
            view={view}
            getPos={getPos}
            tbox={tbox}
        />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }
    destroy() {
        ReactDOM.unmountComponentAtNode(this._fieldWrapper);
    }
    selectNode() { }

}
interface IDashFieldViewInternal {
    fieldKey: string;
    docid: string;
    view: any;
    getPos: any;
    tbox: FormattedTextBox;
    width: number;
    height: number;
}

@observer
export class DashFieldViewInternal extends React.Component<IDashFieldViewInternal> {
    _reactionDisposer: IReactionDisposer | undefined;
    _textBoxDoc: Doc;
    _fieldKey: string;
    _fieldStringRef = React.createRef<HTMLSpanElement>();
    @observable _showEnumerables: boolean = false;
    @observable _dashDoc: Doc | undefined;

    constructor(props: IDashFieldViewInternal) {
        super(props);
        this._fieldKey = this.props.fieldKey;
        this._textBoxDoc = this.props.tbox.props.Document;

        if (this.props.docid) {
            DocServer.GetRefField(this.props.docid).
                then(action(async dashDoc => dashDoc instanceof Doc && (this._dashDoc = dashDoc)));
        } else {
            this._dashDoc = this.props.tbox.props.DataDoc || this.props.tbox.dataDoc;
        }
    }
    componentWillUnmount() {
        this._reactionDisposer?.();
    }

    // set the display of the field's value (checkbox for booleans, span of text for strings)
    @computed get fieldValueContent() {
        if (this._dashDoc) {
            const dashVal = this._dashDoc[this._fieldKey];
            const fval = StrCast(dashVal).startsWith(":=") || dashVal === "" ? Doc.Layout(this._textBoxDoc)[this._fieldKey] : dashVal;
            const boolVal = Cast(fval, "boolean", null);
            const strVal = Field.toString(fval as Field) || "";

            // field value is a boolean, so use a checkbox or similar widget to display it
            if (boolVal === true || boolVal === false) {
                return <input
                    className="dashFieldView-fieldCheck"
                    type="checkbox" checked={boolVal}
                    onChange={e => this._dashDoc![this._fieldKey] = e.target.checked}
                />;
            }
            else // field value is a string, so display it as an editable span
            {
                // bcz: this is unfortunate, but since this React component is nested within a non-React text box (prosemirror), we can't
                // use React events.  Essentially, React events occur after native events have been processed, so corresponding React events
                // will never fire because Prosemirror has handled the native events.  So we add listeners for native events here.
                return <span contentEditable={true} suppressContentEditableWarning={true} defaultValue={strVal} ref={r => {
                    r?.addEventListener("keydown", e => this.fieldSpanKeyDown(e, r));
                    r?.addEventListener("blur", e => r && this.updateText(r.textContent!, false));
                    r?.addEventListener("pointerdown", action((e) => this._showEnumerables = true));
                }} >
                    {strVal}
                </span>
            }
        }
    }

    // we need to handle all key events on the input span or else they will propagate to prosemirror.
    @action
    fieldSpanKeyDown = (e: KeyboardEvent, span: HTMLSpanElement) => {
        if (e.key === "Enter") {  // handle the enter key by "submitting" the current text to Dash's database. 
            e.ctrlKey && Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey, [{ title: span.textContent! }]);
            this.updateText(span.textContent!, true);
            e.preventDefault();// prevent default to avoid a newline from being generated and wiping out this field view
        }
        if (e.key === "a" && (e.ctrlKey || e.metaKey)) { // handle ctrl-A to select all the text within the span
            if (window.getSelection) {
                const range = document.createRange();
                range.selectNodeContents(span);
                window.getSelection()!.removeAllRanges();
                window.getSelection()!.addRange(range);
            }
            e.preventDefault(); //prevent default so that all the text in the prosemirror text box isn't selected
        }
        e.stopPropagation();  // we need to handle all events or else they will propagate to prosemirror.
    }

    @action
    updateText = (nodeText: string, forceMatch: boolean) => {
        this._showEnumerables = false;
        if (nodeText) {
            const newText = nodeText.startsWith(":=") || nodeText.startsWith("=:=") ? ":=-computed-" : nodeText;

            // look for a document whose id === the fieldKey being displayed.  If there's a match, then that document
            // holds the different enumerated values for the field in the titles of its collected documents.
            // if there's a partial match from the start of the input text, complete the text --- TODO: make this an auto suggest box and select from a drop down.
            DocServer.GetRefField(this._fieldKey).then(options => {
                let modText = "";
                (options instanceof Doc) && DocListCast(options.data).forEach(opt => (forceMatch ? StrCast(opt.title).startsWith(newText) : StrCast(opt.title) === newText) && (modText = StrCast(opt.title)));
                if (modText) {
                    //  elementfieldSpan.innerHTML = this._dashDoc![this._fieldKey as string] = modText;
                    Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey, []);
                    this._dashDoc![this._fieldKey] = modText;
                } // if the text starts with a ':=' then treat it as an expression by making a computed field from its value storing it in the key
                else if (nodeText.startsWith(":=")) {
                    this._dashDoc![this._fieldKey] = ComputedField.MakeFunction(nodeText.substring(2));
                } else if (nodeText.startsWith("=:=")) {
                    Doc.Layout(this._textBoxDoc)[this._fieldKey] = ComputedField.MakeFunction(nodeText.substring(3));
                } else {
                    this._dashDoc![this._fieldKey] = newText;
                }
            });
        }
    }

    // display a collection of all the enumerable values for this field
    onPointerDownEnumerables = async (e: any) => {
        e.stopPropagation();
        const collview = await Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey, [{ title: this._fieldKey }]);
        collview instanceof Doc && this.props.tbox.props.addDocTab(collview, "onRight");
    }


    // clicking on the label creates a pivot view collection of all documents
    // in the same collection.  The pivot field is the fieldKey of this label
    onPointerDownLabelSpan = (e: any) => {
        e.stopPropagation();
        let container = this.props.tbox.props.ContainingCollectionView;
        while (container?.props.Document.isTemplateForField || container?.props.Document.isTemplateDoc) {
            container = container.props.ContainingCollectionView;
        }
        if (container) {
            const alias = Doc.MakeAlias(container.props.Document);
            alias.viewType = CollectionViewType.Time;
            let list = Cast(alias.schemaColumns, listSpec(SchemaHeaderField));
            if (!list) {
                alias.schemaColumns = list = new List<SchemaHeaderField>();
            }
            list.map(c => c.heading).indexOf(this._fieldKey) === -1 && list.push(new SchemaHeaderField(this._fieldKey, "#f1efeb"));
            list.map(c => c.heading).indexOf("text") === -1 && list.push(new SchemaHeaderField("text", "#f1efeb"));
            alias._pivotField = this._fieldKey;
            this.props.tbox.props.addDocTab(alias, "onRight");
        }
    }

    render() {
        return <div className="dashFieldView" style={{
            width: this.props.width,
            height: this.props.height,
        }}>
            <span className="dashFieldView-labelSpan" title="click to see related tags" onPointerDown={this.onPointerDownLabelSpan}>
                {this._fieldKey}
            </span>

            <div className="dashFieldView-fieldSpan">
                {this.fieldValueContent}
            </div>

            {!this._showEnumerables ? (null) : <div className="dashFieldView-enumerables" onPointerDown={this.onPointerDownEnumerables} />}

        </div >;
    }
}