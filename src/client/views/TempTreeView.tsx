import { action, observable, computed } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { ListField } from "../../fields/ListField";
import "./TempTreeView.scss"
import { DocumentManager } from "./DocumentManager";


@observer
export class TempTreeView extends React.Component {

    @action
    onClick(doc: Document) {

        let view = DocumentManager.Instance.getDocumentView(doc);
        if (view != null) {

            if (DocumentManager.Instance.parentIsFreeform(view)) {
                view.switchColor()
            }
            DocumentManager.Instance.centerNode(view);
        }
    }

    render() {
        return (
            <div className="tempTree">
                <div className="list">
                    {DocumentManager.Instance.DocumentViews.map(doc => {
                        return (
                            <div key={doc.Id} onClick={() => { this.onClick(doc.props.Document) }}>
                                {doc.props.Document.Title}
                            </div>
                        )
                    }
                    )}
                </div>
            </div>
        );
    }
}