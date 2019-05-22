import React = require("react");
import { observer } from "mobx-react";
import { CollectionSubView } from "./CollectionSubView";
import Measure from "react-measure";
import { Doc, WidthSym, HeightSym } from "../../../new_fields/Doc";
import { DocumentView } from "../nodes/DocumentView";
import { Transform } from "../../util/Transform";
import { emptyFunction, returnOne } from "../../../Utils";
import "./CollectionStackingView.scss";
import { runInAction, action, observable, computed } from "mobx";
import { StrCast } from "../../../new_fields/Types";

@observer
export class CollectionStackingView extends CollectionSubView(doc => doc) {
    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform();

    @action
    moveDocument = (doc: Doc, targetCollection: Doc, addDocument: (document: Doc) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }

    render() {
        const docs = this.childDocs;
        return (
            <div className="collectionStackingView" onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                <div className="collectionStackingView-description">{StrCast(this.props.Document.documentText, StrCast(this.props.Document.title, "stacking collection"))}</div>
                <div className="collectionStackingView-flexCont">
                    {docs.map(d => {
                        return (<div className="collectionStackingView-docView-container">
                            <DocumentView Document={d}
                                addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                                moveDocument={this.moveDocument}
                                ContainingCollectionView={this.props.CollectionView}
                                isTopMost={false}
                                ScreenToLocalTransform={this.getPreviewTransform}
                                focus={emptyFunction}
                                ContentScaling={returnOne}
                                PanelWidth={d[WidthSym]}
                                PanelHeight={d[HeightSym]}
                                selectOnLoad={false}
                                parentActive={this.props.active}
                                addDocTab={this.props.addDocTab}
                                bringToFront={emptyFunction}
                                toggleMinimized={emptyFunction}
                                whenActiveChanged={this.props.active} />
                        </div>);
                    })}
                </div>
            </div>
        );
    }
}