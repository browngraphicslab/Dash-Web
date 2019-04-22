import React = require("react");
import { observer } from "mobx-react";
import { CollectionSubView } from "./CollectionSubView";
import Measure from "react-measure";
import { Document } from "../../../fields/Document";
import { DocumentView } from "../nodes/DocumentView";
import { Transform } from "../../util/Transform";
import { emptyDocFunction } from "../../../Utils";
import "./CollectionStackingView.scss";
import { runInAction, action, observable } from "mobx";
import { KeyStore } from "../../../fields/KeyStore";

@observer
export class CollectionStackingView extends CollectionSubView {
    _panelWidth: number = 0;
    _panelHeight: number = 0;
    _contentScaling: number = 1;
    @observable _docs = this.props.Document.GetList<Document>(this.props.fieldKey, []);

    getPreviewTransform = (): Transform => this.props.ScreenToLocalTransform();
    getPanelWidth = (): number => this._panelWidth * .9;
    getPanelHeight = (): number => this._panelHeight;
    getContentScaling = (): number => this._contentScaling;

    @action
    moveDocument = (doc: Document, targetCollection: Document, addDocument: (document: Document) => boolean): boolean => {
        this.props.removeDocument(doc);
        addDocument(doc);
        return true;
    }

    render() {
        return (
            <Measure bounds={true} onResize={(r: any) => runInAction(() => {
                if (r.entry.width >= 250) {
                    this._panelWidth = r.entry.width;
                    this._panelHeight = r.entry.height;
                }
            })}>
                {({ measureRef }) =>
                    <div className="collectionStackingView" ref={measureRef} onWheel={(e: React.WheelEvent) => e.stopPropagation()}>
                        <div className="collectionStackingView-description">{this.props.Document.GetText(KeyStore.DocumentText, this.props.Document.GetText(KeyStore.Title, "stacking collection"))}</div>
                        <div className="collectionStackingView-flexCont">
                            {this._docs.map(d => {
                                return (<div className="collectionStackingView-docView-container">
                                    <DocumentView Document={d}
                                        addDocument={this.props.addDocument} removeDocument={this.props.removeDocument}
                                        moveDocument={this.moveDocument}
                                        ContainingCollectionView={this.props.CollectionView}
                                        isTopMost={false}
                                        ScreenToLocalTransform={this.getPreviewTransform}
                                        focus={emptyDocFunction}
                                        ContentScaling={(): number => {
                                            return this._panelWidth * .4 / d!.GetNumber(KeyStore.NativeWidth, this._panelWidth);
                                        }}
                                        PanelWidth={this.getPanelWidth}
                                        PanelHeight={this.getPanelHeight}
                                        selectOnLoad={false}
                                        parentActive={this.props.active}
                                        whenActiveChanged={this.props.active} />
                                </div>);
                            })}
                        </div>
                    </div>
                }
            </Measure>
        );
    }
}