
import Lightbox from 'react-image-lightbox';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import "./KeyValuePane.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { FieldWaiting, Opt, Field } from '../../../fields/Field';
import { observer } from "mobx-react"
import { observable, action, IReactionDisposer, reaction, ObservableMap } from 'mobx';
import { KeyStore } from '../../../fields/KeyStore';
import { RichTextField } from "../../../fields/RichTextField";
import { element } from 'prop-types';
import { props } from 'bluebird';
import { EditorView } from 'prosemirror-view';
import { Transaction, EditorState } from 'prosemirror-state';
import { schema } from 'prosemirror-schema-basic';
import { keymap } from 'prosemirror-keymap';
import { undo, redo } from 'prosemirror-history';
import { baseKeymap } from 'prosemirror-commands';
import { KVPField } from '../../../fields/KVPField';
import { Document } from '../../../fields/Document';
import { Key } from '../../../fields/Key';
import { JSXElement } from 'babel-types';
import { KeyValuePair } from "./KeyValuePair"

@observer
export class KeyValuePane extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(KeyValuePane, fieldStr) }
    private _ref: React.RefObject<HTMLDivElement>;
    private _editorView: Opt<EditorView>;
    private _reactionDisposer: Opt<IReactionDisposer>;


    constructor(props: FieldViewProps) {
        super(props);

        this._ref = React.createRef();
    }



    shouldComponentUpdate() {
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
        let table: Array<JSX.Element> = []
        let ret = "waiting"
        let doc = this.props.doc.GetT(KeyStore.Data, Document);
        if (!doc || doc == "<Waiting>") {
            return <tr><td>Loading...</td></tr>
        }
        let realDoc = doc;

        let ids: { [key: string]: string } = {};
        let protos = doc.GetAllPrototypes();
        for (const proto of protos) {
            proto._proxies.forEach((val, key) => {
                if (!(key in ids)) {
                    ids[key] = key;
                }
            })
        }

        let rows: JSX.Element[] = [];
        for (let key in ids) {
            rows.push(<KeyValuePair doc={realDoc} fieldId={key} />)
        }
        return rows;
    }


    render() {

        return (<table>
            <tbody>
                <tr>
                    <th>Key</th>
                    <th>Fields</th>
                </tr>
                {this.createTable()}
            </tbody>
        </table>)
    }
}