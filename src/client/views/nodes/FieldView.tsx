import React = require("react");
import { computed } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../new_fields/DateField";
import { Doc, FieldResult, Opt, Field } from "../../../new_fields/Doc";
import { List } from "../../../new_fields/List";
import { ScriptField } from "../../../new_fields/ScriptField";
import { AudioField, VideoField } from "../../../new_fields/URLField";
import { Transform } from "../../util/Transform";
import { CollectionView } from "../collections/CollectionView";
import { AudioBox } from "./AudioBox";
import { VideoBox } from "./VideoBox";

//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps {
    fieldKey: string;
    fitToBox?: boolean;
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    Document: Doc;
    DataDoc?: Doc;
    LibraryPath: Doc[];
    onClick?: ScriptField;
    isSelected: (outsideReaction?: boolean) => boolean;
    select: (isCtrlPressed: boolean) => void;
    renderDepth: number;
    addDocument?: (document: Doc) => boolean;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    removeDocument?: (document: Doc) => boolean;
    moveDocument?: (document: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    backgroundColor?: (document: Doc) => string | undefined;
    ScreenToLocalTransform: () => Transform;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    active: (outsideReaction?: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    dontRegisterView?: boolean;
    focus: (doc: Doc) => void;
    PanelWidth: () => number;
    PanelHeight: () => number;
    setVideoBox?: (player: VideoBox) => void;
    ContentScaling: () => number;
    ChromeHeight?: () => number;
    childLayoutTemplate?: () => Opt<Doc>;
}

@observer
export class FieldView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldType: { name: string }, fieldStr: string) {
        return `<${fieldType.name} {...props} fieldKey={'${fieldStr}'}/>`;  //e.g., "<ImageBox {...props} fieldKey={"data} />"
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
        // else if (field instanceof RichTextField) {
        //     return <FormattedTextBox {...this.props} />;
        // }
        // else if (field instanceof ImageField) {
        //     return <ImageBox {...this.props} />;
        // }
        // else if (field instaceof PresBox) {
        //    return <PresBox {...this.props} />;
        // }
        else if (field instanceof VideoField) {
            return <VideoBox {...this.props} />;
        }
        else if (field instanceof AudioField) {
            return <AudioBox {...this.props} />;
        } else if (field instanceof DateField) {
            return <p>{field.date.toLocaleString()}</p>;
        }
        else if (field instanceof Doc) {
            return <p><b>{field.title && field.title.toString()}</b></p>;
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
            return <div> {field.map(f => Field.toString(f)).join(", ")}  </div>;
        }
        // bcz: this belongs here, but it doesn't render well so taking it out for now
        // else if (field instanceof HtmlField) {
        //     return <WebBox {...this.props} />
        // }
        else if (!(field instanceof Promise)) {
            return <p>{Field.toString(field)}</p>;
        }
        else {
            return <p> {"Waiting for server..."} </p>;
        }
    }

}