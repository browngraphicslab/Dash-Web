
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { Field, FieldWaiting } from '../../../fields/Field';
import { Key } from '../../../fields/Key';
import { KeyStore } from '../../../fields/KeyStore';
import { CompileScript, ToField } from "../../util/Scripting";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react");

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(KeyValueBox, fieldStr); }
    @observable private _keyInput: string = "";
    @observable private _valueInput: string = "";
    @computed get splitPercentage() { return this.props.Document.GetNumber(KeyStore.SchemaSplitPercentage, 50); }


    constructor(props: FieldViewProps) {
        super(props);
    }

    @action
    onEnterKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter') {
            if (this._keyInput && this._valueInput) {
                let doc = this.props.Document.GetT(KeyStore.Data, Document);
                if (!doc || doc === FieldWaiting) {
                    return;
                }
                let realDoc = doc;

                let script = CompileScript(this._valueInput, { addReturn: true });
                if (!script.compiled) {
                    return;
                }
                let res = script.run();
                if (!res.success) return;
                const field = res.result;
                if (field instanceof Field) {
                    realDoc.Set(new Key(this._keyInput), field);
                } else {
                    let dataField = ToField(field);
                    if (dataField) {
                        realDoc.Set(new Key(this._keyInput), dataField);
                    }
                }
                this._keyInput = "";
                this._valueInput = "";
            }
        }
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
        let doc = this.props.Document.GetT(KeyStore.Data, Document);
        if (!doc || doc === FieldWaiting) {
            return <tr><td>Loading...</td></tr>;
        }
        let realDoc = doc;

        let ids: { [key: string]: string } = {};
        let protos = doc.GetAllPrototypes();
        for (const proto of protos) {
            proto._proxies.forEach((val: any, key: string) => {
                if (!(key in ids)) {
                    ids[key] = key;
                }
            });
        }

        let rows: JSX.Element[] = [];
        let i = 0;
        for (let key in ids) {
            rows.push(<KeyValuePair doc={realDoc} keyWidth={100 - this.splitPercentage} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} fieldId={key} key={key} />);
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
        this.props.Document.SetNumber(KeyStore.SchemaSplitPercentage, Math.max(0, 100 - Math.round((e.clientX - nativeWidth.left) / nativeWidth.width * 100)));
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