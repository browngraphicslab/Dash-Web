import { IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { Doc, DocListCast, Field } from "../../new_fields/Doc";
import { List } from "../../new_fields/List";
import { listSpec } from "../../new_fields/Schema";
import { SchemaHeaderField } from "../../new_fields/SchemaHeaderField";
import { ComputedField } from "../../new_fields/ScriptField";
import { Cast, StrCast } from "../../new_fields/Types";
import { Utils } from "../../Utils";
import { DocServer } from "../DocServer";
import { CollectionViewType } from "../views/collections/CollectionView";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import React = require("react");
import * as ReactDOM from 'react-dom';
import "./DashFieldView.scss";


export class DashFieldView {
    _fieldWrapper: HTMLDivElement; // container for label and value

    constructor(node: any, view: any, getPos: any, tbox: FormattedTextBox) {
        this._fieldWrapper = document.createElement("p");
        this._fieldWrapper.style.width = node.attrs.width;
        this._fieldWrapper.style.height = node.attrs.height;
        this._fieldWrapper.style.fontWeight = "bold";
        this._fieldWrapper.style.position = "relative";
        this._fieldWrapper.style.display = "inline-block";
        ReactDOM.render(<DashFieldViewInternal node={node} view={view} getPos={getPos} tbox={tbox} />, this._fieldWrapper);
        (this as any).dom = this._fieldWrapper;
    }
    destroy() {
        ReactDOM.unmountComponentAtNode(this._fieldWrapper);
    }

}
interface IDashFieldViewInternal {
    node: any,
    view: any,
    getPos: any,
    tbox: FormattedTextBox
}
export class DashFieldViewInternal extends React.Component<IDashFieldViewInternal> {

    _reactionDisposer: IReactionDisposer | undefined;
    _textBoxDoc?: Doc; //Added "?""
    @observable _dashDoc: Doc | undefined;
    _fieldKey?: string; //Added "?" and added "as string"
    _options: Doc[] = [];

    constructor(props: IDashFieldViewInternal) {
        super(props)
        this._fieldKey = this.props.node.attrs.fieldKey;
        this._textBoxDoc = this.props.tbox.props.Document;

        if (this.props.node.attrs.docid) {
            DocServer.GetRefField(this.props.node.attrs.docid).
                then(async dashDoc => dashDoc instanceof Doc && runInAction(() => this.setDashDoc(dashDoc)));
        } else {
            this.setDashDoc(this.props.tbox.props.DataDoc || this.props.tbox.dataDoc);
        }
    }
    componentWillUnmount() {
        this._reactionDisposer?.();
    }
    componentDidMount() {
        var elementFieldCheck = document.getElementById("fieldCheckId") as HTMLInputElement;
        if (elementFieldCheck) {
            this._reactionDisposer = reaction(() => { // this reaction will update the displayed text whenever the document's fieldKey's value changes
                const dashVal = this._dashDoc?.[this._fieldKey as string];
                return StrCast(dashVal).startsWith(":=") || dashVal === "" ? Doc.Layout(this.props.tbox.props.Document)[this._fieldKey as string] : dashVal;
            }, fval => {
                const boolVal = Cast(fval, "boolean", null);
                if (boolVal === true || boolVal === false) {
                    elementFieldCheck.checked = boolVal;
                } else {
                    //  elementFieldCheck.innerHTML = Field.toString(fval as Field) || "";
                }
                elementFieldCheck.style.display = (boolVal === true || boolVal === false) ? "inline-block" : "none";
                elementFieldCheck.style.display = !(boolVal === true || boolVal === false) ? "inline-block" : "none";
            }, { fireImmediately: true });
        }
    }

    setDashDoc = (doc: Doc) => {
        this._dashDoc = doc;
        if (this._options?.length && !this._dashDoc[this._fieldKey as string]) {
            this._dashDoc[this._fieldKey as string] = StrCast(this._options[0].title);
        }
        // NOTE: if the field key starts with "@", then the actual field key is stored in the field 'fieldKey' (removing the @).
        this._fieldKey = this._fieldKey?.startsWith("@") ? StrCast(this.props.tbox.props.Document[StrCast(this._fieldKey as string).substring(1)]) : this._fieldKey as string;
        // var elementlabelSpan = document.getElementById("labelSpanId") as HTMLElement;
        // elementlabelSpan.innerHTML = `${this._fieldKey}: `;
        // const fieldVal = Cast(this._dashDoc?.[this._fieldKey], "boolean", null);
        // var elementfieldCheck = document.getElementById("fieldCheckId") as HTMLElement;
        // elementfieldCheck.style.display = (fieldVal === true || fieldVal === false) ? "inline-block" : "none";
        // elementfieldCheck.style.display = !(fieldVal === true || fieldVal === false) ? "inline-block" : "none";
    };

    updateText = (forceMatch: boolean) => {
        var elementEnumarables = document.getElementById("enumarablesId") as HTMLElement;
        elementEnumarables.style.display = "none";
        var elementfieldSpan = document.getElementById("fieldSpanId") as HTMLElement;
        const newText = elementfieldSpan.innerText.startsWith(":=") || elementfieldSpan.innerText.startsWith("=:=") ? ":=-computed-" : elementfieldSpan.innerText;

        // look for a document whose id === the fieldKey being displayed.  If there's a match, then that document
        // holds the different enumerated values for the field in the titles of its collected documents.
        // if there's a partial match from the start of the input text, complete the text --- TODO: make this an auto suggest box and select from a drop down.
        DocServer.GetRefField(this._fieldKey as string).then(options => {
            let modText = "";
            (options instanceof Doc) && DocListCast(options.data).forEach(opt => (forceMatch ? StrCast(opt.title).startsWith(newText) : StrCast(opt.title) === newText) && (modText = StrCast(opt.title)));
            var elementfieldSpan = document.getElementById("fieldSpanId") as HTMLElement;
            if (modText) {
                //  elementfieldSpan.innerHTML = this._dashDoc![this._fieldKey as string] = modText;
                Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey as string, []);
            } // if the text starts with a ':=' then treat it as an expression by making a computed field from its value storing it in the key
            else if (elementfieldSpan.innerText.startsWith(":=")) {
                this._dashDoc![this._fieldKey as string] = ComputedField.MakeFunction(elementfieldSpan.innerText.substring(2));
            } else if (elementfieldSpan.innerText.startsWith("=:=")) {
                Doc.Layout(this.props.tbox.props.Document)[this._fieldKey as string] = ComputedField.MakeFunction(elementfieldSpan.innerText.substring(3));
            } else {
                this._dashDoc![this._fieldKey as string] = newText;
            }
        });
    };

    onPointerDownEnumerables = async (e: any) => {
        e.stopPropagation();
        var elementfieldSpan = document.getElementById("fieldSpanId") as HTMLElement;
        const collview = await Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey as string, [{ title: elementfieldSpan.innerText }]);
        collview instanceof Doc && this.props.tbox.props.addDocTab(collview, "onRight");
    };

    onChangefieldCheck = (e: any) => {
        this._dashDoc![this._fieldKey as string] = e.target.checked;
    };

    onKeyPressfieldSpan = function (e: any) { e.stopPropagation(); };

    onKeyUpfieldSpan = function (e: any) { e.stopPropagation(); };

    onMouseDownfieldSpan = function (e: any) {
        e.stopPropagation();
        var element = document.getElementById("enumerables") as HTMLElement;
        element.style.display = "inline-block";
    };

    onBlurfieldSpan = (e: any) => { this.updateText(false); }; //Pas importé

    onKeyDownfieldSpan = (e: any) => {
        e.stopPropagation();
        if ((e.key === "a" && e.ctrlKey) || (e.key === "a" && e.metaKey)) {
            if (window.getSelection) {
                const range = document.createRange();
                var elementfieldSpan = document.getElementById("fieldSpanId") as HTMLElement;

                range.selectNodeContents(elementfieldSpan);
                window.getSelection()!.removeAllRanges();
                window.getSelection()!.addRange(range);
            }
            e.preventDefault();
        }
        if (e.key === "Enter") {
            e.preventDefault();
            var elementfieldSpan = document.getElementById("fieldSpanId") as HTMLElement;

            e.ctrlKey && Doc.addFieldEnumerations(this._textBoxDoc, this._fieldKey as string, [{ title: elementfieldSpan.innerText }]);
            this.updateText(true); //added this
        }
    };

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
            list.map(c => c.heading).indexOf(this._fieldKey as string) === -1 && list.push(new SchemaHeaderField(this._fieldKey, "#f1efeb"));
            list.map(c => c.heading).indexOf("text") === -1 && list.push(new SchemaHeaderField("text", "#f1efeb"));
            alias._pivotField = this._fieldKey as string;
            this.props.tbox.props.addDocTab(alias, "onRight");
        }
    };

    destroy() {
        this._reactionDisposer?.();
    }
    selectNode() { }

    render() {

        const fieldStyle = {
            width: this.props.node.attrs.width,
            height: this.props.node.attrs.height,
        };

        const fieldCheckStyle = {
            minWidth: "12px",
            position: 'relative' as 'relative',
            display: 'none',
            backgroundColor: "rgba(155, 155, 155, 0.24)"
        };

        const fieldSpanStyle = {
            minWidth: "12px",
            position: 'relative' as 'relative',
            display: 'none',
            backgroundColor: "rgba(155, 155, 155, 0.24)"
        };

        const labelSpanStyle = {
            position: 'relative' as 'relative',
            display: 'inline-block',
            backgroundColor: "rgba(155, 155, 155, 0.44)",
            fontSize: "small",
            title: "click to see related tags"
        };

        const fieldCheckId = Utils.GenerateGuid();
        const fieldSpanId = Utils.GenerateGuid();

        return (
            <div className="fieldWrapper" style={fieldStyle}>

                <span
                    className="labelSpan"
                    id='labelSpanId'
                    style={labelSpanStyle}
                    onPointerDown={this.onPointerDownLabelSpan}
                //innerHTML= {this._fieldKey}
                >
                </span>

                <input
                    className="fieldCheck"
                    id={fieldCheckId}
                    type="checkbox"
                    style={fieldCheckStyle}
                    onChange={this.onChangefieldCheck}>
                </input>

                <div
                    className="fieldSpan"
                    id={fieldSpanId}
                    contentEditable="true"
                    style={fieldSpanStyle}
                    onBlur={this.onBlurfieldSpan}
                    onKeyDown={this.onKeyDownfieldSpan}
                    onKeyPress={this.onKeyPressfieldSpan}
                    onKeyUp={this.onKeyUpfieldSpan}
                    onMouseDown={this.onMouseDownfieldSpan}
                >
                </div>

                <div
                    className="enumerablesStyle"
                    id="enumerablesId"
                    onPointerDown={this.onPointerDownEnumerables}>

                </div>

            </div >
        )
    }
}