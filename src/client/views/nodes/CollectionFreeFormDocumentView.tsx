import { random } from "animejs";
import { computed, IReactionDisposer, observable, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { listSpec } from "../../../new_fields/Schema";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Transform } from "../../util/Transform";
import { DocComponent } from "../DocComponent";
import "./CollectionFreeFormDocumentView.scss";
import { DocumentView, DocumentViewProps } from "./DocumentView";
import React = require("react");
import { PositionDocument } from "../../../new_fields/documentSchemas";
import { TraceMobx } from "../../../new_fields/util";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
    dataProvider?: (doc: Doc) => { x: number, y: number, width: number, height: number, z: number, transition?: string } | undefined;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    jitterRotation: number;
    transition?: string;
}

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, PositionDocument>(PositionDocument) {
    _disposer: IReactionDisposer | undefined = undefined;
    get displayName() { return "CollectionFreeFormDocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    get transform() { return `scale(${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px)`; }
    get X() { return this._animPos !== undefined ? this._animPos[0] : this.renderScriptDim ? this.renderScriptDim.x : this.props.x !== undefined ? this.props.x : this.dataProvider ? this.dataProvider.x : (this.Document.x || 0); }
    get Y() { return this._animPos !== undefined ? this._animPos[1] : this.renderScriptDim ? this.renderScriptDim.y : this.props.y !== undefined ? this.props.y : this.dataProvider ? this.dataProvider.y : (this.Document.y || 0); }
    get width() { return this.renderScriptDim ? this.renderScriptDim.width : this.props.width !== undefined ? this.props.width : this.props.dataProvider && this.dataProvider ? this.dataProvider.width : this.layoutDoc[WidthSym](); }
    get height() {
        let hgt = this.renderScriptDim ? this.renderScriptDim.height : this.props.height !== undefined ? this.props.height : this.props.dataProvider && this.dataProvider ? this.dataProvider.height : this.layoutDoc[HeightSym]();
        return (hgt === undefined && this.nativeWidth && this.nativeHeight) ? this.width * this.nativeHeight / this.nativeWidth : hgt;
    }
    @computed get dataProvider() { return this.props.dataProvider && this.props.dataProvider(this.props.Document) ? this.props.dataProvider(this.props.Document) : undefined; }
    @computed get nativeWidth() { return NumCast(this.layoutDoc.nativeWidth); }
    @computed get nativeHeight() { return NumCast(this.layoutDoc.nativeHeight); }

    @computed get renderScriptDim() {
        if (this.Document.renderScript) {
            let someView = Cast(this.props.Document.someView, Doc);
            let minimap = Cast(this.props.Document.minimap, Doc);
            if (someView instanceof Doc && minimap instanceof Doc) {
                let x = (NumCast(someView.panX) - NumCast(someView.width) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitX) - NumCast(minimap.fitW) / 2)) / NumCast(minimap.fitW) * NumCast(minimap.width) - NumCast(minimap.width) / 2;
                let y = (NumCast(someView.panY) - NumCast(someView.height) / 2 / NumCast(someView.scale) - (NumCast(minimap.fitY) - NumCast(minimap.fitH) / 2)) / NumCast(minimap.fitH) * NumCast(minimap.height) - NumCast(minimap.height) / 2;
                let w = NumCast(someView.width) / NumCast(someView.scale) / NumCast(minimap.fitW) * NumCast(minimap.width);
                let h = NumCast(someView.height) / NumCast(someView.scale) / NumCast(minimap.fitH) * NumCast(minimap.height);
                return { x: x, y: y, width: w, height: h };
            }
        }
        return undefined;
    }

    componentWillUnmount() {
        this._disposer && this._disposer();
    }
    componentDidMount() {
        this._disposer = reaction(() => this.props.Document.animateToPos ? Array.from(Cast(this.props.Document.animateToPos, listSpec("number"))!) : undefined,
            target => this._animPos = !target ? undefined : target[2] ? [NumCast(this.layoutDoc.x), NumCast(this.layoutDoc.y)] : this.props.ScreenToLocalTransform().transformPoint(target[0], target[1]),
            { fireImmediately: true });
    }

    contentScaling = () => this.nativeWidth > 0 && !this.props.Document.ignoreAspect ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();
    getTransform = (): Transform => this.props.ScreenToLocalTransform()
        .translate(-this.X, -this.Y)
        .scale(1 / this.contentScaling())

    borderRounding = () => {
        let ruleRounding = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleRounding_" + this.Document.heading]) : undefined;
        let ld = this.layoutDoc[StrCast(this.layoutDoc.layoutKey, "layout")] instanceof Doc ? this.layoutDoc[StrCast(this.layoutDoc.layoutKey, "layout")] as Doc : undefined;
        let br = StrCast((ld || this.props.Document).borderRounding);
        return !br && ruleRounding ? ruleRounding : br;
    }

    @computed
    get clusterColor() { return this.props.backgroundColor(this.props.Document); }

    clusterColorFunc = (doc: Doc) => this.clusterColor;

    @observable _animPos: number[] | undefined = undefined;

    finalPanelWidth = () => this.dataProvider ? this.dataProvider.width : this.panelWidth();
    finalPanelHeight = () => this.dataProvider ? this.dataProvider.height : this.panelHeight();

    render() {
        TraceMobx();
        return <div className="collectionFreeFormDocumentView-container"
            style={{
                boxShadow:
                    this.layoutDoc.opacity === 0 ? undefined :  // if it's not visible, then no shadow
                        this.layoutDoc.z ? `#9c9396  ${StrCast(this.layoutDoc.boxShadow, "10px 10px 0.9vw")}` :  // if it's a floating doc, give it a big shadow
                            this.clusterColor ? (`${this.clusterColor} ${StrCast(this.layoutDoc.boxShadow, `0vw 0vw ${(this.layoutDoc.isBackground ? 100 : 50) / this.props.ContentScaling()}px`)}`) :  // if it's just in a cluster, make the shadown roughly match the cluster border extent
                                this.layoutDoc.isBackground ? `1px 1px 1px ${this.clusterColor}` :  // if it's a background & has a cluster color, make the shadow spread really big
                                    StrCast(this.layoutDoc.boxShadow, ""),
                borderRadius: this.borderRounding(),
                transform: this.transform,
                transition: this.Document.isAnimating ? ".5s ease-in" : this.props.transition ? this.props.transition : this.dataProvider ? this.dataProvider.transition : StrCast(this.layoutDoc.transition),
                width: this.width,
                height: this.height,
                zIndex: this.Document.zIndex || 0,
            }} >
            <DocumentView {...this.props}
                ContentScaling={this.contentScaling}
                ScreenToLocalTransform={this.getTransform}
                backgroundColor={this.clusterColorFunc}
                PanelWidth={this.finalPanelWidth}
                PanelHeight={this.finalPanelHeight}
            />
        </div>;
    }
}