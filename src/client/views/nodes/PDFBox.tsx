import * as htmlToImage from "html-to-image";
import { action, computed, IReactionDisposer, observable, reaction, Reaction, trace, runInAction } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import Measure from "react-measure";
//@ts-ignore
import { Document, Page } from "react-pdf";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { RouteStore } from "../../../server/RouteStore";
import { Utils } from '../../../Utils';
import { Annotation } from './Annotation';
import { FieldView, FieldViewProps } from './FieldView';
import "./PDFBox.scss";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { Cast, FieldValue, NumCast } from "../../../new_fields/Types";
import { Opt } from "../../../new_fields/Doc";
import { DocComponent } from "../DocComponent";
import { makeInterface } from "../../../new_fields/Schema";
import { positionSchema } from "./DocumentView";
import { pageSchema } from "./ImageBox";
import { ImageField, PdfField } from "../../../new_fields/URLField";
import { InkingControl } from "../InkingControl";
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

    private _mainDiv = React.createRef<HTMLDivElement>();
    private renderHeight = 2400;

    @observable private _renderAsSvg = true;
    @observable private _alt = false;

    private _reactionDisposer?: IReactionDisposer;

    @observable private _perPageInfo: Object[] = []; //stores pageInfo
    @observable private _pageInfo: any = { area: [], divs: [], anno: [] }; //divs is array of objects linked to anno

    @observable private _currAnno: any = [];
    @observable private _interactive: boolean = false;
    @observable private _loaded: boolean = false;

    @computed private get curPage() { return NumCast(this.Document.curPage, 1); }
    @computed private get thumbnailPage() { return NumCast(this.props.Document.thumbnailPage, -1); }

    componentDidMount() {
        let wasSelected = false;
        this._reactionDisposer = reaction(
            () => this.props.isSelected(),
            () => {
                if (this.curPage > 0 && this.curPage !== this.thumbnailPage && wasSelected && !this.props.isSelected()) {
                    this.saveThumbnail();
                }
                wasSelected = this._interactive = this.props.isSelected();
            },
            { fireImmediately: true });

    }

    componentWillUnmount() {
        if (this._reactionDisposer) this._reactionDisposer();
    }

    /**
     * highlighting helper function
     */
    makeEditableAndHighlight = (colour: string) => {
        var range, sel = window.getSelection();
        if (sel && sel.rangeCount && sel.getRangeAt) {
            range = sel.getRangeAt(0);
        }
        document.designMode = "on";
        if (!document.execCommand("HiliteColor", false, colour)) {
            document.execCommand("HiliteColor", false, colour);
        }

        if (range && sel) {
            sel.removeAllRanges();
            sel.addRange(range);

            let obj: Object = { parentDivs: [], spans: [] };
            //@ts-ignore
            if (range.commonAncestorContainer.className === 'react-pdf__Page__textContent') { //multiline highlighting case
                obj = this.highlightNodes(range.commonAncestorContainer.childNodes);
            } else { //single line highlighting case
                let parentDiv = range.commonAncestorContainer.parentElement;
                if (parentDiv) {
                    if (parentDiv.className === 'react-pdf__Page__textContent') { //when highlight is overwritten
                        obj = this.highlightNodes(parentDiv.childNodes);
                    } else {
                        parentDiv.childNodes.forEach((child) => {
                            if (child.nodeName === 'SPAN') {
                                //@ts-ignore
                                obj.parentDivs.push(parentDiv);
                                //@ts-ignore
                                child.id = "highlighted";
                                //@ts-ignore
                                obj.spans.push(child);
                                // child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
                            }
                        });
                    }
                }
            }
            this._pageInfo.divs.push(obj);

        }
        document.designMode = "off";
    }

    highlightNodes = (nodes: NodeListOf<ChildNode>) => {
        let temp = { parentDivs: [], spans: [] };
        nodes.forEach((div) => {
            div.childNodes.forEach((child) => {
                if (child.nodeName === 'SPAN') {
                    //@ts-ignore
                    temp.parentDivs.push(div);
                    //@ts-ignore
                    child.id = "highlighted";
                    //@ts-ignore
                    temp.spans.push(child);
                    // child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
                }
            });

        });
        return temp;
    }

    /**
     * when the cursor enters the highlight, it pops out annotation. ONLY WORKS FOR SINGLE DIV LINES
     */
    @action
    onEnter = (e: any) => {
        let span: HTMLSpanElement = e.toElement;
        let index: any;
        this._pageInfo.divs.forEach((obj: any) => {
            obj.spans.forEach((element: any) => {
                if (element === span && !index) {
                    index = this._pageInfo.divs.indexOf(obj);
                }
            });
        });

        if (this._pageInfo.anno.length >= index + 1) {
            if (this._currAnno.length === 0) {
                this._currAnno.push(this._pageInfo.anno[index]);
            }
        } else {
            if (this._currAnno.length === 0) { //if there are no current annotation
                let div = span.offsetParent;
                //@ts-ignore
                let divX = div.style.left;
                //@ts-ignore
                let divY = div.style.top;
                //slicing "px" from the end
                divX = divX.slice(0, divX.length - 2); //gets X of the DIV element (parent of Span)
                divY = divY.slice(0, divY.length - 2); //gets Y of the DIV element (parent of Span)
                let annotation = <Annotation key={Utils.GenerateGuid()} Span={span} X={divX} Y={divY - 300} Highlights={this._pageInfo.divs} Annotations={this._pageInfo.anno} CurrAnno={this._currAnno} />;
                this._pageInfo.anno.push(annotation);
                this._currAnno.push(annotation);
            }
        }

    }

    /**
     * highlight function for highlighting actual text. This works fine. 
     */
    highlight = (color: string) => {
        if (window.getSelection()) {
            try {
                if (!document.execCommand("hiliteColor", false, color)) {
                    this.makeEditableAndHighlight(color);
                }
            } catch (ex) {
                this.makeEditableAndHighlight(color);
            }
        }
    }

    /**
     * controls the area highlighting (stickies) Kinda temporary
     */
    onPointerDown = (e: React.PointerEvent) => {
        if (this.props.isSelected() && !InkingControl.Instance.selectedTool && e.buttons === 1) {
            if (e.altKey) {
                this._alt = true;
            } else {
                if (e.metaKey) {
                    e.stopPropagation();
                }
            }
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
        if (this.props.isSelected() && e.buttons === 2) {
            runInAction(() => this._alt = true);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    /**
     * controls area highlighting and partially highlighting. Kinda temporary
     */
    @action
    onPointerUp = (e: PointerEvent) => {
        this._alt = false;
        document.removeEventListener("pointerup", this.onPointerUp);
        if (this.props.isSelected()) {
            this.highlight("rgba(76, 175, 80, 0.3)"); //highlights to this default color. 
        }
        this._interactive = true;
    }


    @action
    saveThumbnail = () => {
        this._renderAsSvg = false;
        setTimeout(() => {
            let nwidth = FieldValue(this.Document.nativeWidth, 0);
            let nheight = FieldValue(this.Document.nativeHeight, 0);
            htmlToImage.toPng(this._mainDiv.current!, { width: nwidth, height: nheight, quality: 1 })
                .then(action((dataUrl: string) => {
                    this.props.Document.thumbnail = new ImageField(new URL(dataUrl));
                    this.props.Document.thumbnailPage = FieldValue(this.Document.curPage, -1);
                    this._renderAsSvg = true;
                }))
                .catch(function (error: any) {
                    console.error('oops, something went wrong!', error);
                });
        }, 1250);
    }

    @action
    onLoaded = (page: any) => {
        // bcz: the number of pages should really be set when the document is imported.
        this.props.Document.numPages = page._transport.numPages;
        if (this._perPageInfo.length === 0) { //Makes sure it only runs once
            this._perPageInfo = [...Array(page._transport.numPages)];
        }
        this._loaded = true;
    }

    @action
    setScaling = (r: any) => {
        // bcz: the nativeHeight should really be set when the document is imported.
        //      also, the native dimensions could be different for different pages of the canvas
        //      so this design is flawed.
        var nativeWidth = FieldValue(this.Document.nativeWidth, 0);
        if (!FieldValue(this.Document.nativeHeight, 0)) {
            var nativeHeight = nativeWidth * r.offset.height / r.offset.width;
            this.props.Document.height = nativeHeight / nativeWidth * FieldValue(this.Document.width, 0);
            this.props.Document.nativeHeight = nativeHeight;
        }
    }
    @computed
    get pdfPage() {
        return <Page height={this.renderHeight} renderTextLayer={false} pageNumber={this.curPage} onLoadSuccess={this.onLoaded} />;
    }
    @computed
    get pdfContent() {
        trace();
        let pdfUrl = Cast(this.props.Document[this.props.fieldKey], PdfField);
        if (!pdfUrl) {
            return <p>No pdf url to render</p>;
        }
        let pdfpage = this.pdfPage;
        let body = this.Document.nativeHeight ?
            pdfpage :
            <Measure offset onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="pdfBox-page" ref={measureRef}>
                        {pdfpage}
                    </div>
                }
            </Measure>;
        let xf = (this.Document.nativeHeight || 0) / this.renderHeight;
        return <div className="pdfBox-contentContainer" key="container" style={{ transform: `scale(${xf}, ${xf})` }}>
            <Document file={window.origin + RouteStore.corsProxy + `/${pdfUrl.url}`} renderMode={this._renderAsSvg ? "svg" : "canvas"}>
                {body}
            </Document>
        </div >;
    }

    @computed
    get pdfRenderer() {
        let proxy = this._loaded ? (null) : this.imageProxyRenderer;
        let pdfUrl = Cast(this.props.Document[this.props.fieldKey], PdfField);
        if ((!this._interactive && proxy) || !pdfUrl) {
            return proxy;
        }
        return [
            this._pageInfo.area.filter(() => this._pageInfo.area).map((element: any) => element),
            this._currAnno.map((element: any) => element),
            this.pdfContent,
            proxy
        ];
    }

    @computed
    get imageProxyRenderer() {
        let thumbField = this.props.Document.thumbnail;
        if (thumbField) {
            let path = this.thumbnailPage !== this.curPage ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
                thumbField instanceof ImageField ? thumbField.url.href : "http://cs.brown.edu/people/bcz/prairie.jpg";
            return <img src={path} width="100%" />;
        }
        return (null);
    }
    @action onKeyDown = (e: React.KeyboardEvent) => e.key === "Alt" && (this._alt = true);
    @action onKeyUp = (e: React.KeyboardEvent) => e.key === "Alt" && (this._alt = false);
    render() {
        trace();
        const pdfUrl = window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool && !this._alt ? "-interactive" : "");
        return (
            <div className={classname} tabIndex={0} ref={this._mainDiv} onPointerDown={this.onPointerDown} onKeyDown={this.onKeyDown} onKeyUp={this.onKeyUp} >
                <PDFViewer url={pdfUrl} />
            </div >
        );
    }

}