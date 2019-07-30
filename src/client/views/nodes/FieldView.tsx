import React = require("react");
import { computed } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../new_fields/DateField";
import { Doc, FieldResult, Opt } from "../../../new_fields/Doc";
import { IconField } from "../../../new_fields/IconField";
import { List } from "../../../new_fields/List";
import { RichTextField } from "../../../new_fields/RichTextField";
import { AudioField, ImageField, VideoField } from "../../../new_fields/URLField";
import { Transform } from "../../util/Transform";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { AudioBox } from "./AudioBox";
import { FormattedTextBox } from "./FormattedTextBox";
import { IconBox } from "./IconBox";
import { ImageBox } from "./ImageBox";
import { PDFBox } from "./PDFBox";
import { VideoBox } from "./VideoBox";
import { Id } from "../../../new_fields/FieldSymbols";

//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: string;
    fieldExt: string;
    leaveNativeSize?: boolean;
    fitToBox?: boolean;
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    DataDoc?: Doc;
    isSelected: () => boolean;
    select: (isCtrlPressed: boolean) => void;
    renderDepth: number;
    selectOnLoad: boolean;
    addDocument?: (document: Doc, allowDuplicates?: boolean) => boolean;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    removeDocument?: (document: Doc) => boolean;
    moveDocument?: (document: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    focus: (doc: Doc) => void;
    PanelWidth: () => number;
    PanelHeight: () => number;
    setVideoBox?: (player: VideoBox) => void;
    setPdfBox?: (player: PDFBox) => void;
    ContentScaling: () => number;
    ChromeHeight?: () => number;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string = "data", fieldExt: string = "") {
        return `<${fieldType.name} {...props} fieldKey={"${fieldStr}"} fieldExt={"${fieldExt}"} />`;
    }

    @computed
    get field(): FieldResult {
        const { Document, fieldKey } = this.props;
        return Document[fieldKey];
    }
    render() {
        const field = this.field;
        if (field === undefined) {
            return <p>{'<null>'}</p>;
        }
        // if (typeof field === "string") {
        //     return <p>{field}</p>;
        // }
        else if (field instanceof RichTextField) {
            return <FormattedTextBox {...this.props} />;
        }
        else if (field instanceof ImageField) {
            return <ImageBox {...this.props} leaveNativeSize={true} />;
        }
        else if (field instanceof IconField) {
            return <IconBox {...this.props} />;
        }
        else if (field instanceof VideoField) {
            return <VideoBox {...this.props} />;
        }
        else if (field instanceof AudioField) {
            return <AudioBox {...this.props} />;
        } else if (field instanceof DateField) {
            return <p>{field.date.toLocaleString()}</p>;
        }
        else if (field instanceof Doc) {
            return <p><b>{field.title}</b></p>;
            //return <p><b>{field.title + " : id= " + field[Id]}</b></p>;
            // let returnHundred = () => 100;
            // return (
            //     <DocumentContentsView Document={field}
            //         addDocument={undefined}
            //         addDocTab={this.props.addDocTab}
            //         removeDocument={undefined}
            //         ScreenToLocalTransform={Transform.Identity}
            //         ContentScaling={returnOne}
            //         PanelWidth={returnHundred}
            //         PanelHeight={returnHundred}
            //         renderDepth={0} //TODO Why is renderDepth reset?
            //         selectOnLoad={false}
            //         focus={emptyFunction}
            //         isSelected={this.props.isSelected}
            //         select={returnFalse}
            //         layoutKey={"layout"}
            //         ContainingCollectionView={this.props.ContainingCollectionView}
            //         parentActive={this.props.active}
            //         whenActiveChanged={this.props.whenActiveChanged}
            //         bringToFront={emptyFunction} />
            // );
        }
        else if (field instanceof List) {
            return (<div>
                {field.map(f => f instanceof Doc ? f.title : (f && f.toString && f.toString())).join(", ")}
            </div>);
        }
        // bcz: this belongs here, but it doesn't render well so taking it out for now
        // else if (field instanceof HtmlField) {
        //     return <WebBox {...this.props} />
        // }
        else if (!(field instanceof Promise)) {
            return <p>{field.toString()}</p>;
        }
        else {
            return <p> {"Waiting for server..."} </p>;
        }
    }

}