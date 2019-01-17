import { Key } from "../../fields/Key";
import { Document } from "../../fields/Document";
import { observer } from "mobx-react";
import { TextField } from "../../fields/TextField";
import React = require("react")
import { action, observable } from "mobx";

interface IProps {
    fieldKey:Key;
    doc:Document;
    test:string;
}

@observer
export class FieldTextBox extends React.Component<IProps, IProps> {
    readonly doc:Document;
    readonly fieldKey:Key;

    constructor(props:IProps) {
        super(props);
        this.doc = props.doc;
        this.fieldKey = props.fieldKey;
        this.onChange = this.onChange.bind(this);
    }

    @action
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        const {fieldKey, doc} = this.props;
        doc.SetFieldValue(fieldKey, e.target.value, TextField);
    }

    render() {
        const {fieldKey, doc} = this.props;
        const value = doc.GetFieldValue(fieldKey, TextField, String(""));
        return (<input value={value} onChange={this.onChange} />)
    }
}