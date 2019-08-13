import { observer } from "mobx-react";
import React = require("react");
import { Doc } from "./new_fields/Doc";
import { NumCast } from "./new_fields/Types";

export interface RecProps {
    documents: { preview: string, similarity: number }[],
    node: Doc;
}

@observer
export class Recommendations extends React.Component<RecProps> {
    render() {
        const transform = "translate(" + (NumCast(this.props.node.x) + 350) + "px, " + NumCast(this.props.node.y) + "px"
        return (
            <div className="rec-scroll" style={{ transform: transform }}>
                {this.props.documents.map(doc => {
                    return (
                        <div className="recommendation-content">
                            <img src={doc.preview} />
                            <div>{doc.similarity}</div>
                        </div>
                    )
                })}
            </div>
        )
    }
}