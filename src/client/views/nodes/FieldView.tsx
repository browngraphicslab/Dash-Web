import React = require("react");
import { computed } from "mobx";
import { observer } from "mobx-react";
import { DateField } from "../../../fields/DateField";
import { Doc, Field, FieldResult, Opt } from "../../../fields/Doc";
import { List } from "../../../fields/List";
import { VideoField, WebField } from "../../../fields/URLField";
import { DocumentViewSharedProps } from "./DocumentView";
import { VideoBox } from "./VideoBox";

//
// these properties get assigned through the render() method of the DocumentView when it creates this node.
// However, that only happens because the properties are "defined" in the markup for the field view.
// See the LayoutString method on each field view :   ImageBox, FormattedTextBox, etc. 
//
export interface FieldViewProps extends DocumentViewSharedProps {
    // FieldView specific props that are not part of DocumentView props
    fieldKey: string;
    scrollOverflow?: boolean; // bcz: would like to think this can be avoided -- need to look at further

    active: (outsideReaction?: boolean) => boolean;
    select: (isCtrlPressed: boolean) => void;
    isSelected: (outsideReaction?: boolean) => boolean;
    scaling?: () => number;
    setHeight: (height: number) => void;

    // properties intended to be used from within layout strings (otherwise use the function equivalents that work more efficiently with React)
    pointerEvents?: string;
    fontSize?: number;
    height?: number;
    width?: number;
    background?: string;
    color?: string;
    xMargin?: number;
    yMargin?: number;
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
        // else if (field instanceof AudioField) {
        //     return <AudioBox {...this.props} />;
        //}
        else if (field instanceof DateField) {
            return <p>{field.date.toLocaleString()}</p>;
        }
        else if (field instanceof Doc) {
            return <p><b>{field.title?.toString()}</b></p>;
        }
        else if (field instanceof List) {
            return <div> {field.length ? field.map(f => Field.toString(f)).join(", ") : ""}  </div>;
        }
        // bcz: this belongs here, but it doesn't render well so taking it out for now
        else if (field instanceof WebField) {
            return <p>{Field.toString(field.url.href)}</p>;
        }
        else if (!(field instanceof Promise)) {
            return <p>{Field.toString(field)}</p>;
        }
        else {
            return <p> {"Waiting for server..."} </p>;
        }
    }

}