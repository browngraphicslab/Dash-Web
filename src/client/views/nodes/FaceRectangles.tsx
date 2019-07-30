import React = require("react");
import { Doc, DocListCast } from "../../../new_fields/Doc";
import { Cast, NumCast } from "../../../new_fields/Types";
import { observer } from "mobx-react";
import { Id } from "../../../new_fields/FieldSymbols";
import FaceRectangle from "./FaceRectangle";

interface FaceRectanglesProps {
    document: Doc;
    color: string;
    backgroundColor: string;
}

export interface RectangleTemplate {
    id: string;
    style: Partial<React.CSSProperties>;
}

@observer
export default class FaceRectangles extends React.Component<FaceRectanglesProps> {

    render() {
        let faces = DocListCast(this.props.document.faces);
        let templates: RectangleTemplate[] = faces.map(faceDoc => {
            let rectangle = Cast(faceDoc.faceRectangle, Doc) as Doc;
            let style = {
                top: NumCast(rectangle.top),
                left: NumCast(rectangle.left),
                width: NumCast(rectangle.width),
                height: NumCast(rectangle.height),
                backgroundColor: `${this.props.backgroundColor}33`,
                border: `solid 2px ${this.props.color}`,
            } as React.CSSProperties;
            return {
                id: rectangle[Id],
                style: style
            };
        });
        return (
            <div>
                {templates.map(rectangle => <FaceRectangle key={rectangle.id} rectangle={rectangle} />)}
            </div>
        );
    }

}