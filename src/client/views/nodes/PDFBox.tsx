import * as htmlToImage from "html-to-image";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, trace } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import Measure from "react-measure";
//@ts-ignore
// import { Document, Page } from "react-pdf";
// import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { Utils } from '../../../Utils';
import { DocServer } from "../../DocServer";
import { DocComponent } from "../DocComponent";
import { InkingControl } from "../InkingControl";
import { SearchBox } from "../SearchBox";
import { Annotation } from './Annotation';
import { positionSchema } from "./DocumentView";
import { FieldView, FieldViewProps } from './FieldView';
import { pageSchema } from "./ImageBox";
import "./PDFBox.scss";
var path = require('path');
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { Opt, HeightSym, Doc } from "../../../new_fields/Doc";
import { makeInterface } from "../../../new_fields/Schema";
import { ImageField, PdfField } from "../../../new_fields/URLField";
import { PDFViewer } from "../pdf/PDFViewer";

/** ALSO LOOK AT: Annotation.tsx, Sticky.tsx
 * This method renders PDF and puts all kinds of functionalities such as annotation, highlighting, 
 * area selection (I call it stickies), embedded ink node for directly annotating using a pen or 
 * mouse, and pagination. 
 *
 * 
 * HOW TO USE: 
 * AREA selection: 
 *          1) Click on Area button. 
 *          2) click on any part of the PDF, and drag to get desired sized area shape
 *          3) You can write on the area (hence the reason why it's called sticky)
 *          4) to make another area, you need to click on area button AGAIN. 
 * 
 * HIGHLIGHT: (Buggy. No multiline/multidiv text highlighting for now...)
 *          1) just click and drag on a text
 *          2) click highlight
 *          3) for annotation, just pull your cursor over to that text
 *          4) another method: click on highlight first and then drag on your desired text
 *          5) To make another highlight, you need to reclick on the button 
 * 
 * written by: Andrew Kim 
 */

type PdfDocument = makeInterface<[typeof positionSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(positionSchema, pageSchema);

@observer
export class PDFBox extends DocComponent<FieldViewProps, PdfDocument>(PdfDocument) {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    @observable private _alt = false;
    @observable private _scrollY: number = 0;

    getHeight = (): number => {
        if (this.props.Document) {
            let doc = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
            console.log(doc);
            return NumCast(doc.height);
        }
        return 0;
    }

    loaded = (nw: number, nh: number) => {
        if (this.props.Document) {
            let doc = this.props.Document.proto ? this.props.Document.proto : this.props.Document;
            doc.nativeWidth = nw;
            doc.nativeHeight = nh;
        }
    }

    @action
    onScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (e.currentTarget) {
            this._scrollY = e.currentTarget.scrollTop;
        }
    }

    render() {
        trace();
        const pdfUrl = window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div onScroll={this.onScroll} style={{ overflow: "scroll", height: `${NumCast(this.props.Document.nativeWidth ? this.props.Document.nativeWidth : 300)}px` }} onWheel={(e: React.WheelEvent) => e.stopPropagation()} className={classname}>
                <PDFViewer url={pdfUrl} loaded={this.loaded} scrollY={this._scrollY} parent={this} />
            </div>
        );
    }

}