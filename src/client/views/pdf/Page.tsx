import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, IReactionDisposer, reaction } from "mobx";
import * as Pdfjs from "pdfjs-dist";
import { Opt, Doc, FieldResult, Field, DocListCast, WidthSym, HeightSym } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFBox } from "../nodes/PDFBox";
import { DragManager } from "../../util/DragManager";
import { Docs, DocUtils } from "../../documents/Documents";
import { List } from "../../../new_fields/List";
import { emptyFunction } from "../../../Utils";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { listSpec } from "../../../new_fields/Schema";
import { menuBar } from "prosemirror-menu";
import { AnnotationTypes } from "./PDFViewer";

interface IPageProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
    name: string;
    numPages: number;
    page: number;
    pageLoaded: (index: number, page: Pdfjs.PDFPageViewport) => void;
    parent: PDFBox;
    renderAnnotations: (annotations: Doc[], removeOld: boolean) => void;
    makePin: (x: number, y: number, page: number) => void;
    sendAnnotations: (annotations: HTMLDivElement[], page: number) => void;
    receiveAnnotations: (page: number) => HTMLDivElement[] | undefined;
    createAnnotation: (div: HTMLDivElement, page: number) => void;
    makeAnnotationDocuments: (doc: Doc) => Doc;
}

@observer
export default class Page extends React.Component<IPageProps> {
    @observable private _state: string = "N/A";
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _page: Opt<Pdfjs.PDFPageProxy>;
    @observable private _currPage: number = this.props.page + 1;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;
    @observable private _rotate: string = "";

    private _canvas: React.RefObject<HTMLCanvasElement>;
    private _textLayer: React.RefObject<HTMLDivElement>;
    private _annotationLayer: React.RefObject<HTMLDivElement>;
    private _marquee: React.RefObject<HTMLDivElement>;
    private _curly: React.RefObject<HTMLImageElement>;
    private _marqueeing: boolean = false;
    private _dragging: boolean = false;
    private _reactionDisposer?: IReactionDisposer;

    constructor(props: IPageProps) {
        super(props);
        this._canvas = React.createRef();
        this._textLayer = React.createRef();
        this._annotationLayer = React.createRef();
        this._marquee = React.createRef();
        this._curly = React.createRef();
    }

    componentDidMount = (): void => {
        if (this.props.pdf) {
            this.update(this.props.pdf);
        }
    }

    componentWillUnmount = (): void => {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
    }

    componentDidUpdate = (): void => {
        if (this.props.pdf) {
            this.update(this.props.pdf);
        }
    }

    private update = (pdf: Pdfjs.PDFDocumentProxy): void => {
        if (pdf) {
            this.loadPage(pdf);
        }
        else {
            this._state = "loading";
        }
    }

    private loadPage = (pdf: Pdfjs.PDFDocumentProxy): void => {
        if (this._state === "rendering" || this._page) return;

        pdf.getPage(this._currPage).then(
            (page: Pdfjs.PDFPageProxy): void => {
                this._state = "rendering";
                this.renderPage(page);
            }
        );
    }

    @action
    private renderPage = (page: Pdfjs.PDFPageProxy): void => {
        // lower scale = easier to read at small sizes, higher scale = easier to read at large sizes
        let scale = 2;
        let viewport = page.getViewport(scale);
        let canvas = this._canvas.current;
        let textLayer = this._textLayer.current;
        if (canvas && textLayer) {
            let ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            this._width = viewport.width;
            canvas.height = viewport.height;
            this._height = viewport.height;
            this.props.pageLoaded(this._currPage, viewport);
            if (ctx) {
                // renders the page onto the canvas context
                page.render({ canvasContext: ctx, viewport: viewport });
                // renders text onto the text container
                page.getTextContent().then((res: Pdfjs.TextContent): void => {
                    //@ts-ignore
                    Pdfjs.renderTextLayer({
                        textContent: res,
                        container: textLayer,
                        viewport: viewport
                    });
                });

                this._page = page;
            }
        }
    }

    /**
     * This is temporary for creating annotations from highlights. It will
     * start a drag event and create or put the necessary info into the drag event.
     */
    @action
    startDrag = (e: PointerEvent): void => {
        // the first 5 lines is a hack to prevent text selection while dragging
        e.preventDefault();
        e.stopPropagation();
        if (this._dragging) {
            return;
        }
        this._dragging = true;
        let thisDoc = this.props.parent.Document;
        // document that this annotation is linked to
        let targetDoc = Docs.TextDocument({ width: 200, height: 200, title: "New Annotation" });
        targetDoc.targetPage = this.props.page;
        // creates annotation documents for current highlights
        let annotationDoc = this.props.makeAnnotationDocuments(targetDoc);
        let targetAnnotations = DocListCast(this.props.parent.Document.annotations);
        if (targetAnnotations) {
            targetAnnotations.push(annotationDoc);
            this.props.parent.Document.annotations = new List<Doc>(targetAnnotations);
        }
        else {
            this.props.parent.Document.annotations = new List<Doc>([annotationDoc]);
        }
        // create dragData and star tdrag
        let dragData = new DragManager.AnnotationDragData(thisDoc, annotationDoc, targetDoc);
        if (this._textLayer.current) {
            DragManager.StartAnnotationDrag([this._textLayer.current], dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
    }

    // cleans up events and boolean
    endDrag = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.startDrag);
        document.removeEventListener("pointerup", this.endDrag);
        this._dragging = false;
        e.stopPropagation();
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        // if alt+left click, drag and annotate
        if (e.altKey && e.button === 0) {
            e.stopPropagation();

            document.removeEventListener("pointermove", this.startDrag);
            document.addEventListener("pointermove", this.startDrag);
            document.removeEventListener("pointerup", this.endDrag);
            document.addEventListener("pointerup", this.endDrag);
        }
        else if (e.button === 0) {
            let target: any = e.target;
            if (target && target.parentElement === this._textLayer.current) {
                e.stopPropagation();
            }
            else {
                e.stopPropagation();
                // set marquee x and y positions to the spatially transformed position
                let current = this._textLayer.current;
                if (current) {
                    let boundingRect = current.getBoundingClientRect();
                    this._marqueeX = (e.clientX - boundingRect.left) * (current.offsetWidth / boundingRect.width);
                    this._marqueeY = (e.clientY - boundingRect.top) * (current.offsetHeight / boundingRect.height);
                }
                this._marqueeing = true;
                if (this._marquee.current) this._marquee.current.style.opacity = "0.2";
            }
            document.removeEventListener("pointermove", this.onSelectStart);
            document.addEventListener("pointermove", this.onSelectStart);
            document.removeEventListener("pointerup", this.onSelectEnd);
            document.addEventListener("pointerup", this.onSelectEnd);
            if (!e.ctrlKey) {
                this.props.sendAnnotations([], -1);
            }
        }
    }

    @action
    onSelectStart = (e: PointerEvent): void => {
        let target: any = e.target;
        if (this._marqueeing) {
            let current = this._textLayer.current;
            if (current) {
                // transform positions and find the width and height to set the marquee to
                let boundingRect = current.getBoundingClientRect();
                this._marqueeWidth = (e.clientX - boundingRect.left) * (current.offsetWidth / boundingRect.width) - this._marqueeX;
                this._marqueeHeight = (e.clientY - boundingRect.top) * (current.offsetHeight / boundingRect.height) - this._marqueeY;
                let { background, opacity, transform: transform } = this.getCurlyTransform();
                if (this._marquee.current && this._curly.current) {
                    this._marquee.current.style.background = background;
                    this._curly.current.style.opacity = opacity;
                    this._rotate = transform;
                }
            }
            e.stopPropagation();
            e.preventDefault();
        }
        else if (target && target.parentElement === this._textLayer.current) {
            e.stopPropagation();
        }
    }

    getCurlyTransform = (): { background: string, opacity: string, transform: string } => {
        let background = "", opacity = "", transform = "";
        if (this._marquee.current && this._curly.current) {
            if (this._marqueeWidth > 100 && this._marqueeHeight > 100) {
                background = "red";
                opacity = "0";
            }
            else {
                background = "transparent";
                opacity = "1";
            }

            // split up for simplicity, could be done in a nested ternary. please do not. -syip2
            let ratio = this._marqueeWidth / this._marqueeHeight;
            if (ratio > 1.5) {
                // vertical
                transform = "rotate(90deg) scale(1, 5)";
            }
            else if (ratio < 0.5) {
                // horizontal
                transform = "scale(2, 1)";
            }
            else {
                // diagonal
                transform = "rotate(45deg) scale(1.5, 1.5)";
            }
        }
        return { background: background, opacity: opacity, transform: transform };
    }

    @action
    onSelectEnd = (): void => {
        if (this._marqueeing) {
            this._marqueeing = false;
            if (this._marquee.current) {
                let copy = document.createElement("div");
                // make a copy of the marquee
                copy.style.left = this._marquee.current.style.left;
                copy.style.top = this._marquee.current.style.top;
                copy.style.width = this._marquee.current.style.width;
                copy.style.height = this._marquee.current.style.height;

                // apply the appropriate background, opacity, and transform
                let { background, opacity, transform } = this.getCurlyTransform();
                copy.style.background = background;
                // if curly bracing, add a curly brace
                if (opacity === "1" && this._curly.current) {
                    copy.style.opacity = opacity;
                    let img = this._curly.current.cloneNode();
                    (img as any).style.opacity = opacity;
                    (img as any).style.transform = transform;
                    copy.appendChild(img);
                }
                else {
                    copy.style.opacity = this._marquee.current.style.opacity;
                }
                copy.className = this._marquee.current.className;
                this.props.createAnnotation(copy, this.props.page);
                this._marquee.current.style.opacity = "0";
            }

            this._marqueeHeight = this._marqueeWidth = 0;
        }
        else {
            let sel = window.getSelection();
            // if selecting over a range of things
            if (sel && sel.type === "Range") {
                let clientRects = sel.getRangeAt(0).getClientRects();
                if (this._textLayer.current) {
                    let boundingRect = this._textLayer.current.getBoundingClientRect();
                    for (let i = 0; i < clientRects.length; i++) {
                        let rect = clientRects.item(i);
                        if (rect) {
                            let annoBox = document.createElement("div");
                            annoBox.className = "pdfViewer-annotationBox";
                            // transforms the positions from screen onto the pdf div
                            annoBox.style.top = ((rect.top - boundingRect.top) * (this._textLayer.current.offsetHeight / boundingRect.height)).toString();
                            annoBox.style.left = ((rect.left - boundingRect.left) * (this._textLayer.current.offsetWidth / boundingRect.width)).toString();
                            annoBox.style.width = (rect.width * this._textLayer.current.offsetWidth / boundingRect.width).toString();
                            annoBox.style.height = (rect.height * this._textLayer.current.offsetHeight / boundingRect.height).toString();
                            this.props.createAnnotation(annoBox, this.props.page);
                        }
                    }
                }
                // clear selection
                if (sel.empty) {  // Chrome
                    sel.empty();
                } else if (sel.removeAllRanges) {  // Firefox
                    sel.removeAllRanges();
                }
            }
        }
        document.removeEventListener("pointermove", this.onSelectStart);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }

    doubleClick = (e: React.MouseEvent) => {
        let target: any = e.target;
        // if double clicking text
        if (target && target.parentElement === this._textLayer.current) {
            // do something to select the paragraph ideally
        }

        let current = this._textLayer.current;
        if (current) {
            let boundingRect = current.getBoundingClientRect();
            let x = (e.clientX - boundingRect.left) * (current.offsetWidth / boundingRect.width);
            let y = (e.clientY - boundingRect.top) * (current.offsetHeight / boundingRect.height);
            this.props.makePin(x, y, this.props.page);
        }
    }

    render() {
        return (
            <div onPointerDown={this.onPointerDown} onDoubleClick={this.doubleClick} className={this.props.name} style={{ "width": this._width, "height": this._height }}>
                <div className="canvasContainer">
                    <canvas ref={this._canvas} />
                </div>
                <div className="pdfInkingLayer-cont" ref={this._annotationLayer} style={{ width: "100%", height: "100%", position: "relative", top: "-100%" }}>
                    <div className="pdfViewer-annotationBox" ref={this._marquee}
                        style={{ left: `${this._marqueeX}px`, top: `${this._marqueeY}px`, width: `${this._marqueeWidth}px`, height: `${this._marqueeHeight}px`, background: "transparent" }}>
                        <img ref={this._curly} src="https://static.thenounproject.com/png/331760-200.png" style={{ width: "100%", height: "100%", transform: `${this._rotate}` }} />
                    </div>
                </div>
                <div className="textlayer" ref={this._textLayer} style={{ "position": "relative", "top": `-${2 * this._height}px`, "height": `${this._height}px` }} />
            </div>
        );
    }
}
