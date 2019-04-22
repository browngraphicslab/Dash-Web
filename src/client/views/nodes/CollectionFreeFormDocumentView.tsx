import { computed, trace } from "mobx";
import { observer } from "mobx-react";
import { Transform } from "../../util/Transform";
import { DocumentView, DocumentViewProps, positionSchema } from "./DocumentView";
import "./DocumentView.scss";
import React = require("react");
import { OmitKeys } from "../../../Utils";
import { DocComponent } from "../DocComponent";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { FieldValue } from "../../../new_fields/Types";

export interface CollectionFreeFormDocumentViewProps extends DocumentViewProps {
}

const schema = createSchema({
    zoom: "number",
    zIndex: "number"
});

type FreeformDocument = makeInterface<[typeof schema, typeof positionSchema]>;
const FreeformDocument = makeInterface(schema, positionSchema);

@observer
export class CollectionFreeFormDocumentView extends DocComponent<CollectionFreeFormDocumentViewProps, FreeformDocument>(FreeformDocument) {
    private _mainCont = React.createRef<HTMLDivElement>();

    @computed
    get transform(): string {
        return `scale(${this.props.ContentScaling()}, ${this.props.ContentScaling()}) translate(${this.X}px, ${this.Y}px) scale(${this.zoom}, ${this.zoom}) `;
    }

    @computed get zoom(): number { return 1 / FieldValue(this.Document.zoom, 1); }
    @computed get zIndex(): number { return FieldValue(this.Document.zIndex, 0); }
    @computed get width(): number { return FieldValue(this.Document.width, 0); }
    @computed get height(): number { return FieldValue(this.Document.height, 0); }
    @computed get nativeWidth(): number { return FieldValue(this.Document.nativeWidth, 0); }
    @computed get nativeHeight(): number { return FieldValue(this.Document.nativeHeight, 0); }

    set width(w: number) {
        this.Document.width = w;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.height = this.nativeHeight / this.nativeWidth * w;
        }
    }

    set height(h: number) {
        this.Document.height = h;
        if (this.nativeWidth && this.nativeHeight) {
            this.Document.width = this.nativeWidth / this.nativeHeight * h;
        }
    }

    set zIndex(h: number) {
        this.Document.zIndex = h;
    }

    get X() {
        return FieldValue(this.Document.x, 0);
    }
    get Y() {
        return FieldValue(this.Document.y, 0);
    }
    getTransform = (): Transform =>
        this.props.ScreenToLocalTransform()
            .translate(-this.X, -this.Y)
            .scale(1 / this.contentScaling()).scale(1 / this.zoom)

    contentScaling = () => this.nativeWidth > 0 ? this.width / this.nativeWidth : 1;
    panelWidth = () => this.props.PanelWidth();
    panelHeight = () => this.props.PanelHeight();

    @computed
    get docView() {
        return <DocumentView {...OmitKeys(this.props, ['zoomFade'])}
            ContentScaling={this.contentScaling}
            ScreenToLocalTransform={this.getTransform}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
        />;
    }

    render() {
        let zoomFade = 1;
        //var zoom = doc.GetNumber(KeyStore.Zoom, 1);
        // let transform = this.getTransform().scale(this.contentScaling()).inverse();
        // var [sptX, sptY] = transform.transformPoint(0, 0);
        // let [bptX, bptY] = transform.transformPoint(this.props.PanelWidth(), this.props.PanelHeight());
        // let w = bptX - sptX;
        // //zoomFade = area < 100 || area > 800 ? Math.max(0, Math.min(1, 2 - 5 * (zoom < this.scale ? this.scale / zoom : zoom / this.scale))) : 1;
        // let fadeUp = .75 * 1800;
        // let fadeDown = .075 * 1800;
        // zoomFade = w < fadeDown  /* || w > fadeUp */ ? Math.max(0, Math.min(1, 2 - (w < fadeDown ? fadeDown / w : w / fadeUp))) : 1;

        return (
            <div className="collectionFreeFormDocumentView-container" ref={this._mainCont} style={{
                opacity: zoomFade,
                transformOrigin: "left top",
                transform: this.transform,
                pointerEvents: (zoomFade < 0.09 ? "none" : "all"),
                width: this.width,
                height: this.height,
                position: "absolute",
                zIndex: this.zIndex,
                backgroundColor: "transparent"
            }} >
                {this.docView}
            </div>
        );
    }
}