
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { Opt, FieldWaiting, Field } from '../../../fields/Field';
import { KeyStore } from '../../../fields/KeyStore';
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import { KeyValuePair } from "./KeyValuePair";
import React = require("react")
import { Server } from "../../Server"
import { EditableView } from "../EditableView";
import { CompileScript, ToField } from "../../util/Scripting";
import { useState } from 'react'
import { Key } from '../../../fields/Key';
import { TextField } from '../../../fields/TextField';
import { EditorView } from "prosemirror-view";
import { IReactionDisposer } from "mobx";

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(KeyValueBox, fieldStr) }
    private _ref: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _reactionDisposer: Opt<IReactionDisposer>;
    private _newKey = '';
    private _newValue = '';


    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
        this.state = {
            key: '',
            value: ''
        }
    }



    shouldComponentUpdate() {
        return false;
    }

    onEnterKey = (e: React.KeyboardEvent): void => {
        if (e.key == 'Enter') {
            if (this._newKey != '' && this._newValue != '') {
                let doc = this.props.doc.GetT(KeyStore.Data, Document);
                if (!doc || doc == FieldWaiting) {
                    return
                }
                let realDoc = doc;
                realDoc.Set(new Key(this._newKey), new TextField(this._newValue));
                if (this.refs.newKVPKey instanceof HTMLInputElement) {
                    this.refs.newKVPKey.value = ''
                }
                if (this.refs.newKVPValue instanceof HTMLInputElement) {
                    this.refs.newKVPValue.value = ''
                }
                this._newKey = ''
                this._newValue = ''
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
        let doc = this.props.doc.GetT(KeyStore.Data, Document);
        if (!doc || doc == FieldWaiting) {
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

    keyChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._newKey = e.currentTarget.value;
    }

    valueChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._newValue = e.currentTarget.value;
    }

    newKeyValue = () => {
        return (
            <tr>
                <td><input type="text" ref="newKVPKey" id="key" placeholder="Key" onChange={this.keyChanged} /></td>
                <td><input type="text" ref="newKVPValue" id="value" placeholder="Value" onChange={this.valueChanged} onKeyPress={this.onEnterKey} /></td>
            </tr>
        )
    }

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