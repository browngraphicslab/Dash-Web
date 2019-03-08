import * as htmlToImage from "html-to-image";
import { action, computed, observable, reaction, IReactionDisposer } from 'mobx';
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
import { Utils } from '../../../Utils';
import { Annotation } from './Annotation';
import { FieldView, FieldViewProps } from './FieldView';
import "./ImageBox.scss";
import "./PDFBox.scss";
import { Sticky } from './Sticky'; //you should look at sticky and annotation, because they are used here
import React = require("react")

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
 * Draw:
 *          1) click draw and select color. then just draw like there's no tomorrow.
 *          2) once you finish drawing your masterpiece, just reclick on the draw button to end your drawing session. 
 * 
 * Pagination:
 *          1) click on arrows. You'll notice that stickies will stay in those page. But... highlights won't. 
 *          2) to test this out, make few area/stickies and then click on next page then come back. You'll see that they are all saved. 
 *
 * 
 * written by: Andrew Kim 
 */
@observer
export class PDFBox extends React.Component<FieldViewProps> {
    public static LayoutString() { return FieldView.LayoutString(PDFBox); }

    private _mainDiv = React.createRef<HTMLDivElement>()
    private _pdf = React.createRef<HTMLCanvasElement>();

    //very useful for keeping track of X and y position throughout the PDF Canvas
    private initX: number = 0;
    private initY: number = 0;
    private initPage: boolean = false;

    //checks if tool is on
    private _toolOn: boolean = false; //checks if tool is on
    private _pdfContext: any = null; //gets pdf context
    private bool: Boolean = false; //general boolean debounce
    private currSpan: any;//keeps track of current span (for highlighting)

    private _currTool: any; //keeps track of current tool button reference
    private _drawToolOn: boolean = false; //boolean that keeps track of the drawing tool 
    private _drawTool = React.createRef<HTMLButtonElement>()//drawing tool button reference

    private _colorTool = React.createRef<HTMLButtonElement>(); //color button reference
    private _currColor: string = "black"; //current color that user selected (for ink/pen)

    private _highlightTool = React.createRef<HTMLButtonElement>(); //highlighter button reference
    private _highlightToolOn: boolean = false;
    private _pdfCanvas: any;
    private _reactionDisposer: Opt<IReactionDisposer>;

    @observable private _perPageInfo: Object[] = []; //stores pageInfo
    @observable private _pageInfo: any = { area: [], divs: [], anno: [] }; //divs is array of objects linked to anno

    @observable private _currAnno: any = []
    @observable private _interactive: boolean = false;
    @observable private _loaded: boolean = false;

    @computed private get curPage() { return this.props.doc.GetNumber(KeyStore.CurPage, 0); }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => this.curPage,
            () => {
                if (this.curPage && this.initPage) {
                    this.saveThumbnail();
                    this._interactive = true;
                } else {
                    if (this.curPage)
                        this.initPage = true;
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
     * selection tool used for area highlighting (stickies). Kinda temporary
     */
    selectionTool = () => {
        this._toolOn = true;
    }
    /**
     * when user draws on the canvas. When mouse pointer is down 
     */
    drawDown = (e: PointerEvent) => {
        this.initX = e.offsetX;
        this.initY = e.offsetY;
        this._pdfContext.beginPath();
        this._pdfContext.lineTo(this.initX, this.initY);
        this._pdfContext.strokeStyle = this._currColor;
        this._pdfCanvas.addEventListener("pointermove", this.drawMove);
        this._pdfCanvas.addEventListener("pointerup", this.drawUp);

    }
    //when user drags 
    drawMove = (e: PointerEvent): void => {
        //x and y mouse movement
        let x = this.initX += e.movementX,
            y = this.initY += e.movementY;
        //connects the point 
        this._pdfContext.lineTo(x, y);
        this._pdfContext.stroke();
    }

    drawUp = (e: PointerEvent) => {
        this._pdfContext.closePath();
        this._pdfCanvas.removeEventListener("pointermove", this.drawMove);
        this._pdfCanvas.removeEventListener("pointerdown", this.drawDown);
        this._pdfCanvas.addEventListener("pointerdown", this.drawDown);
    }


    /**
     * highlighting helper function
     */
    makeEditableAndHighlight = (colour: string) => {
        var range, sel = window.getSelection();
        if (sel.rangeCount && sel.getRangeAt) {
            range = sel.getRangeAt(0);
        }
        document.designMode = "on";
        if (!document.execCommand("HiliteColor", false, colour)) {
            document.execCommand("HiliteColor", false, colour);
        }

        if (range) {
            sel.removeAllRanges();
            sel.addRange(range);

            let obj: Object = { parentDivs: [], spans: [] };
            //@ts-ignore
            if (range.commonAncestorContainer.className == 'react-pdf__Page__textContent') { //multiline highlighting case
                obj = this.highlightNodes(range.commonAncestorContainer.childNodes)
            } else { //single line highlighting case
                let parentDiv = range.commonAncestorContainer.parentElement
                if (parentDiv) {
                    if (parentDiv.className == 'react-pdf__Page__textContent') { //when highlight is overwritten
                        obj = this.highlightNodes(parentDiv.childNodes)
                    } else {
                        parentDiv.childNodes.forEach((child) => {
                            if (child.nodeName == 'SPAN') {
                                //@ts-ignore
                                obj.parentDivs.push(parentDiv)
                                //@ts-ignore
                                child.id = "highlighted"
                                //@ts-ignore
                                obj.spans.push(child)
                                child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
                            }
                        })
                    }
                }
            }
            this._pageInfo.divs.push(obj);

        }
        document.designMode = "off";
    }

    highlightNodes = (nodes: NodeListOf<ChildNode>) => {
        let temp = { parentDivs: [], spans: [] }
        nodes.forEach((div) => {
            div.childNodes.forEach((child) => {
                if (child.nodeName == 'SPAN') {
                    //@ts-ignore
                    temp.parentDivs.push(div)
                    //@ts-ignore
                    child.id = "highlighted"
                    //@ts-ignore
                    temp.spans.push(child)
                    child.addEventListener("mouseover", this.onEnter); //adds mouseover annotation handler
                }
            })

        })
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
                if (element == span) {
                    if (!index) {
                        index = this._pageInfo.divs.indexOf(obj);
                    }
                }
            })
        })

        if (this._pageInfo.anno.length >= index + 1) {
            if (this._currAnno.length == 0) {
                this._currAnno.push(this._pageInfo.anno[index]);
            }
        } else {
            if (this._currAnno.length == 0) { //if there are no current annotation
                let div = span.offsetParent;
                //@ts-ignore
                let divX = div.style.left
                //@ts-ignore
                let divY = div.style.top
                //slicing "px" from the end
                divX = divX.slice(0, divX.length - 2); //gets X of the DIV element (parent of Span)
                divY = divY.slice(0, divY.length - 2); //gets Y of the DIV element (parent of Span)
                let annotation = <Annotation key={Utils.GenerateGuid()} Span={span} X={divX} Y={divY - 300} Highlights={this._pageInfo.divs} Annotations={this._pageInfo.anno} CurrAnno={this._currAnno} />
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
                this.makeEditableAndHighlight(color)
            }
        }
    }

    /**
     * controls the area highlighting (stickies) Kinda temporary
     */
    onPointerDown = (e: React.PointerEvent) => {
        if (this._toolOn) {
            let mouse = e.nativeEvent;
            this.initX = mouse.offsetX;
            this.initY = mouse.offsetY;

        }
    }

    /**
     * controls area highlighting and partially highlighting. Kinda temporary
     */
    @action
    onPointerUp = (e: React.PointerEvent) => {
        if (this._highlightToolOn) {
            this.highlight("rgba(76, 175, 80, 0.3)"); //highlights to this default color. 
            this._highlightToolOn = false;
        }
        if (this._toolOn) {
            let mouse = e.nativeEvent;
            let finalX = mouse.offsetX;
            let finalY = mouse.offsetY;
            let width = Math.abs(finalX - this.initX); //width
            let height = Math.abs(finalY - this.initY); //height

            //these two if statements are bidirectional dragging. You can drag from any point to another point and generate sticky
            if (finalX < this.initX) {
                this.initX = finalX;
            }
            if (finalY < this.initY) {
                this.initY = finalY;
            }

            if (this._mainDiv.current) {
                let sticky = <Sticky key={Utils.GenerateGuid()} Height={height} Width={width} X={this.initX} Y={this.initY} />
                this._pageInfo.area.push(sticky);
            }
            this._toolOn = false;
        }
        this._interactive = true;
    }

    /**
     * starts drawing the line when user presses down. 
     */
    onDraw = () => {
        if (this._currTool != null) {
            this._currTool.style.backgroundColor = "grey";
        }

        if (this._drawTool.current) {
            this._currTool = this._drawTool.current;
            if (this._drawToolOn) {
                this._drawToolOn = false;
                this._pdfCanvas.removeEventListener("pointerdown", this.drawDown);
                this._pdfCanvas.removeEventListener("pointerup", this.drawUp);
                this._pdfCanvas.removeEventListener("pointermove", this.drawMove);
                this._drawTool.current.style.backgroundColor = "grey";
            } else {
                this._drawToolOn = true;
                this._pdfCanvas.addEventListener("pointerdown", this.drawDown);
                this._drawTool.current.style.backgroundColor = "cyan";
            }
        }
    }


    /**
     * for changing color (for ink/pen)
     */
    onColorChange = (e: React.PointerEvent) => {
        if (e.currentTarget.innerHTML == "Red") {
            this._currColor = "red";
        } else if (e.currentTarget.innerHTML == "Blue") {
            this._currColor = "blue";
        } else if (e.currentTarget.innerHTML == "Green") {
            this._currColor = "green";
        } else if (e.currentTarget.innerHTML == "Black") {
            this._currColor = "black";
        }

    }


    /**
     * For highlighting (text drag highlighting)
     */
    onHighlight = () => {
        this._drawToolOn = false;
        if (this._currTool != null) {
            this._currTool.style.backgroundColor = "grey";
        }
        if (this._highlightTool.current) {
            this._currTool = this._drawTool.current;
            if (this._highlightToolOn) {
                this._highlightToolOn = false;
                this._highlightTool.current.style.backgroundColor = "grey";
            } else {
                this._highlightToolOn = true;
                this._highlightTool.current.style.backgroundColor = "orange";
            }
        }
    }


    @action
    saveThumbnail = () => {
        setTimeout(() => {
            var me = this;
            htmlToImage.toPng(this._mainDiv.current!,
                { width: me.props.doc.GetNumber(KeyStore.NativeWidth, 0), height: me.props.doc.GetNumber(KeyStore.NativeHeight, 0), quality: 0.5 })
                .then(function (dataUrl: string) {
                    me.props.doc.SetData(KeyStore.Thumbnail, new URL(dataUrl), ImageField);
                })
                .catch(function (error: any) {
                    console.error('oops, something went wrong!', error);
                });
        }, 1000);
    }

    @action
    onLoaded = (page: any) => {
        if (this._mainDiv.current) {
            this._mainDiv.current.childNodes.forEach((element) => {
                if (element.nodeName == "DIV") {
                    element.childNodes[0].childNodes.forEach((e) => {

                        if (e instanceof HTMLCanvasElement) {
                            this._pdfCanvas = e;
                            this._pdfContext = e.getContext("2d")

                        }

                    })
                }
            })
        }

        // bcz: the number of pages should really be set when the document is imported.
        this.props.doc.SetNumber(KeyStore.NumPages, page._transport.numPages);
        if (this._perPageInfo.length == 0) { //Makes sure it only runs once
            this._perPageInfo = [...Array(page._transport.numPages)]
        }
        this._loaded = true;
    }

    @action
    setScaling = (r: any) => {
        // bcz: the nativeHeight should really be set when the document is imported.
        //      also, the native dimensions could be different for different pages of the PDF
        //      so this design is flawed.
        var nativeWidth = this.props.doc.GetNumber(KeyStore.NativeWidth, 0);
        if (!this.props.doc.GetNumber(KeyStore.NativeHeight, 0)) {
            this.props.doc.SetNumber(KeyStore.NativeHeight, nativeWidth * r.entry.height / r.entry.width);
        }
        if (!this.props.doc.GetT(KeyStore.Thumbnail, ImageField)) {
            this.saveThumbnail();
        }
    }

    @computed
    get pdfContent() {
        let page = this.curPage;
        if (page == 0)
            page = 1;
        const renderHeight = 2400;
        let pdfUrl = this.props.doc.GetT(this.props.fieldKey, PDFField);
        let xf = this.props.doc.GetNumber(KeyStore.NativeHeight, 0) / renderHeight;
        return <div className="pdfBox-contentContainer" key="container" style={{ transform: `scale(${xf}, ${xf})` }}>
            <Document file={window.origin + "/corsProxy/" + `${pdfUrl}`}>
                <Measure onResize={this.setScaling}>
                    {({ measureRef }) =>
                        <div className="pdfBox-page" ref={measureRef}>
                            <Page height={renderHeight} pageNumber={page} onLoadSuccess={this.onLoaded} />
                        </div>
                    }
                </Measure>
            </Document>
        </div >;
    }

    @computed
    get pdfRenderer() {
        let proxy = this._loaded ? (null) : this.imageProxyRenderer;
        let pdfUrl = this.props.doc.GetT(this.props.fieldKey, PDFField);
        if ((!this._interactive && proxy) || !pdfUrl || pdfUrl == FieldWaiting) {
            return proxy;
        }
        return [
            this._pageInfo.area.filter(() => this._pageInfo.area).map((element: any) => element),
            this._currAnno.map((element: any) => element),
            <div key="pdfBox-contentShell">
                {this.pdfContent}
                {proxy}
            </div>
        ];
    }

    @computed
    get imageProxyRenderer() {
        let field = this.props.doc.Get(KeyStore.Thumbnail);
        if (field) {
            let path = field == FieldWaiting ? "https://image.flaticon.com/icons/svg/66/66163.svg" :
                field instanceof ImageField ? field.Data.href : "http://cs.brown.edu/people/bcz/prairie.jpg";
            return <img src={path} width="100%" />;
        }
        return (null);
    }

    render() {
        return (
            <div className="pdfBox-cont" ref={this._mainDiv} onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} >
                {this.pdfRenderer}
            </div >
        );
    }

}