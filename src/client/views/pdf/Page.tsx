import { action, IReactionDisposer, observable } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Doc, DocListCastAsync, Opt, WidthSym } from "../../../new_fields/Doc";
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Docs, DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import PDFMenu from "./PDFMenu";
import { scale } from "./PDFViewer";
import "./Page.scss";
import React = require("react");


interface IPageProps {
    size: { width: number, height: number };
    pdf: Pdfjs.PDFDocumentProxy;
    name: string;
    numPages: number;
    page: number;
    pageLoaded: (page: Pdfjs.PDFPageViewport) => void;
    fieldExtensionDoc: Doc;
    Document: Doc;
    renderAnnotations: (annotations: Doc[], removeOld: boolean) => void;
    sendAnnotations: (annotations: HTMLDivElement[], page: number) => void;
    createAnnotation: (div: HTMLDivElement, page: number) => void;
    makeAnnotationDocuments: (doc: Doc | undefined, color: string, linkTo: boolean) => Doc;
    getScrollFromPage: (page: number) => number;
    setSelectionText: (text: string) => void;
}

@observer
export default class Page extends React.Component<IPageProps> {
    @observable private _state: "N/A" | "rendering" = "N/A";
    @observable private _width: number = this.props.size.width;
    @observable private _height: number = this.props.size.height;
    @observable private _page: Opt<Pdfjs.PDFPageProxy>;
    @observable private _currPage: number = this.props.page + 1;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;

    private _canvas: React.RefObject<HTMLCanvasElement> = React.createRef();
    private _textLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _marquee: React.RefObject<HTMLDivElement> = React.createRef();
    private _marqueeing: boolean = false;
    private _reactionDisposer?: IReactionDisposer;
    private _startY: number = 0;
    private _startX: number = 0;

    componentDidMount = (): void => this.loadPage(this.props.pdf);

    componentDidUpdate = (): void => this.loadPage(this.props.pdf);

    componentWillUnmount = (): void => this._reactionDisposer && this._reactionDisposer();

    loadPage = (pdf: Pdfjs.PDFDocumentProxy): void => {
        pdf.getPage(this._currPage).then(page => this.renderPage(page));
    }

    @action
    renderPage = (page: Pdfjs.PDFPageProxy): void => {
        // lower scale = easier to read at small sizes, higher scale = easier to read at large sizes
        if (this._state !== "rendering" && !this._page && this._canvas.current && this._textLayer.current) {
            this._state = "rendering";
            let viewport = page.getViewport(scale as any);
            this._canvas.current.width = this._width = viewport.width;
            this._canvas.current.height = this._height = viewport.height;
            this.props.pageLoaded(viewport);
            let ctx = this._canvas.current.getContext("2d");
            if (ctx) {
                page.render({ canvasContext: ctx, viewport: viewport }); // renders the page onto the canvas context
                page.getTextContent().then(res =>                   // renders text onto the text container
                    //@ts-ignore
                    Pdfjs.renderTextLayer({
                        textContent: res,
                        container: this._textLayer.current,
                        viewport: viewport
                    }));

                this._page = page;
            }
        }
    }

    @action
    highlight = (targetDoc: Doc | undefined, color: string) => {
        // creates annotation documents for current highlights
        let annotationDoc = this.props.makeAnnotationDocuments(targetDoc, color, false);
        Doc.AddDocToList(this.props.fieldExtensionDoc, "annotations", annotationDoc);
        return annotationDoc;
    }

    /**
     * This is temporary for creating annotations from highlights. It will
     * start a drag event and create or put the necessary info into the drag event.
     */
    @action
    startDrag = (e: PointerEvent, ele: HTMLElement): void => {
        e.preventDefault();
        e.stopPropagation();
        if (this._textLayer.current) {
            let targetDoc = Docs.Create.TextDocument({ width: 200, height: 200, title: "New Annotation" });
            targetDoc.targetPage = this.props.page;
            let annotationDoc = this.highlight(undefined, "red");
            annotationDoc.linkedToDoc = false;
            let dragData = new DragManager.AnnotationDragData(this.props.Document, annotationDoc, targetDoc);
            DragManager.StartAnnotationDrag([ele], dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: async () => {
                        if (!BoolCast(annotationDoc.linkedToDoc)) {
                            let annotations = await DocListCastAsync(annotationDoc.annotations);
                            annotations && annotations.forEach(anno => anno.target = targetDoc);
                            DocUtils.MakeLink(annotationDoc, targetDoc, dragData.targetContext, `Annotation from ${StrCast(this.props.Document.title)}`);
                        }
                    }
                },
                hideSource: false
            });
        }
    }

    // cleans up events and boolean
    endDrag = (e: PointerEvent): void => {
        e.stopPropagation();
    }

    createSnippet = (marquee: { left: number, top: number, width: number, height: number }): void => {
        let view = Doc.MakeAlias(this.props.Document);
        let data = Doc.MakeDelegate(Doc.GetProto(this.props.Document));
        data.title = StrCast(data.title) + "_snippet";
        view.proto = data;
        view.nativeHeight = marquee.height;
        view.height = (this.props.Document[WidthSym]() / NumCast(this.props.Document.nativeWidth)) * marquee.height;
        view.nativeWidth = this.props.Document.nativeWidth;
        view.startY = marquee.top + this.props.getScrollFromPage(this.props.page);
        view.width = this.props.Document[WidthSym]();
        DragManager.StartDocumentDrag([], new DragManager.DocumentDragData([view], [undefined]), 0, 0);
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        // if alt+left click, drag and annotate
        if (NumCast(this.props.Document.scale, 1) !== 1) return;
        if (!e.altKey && e.button === 0) {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
            PDFMenu.Instance.Snippet = this.createSnippet;
            PDFMenu.Instance.Status = "pdf";
            PDFMenu.Instance.fadeOut(true);
            if (e.target && (e.target as any).parentElement === this._textLayer.current) {
                e.stopPropagation();
                if (!e.ctrlKey) {
                    this.props.sendAnnotations([], -1);
                }
            }
            else {
                // set marquee x and y positions to the spatially transformed position
                if (this._textLayer.current) {
                    let boundingRect = this._textLayer.current.getBoundingClientRect();
                    this._startX = this._marqueeX = (e.clientX - boundingRect.left) * (this._textLayer.current.offsetWidth / boundingRect.width);
                    this._startY = this._marqueeY = (e.clientY - boundingRect.top) * (this._textLayer.current.offsetHeight / boundingRect.height);
                }
                this._marqueeing = true;
                this._marquee.current && (this._marquee.current.style.opacity = "0.2");
                this.props.sendAnnotations([], -1);
            }
            document.removeEventListener("pointermove", this.onSelectStart);
            document.addEventListener("pointermove", this.onSelectStart);
            document.removeEventListener("pointerup", this.onSelectEnd);
            document.addEventListener("pointerup", this.onSelectEnd);
        }
    }

    @action
    onSelectStart = (e: PointerEvent): void => {
        if (this._marqueeing && this._textLayer.current) {
            // transform positions and find the width and height to set the marquee to
            let boundingRect = this._textLayer.current.getBoundingClientRect();
            this._marqueeWidth = ((e.clientX - boundingRect.left) * (this._textLayer.current.offsetWidth / boundingRect.width)) - this._startX;
            this._marqueeHeight = ((e.clientY - boundingRect.top) * (this._textLayer.current.offsetHeight / boundingRect.height)) - this._startY;
            this._marqueeX = Math.min(this._startX, this._startX + this._marqueeWidth);
            this._marqueeY = Math.min(this._startY, this._startY + this._marqueeHeight);
            this._marqueeWidth = Math.abs(this._marqueeWidth);
            e.stopPropagation();
            e.preventDefault();
        }
        else if (e.target && (e.target as any).parentElement === this._textLayer.current) {
            e.stopPropagation();
        }
    }

    @action
    onSelectEnd = (e: PointerEvent): void => {
        if (this._marqueeing) {
            this._marqueeing = false;
            if (this._marqueeWidth > 10 || this._marqueeHeight > 10) {
                if (this._marquee.current) { // make a copy of the marquee
                    let copy = document.createElement("div");
                    let style = this._marquee.current.style;
                    copy.style.left = style.left;
                    copy.style.top = style.top;
                    copy.style.width = style.width;
                    copy.style.height = style.height;
                    copy.style.border = style.border;
                    copy.style.opacity = style.opacity;
                    copy.className = "pdfPage-annotationBox";
                    this.props.createAnnotation(copy, this.props.page);
                    this._marquee.current.style.opacity = "0";
                }

                if (!e.ctrlKey) {
                    PDFMenu.Instance.Status = "snippet";
                    PDFMenu.Instance.Marquee = { left: this._marqueeX, top: this._marqueeY, width: this._marqueeWidth, height: this._marqueeHeight };
                }
                PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
            }

            this._marqueeHeight = this._marqueeWidth = 0;
        }
        else {
            let sel = window.getSelection();
            if (sel && sel.type === "Range") {
                let selRange = sel.getRangeAt(0);
                this.createTextAnnotation(sel, selRange);
                PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
            }
        }

        if (PDFMenu.Instance.Highlighting) {
            this.highlight(undefined, "goldenrod");
        }
        else {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
        }
        document.removeEventListener("pointermove", this.onSelectStart);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }

    @action
    createTextAnnotation = (sel: Selection, selRange: Range) => {
        if (this._textLayer.current) {
            let boundingRect = this._textLayer.current.getBoundingClientRect();
            let clientRects = selRange.getClientRects();
            for (let i = 0; i < clientRects.length; i++) {
                let rect = clientRects.item(i);
                if (rect && rect.width !== this._textLayer.current.getBoundingClientRect().width && rect.height !== this._textLayer.current.getBoundingClientRect().height) {
                    let annoBox = document.createElement("div");
                    annoBox.className = "pdfPage-annotationBox";
                    // transforms the positions from screen onto the pdf div
                    annoBox.style.top = ((rect.top - boundingRect.top) * (this._textLayer.current.offsetHeight / boundingRect.height)).toString();
                    annoBox.style.left = ((rect.left - boundingRect.left) * (this._textLayer.current.offsetWidth / boundingRect.width)).toString();
                    annoBox.style.width = (rect.width * this._textLayer.current.offsetWidth / boundingRect.width).toString();
                    annoBox.style.height = (rect.height * this._textLayer.current.offsetHeight / boundingRect.height).toString();
                    this.props.createAnnotation(annoBox, this.props.page);
                }
            }
        }
        let text = selRange.extractContents().textContent;
        text && this.props.setSelectionText(text);

        // clear selection
        if (sel.empty) {  // Chrome
            sel.empty();
        } else if (sel.removeAllRanges) {  // Firefox
            sel.removeAllRanges();
        }
    }

    doubleClick = (e: React.MouseEvent) => {
        if (e.target && (e.target as any).parentElement === this._textLayer.current) {
            // do something to select the paragraph ideally
        }
    }

    render() {
        return (
            <div className={"pdfPage-cont"} onPointerDown={this.onPointerDown} onDoubleClick={this.doubleClick} style={{ "width": this._width, "height": this._height }}>
                <canvas className="PdfPage-canvasContainer" ref={this._canvas} />
                <div className="pdfPage-dragAnnotationBox" ref={this._marquee}
                    style={{
                        left: `${this._marqueeX}px`, top: `${this._marqueeY}px`,
                        width: `${this._marqueeWidth}px`, height: `${this._marqueeHeight}px`,
                        border: `${this._marqueeWidth === 0 ? "" : "10px dashed black"}`
                    }}>
                </div>
                <div className="pdfPage-textlayer" ref={this._textLayer} />
            </div>);
    }
}