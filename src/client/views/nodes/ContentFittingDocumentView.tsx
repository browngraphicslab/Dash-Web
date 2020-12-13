import React = require("react");
import { computed, observable, action } from "mobx";
import { observer } from "mobx-react";
import { Doc, WidthSym, HeightSym } from "../../../fields/Doc";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, OmitKeys, returnVal, returnOne } from "../../../Utils";
import { DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import "./ContentFittingDocumentView.scss";
import { StyleProp } from "../StyleProvider";
import { StrCast } from "../../../fields/Types";

interface ContentFittingDocumentViewProps {
    dontCenter?: "x" | "y" | "xy";
}

@observer
export class ContentFittingDocumentView extends React.Component<DocumentViewProps & ContentFittingDocumentViewProps> {
    public get displayName() { return "DocumentView(" + this.props.Document?.title + ")"; } // this makes mobx trace() statements more descriptive
    public ContentRef = React.createRef<HTMLDivElement>();
    @observable public docView: DocumentView | undefined | null;
    @computed get layoutDoc() { return Doc.Layout(this.props.Document, this.props.LayoutTemplate?.()); }
    @computed get nativeWidth() { return !this.layoutDoc._fitWidth && returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions)); }
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

    contentFittingScaling = () => {
        if (this.props.DataDoc) return 1; // this is intended to detect when a document is being rendered inside itself as part of a template, but not as a leaf node where nativeWidth & height would apply.
        const layoutStr = (this.props.LayoutTemplateString || StrCast(this.layoutDoc.layout));
        if (this.nativeWidth || layoutStr.includes("FormattedTextBox")) return this.nativeScaling;
        return 1;
    }

    private getTransform = () => this.props.ScreenToLocalTransform().
        translate(this.props.dontCenter?.includes("x") ? 0 : -this.centeringOffset, this.props.dontCenter?.includes("y") ? 0 : -this.centeringYOffset).scale(1 / this.contentFittingScaling())
    private get centeringOffset() { return this.nativeWidth && !this.props.Document._fitWidth ? (this.props.PanelWidth() - this.nativeWidth * this.nativeScaling) / 2 : 0; }
    private get centeringYOffset() { return this.nativeWidth && Math.abs(this.centeringOffset) < 0.001 && this.nativeHeight ? (this.props.PanelHeight() - this.nativeHeight * this.nativeScaling) / 2 : 0; }

    PanelWidth = () => this.panelWidth;
    PanelHeight = () => this.panelHeight;

    render() {
        TraceMobx();
        return (<div className="contentFittingDocumentView">
            {!this.props.Document || !this.props.PanelWidth ? (null) : (
                <div className="contentFittingDocumentView-previewDoc" ref={this.ContentRef}
                    style={{
                        transform: `translate(${this.props.dontCenter?.includes("x") ? 0 : this.centeringOffset}px, ${this.props.dontCenter?.includes("y") ? 0 : this.centeringYOffset}px)`,
                        borderRadius: this.props.styleProvider?.(this.props.Document, this.props, StyleProp.PointerEvents),
                        height: Math.abs(this.centeringYOffset) > 0.001 && this.nativeWidth ? `${100 * this.nativeHeight / this.nativeWidth * this.props.PanelWidth() / this.props.PanelHeight()}%` : this.props.PanelHeight(),
                        width: Math.abs(this.centeringOffset) > 0.001 ? `${100 * (this.props.PanelWidth() - this.centeringOffset * 2) / this.props.PanelWidth()}%` : this.props.PanelWidth(),
                    }}>
                    <DocumentView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                        ref={action((r: DocumentView | null) => this.docView = r)}
                        LayoutTemplate={this.props.LayoutTemplate}
                        PanelWidth={this.PanelWidth}
                        PanelHeight={this.PanelHeight}
                        ContentScaling={returnOne}
                        contentFittingScaling={this.contentFittingScaling}
                        ScreenToLocalTransform={this.getTransform}
                        focus={this.props.focus || emptyFunction}
                        bringToFront={emptyFunction}
                    />
                </div>)}
        </div>);
    }
}