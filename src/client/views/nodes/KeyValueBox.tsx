
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { FieldWaiting, Field } from '../../../fields/Field';
import { KeyStore } from '../../../fields/KeyStore';
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react")
import { CompileScript, ToField } from "../../util/Scripting";
import { Key } from '../../../fields/Key';
import { observable, action } from "mobx";

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(KeyValueBox, fieldStr) }
    @observable private _keyInput: string = "";
    @observable private _valueInput: string = "";


    constructor(props: FieldViewProps) {
        super(props);
    }



    shouldComponentUpdate() {
        return false;
    }

    @action
    onEnterKey = (e: React.KeyboardEvent): void => {
        if (e.key === 'Enter') {
            if (this._keyInput && this._valueInput) {
                let doc = this.props.Document.GetT(KeyStore.Data, Document);
                if (!doc || doc === FieldWaiting) {
                    return
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
                this._keyInput = ""
                this._valueInput = ""
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
            return <tr><td>Loading...</td></tr>
        }
        let realDoc = doc;

        let ids: { [key: string]: string } = {};
        let protos = doc.GetAllPrototypes();
        for (const proto of protos) {
            proto._proxies.forEach((val: any, key: string) => {
                if (!(key in ids)) {
                    ids[key] = key;
                }
            })
        }

        let rows: JSX.Element[] = [];
        let i = 0;
        for (let key in ids) {
            rows.push(<KeyValuePair doc={realDoc} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} fieldId={key} key={key} />)
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
            <tr>
                <td><input type="text" value={this._keyInput} placeholder="Key" onChange={this.keyChanged} /></td>
                <td><input type="text" value={this._valueInput} placeholder="Value" onChange={this.valueChanged} onKeyPress={this.onEnterKey} /></td>
            </tr>
        )

    render() {
        return (<div className="keyValueBox-cont" onWheel={this.onPointerWheel}>
            <table className="keyValueBox-table">
                <tbody>
                    <tr className="keyValueBox-header">
                        <th>Key</th>
                        <th>Fields</th>
                    </tr>
                    {this.createTable()}
                    {this.newKeyValue()}
                </tbody>
            </table>
        </div>)
    }
}