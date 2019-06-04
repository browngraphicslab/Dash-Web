import { action, observable } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import { emptyFunction, returnFalse, returnZero, returnTrue } from '../../../Utils';
import { CompileScript } from "../../util/Scripting";
import { Transform } from '../../util/Transform';
import { EditableView } from "../EditableView";
import { FieldView, FieldViewProps } from './FieldView';
import "./KeyValueBox.scss";
import "./KeyValuePair.scss";
import React = require("react");
import { Doc, Opt, Field } from '../../../new_fields/Doc';
import { FieldValue } from '../../../new_fields/Types';

// Represents one row in a key value plane

export interface KeyValuePairProps {
    rowStyle: string;
    keyName: string;
    doc: Doc;
    keyWidth: number;
}
@observer
export class KeyValuePair extends React.Component<KeyValuePairProps> {

    render() {
        let props: FieldViewProps = {
            Document: this.props.doc,
            ContainingCollectionView: undefined,
            fieldKey: this.props.keyName,
            isSelected: returnFalse,
            select: emptyFunction,
            isTopMost: false,
            selectOnLoad: false,
            active: returnFalse,
            whenActiveChanged: emptyFunction,
            ScreenToLocalTransform: Transform.Identity,
            focus: emptyFunction,
            PanelWidth: returnZero,
            PanelHeight: returnZero,
            addDocTab: emptyFunction
        };
        let contents = <FieldView {...props} />;
        let fieldKey = Object.keys(props.Document).indexOf(props.fieldKey) !== -1 ? props.fieldKey : "(" + props.fieldKey + ")";
        return (
            <tr className={this.props.rowStyle}>
                <td className="keyValuePair-td-key" style={{ width: `${this.props.keyWidth}%` }}>
                    <div className="keyValuePair-td-key-container">
                        <button className="keyValuePair-td-key-delete" onClick={() => {
                            if (Object.keys(props.Document).indexOf(props.fieldKey) !== -1) {
                                props.Document[props.fieldKey] = undefined;
                            }
                            else props.Document.proto![props.fieldKey] = undefined;
                        }}>
                            X
                        </button>
                        <div className="keyValuePair-keyField">{fieldKey}</div>
                    </div>
                </td>
                <td className="keyValuePair-td-value" style={{ width: `${100 - this.props.keyWidth}%` }}>
                    <EditableView contents={contents} height={36} GetValue={() => {

                        let field = FieldValue(props.Document[props.fieldKey]);
                        if (Field.IsField(field)) {
                            return Field.toScriptString(field);
                        }
                        return "";
                    }}
                        SetValue={(value: string) => {
                            let script = CompileScript(value, { addReturn: true });
                            if (!script.compiled) {
                                return false;
                            }
                            let res = script.run();
                            if (!res.success) return false;
                            const field = res.result;
                            if (Field.IsField(field, true)) {
                                props.Document[props.fieldKey] = field;
                                return true;
                            }
                            return false;
                        }}>
                    </EditableView></td>
            </tr>
        );
    }
}