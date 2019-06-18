import { action, IReactionDisposer, observable, reaction, trace, untracked } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import { WidthSym } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast } from "../../../new_fields/Types";
import { PdfField } from "../../../new_fields/URLField";
//@ts-ignore
// import { Document, Page } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { PDFViewer } from "../pdf/PDFViewer";
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
import React = require("react");

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _alt = false;
    @observable private _scrollY: number = 0;
    private _reactionDisposer?: IReactionDisposer;

    componentDidMount() {
        if (this.props.setPdfBox) this.props.setPdfBox(this);
    }

    public GetPage() {
        return Math.floor(NumCast(this.props.Document.scrollY) / NumCast(this.Document.pdfHeight)) + 1;
    }
    public BackPage() {
        let cp = Math.ceil(NumCast(this.props.Document.scrollY) / NumCast(this.Document.pdfHeight)) + 1;
        cp = cp - 1;
        if (cp > 0) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.Document.pdfHeight);
        }
    }
    public GotoPage(p: number) {
        if (p > 0 && p <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = p;
            this.props.Document.scrollY = (p - 1) * NumCast(this.Document.pdfHeight);
        }
    }

    public ForwardPage() {
        let cp = this.GetPage() + 1;
        if (cp <= NumCast(this.props.Document.numPages)) {
            this.props.Document.curPage = cp;
            this.props.Document.scrollY = (cp - 1) * NumCast(this.Document.pdfHeight);
        }
    }

    createRef = (ele: HTMLDivElement | null) => {
        if (this._reactionDisposer) this._reactionDisposer();
        this._reactionDisposer = reaction(() => this.props.Document.scrollY, () => {
            ele && ele.scrollTo({ top: NumCast(this.Document.scrollY), behavior: "smooth" });
        });
    }

    loaded = (nw: number, nh: number, np: number) => {
        if (this.props.Document) {
            let doc = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
            doc.numPages = np;
            if (doc.nativeWidth && doc.nativeHeight) return;
            let oldaspect = NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth, 1);
            doc.nativeWidth = nw;
            if (doc.nativeHeight) doc.nativeHeight = nw * oldaspect;
            else doc.nativeHeight = nh;
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
        // uses mozilla pdf as default
        const pdfUrl = Cast(this.props.Document.data, PdfField, new PdfField(window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf"));
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div onScroll={this.onScroll}
                style={{
                    height: "100%",
                    overflowY: "scroll", overflowX: "hidden",
                    marginTop: `${NumCast(this.props.ContainingCollectionView!.props.Document.panY)}px`
                }}
                ref={this.createRef}
                onWheel={(e: React.WheelEvent) => e.stopPropagation()} className={classname}>
                <PDFViewer url={pdfUrl.url.pathname} loaded={this.loaded} scrollY={this._scrollY} parent={this} />
                {/* <div style={{ width: "100px", height: "300px" }}></div> */}
            </div>
        );
    }

}