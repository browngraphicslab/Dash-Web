import * as htmlToImage from "html-to-image";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, trace } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import Measure from "react-measure";
//@ts-ignore
// import { Document, Page } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");
import { NumCast, StrCast, Cast } from "../../../new_fields/Types";
import { makeInterface } from "../../../new_fields/Schema";
import { PDFViewer } from "../pdf/PDFViewer";
import { PdfField } from "../../../new_fields/URLField";
import { HeightSym, WidthSym } from "../../../new_fields/Doc";
import { CollectionStackingView } from "../collections/CollectionStackingView";

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _alt = false;
    @observable private _scrollY: number = 0;

    loaded = (nw: number, nh: number) => {
        if (this.props.Document) {
            let doc = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
            doc.nativeWidth = nw;
            doc.nativeHeight = nh;
            let ccv = this.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.pdfHeight = nh;
            }
            doc.height = nh * (doc[WidthSym]() / nw);
        }
    }

    @action
    onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget) {
            this._scrollY = e.currentTarget.scrollTop;
            // e.currentTarget.scrollTo({ top: 1000, behavior: "smooth" });
            let ccv = this.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.scrollY = this._scrollY;
            }
        }
    }

    render() {
        trace();
        // uses mozilla pdf as default
        const pdfUrl = Cast(this.props.Document.data, PdfField, new PdfField(window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"));
        console.log(pdfUrl);
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div onScroll={this.onScroll}
                style={{
                    overflowY: "scroll", overflowX: "hidden", height: `${NumCast(this.props.Document.nativeHeight ? this.props.Document.nativeHeight : 300)}px`,
                    marginTop: `${NumCast(this.props.ContainingCollectionView!.props.Document.panY)}px`
                }}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()} className={classname}>
                <PDFViewer url={pdfUrl.url.href} loaded={this.loaded} scrollY={this._scrollY} parent={this} />
                {/* <div style={{ width: "100px", height: "300px" }}></div> */}
            </div>
        );
    }

}