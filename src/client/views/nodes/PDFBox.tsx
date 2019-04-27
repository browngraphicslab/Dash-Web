import * as htmlToImage from "html-to-image";
import { action, computed, IReactionDisposer, observable, reaction, Reaction, trace } from 'mobx';
import { observer } from "mobx-react";
import 'react-image-lightbox/style.css';
import Measure from "react-measure";
//@ts-ignore
import { Document, Page } from "react-pdf";
import 'react-pdf/dist/Page/AnnotationLayer.css';
import { FieldWaiting, Opt } from '../../../fields/Field';
import { ImageField } from '../../../fields/ImageField';
import { KeyStore } from '../../../fields/KeyStore';
import { PDFField } from '../../../fields/PDFField';
import { RouteStore } from "../../../server/RouteStore";
import { Utils } from '../../../Utils';
import { Annotation } from './Annotation';
import { FieldView, FieldViewProps } from './FieldView';
import "./PDFBox.scss";
import React = require("react");
import { SelectionManager } from "../../util/SelectionManager";
import { InkingControl } from "../InkingControl";

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
@observer
export class PDFBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    private _mainDiv = React.createRef<HTMLDivElement>();

    @observable private _renderAsSvg = true;

    private _reactionDisposer: Opt<IReactionDisposer>;

    @observable private _perPageInfo: Object[] = []; //stores pageInfo
    @observable private _pageInfo: any = { area: [], divs: [], anno: [] }; //divs is array of objects linked to anno

    @observable private _currAnno: any = [];
    @observable private _interactive: boolean = false;
    @observable private _loaded: boolean = false;

    @computed private get curPage() { return this.props.Document.GetNumber(KeyStore.CurPage, 1); }
    @computed private get thumbnailPage() { return this.props.Document.GetNumber(KeyStore.ThumbnailPage, -1); }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => [SelectionManager.SelectedDocuments().slice()],
            () => {
                if (this.curPage > 0 && this.thumbnailPage > 0 && this.curPage !== this.thumbnailPage && !this.props.isSelected()) {
                    this.saveThumbnail();
                    this._interactive = true;
                }
            },
            { fireImmediately: true });

    }

    componentWillUnmount() {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
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
                                child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
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
                    child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
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
                if (element === span) {
                    if (!index) {
                        index = this._pageInfo.divs.indexOf(obj);
                    }
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
            e.stopPropagation();
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    /**
     * controls area highlighting and partially highlighting. Kinda temporary
     */
    @action
    onPointerUp = (e: PointerEvent) => {
        if (this.props.isSelected()) {
            this.highlight("rgba(76, 175, 80, 0.3)"); //highlights to this default color. 
        }
        this._interactive = true;
    }



    @action
    saveThumbnail = () => {
        this._renderAsSvg = false;
        setTimeout(() => {
            var me = this;
            let nwidth = me.props.Document.GetNumber(KeyStore.NativeWidth, 0);
            let nheight = me.props.Document.GetNumber(KeyStore.NativeHeight, 0);
            htmlToImage.toPng(this._mainDiv.current!, { width: nwidth, height: nheight, quality: 1 })
                .then(action((dataUrl: string) => {
                    me.props.Document.SetData(KeyStore.Thumbnail, new URL(dataUrl), ImageField);
                    me.props.Document.SetNumber(KeyStore.ThumbnailPage, me.props.Document.GetNumber(KeyStore.CurPage, -1));
                    me._renderAsSvg = true;
                }))
                .catch(function (error: any) {
                    console.error('oops, something went wrong!', error);
                });
        }, 250);
    }

    @action
    onLoaded = (page: any) => {
        // bcz: the number of pages should really be set when the document is imported.
        this.props.Document.SetNumber(KeyStore.NumPages, page._transport.numPages);
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
        var nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        if (!this.props.Document.GetNumber(KeyStore.NativeHeight, 0)) {
            var nativeHeight = nativeWidth * r.entry.height / r.entry.width;
            this.props.Document.SetNumber(KeyStore.Height, nativeHeight / nativeWidth * this.props.Document.GetNumber(KeyStore.Width, 0));
            this.props.Document.SetNumber(KeyStore.NativeHeight, nativeHeight);
        }
    }
    renderHeight = 2400;
    @computed
    get pdfPage() {
        return <Page height={this.renderHeight} pageNumber={this.curPage} onLoadSuccess={this.onLoaded} />
    }
    @computed
    get pdfContent() {
        let pdfUrl = this.props.Document.GetT(this.props.fieldKey, PDFField);
        let xf = this.props.Document.GetNumber(KeyStore.NativeHeight, 0) / this.renderHeight;
        let body = (this.props.Document.GetNumber(KeyStore.NativeHeight, 0)) ?
            this.pdfPage :
            <Measure onResize={this.setScaling}>
                {({ measureRef }) =>
                    <div className="pdfBox-page" ref={measureRef}>
                        {this.pdfPage}
                    </div>
                }
            </Measure>;
        return <div className="pdfBox-contentContainer" key="container" style={{ transform: `scale(${xf}, ${xf})` }}>
            <Document file={window.origin + RouteStore.corsProxy + `/${pdfUrl}`} renderMode={this._renderAsSvg ? "svg" : "canvas"}>
                {body}
            </Document>
        </div >;
    }

    @computed
    get pdfRenderer() {
        let proxy = this._loaded ? (null) : this.imageProxyRenderer;
        let pdfUrl = this.props.Document.GetT(this.props.fieldKey, PDFField);
        if ((!this._interactive && proxy) || !pdfUrl || pdfUrl === FieldWaiting) {
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
        let thumbField = this.props.Document.Get(KeyStore.Thumbnail);
        if (thumbField) {
            let path = thumbField === FieldWaiting || this.thumbnailPage !== this.curPage ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
                thumbField instanceof ImageField ? thumbField.Data.href : "http://cs.brown.edu/people/bcz/prairie.jpg";
            return <img src={path} width="100%" />;
        }
        return (null);
    }
    render() {
        trace();
        let classname = "pdfBox-cont" + (this.props.isSelected() && !InkingControl.Instance.selectedTool ? "-interactive" : "");
        return (
            <div className={classname} ref={this._mainDiv} onPointerDown={this.onPointerDown} >
                {this.pdfRenderer}
            </div >
        );
    }

}