import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { Document } from '../../../fields/Document';
import { Field, Opt } from '../../../fields/Field';
import { Key } from '../../../fields/Key';
import { emptyDocFunction, emptyFunction, returnFalse } from '../../../Utils';
import { Server } from "../../Server";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from '../../util/Transform';
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import "./KeyValuePair.scss";
import React = require("react");

// Represents one row in a key value plane

export interface KeyValuePairProps {
    rowStyle: string;
    fieldId: string;
    doc: Document;
    keyWidth: number;
}
@observer
export class KeyValuePair extends React.Component<KeyValuePairProps> {

    @observable private key: Opt<Key>;

    constructor(props: KeyValuePairProps) {
        super(props);
        Server.GetField(this.props.fieldId,
            action((field: Opt<Field>) => field instanceof Key && (this.key = field)));

    }


    render() {
        if (!this.key) {
            return <tr><td>error</td><td /></tr>;
        }
        let props: FieldViewProps = {
            Document: this.props.doc,
            ContainingCollectionView: undefined,
            fieldKey: this.key,
            isSelected: returnFalse,
            select: emptyFunction,
            isTopMost: false,
            selectOnLoad: false,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyDocFunction,
        };
        let contents = <FieldView {...props} />;
        return (
            <tr className={this.props.rowStyle}>
                <td className="keyValuePair-td-key" style={{ width: `${this.props.keyWidth}%` }}>
                    <div className="keyValuePair-td-key-container">
                        <button className="keyValuePair-td-key-delete" onClick={() => {
                            let field = props.Document.Get(props.fieldKey);
                            field && field instanceof Field && props.Document.Set(props.fieldKey, undefined);
                        }}>
                            X
                        </button>
                        <div className="keyValuePair-keyField">{this.key.Name}</div>
                    </div>
                </td>
                <td className="keyValuePair-td-value" style={{ width: `${100 - this.props.keyWidth}%` }}>
                    <EditableView contents={contents} height={36} GetValue={() => {
                        let field = props.Document.Get(props.fieldKey);
                        if (field && field instanceof Field) {
                            return field.ToScriptString();
                        }
                        return field || "";
                    }}
                        SetValue={(value: string) => {
                            let script = CompileScript(value, { addReturn: true });
                            if (!script.compiled) {
                                return false;
                            }
                            let res = script.run();
                            if (!res.success) return false;
                            const field = res.result;
                            if (field instanceof Field) {
                                props.Document.Set(props.fieldKey, field);
                                return true;
                            } else {
                                let dataField = ToField(field);
                                if (dataField) {
                                    props.Document.Set(props.fieldKey, dataField);
                                    return true;
                                }
                            }
                            return false;
                        }}>
                    </EditableView></td>
            </tr>
        );
    }
}