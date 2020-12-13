import React = require("react");
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../fields/Doc";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, OmitKeys, returnOne, returnVal } from "../../../Utils";
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import { StyleProp } from "../StyleProvider";
import "./ContentFittingDocumentView.scss";

interface ContentFittingDocumentViewProps {
    dontCenter?: "x" | "y" | "xy";
}

@observer
export class ContentFittingDocumentView extends React.Component<DocumentViewProps & ContentFittingDocumentViewProps> {
    public get displayName() { return "DocumentView(" + this.props.Document?.title + ")"; } // this makes mobx trace() statements more descriptive
    public ContentRef = React.createRef<HTMLDivElement>();

    @observable public docView: DocumentView | undefined | null;

    @computed get layoutDoc() { return Doc.Layout(this.props.Document, this.props.LayoutTemplate?.()); }
    @computed get nativeWidth() { return this.layoutDoc._fitWidth ? 0 : returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions) || 0); }
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
            if (this.props.Document._fitWidth) return Math.min(this.props.PanelHeight(), this.panelWidth / Doc.NativeAspect(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions) || 1);
            return Math.min(this.props.PanelHeight(), this.nativeHeight * this.nativeScaling);
        }
        return this.props.PanelHeight();
    }

    @computed get Xshift() { return this.nativeWidth ? (this.props.PanelWidth() - this.nativeWidth * this.nativeScaling) / 2 : 0; }
    @computed get YShift() { return this.nativeWidth && this.nativeHeight && Math.abs(this.Xshift) < 0.001 ? (this.props.PanelHeight() - this.nativeHeight * this.nativeScaling) / 2 : 0; }
    @computed get centeringX() { return this.props.dontCenter?.includes("x") ? 0 : this.Xshift; }
    @computed get centeringY() { return this.props.dontCenter?.includes("y") ? 0 : this.YShift; }

    PanelWidth = () => this.panelWidth;
    PanelHeight = () => this.panelHeight;
    NativeScaling = () => this.nativeScaling;
    screenToLocalTransform = () => this.props.ScreenToLocalTransform().translate(-this.centeringX, -this.centeringY).scale(1 / this.nativeScaling);

    render() {
        TraceMobx();
        return (<div className="contentFittingDocumentView">
            {!this.props.Document || !this.props.PanelWidth() ? (null) : (
                <div className="contentFittingDocumentView-previewDoc" ref={this.ContentRef}
                    style={{
                        transform: `translate(${this.centeringX}px, ${this.centeringY}px)`,
                        borderRadius: this.props.styleProvider?.(this.props.Document, this.props, StyleProp.PointerEvents),
                        height: Math.abs(this.YShift) > 0.001 ? `${100 * this.nativeHeight / this.nativeWidth * this.props.PanelWidth() / this.props.PanelHeight()}%` : this.props.PanelHeight(),
                        width: Math.abs(this.Xshift) > 0.001 ? `${100 * (this.props.PanelWidth() - this.Xshift * 2) / this.props.PanelWidth()}%` : this.props.PanelWidth(),
                    }}>
                    <DocumentView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        ref={action((r: DocumentView | null) => this.docView = r)}
                        LayoutTemplate={this.props.LayoutTemplate}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        ContentScaling={returnOne}
                        contentFittingScaling={this.NativeScaling}
                        ScreenToLocalTransform={this.screenToLocalTransform}
                        focus={this.props.focus || emptyFunction}
                        bringToFront={emptyFunction}
                    />
                </div>)}
        </div>);
    }
}