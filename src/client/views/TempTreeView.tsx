import { observable, computed } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { ListField } from "../../fields/ListField";
import "./TempTreeView.scss"
import { DocumentManager } from "./DocumentManager";

export interface IProps {
    mainCollection: Array<Document>;
}

@observer
export class TempTreeView extends React.Component<IProps>{

    onClick(doc: Document) {
        let view = DocumentManager.Instance.getDocumentView(doc);
        if (view != null) {
            console.log(view.Id)
            console.log(view.props.Document.Title)
            if (view.props.ContainingCollectionView != undefined) {
                //console.log(view.props.ContainingCollectionView.Id)
            }
            else {
                console.log("containing collection is undefined")
            }
        }
    }

    render() {
        return (
            <div className="tempTree">
                <div className="list">
                    {this.props.mainCollection.map(doc => {
                        return (
                            <div key={doc.Id} onClick={() => { this.onClick(doc) }}>
                                {doc.Title}
                            </div>
                        )
                    }
                    )}
                </div>
            </div>
        );
    }

}