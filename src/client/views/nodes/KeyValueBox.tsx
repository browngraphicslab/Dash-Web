
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { CompileScript, ScriptOptions } from "../../util/Scripting";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react");
import { NumCast, Cast, FieldValue } from "../../../new_fields/Types";
import { Doc, Field } from "../../../new_fields/Doc";
import { ComputedField } from "../../../fields/ScriptField";

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();

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
        value = eq ? value.substr(1) : value;
        let dubEq = value.startsWith(":=");
        value = dubEq ? value.substr(2) : value;
        let options: ScriptOptions = { addReturn: true };
        if (dubEq) options.typecheck = false;
        let script = CompileScript(value, options);
        if (!script.compiled) {
            return false;
        }
        let field = new ComputedField(script);
        if (!dubEq) {
            let res = script.run();
            if (!res.success) return false;
            field = res.result;
        }
        if (Field.IsField(field, true)) {
            let target = eq ? doc : Doc.GetProto(doc);
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
        for (let key of Object.keys(ids).sort()) {
            rows.push(<KeyValuePair doc={realDoc} keyWidth={100 - this.splitPercentage} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} key={key} keyName={key} />);
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

    render() {
        let dividerDragger = this.splitPercentage === 0 ? (null) :
            <div className="keyValueBox-dividerDragger" style={{ transform: `translate(calc(${100 - this.splitPercentage}% - 5px), 0px)` }}>
                <div className="keyValueBox-dividerDraggerThumb" onPointerDown={this.onDividerDown} />
            </div>;

        return (<div className="keyValueBox-cont" onWheel={this.onPointerWheel} ref={this._mainCont}>
            <table className="keyValueBox-table">
                <tbody className="keyValueBox-tbody">
                    <tr className="keyValueBox-header">
                        <th className="keyValueBox-key" style={{ width: `${100 - this.splitPercentage}%` }}>Key</th>
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