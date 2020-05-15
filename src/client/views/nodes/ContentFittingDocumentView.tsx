import React = require("react");
import { computed } from "mobx";
import { observer } from "mobx-react";
import "react-table/react-table.css";
import { Doc, Opt, WidthSym, HeightSym } from "../../../fields/Doc";
import { NumCast, StrCast, Cast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, returnOne } from "../../../Utils";
import '../DocumentDecorations.scss';
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import "./ContentFittingDocumentView.scss";
import { dropActionType } from "../../util/DragManager";
import { CollectionView } from "../collections/CollectionView";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Transform } from "nodemailer/lib/xoauth2";

interface ContentFittingDocumentViewProps {
    Document: Doc;
    DataDocument?: Doc;
    LayoutDoc?: () => Opt<Doc>;
    NativeWidth?: () => number;
    NativeHeight?: () => number;
    FreezeDimensions?: boolean;
    LibraryPath: Doc[];
    renderDepth: number;
    fitToBox?: boolean;
    layoutKey?: string;
    dropAction?: dropActionType;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus?: (doc: Doc) => void;
    CollectionView?: CollectionView;
    CollectionDoc?: Doc;
    onClick?: ScriptField;
    backgroundColor?: (doc: Doc) => string | undefined;
    getTransform: () => Transform;
    addDocument?: (document: Doc) => boolean;
    moveDocument?: (document: Doc, target: Doc | undefined, addDoc: ((doc: Doc) => boolean)) => boolean;
    removeDocument?: (document: Doc) => boolean;
    active: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    addDocTab: (document: Doc, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    dontRegisterView?: boolean;
    rootSelected: (outsideReaction?: boolean) => boolean;
    Display?: string;
}

@observer
export class ContentFittingDocumentView extends React.Component<DocumentViewProps>{
    public get displayName() { return "DocumentView(" + this.props.Document?.title + ")"; } // this makes mobx trace() statements more descriptive
    private get layoutDoc() {
        return this.props.LayoutTemplate?.() ||
            (this.props.layoutKey && Doc.Layout(this.props.Document, Cast(this.props.Document[this.props.layoutKey], Doc, null))) ||
            Doc.Layout(this.props.Document);
    }
    @computed get freezeDimensions() { return this.props.FreezeDimensions; }
    nativeWidth = () => NumCast(this.layoutDoc?._nativeWidth, this.props.NativeWidth?.() || (this.freezeDimensions && this.layoutDoc ? this.layoutDoc[WidthSym]() : this.props.PanelWidth()));
    nativeHeight = () => NumCast(this.layoutDoc?._nativeHeight, this.props.NativeHeight?.() || (this.freezeDimensions && this.layoutDoc ? this.layoutDoc[HeightSym]() : this.props.PanelHeight()));
    @computed get scaling() {
        const wscale = this.props.PanelWidth() / this.nativeWidth();
        if (wscale * this.nativeHeight() > this.props.PanelHeight()) {
            return (this.props.PanelHeight() / this.nativeHeight()) || 1;
        }
        return wscale || 1;
    }
    private contentScaling = () => this.scaling;

    private PanelWidth = () => this.panelWidth;
    private PanelHeight = () => this.panelHeight;

    @computed get panelWidth() { return this.nativeWidth && !this.props.Document._fitWidth ? this.nativeWidth() * this.contentScaling() : this.props.PanelWidth(); }
    @computed get panelHeight() { return this.nativeHeight && !this.props.Document._fitWidth ? this.nativeHeight() * this.contentScaling() : this.props.PanelHeight(); }

    private getTransform = () => this.props.ScreenToLocalTransform().translate(-this.centeringOffset, -this.centeringYOffset).scale(1 / this.contentScaling());
    private get centeringOffset() { return this.nativeWidth() && !this.props.Document._fitWidth ? (this.props.PanelWidth() - this.nativeWidth() * this.contentScaling()) / 2 : 0; }
    private get centeringYOffset() { return Math.abs(this.centeringOffset) < 0.001 ? (this.props.PanelHeight() - this.nativeHeight() * this.contentScaling()) / 2 : 0; }

    @computed get borderRounding() { return StrCast(this.props.Document?.borderRounding); }

    render() {
        TraceMobx();
        return (<div className="contentFittingDocumentView" style={{
            width: Math.abs(this.centeringYOffset) > 0.001 ? "auto" : this.props.PanelWidth(),
            height: Math.abs(this.centeringOffset) > 0.0001 ? "auto" : this.props.PanelHeight(),
            display: this.props.Display /* just added for grid */
        }}>
            {!this.props.Document || !this.props.PanelWidth ? (null) : (
                <div className="contentFittingDocumentView-previewDoc"
                    style={{
                        transform: `translate(${this.centeringOffset}px, 0px)`,
                        borderRadius: this.borderRounding,
                        height: Math.abs(this.centeringYOffset) > 0.001 ? `${100 * this.nativeHeight() / this.nativeWidth() * this.props.PanelWidth() / this.props.PanelHeight()}%` : this.props.PanelHeight(),
                        width: Math.abs(this.centeringOffset) > 0.001 ? `${100 * (this.props.PanelWidth() - this.centeringOffset * 2) / this.props.PanelWidth()}%` : this.props.PanelWidth()
                    }}>
                    <DocumentView {...this.props}
                        Document={this.props.Document}
                        DataDoc={this.props.DataDoc}
                        LayoutTemplate={this.props.LayoutTemplate}
                        LayoutTemplateString={this.props.LayoutTemplateString}
                        LibraryPath={this.props.LibraryPath}
                        NativeWidth={this.nativeWidth}
                        NativeHeight={this.nativeHeight}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        ContentScaling={this.contentScaling}
                        fitToBox={this.props.fitToBox}
                        layoutKey={this.props.layoutKey}
                        dropAction={this.props.dropAction}
                        onClick={this.props.onClick}
                        backgroundColor={this.props.backgroundColor}
                        addDocument={this.props.addDocument}
                        removeDocument={this.props.removeDocument}
                        moveDocument={this.props.moveDocument}
                        whenActiveChanged={this.props.whenActiveChanged}
                        ContainingCollectionView={this.props.ContainingCollectionView}
                        ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                        addDocTab={this.props.addDocTab}
                        pinToPres={this.props.pinToPres}
                        parentActive={this.props.parentActive}
                        ScreenToLocalTransform={this.getTransform}
                        renderDepth={this.props.renderDepth}
                        focus={this.props.focus || emptyFunction}
                        bringToFront={emptyFunction}
                        dontRegisterView={this.props.dontRegisterView}
                    />
                </div>)}
        </div>);
    }
}