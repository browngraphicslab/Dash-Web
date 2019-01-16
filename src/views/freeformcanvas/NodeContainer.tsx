import { observer } from "mobx-react";
import { NodeCollectionStore } from "../../stores/NodeCollectionStore";
import { StaticTextNodeStore } from "../../stores/StaticTextNodeStore";
import { VideoNodeStore } from "../../stores/VideoNodeStore";
import { TextNodeView } from "../nodes/TextNodeView";
import { VideoNodeView } from "../nodes/VideoNodeView";
import "./FreeFormCanvas.scss";
import React = require("react");
import { DocumentView } from "../nodes/DocumentView";
import { DocumentViewModel } from "../../viewmodels/DocumentViewModel";

interface IProps {
    store: NodeCollectionStore
}

@observer
export class NodeContainer extends React.Component<IProps> {

    render() {
        return (
            <div className="node-container">
                {this.props.store.Docs.map(doc => {
                    return (<DocumentView key={doc.Id} dvm={new DocumentViewModel(doc)} />);
                })}
            </div>
        );
    }
}