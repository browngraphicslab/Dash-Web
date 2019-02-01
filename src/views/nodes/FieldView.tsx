import React = require("react")
import { DocumentFieldViewProps } from "./DocumentView";
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Field, Opt } from "../../fields/Field";
import { TextField } from "../../fields/TextField";
import { NumberField } from "../../fields/NumberField";

@observer
export class FieldView extends React.Component<DocumentFieldViewProps> {
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
        else if (field instanceof NumberField) {
            return <p>{field.Data}</p>
        } else {
            return <p>{field.GetValue}</p>
        }
    }

}