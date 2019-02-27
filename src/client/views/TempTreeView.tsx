import { action, observable, computed } from "mobx";
import React = require("react");
import { observer } from "mobx-react";
import { Document } from "../../fields/Document";
import { ListField } from "../../fields/ListField";
import "./TempTreeView.scss"
import { DocumentManager } from "./DocumentManager";
import { KeyStore } from "../../fields/KeyStore";


@observer
export class TempTreeView extends React.Component {

    @action
    onClick(doc: Document) {

        let view = DocumentManager.Instance.getDocumentView(doc);
        if (view != null) {
            // DocumentManager.Instance.centerNode(view);
            doc = view.props.Document
            view.props.focus(doc, doc.GetNumber(KeyStore.X, 0), doc.GetNumber(KeyStore.Y, 0))
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