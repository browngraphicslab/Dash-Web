import React = require("react")
import { observer } from "mobx-react";
import { computed } from "mobx";
import { Field, FieldWaiting, FieldValue } from "../../../fields/Field";
import { Document } from "../../../fields/Document";
import { TextField } from "../../../fields/TextField";
import { NumberField } from "../../../fields/NumberField";
import { RichTextField } from "../../../fields/RichTextField";
import { ImageField } from "../../../fields/ImageField";
import { VideoField } from "../../../fields/VideoField"
import { Key } from "../../../fields/Key";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { WebBox } from "./WebBox";
import { VideoBox } from "./VideoBox";
import { AudioBox } from "./AudioBox";
import { AudioField } from "../../../fields/AudioField";
import { ListField } from "../../../fields/ListField";
import { DocumentContentsView } from "./DocumentContentsView";
import { Transform } from "../../util/Transform";
import { KeyStore } from "../../../fields/KeyStore";


//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: Key;
    Document: Document;
    isSelected: () => boolean;
    select: (isCtrlPressed: boolean) => void;
    isTopMost: boolean;
    selectOnLoad: boolean;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string = "DataKey") {
        return `<${fieldType.name} {...props} fieldKey={${fieldStr}} />`;
    }

    @computed
    get field(): FieldValue<Field> {
        const { Document: doc, fieldKey } = this.props;
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
        }
        else if (field instanceof Document) {
            return (<DocumentContentsView Document={field}
                AddDocument={undefined}
                RemoveDocument={undefined}
                ScreenToLocalTransform={() => Transform.Identity}
                ContentScaling={() => 1}
                PanelWidth={() => 100}
                PanelHeight={() => 100}
                isTopMost={true}
                selectOnLoad={false}
                focus={() => { }}
                isSelected={() => false}
                select={() => false}
                layoutKey={KeyStore.Layout}
                ContainingCollectionView={undefined} />)
        }
        else if (field instanceof ListField) {
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