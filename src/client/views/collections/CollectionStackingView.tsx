import React = require("react");
import { observer } from "mobx-react";
import { CollectionSubView } from "./CollectionSubView";
import Measure from "react-measure";
import { Document } from "../../../fields/Document";
import { DocumentView } from "../nodes/DocumentView";
import { Transform } from "../../util/Transform";
import { emptyDocFunction, returnOne } from "../../../Utils";
import "./CollectionStackingView.scss";
import { runInAction, action, observable, computed } from "mobx";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";

@observer
export class CollectionStackingView extends CollectionSubView {
    @computed
    public get docs() {
        return this.props.Document.GetList<Document>(this.props.fieldKey, []);
    }

    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform();

    @action
    moveDocument = (doc: Document, targetCollection: Document, addDocument: (document: Document) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }

    render() {
        const docs = this.docs;
        return (
            <div className="collectionStackingView" onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="collectionStackingView-description">{this.props.Document.GetText(KeyStore.DocumentText, this.props.Document.GetText(KeyStore.Title, "stacking collection"))}</div>
                <div className="collectionStackingView-flexCont">
                    {docs.map(d => {
                        return (<div className="collectionStackingView-docView-container">
                            <DocumentView Document={d}
                                addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                                moveDocument={this.moveDocument}
                                ContainingCollectionView={this.props.CollectionView}
                                isTopMost={false}
                                ScreenToLocalTransform={this.getPreviewTransform}
                                focus={emptyDocFunction}
                                ContentScaling={returnOne}
                                PanelWidth={d.Width}
                                PanelHeight={d.Height}
                                selectOnLoad={false}
                                parentActive={this.props.active}
                                whenActiveChanged={this.props.active} />
                        </div>);
                    })}
                </div>
            </div>
        );
    }
}