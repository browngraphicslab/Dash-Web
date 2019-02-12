import { observer } from "mobx-react";
import { StaticTextNodeStore } from "../../stores/StaticTextNodeStore";
import "./NodeView.scss";
import { TopBar } from "./TopBar";
import React = require("react");

interface IProps {
    store: StaticTextNodeStore;
}

@observer
export class TextNodeView extends React.Component<IProps> {

    render() {
        let store = this.props.store;
        return (
            <div className="node text-node" style={{ transform: store.Transform }}>
                <TopBar store={store} />
                <div className="scroll-box">
                    <div className="content">
                        <h3 className="title">{store.Title}</h3>
                        <p className="paragraph">{store.Text}</p>
                    </div>
                </div>
            </div>
        );
    }
}