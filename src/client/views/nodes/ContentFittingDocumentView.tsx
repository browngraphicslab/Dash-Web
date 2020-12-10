import React = require("react");
import { computed, observable, action } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../fields/Doc";
import { Cast, StrCast } from "../../../fields/Types";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, OmitKeys, returnVal, returnOne } from "../../../Utils";
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import "./ContentFittingDocumentView.scss";

interface ContentFittingDocumentViewProps {
    dontCenter?: string; // "x" ,"y", "xy"
}

@observer
export class ContentFittingDocumentView extends React.Component<DocumentViewProps & ContentFittingDocumentViewProps> {
    public get displayName() { return "DocumentView(" + this.props.Document?.title + ")"; } // this makes mobx trace() statements more descriptive
    public ContentRef = React.createRef<HTMLDivElement>();
    @observable public docView: DocumentView | undefined | null;
    @computed get layoutDoc() {
        return this.props.LayoutTemplate?.() ||
            (this.props.layoutKey && Doc.Layout(this.props.Document, Cast(this.props.Document[this.props.layoutKey], Doc, null))) ||
            Doc.Layout(this.props.Document);
    }
    @computed get freezeDimensions() { return this.props.freezeDimensions; }
    @computed get nativeWidth() { return !this.layoutDoc._fitWidth && returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, this.props.DataDoc, this.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, this.props.DataDoc, this.freezeDimensions) || 0); }
    @computed get nativeScaling() {
        if (!this.nativeWidth || !this.nativeHeight) return 1;
        const wscale = this.props.PanelWidth() / this.nativeWidth;
        const hscale = this.props.PanelHeight() / this.nativeHeight;
        if (wscale * this.nativeHeight > this.props.PanelHeight()) {
            return hscale || 1;
        }
        return wscale || 1;
    }

    @computed get panelWidth() { return this.nativeWidth ? this.nativeWidth * this.nativeScaling : this.props.PanelWidth(); }
    @computed get panelHeight() {
        if (this.nativeHeight) {
            if (this.props.Document._fitWidth) return Math.min(this.props.PanelHeight(), this.panelWidth / Doc.NativeAspect(this.layoutDoc, this.props.DataDoc, this.freezeDimensions) || 1);
            return Math.min(this.props.PanelHeight(), this.nativeHeight * this.nativeScaling);
        }
        return this.props.PanelHeight();
    }

    private getTransform = () => this.props.ScreenToLocalTransform().
        translate(this.props.dontCenter?.includes("x") ? 0 : -this.centeringOffset, this.props.dontCenter?.includes("y") ? 0 : -this.centeringYOffset)
    private get centeringOffset() { return this.nativeWidth && !this.props.Document._fitWidth ? (this.props.PanelWidth() - this.nativeWidth * this.nativeScaling) / 2 : 0; }
    private get centeringYOffset() { return this.nativeWidth && Math.abs(this.centeringOffset) < 0.001 && this.nativeHeight ? (this.props.PanelHeight() - this.nativeHeight * this.nativeScaling) / 2 : 0; }

    @computed get borderRounding() { return StrCast(this.props.Document?.borderRounding); }

    PanelWidth = () => this.panelWidth;
    PanelHeight = () => this.panelHeight;

    render() {
        TraceMobx();
        return (<div className="contentFittingDocumentView">
            {!this.props.Document || !this.props.PanelWidth ? (null) : (
                <div className="contentFittingDocumentView-previewDoc" ref={this.ContentRef}
                    style={{
                        transform: `translate(${this.props.dontCenter?.includes("x") ? 0 : this.centeringOffset}px, ${this.props.dontCenter?.includes("y") ? 0 : this.centeringYOffset}px)`,
                        borderRadius: this.borderRounding,
                        height: Math.abs(this.centeringYOffset) > 0.001 && this.nativeWidth ? `${100 * this.nativeHeight / this.nativeWidth * this.props.PanelWidth() / this.props.PanelHeight()}%` : this.props.PanelHeight(),
                        width: Math.abs(this.centeringOffset) > 0.001 ? `${100 * (this.props.PanelWidth() - this.centeringOffset * 2) / this.props.PanelWidth()}%` : this.props.PanelWidth(),
                    }}>
                    <DocumentView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        ref={action((r: DocumentView | null) => this.docView = r)}
                        Document={this.props.Document}
                        DataDoc={this.props.DataDoc}
                        LayoutTemplate={this.props.LayoutTemplate}
                        LayoutTemplateString={this.props.LayoutTemplateString}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        ContentScaling={returnOne}
                        fitToBox={this.props.fitToBox}
                        layoutKey={this.props.layoutKey}
                        dropAction={this.props.dropAction}
                        onClick={this.props.onClick}
                        styleProvider={this.props.styleProvider}
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