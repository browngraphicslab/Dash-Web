import React = require("react")
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Field, FieldWaiting, FieldValue } from "../../../fields/Field";
import { Document } from "../../../fields/Document";
import { TextField } from "../../../fields/TextField";
import { NumberField } from "../../../fields/NumberField";
import { RichTextField } from "../../../fields/RichTextField";
import { ImageField } from "../../../fields/ImageField";
import { WebField } from "../../../fields/WebField";
import { VideoField } from "../../../fields/VideoField"
import { Key } from "../../../fields/Key";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { WebBox } from "./WebBox";
import { VideoBox } from "./VideoBox";
import { AudioBox } from "./AudioBox";
import { AudioField } from "../../../fields/AudioField";
import { ListField } from "../../../fields/ListField";


//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: Key;
    doc: Document;
    isSelected: () => boolean;
    select: () => void;
    isTopMost: boolean;
    selectOnLoad: boolean;
    bindings: any;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string = "DataKey") {
        return `<${fieldType.name} doc={Document} DocumentViewForField={DocumentView} bindings={bindings} fieldKey={${fieldStr}} isSelected={isSelected} select={select} selectOnLoad={SelectOnLoad} isTopMost={isTopMost} />`;
    }

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
        else if (field instanceof VideoField) {
            return <VideoBox {...this.props} />
        }
        else if (field instanceof AudioField) {
            return <AudioBox {...this.props} />
        } else if (field instanceof Document) {
            return <div>{field.Title}</div>
        } else if (field instanceof ListField) {
            return (<div>
                {(field as ListField<Field>).Data.map(f => {
                    return f instanceof Document ? f.Title : f.GetValue().toString();
                }).join(", ")}
            </div>)
        }
        // bcz: this belongs here, but it doesn't render well so taking it out for now
        // else if (field instanceof HtmlField) {
        //     return <WebBox {...this.props} />
        // }
        else if (field instanceof NumberField) {
            return <p>{field.Data}</p>
        }
        else if (field != FieldWaiting) {
            return <p>{JSON.stringify(field.GetValue())}</p>
        }
        else
            return <p> {"Waiting for server..."} </p>
    }

}