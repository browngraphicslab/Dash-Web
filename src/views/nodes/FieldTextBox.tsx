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

// FieldTextBox: Displays an editable plain text node that maps to a specified Key of a Document
//
//  HTML Markup:  <FieldTextBox Doc={Document's ID} FieldKey={Key's name + "Key"}
// 
//  In Code, the node's HTML is specified in the document's parameterized structure as:
//        document.SetField(KeyStore.Layout,  "<FieldTextBox doc={doc} fieldKey={<KEYNAME>Key} />");
//  and the node's binding to the specified document KEYNAME as:
//        document.SetField(KeyStore.LayoutKeys, new ListField([KeyStore.<KEYNAME>]));
//  The Jsx parser at run time will bind:
//        'fieldKey' property to the Key stored in LayoutKeys
//    and 'doc' property to the document that is being rendered
//
//  When rendered() by React, this extracts the TextController from the Document stored at the 
//  specified Key and assigns it to an HTML input node.  When changes are made tot his node, 
//  this will edit the document and assign the new value to that field.
//
@observer
export class FieldTextBox extends React.Component<IProps, IProps> {

    constructor(props:IProps) {
        super(props);
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