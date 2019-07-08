
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { CompileScript, ScriptOptions } from "../../util/Scripting";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react");
import { NumCast, Cast, FieldValue, StrCast } from "../../../new_fields/Types";
import { Doc, Field, FieldResult } from "../../../new_fields/Doc";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { SetupDrag } from "../../util/DragManager";
import { Docs } from "../../documents/Documents";
import { RawDataOperationParameters } from "../../northstar/model/idea/idea";
import { Templates } from "../Templates";
import { List } from "../../../new_fields/List";
import { TextField } from "../../util/ProsemirrorCopy/prompt";
import { RichTextField } from "../../../new_fields/RichTextField";
import { ImageField } from "../../../new_fields/URLField";
import { SelectionManager } from "../../util/SelectionManager";

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _keyHeader = React.createRef<HTMLTableHeaderCellElement>();
    @observable private rows: KeyValuePair[] = [];

    public static LayoutString(fieldStr: string = "data") { return FieldView.LayoutString(KeyValueBox, fieldStr); }
    @observable private _keyInput: string = "";
    @observable private _valueInput: string = "";
    @computed get splitPercentage() { return NumCast(this.props.Document.schemaSplitPercentage, 50); }
    get fieldDocToLayout() { return this.props.fieldKey ? FieldValue(Cast(this.props.Document[this.props.fieldKey], Doc)) : this.props.Document; }

    constructor(props: FieldViewProps) {
        super(props);
    }

    @action
    onEnterKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter') {
            if (this._keyInput && this._valueInput && this.fieldDocToLayout) {
                if (KeyValueBox.SetField(this.fieldDocToLayout, this._keyInput, this._valueInput)) {
                    this._keyInput = "";
                    this._valueInput = "";
                }
            }
        }
    }
    public static SetField(doc: Doc, key: string, value: string) {
        let eq = value.startsWith("=");
        let target = eq ? doc : Doc.GetProto(doc);
        value = eq ? value.substr(1) : value;
        let dubEq = value.startsWith(":=") ? 1 : value.startsWith(";=") ? 2 : 0;
        value = dubEq ? value.substr(2) : value;
        let options: ScriptOptions = { addReturn: true, params: { this: "Doc" } };
        if (dubEq) options.typecheck = false;
        let script = CompileScript(value, options);
        if (!script.compiled) {
            return false;
        }
        let field: Field;
        if (dubEq === 1) {
            field = new ComputedField(script);
        } else if (dubEq === 2) {
            field = new ScriptField(script);
        } else {
            let res = script.run({ this: target });
            if (!res.success) return false;
            field = res.result;
        }
        if (Field.IsField(field, true)) {
            target[key] = field;
            return true;
        }
        return false;
    }

    onPointerDown = (e: React.PointerEvent): void => {
        if (e.buttons === 1 && this.props.isSelected()) {
            e.stopPropagation();
        }
    }
    onPointerWheel = (e: React.WheelEvent): void => {
        e.stopPropagation();
    }

    createTable = () => {
        let doc = this.fieldDocToLayout;
        if (!doc) {
            return <tr><td>Loading...</td></tr>;
        }
        let realDoc = doc;

        let ids: { [key: string]: string } = {};
        let protos = Doc.GetAllPrototypes(doc);
        for (const proto of protos) {
            Object.keys(proto).forEach(key => {
                if (!(key in ids)) {
                    ids[key] = key;
                }
            });
        }

        let rows: JSX.Element[] = [];
        let i = 0;
        const self = this;
        for (let key of Object.keys(ids).sort()) {
            rows.push(<KeyValuePair doc={realDoc} ref={(function () {
                let oldEl: KeyValuePair | undefined;
                return (el: KeyValuePair) => {
                    if (oldEl) self.rows.splice(self.rows.indexOf(oldEl), 1);
                    oldEl = el;
                    if (el) self.rows.push(el);
                };
            })()} keyWidth={100 - this.splitPercentage} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} key={key} keyName={key} />);
        }
        return rows;
    }

    @action
    keyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._keyInput = e.currentTarget.value;
    }

    @action
    valueChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._valueInput = e.currentTarget.value;
    }

    newKeyValue = () =>
        (
            <tr className="keyValueBox-valueRow">
                <td className="keyValueBox-td-key" style={{ width: `${100 - this.splitPercentage}%` }}>
                    <input style={{ width: "100%" }} type="text" value={this._keyInput} placeholder="Key" onChange={this.keyChanged} />
                </td>
                <td className="keyValueBox-td-value" style={{ width: `${this.splitPercentage}%` }}>
                    <input style={{ width: "100%" }} type="text" value={this._valueInput} placeholder="Value" onChange={this.valueChanged} onKeyPress={this.onEnterKey} />
                </td>
            </tr>
        )

    @action
    onDividerMove = (e: PointerEvent): void => {
        let nativeWidth = this._mainCont.current!.getBoundingClientRect();
        this.props.Document.schemaSplitPercentage = Math.max(0, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100));
    }
    @action
    onDividerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onDividerMove);
        document.removeEventListener('pointerup', this.onDividerUp);
    }
    onDividerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        e.preventDefault();
        document.addEventListener("pointermove", this.onDividerMove);
        document.addEventListener('pointerup', this.onDividerUp);
    }

    getTemplate = async () => {
        let parent = Docs.StackingDocument([], { width: 800, height: 800, title: "Template" });
        parent.singleColumn = false;
        parent.columnWidth = 50;
        for (let row of this.rows.filter(row => row.isChecked)) {
            await this.createTemplateField(parent, row);
            row.uncheck();
        }
        return parent;
    }

    createTemplateField = async (parentStackingDoc: Doc, row: KeyValuePair) => {
        // let collectionKeyProp = `fieldKey={"data"}`;
        // let metaKey = row.props.keyName;
        // let metaKeyProp = `fieldKey={"${metaKey}"}`;

        // let sourceDoc = await Cast(this.props.Document.data, Doc);
        // if (!sourceDoc) {
        //     return;
        // }
        // let target = this.inferType(sourceDoc[metaKey], metaKey);

        // let template = Doc.MakeAlias(target);
        // template.proto = parent;
        // template.title = metaKey;
        // template.nativeWidth = 0;
        // template.nativeHeight = 0;
        // template.embed = true;
        // template.isTemplate = true;
        // template.templates = new List<string>([Templates.TitleBar(metaKey)]);
        // if (target.backgroundLayout) {
        //     let metaAnoKeyProp = `fieldKey={"${metaKey}"} fieldExt={"annotations"}`;
        //     let collectionAnoKeyProp = `fieldKey={"annotations"}`;
        //     template.layout = StrCast(target.layout).replace(collectionAnoKeyProp, metaAnoKeyProp);
        //     template.backgroundLayout = StrCast(target.backgroundLayout).replace(collectionKeyProp, metaKeyProp);
        // } else {
        //     template.layout = StrCast(target.layout).replace(collectionKeyProp, metaKeyProp);
        // }

        let metaKey = row.props.keyName;
        let sourceDoc = await Cast(this.props.Document.data, Doc);
        if (!sourceDoc) {
            return;
        }
        let fieldTemplate = this.inferType(sourceDoc[metaKey], metaKey);

        // move data doc fields to layout doc as needed (nativeWidth/nativeHeight, data, ??)
        let backgroundLayout = StrCast(fieldTemplate.backgroundLayout);
        let layout = StrCast(fieldTemplate.layout).replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
        if (backgroundLayout) {
            layout = StrCast(fieldTemplate.layout).replace(/fieldKey={"annotations"}/, `fieldKey={"${metaKey}"} fieldExt={"annotations"}`);
            backgroundLayout = backgroundLayout.replace(/fieldKey={"[^"]*"}/, `fieldKey={"${metaKey}"}`);
        }
        let nw = NumCast(fieldTemplate.nativeWidth);
        let nh = NumCast(fieldTemplate.nativeHeight);

        fieldTemplate.title = metaKey;
        fieldTemplate.layout = layout;
        fieldTemplate.backgroundLayout = backgroundLayout;
        fieldTemplate.nativeWidth = nw;
        fieldTemplate.nativeHeight = nh;
        fieldTemplate.embed = true;
        fieldTemplate.isTemplate = true;
        fieldTemplate.templates = new List<string>([Templates.TitleBar(metaKey)]);
        fieldTemplate.proto = Doc.GetProto(parentStackingDoc);

        Doc.AddDocToList(parentStackingDoc, "data", fieldTemplate);
        row.uncheck();
    }

    inferType = (data: FieldResult, metaKey: string) => {
        let options = { width: 300, height: 300, title: metaKey };
        if (data instanceof RichTextField || typeof data === "string" || typeof data === "number") {
            return Docs.TextDocument(options);
        } else if (data instanceof List) {
            return Docs.StackingDocument([], options);
        } else if (data instanceof ImageField) {
            return Docs.ImageDocument("https://www.freepik.com/free-icon/picture-frame-with-mountain-image_748687.htm", options);
        }
        return new Doc;
    }

    render() {
        let dividerDragger = this.splitPercentage === 0 ? (null) :
            <div className="keyValueBox-dividerDragger" style={{ transform: `translate(calc(${100 - this.splitPercentage}% - 5px), 0px)` }}>
                <div className="keyValueBox-dividerDraggerThumb" onPointerDown={this.onDividerDown} />
            </div>;

        return (<div className="keyValueBox-cont" onWheel={this.onPointerWheel} ref={this._mainCont}>
            <table className="keyValueBox-table">
                <tbody className="keyValueBox-tbody">
                    <tr className="keyValueBox-header">
                        <th className="keyValueBox-key" style={{ width: `${100 - this.splitPercentage}%` }} ref={this._keyHeader}
                            onPointerDown={SetupDrag(this._keyHeader, this.getTemplate)}
                        >Key</th>
                        <th className="keyValueBox-fields" style={{ width: `${this.splitPercentage}%` }}>Fields</th>
                    </tr>
                    {this.createTable()}
                    {this.newKeyValue()}
                </tbody>
            </table>
            {dividerDragger}
        </div>);
    }
}
