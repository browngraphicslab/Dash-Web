import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import "./KeyValueBox.scss";
import "./KeyValuePair.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { Opt, Field } from '../../../fields/Field';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import { Document } from '../../../fields/Document';
import { Key } from '../../../fields/Key';
import { Server } from "../../Server"
import { EditableView } from "../EditableView";
import { CompileScript, ToField } from "../../util/Scripting";
import { Transform } from '../../util/Transform';

// Represents one row in a key value plane

export interface KeyValuePairProps {
    rowStyle: string;
    fieldId: string;
    doc: Document;
}
@observer
export class KeyValuePair extends React.Component<KeyValuePairProps> {

    @observable
    private key: Opt<Key>

    constructor(props: KeyValuePairProps) {
        super(props);
        Server.GetField(this.props.fieldId,
            action((field: Opt<Field>) => {
                if (field) {
                    this.key = field as Key;
                }
            }));

    }


    render() {
        if (!this.key) {
            return <tr><td>error</td><td></td></tr>

        }
        let props: FieldViewProps = {
            Document: this.props.doc,
            fieldKey: this.key,
            isSelected: () => false,
            select: () => { },
            isTopMost: false,
            selectOnLoad: false,
            active: () => false,
            ScreenToLocalTransform: Transform.Identity,
            focus: () => { },
        }
        let contents = (
            <FieldView {...props} />
        );
        return (
            <tr className={this.props.rowStyle}>
                {/* <button>X</button> */}
                <td>
                    <div className="container">
                        <div>{this.key.Name}</div>
                        <button className="delete" onClick={() => {
                            let field = props.Document.Get(props.fieldKey);
                            if (field && field instanceof Field) {
                                props.Document.Set(props.fieldKey, undefined);
                            }
                        }}>X</button>
                    </div>
                </td>
                <td><EditableView contents={contents} height={36} GetValue={() => {
                    let field = props.Document.Get(props.fieldKey);
                    if (field && field instanceof Field) {
                        return field.ToScriptString();
                    }
                    return field || "";
                }}
                    SetValue={(value: string) => {
                        let script = CompileScript(value, undefined, true);
                        if (!script.compiled) {
                            return false;
                        }
                        let field = script();
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
                    }}></EditableView></td>
            </tr>
        )
    }
}