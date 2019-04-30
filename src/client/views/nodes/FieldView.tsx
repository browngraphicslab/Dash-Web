import React = require("react");
import { observer } from "mobx-react";
import { computed } from "mobx";
import { FormattedTextBox } from "./FormattedTextBox";
import { ImageBox } from "./ImageBox";
import { VideoBox } from "./VideoBox";
import { AudioBox } from "./AudioBox";
import { DocumentContentsView } from "./DocumentContentsView";
import { Transform } from "../../util/Transform";
import { returnFalse, emptyFunction } from "../../../Utils";
import { CollectionView } from "../collections/CollectionView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { IconBox } from "./IconBox";
import { Opt, Doc, FieldResult } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ImageField, VideoField, AudioField } from "../../../new_fields/URLField";
import { IconField } from "../../../new_fields/IconField";
import { RichTextField } from "../../../new_fields/RichTextField";


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
    PanelWidth: () => number;
    PanelHeight: () => number;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string = "data") {
        return `<${fieldType.name} {...props} fieldKey={"${fieldStr}"} />`;
    }

    @computed
    get field(): FieldResult {
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
                    isSelected={this.props.isSelected}
                    select={returnFalse}
                    layoutKey={"layout"}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    parentActive={this.props.active}
                    toggleMinimized={emptyFunction}
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
        else if (!(field instanceof Promise)) {
            return <p>{JSON.stringify(field)}</p>;
        }
        else {
            return <p> {"Waiting for server..."} </p>;
        }
    }

}