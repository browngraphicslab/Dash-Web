import 'react-image-lightbox/style.css'; // This only needs to be imported once in your app
import "./KeyValueBox.scss";
import React = require("react")
import { FieldViewProps, FieldView } from './FieldView';
import { Opt, Field } from '../../../fields/Field';
import { observer } from "mobx-react"
import { observable, action } from 'mobx';
import { Document } from '../../../fields/Document';
import { Key } from '../../../fields/Key';
import { Server } from "../../Server"

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
            doc: this.props.doc,
            fieldKey: this.key,
            isSelected: () => false,
            select: () => { },
            isTopMost: false,
            bindings: {},
            selectOnLoad: false,
        }
        return (
            <tr className={this.props.rowStyle}>
                <td>{this.key.Name}</td>
                <td><FieldView {...props} /></td>
            </tr>
        )
    }
}