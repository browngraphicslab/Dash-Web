import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Doc, Field } from '../../../new_fields/Doc';
import { emptyFunction, returnFalse, returnOne, returnZero } from '../../../Utils';
import { Docs } from '../../documents/Documents';
import { Transform } from '../../util/Transform';
import { undoBatch } from '../../util/UndoManager';
import { CollectionDockingView } from '../collections/CollectionDockingView';
import { ContextMenu } from '../ContextMenu';
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from './FieldView';
import { KeyValueBox } from './KeyValueBox';
import "./KeyValueBox.scss";
import "./KeyValuePair.scss";
import React = require("react");

// Represents one row in a key value plane

export interface KeyValuePairProps {
    rowStyle: string;
    keyName: string;
    doc: Doc;
    keyWidth: number;
}
@observer
export class KeyValuePair extends React.Component<KeyValuePairProps> {
    @observable private isPointerOver = false;
    @observable public isChecked = false;
    private checkbox = React.createRef<HTMLInputElement>();

    @action
    handleCheck = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.isChecked = e.currentTarget.checked;
    }

    @action
    uncheck = () => {
        this.checkbox.current!.checked = false;
        this.isChecked = false;
    }

    onContextMenu = (e: React.MouseEvent) => {
        const value = this.props.doc[this.props.keyName];
        if (value instanceof Doc) {
            e.stopPropagation();
            e.preventDefault();
            ContextMenu.Instance.addItem({ description: "Open Fields", event: () => { let kvp = Docs.Create.KVPDocument(value, { width: 300, height: 300 }); CollectionDockingView.Instance.AddRightSplit(kvp, undefined); }, icon: "layer-group" });
            ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
        }
    }

    render() {
        let props: FieldViewProps = {
            Document: this.props.doc,
            DataDoc: this.props.doc,
            ContainingCollectionView: undefined,
            ContainingCollectionDoc: undefined,
            ruleProvider: undefined,
            fieldKey: this.props.keyName,
            fieldExt: "",
            isSelected: returnFalse,
            select: emptyFunction,
            renderDepth: 1,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            PanelWidth: returnZero,
            PanelHeight: returnZero,
            addDocTab: returnZero,
            pinToPres: returnZero,
            ContentScaling: returnOne
        };
        let contents = <FieldView {...props} />;
        // let fieldKey = Object.keys(props.Document).indexOf(props.fieldKey) !== -1 ? props.fieldKey : "(" + props.fieldKey + ")";
        let protoCount = 0;
        let doc: Doc | undefined = props.Document;
        while (doc) {
            if (Object.keys(doc).includes(props.fieldKey)) {
                break;
            }
            protoCount++;
            doc = doc.proto;
        }
        const parenCount = Math.max(0, protoCount - 1);
        let keyStyle = protoCount === 0 ? "black" : "blue";

        let hover = { transition: "0.3s ease opacity", opacity: this.isPointerOver || this.isChecked ? 1 : 0 };

        return (
            <tr className={this.props.rowStyle} onPointerEnter={action(() => this.isPointerOver = true)} onPointerLeave={action(() => this.isPointerOver = false)}>
                <td className="keyValuePair-td-key" style={{ width: `${this.props.keyWidth}%` }}>
                    <div className="keyValuePair-td-key-container">
                        <button style={hover} className="keyValuePair-td-key-delete" onClick={undoBatch(() => {
                            if (Object.keys(props.Document).indexOf(props.fieldKey) !== -1) {
                                props.Document[props.fieldKey] = undefined;
                            }
                            else props.Document.proto![props.fieldKey] = undefined;
                        })}>
                            X
                        </button>
                        <input
                            className={"keyValuePair-td-key-check"}
                            type="checkbox"
                            style={hover}
                            onChange={this.handleCheck}
                            ref={this.checkbox}
                        />
                        <div className="keyValuePair-keyField" style={{ color: keyStyle }}>{"(".repeat(parenCount)}{props.fieldKey}{")".repeat(parenCount)}</div>
                    </div>
                </td>
                <td className="keyValuePair-td-value" style={{ width: `${100 - this.props.keyWidth}%` }} onContextMenu={this.onContextMenu}>
                    <div className="keyValuePair-td-value-container">
                        <EditableView
                            contents={contents}
                            maxHeight={36}
                            height={"auto"}
                            GetValue={() => {
                                return Field.toKeyValueString(props.Document, props.fieldKey);
                            }}
                            SetValue={(value: string) =>
                                KeyValueBox.SetField(props.Document, props.fieldKey, value)}>
                        </EditableView>
                    </div>
                </td>
            </tr>
        );
    }
}