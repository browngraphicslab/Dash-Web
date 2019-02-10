import React = require("react")
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Field, Opt, FieldWaiting, FieldValue } from "../../../fields/Field";
import { Document } from "../../../fields/Document";
import { TextField } from "../../../fields/TextField";
import { NumberField } from "../../../fields/NumberField";
import { RichTextField } from "../../../fields/RichTextField";
import { ImageField } from "../../../fields/ImageField";
import { Key } from "../../../fields/Key";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { DocumentView } from "./DocumentView";

//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: Key;
    doc: Document;
    DocumentViewForField: Opt<DocumentView>
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: string) { return `<${fieldType} doc={Document} DocumentViewForField={DocumentView} fieldKey={DataKey} />`; }
    @computed
    get field(): FieldValue<Field> {
        const { doc, fieldKey } = this.props;
        return doc.Get(fieldKey);
    }
    render() {
        const field = this.field;
        if (!field) {
            return <p>{'<null>'}</p>
        }
        if (field instanceof TextField) {
            return <p>{field.Data}</p>
        }
        else if (field instanceof RichTextField) {
            return <FormattedTextBox {...this.props} />
        }
        else if (field instanceof ImageField) {
            return <ImageBox {...this.props} />
        }
        else if (field instanceof NumberField) {
            return <p>{field.Data}</p>
        } else if (field != FieldWaiting) {
            return <p>{field.GetValue}</p>
        } else
            return <p> {"Waiting for server..."} </p>
    }

}