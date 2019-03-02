
import { IReactionDisposer } from 'mobx';
import { observer } from "mobx-react";
import { EditorView } from 'prosemirror-view';
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { Opt, FieldWaiting } from '../../../fields/Field';
import { KeyStore } from '../../../fields/KeyStore';
import { FieldView, FieldViewProps } from './FieldView';
import { KeyValuePair } from "./KeyValuePair";
import "./KeyValueBox.scss";
import React = require("react")

@observer
export class KeyValueBox extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(KeyValueBox, fieldStr) }
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
        let doc = this.props.doc.GetT(KeyStore.Data, Document);
        if (!doc || doc == FieldWaiting) {
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
        let i = 0;
        for (let key in ids) {
            rows.push(<KeyValuePair doc={realDoc} rowStyle={"keyValueBox-" + (i++ % 2 ? "oddRow" : "evenRow")} fieldId={key} key={key} />)
        }
        return rows;
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
                </tbody>
            </table>
        </div>)
    }
}