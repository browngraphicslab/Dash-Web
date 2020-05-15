import React = require("react");
import { Doc, DocListCast } from "../../../fields/Doc";
import { Cast, NumCast } from "../../../fields/Types";
import { observer } from "mobx-react";
import { Id } from "../../../fields/FieldSymbols";
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
        const faces = DocListCast(this.props.document.faces);
        const templates: RectangleTemplate[] = faces.map(faceDoc => {
            const rectangle = Cast(faceDoc.faceRectangle, Doc) as Doc;
            const style = {
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