import React = require("react");
import { action, computed } from "mobx";
import { observer } from "mobx-react";
import "react-table/react-table.css";
import { Doc } from "../../../new_fields/Doc";
import { ComputedField, ScriptField } from "../../../new_fields/ScriptField";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnOne } from "../../../Utils";
import { DragManager } from "../../util/DragManager";
import { Transform } from "../../util/Transform";
import { undoBatch } from "../../util/UndoManager";
import '../DocumentDecorations.scss';
import { DocumentView } from "../nodes/DocumentView";
import "./ContentFittingDocumentView.scss";
import { CollectionView } from "../collections/CollectionView";
import { TraceMobx } from "../../../new_fields/util";

interface ContentFittingDocumentViewProps {
    Document?: Doc;
    DataDocument?: Doc;
    LibraryPath: Doc[];
    childDocs?: Doc[];
    renderDepth: number;
    fitToBox?: boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    ruleProvider: Doc | undefined;
    focus?: (doc: Doc) => void;
    showOverlays?: (doc: Doc) => { title?: string, caption?: string };
    CollectionView?: CollectionView;
    CollectionDoc?: Doc;
    onClick?: ScriptField;
    getTransform: () => Transform;
    addDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, target: Doc, addDoc: ((doc: Doc) => boolean)) => boolean;
    removeDocument: (document: Doc) => boolean;
    active: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    dontRegisterView?: boolean;
    setPreviewScript: (script: string) => void;
    previewScript?: string;
}

@observer
export class ContentFittingDocumentView extends React.Component<ContentFittingDocumentViewProps>{
    private get layoutDoc() { return this.props.Document && Doc.Layout(this.props.Document); }
    private get nativeWidth() { return NumCast(this.layoutDoc!.nativeWidth, this.props.PanelWidth()); }
    private get nativeHeight() { return NumCast(this.layoutDoc!.nativeHeight, this.props.PanelHeight()); }
    private contentScaling = () => {
        const wscale = this.props.PanelWidth() / (this.nativeWidth ? this.nativeWidth : this.props.PanelWidth());
        if (wscale * this.nativeHeight > this.props.PanelHeight()) {
            return this.props.PanelHeight() / (this.nativeHeight ? this.nativeHeight : this.props.PanelHeight());
        }
        return wscale;
    }

    @undoBatch
    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.DocumentDragData) {
            this.props.childDocs && this.props.childDocs.map(otherdoc => {
                const target = Doc.GetProto(otherdoc);
                target.layout = ComputedField.MakeFunction("this.image_data[0]");
                target.layoutCustom = Doc.MakeDelegate(de.data.draggedDocuments[0]);
            });
            e.stopPropagation();
        }
        return true;
    }
    private PanelWidth = () => this.nativeWidth && (!this.props.Document || !this.props.Document.fitWidth) ? this.nativeWidth * this.contentScaling() : this.props.PanelWidth();
    private PanelHeight = () => this.nativeHeight && (!this.props.Document || !this.props.Document.fitWidth) ? this.nativeHeight * this.contentScaling() : this.props.PanelHeight();
    private getTransform = () => this.props.getTransform().translate(-this.centeringOffset, 0).scale(1 / this.contentScaling());
    private get centeringOffset() { return this.nativeWidth && (!this.props.Document || !this.props.Document.fitWidth) ? (this.props.PanelWidth() - this.nativeWidth * this.contentScaling()) / 2 : 0; }

    @computed get borderRounding() { return StrCast(this.props.Document!.borderRounding); }

    render() {
        TraceMobx();
        return (<div className="contentFittingDocumentView" style={{ width: this.props.PanelWidth(), height: this.props.PanelHeight() }}>
            {!this.props.Document || !this.props.PanelWidth ? (null) : (
                <div className="contentFittingDocumentView-previewDoc"
                    style={{
                        transform: `translate(${this.centeringOffset}px, 0px)`,
                        borderRadius: this.borderRounding,
                        height: this.props.PanelHeight(),
                        width: `${100 * (this.props.PanelWidth() - this.centeringOffset * 2) / this.props.PanelWidth()}%`
                    }}>
                    <DocumentView {...this.props}
                        Document={this.props.Document}
                        DataDoc={this.props.DataDocument}
                        LibraryPath={this.props.LibraryPath}
                        fitToBox={this.props.fitToBox}
                        onClick={this.props.onClick}
                        ruleProvider={this.props.ruleProvider}
                        showOverlays={this.props.showOverlays}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        moveDocument={this.props.moveDocument}
                        whenActiveChanged={this.props.whenActiveChanged}
                        ContainingCollectionView={this.props.CollectionView}
                        ContainingCollectionDoc={this.props.CollectionDoc}
                        addDocTab={this.props.addDocTab}
                        pinToPres={this.props.pinToPres}
                        parentActive={this.props.active}
                        ScreenToLocalTransform={this.getTransform}
                        renderDepth={this.props.renderDepth + 1}
                        ContentScaling={this.contentScaling}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        focus={this.props.focus || emptyFunction}
                        backgroundColor={returnEmptyString}
                        bringToFront={emptyFunction}
                        dontRegisterView={this.props.dontRegisterView}
                        zoomToScale={emptyFunction}
                        getScale={returnOne}
                    />
                </div>)}
        </div>);
    }
}