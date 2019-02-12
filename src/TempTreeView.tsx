import { observable, computed } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { Document } from "./fields/Document";

export interface IProps {
    mainCollection: Array<Document>;
}

@observer
export class TempTreeView extends React.Component<IProps>{

    render() {
        return (
            <div className="tempTree" style={{ border: "5px red" }}>
                {this.props.mainCollection.map(node => {
                    return (
                        <div>
                            {node.Title}
                        </div>
                    )
                }
                )}}
            </div>
        );
    }

}