import React = require("react")
import { Document } from "../../fields/Document";
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Field, Opt } from "../../fields/Field";
import { TextField } from "../../fields/TextField";
import { NumberField } from "../../fields/NumberField";
import { RichTextField } from "../../fields/RichTextField";
import { FieldTextBox } from "./FieldTextBox";
import { ImageField } from "../../fields/ImageField";
import { ImageBox } from "./ImageBox";
import { Key } from "../../fields/Key";
import { DocumentView } from "./DocumentView";

//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FieldTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: Key;
    doc: Document;
    documentViewContainer: DocumentView
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    @computed
    get field(): Opt<Field> {
        const { doc, fieldKey } = this.props;
        return doc.GetField(fieldKey);
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
            return <FieldTextBox {...this.props} />
        }
        else if (field instanceof ImageField) {
            return <ImageBox {...this.props} />
        }
        else if (field instanceof NumberField) {
            return <p>{field.Data}</p>
        } else {
            return <p>{field.GetValue}</p>
        }
    }

}