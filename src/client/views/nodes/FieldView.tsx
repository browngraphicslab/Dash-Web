import React = require("react");
import { observer } from "mobx-react";
import { computed } from "mobx";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { WebBox } from "./WebBox";
import { VideoBox } from "./VideoBox";
import { AudioBox } from "./AudioBox";
import { DocumentContentsView } from "./DocumentContentsView";
import { Transform } from "../../util/Transform";
import { returnFalse, emptyFunction, returnOne } from "../../../Utils";
import { CollectionView } from "../collections/CollectionView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { IconField } from "../../../fields/IconFIeld";
import { IconBox } from "./IconBox";
import { Opt, Doc, Field, FieldValue, FieldWaiting } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";


//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: string;
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    isSelected: () => boolean;
    select: (isCtrlPressed: boolean) => void;
    isTopMost: boolean;
    selectOnLoad: boolean;
    addDocument?: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument?: (document: Doc) => boolean;
    moveDocument?: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    focus: (doc: Doc) => void;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string = "DataKey") {
        return `<${fieldType.name} {...props} fieldKey={${fieldStr}} />`;
    }

    @computed
    get field(): FieldValue {
        const { Document, fieldKey } = this.props;
        return Document[fieldKey];
    }
    render() {
        const field = this.field;
        if (!field) {
            return <p>{'<null>'}</p>;
        }
        if (typeof field === "string") {
            return <p>{field}</p>;
        }
        else if (field instanceof RichTextField) {
            return <FormattedTextBox {...this.props} />;
        }
        else if (field instanceof ImageField) {
            return <ImageBox {...this.props} />;
        }
        else if (field instanceof IconField) {
            return <IconBox {...this.props} />;
        }
        else if (field instanceof VideoField) {
            return <VideoBox {...this.props} />;
        }
        else if (field instanceof AudioField) {
            return <AudioBox {...this.props} />;
        }
        else if (field instanceof Doc) {
            return (
                <DocumentContentsView Document={field}
                    addDocument={undefined}
                    removeDocument={undefined}
                    ScreenToLocalTransform={Transform.Identity}
                    ContentScaling={() => 1}
                    PanelWidth={() => 100}
                    PanelHeight={() => 100}
                    isTopMost={true} //TODO Why is this top most?
                    selectOnLoad={false}
                    focus={emptyFunction}
                    isSelected={returnFalse}
                    select={returnFalse}
                    layoutKey={"layout"}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    parentActive={this.props.active}
                    whenActiveChanged={this.props.whenActiveChanged} />
            );
        }
        else if (field instanceof List) {
            return (<div>
                {field.map(f => f instanceof Doc ? f.title : f.toString()).join(", ")}
            </div>);
        }
        // bcz: this belongs here, but it doesn't render well so taking it out for now
        // else if (field instanceof HtmlField) {
        //     return <WebBox {...this.props} />
        // }
        else if (typeof field === "number") {
            return <p>{field}</p>;
        }
        else if (field !== FieldWaiting) {
            return <p>{JSON.stringify(field)}</p>;
        }
        else {
            return <p> {"Waiting for server..."} </p>;
        }
    }

}