import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, computed, IReactionDisposer, reaction } from "mobx";
import * as Pdfjs from "pdfjs-dist";
import { Opt } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFBox } from "../nodes/PDFBox";

interface IPDFViewerProps {
    url: string;
    loaded: (nw: number, nh: number) => void;
    scrollY: number;
    parent: PDFBox;
}

/**
 * Wrapper that loads the PDF and cascades the pdf down
 */
@observer
export class PDFViewer extends React.Component<IPDFViewerProps> {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    private _mainDiv = React.createRef<HTMLDivElement>();

    @action
    componentDidMount() {
        const pdfUrl = this.props.url;
        let promise = Pdfjs.getDocument(pdfUrl).promise;

        promise.then((pdf: Pdfjs.PDFDocumentProxy) => {
            runInAction(() => this._pdf = pdf);
        });
    }

    render() {
        return (
            <div ref={this._mainDiv}>
                <Viewer pdf={this._pdf} loaded={this.props.loaded} scrollY={this.props.scrollY} parent={this.props.parent} mainCont={this._mainDiv} url={this.props.url} />
            </div>
        );
    }
}

interface IViewerProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
    loaded: (nw: number, nh: number) => void;
    scrollY: number;
    parent: PDFBox;
    mainCont: React.RefObject<HTMLDivElement>;
    url: string;
}

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
class Viewer extends React.Component<IViewerProps> {
    // _visibleElements is the array of JSX elements that gets rendered
    @observable.shallow private _visibleElements: JSX.Element[] = [];
    // _isPage is an array that tells us whether or not an index is rendered as a page or as a placeholder
    @observable private _isPage: boolean[] = [];
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _startIndex: number = 0;
    @observable private _endIndex: number = 1;
    @observable private _loaded: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;

    private _pageBuffer: number = 1;
    private _reactionDisposer?: IReactionDisposer;

    componentDidMount = () => {
        let wasSelected = this.props.parent.props.isSelected();
        // reaction for when document gets (de)selected
        this._reactionDisposer = reaction(
            () => [this.props.parent.props.isSelected(), this.startIndex],
            () => {
                // if deselected, render images in place of pdf
                if (wasSelected && !this.props.parent.props.isSelected()) {
                    this.saveThumbnail();
                }
                // if selected, render pdf
                else if (!wasSelected && this.props.parent.props.isSelected()) {
                    this.renderPages(this.startIndex, this.endIndex, true);
                }
                wasSelected = this.props.parent.props.isSelected();
            },
            { fireImmediately: true }
        );

        // On load, render pdf
        setTimeout(() => this.renderPages(this.startIndex, this.endIndex, true), 1000);
    }

    componentWillUnmount = () => {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
    }

    @action
    saveThumbnail = () => {
        // file address of the pdf
        const address: string = this.props.url;
        for (let i = 0; i < this._visibleElements.length; i++) {
            if (this._isPage[i]) {
                // change the address to be the file address of the PNG version of each page
                let thisAddress = `${address.substring(0, address.length - ".pdf".length)}-${i + 1}.PNG`;
                let nWidth = this._pageSizes[i].width;
                let nHeight = this._pageSizes[i].height;
                // replace page with image
                this._visibleElements[i] = <img key={thisAddress} style={{ width: `${nWidth}px`, height: `${nHeight}px` }} src={thisAddress} />;
            }
        }
    }

    @computed get scrollY(): number {
        return this.props.scrollY;
    }

    @computed get startIndex(): number {
        return Math.max(0, this.getIndex(this.scrollY) - this._pageBuffer);
    }

    @computed get endIndex(): number {
        let width = this._pageSizes.map(i => i.width);
        return Math.min(this.props.pdf ? this.props.pdf.numPages - 1 : 0, this.getIndex(this.scrollY + Math.max(...width)) + this._pageBuffer);
    }

    componentDidUpdate = (prevProps: IViewerProps) => {
        if (this.scrollY !== prevProps.scrollY || this._pdf !== this.props.pdf) {
            this._pdf = this.props.pdf;
            // render pages if the scorll position changes
            this.renderPages(this.startIndex, this.endIndex);
        }
    }

    /**
     * @param startIndex: where to start rendering pages
     * @param endIndex: where to end rendering pages
     * @param forceRender: (optional), force pdfs to re-render, even if the page already exists
     */
    @action
    renderPages = (startIndex: number, endIndex: number, forceRender: boolean = false) => {
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        if (!this.props.pdf) {
            return;
        }

        // this is only for an initial render to get all of the pages rendered
        if (this._visibleElements.length !== numPages) {
            let divs = Array.from(Array(numPages).keys()).map(i => (
                <Page
                    pdf={this.props.pdf}
                    page={i}
                    numPages={numPages}
                    key={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                    name={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                    pageLoaded={this.pageLoaded}
                    {...this.props} />
            ));
            let arr = Array.from(Array(numPages).keys()).map(i => false);
            this._visibleElements.push(...divs);
            this._isPage.push(...arr);
        }

        // if nothing changed, return
        if (startIndex === this._startIndex && endIndex === this._endIndex && !forceRender) {
            return;
        }

        // unrender pages outside of the pdf by replacing them with empty stand-in divs
        for (let i = 0; i < numPages; i++) {
            if (i < startIndex || i > endIndex) {
                if (this._isPage[i]) {
                    this._visibleElements[i] = (
                        <div key={`pdfviewer-placeholder-${i}`} className="pdfviewer-placeholder" style={{ width: this._pageSizes[i] ? this._pageSizes[i].width : 0, height: this._pageSizes[i] ? this._pageSizes[i].height : 0 }} />
                    );
                }
                this._isPage[i] = false;
            }
        }

        // render pages for any indices that don't already have pages (force rerender will make these render regardless)
        for (let i = startIndex; i <= endIndex; i++) {
            if (!this._isPage[i] || forceRender) {
                this._visibleElements[i] = (
                    <Page
                        pdf={this.props.pdf}
                        page={i}
                        numPages={numPages}
                        key={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        name={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        pageLoaded={this.pageLoaded}
                        {...this.props} />
                );
                this._isPage[i] = true;
            }
        }

        this._startIndex = startIndex;
        this._endIndex = endIndex;

        return;
    }

    // get the page index that the vertical offset passed in is on
    getIndex = (vOffset: number) => {
        if (this._loaded) {
            let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
            let index = 0;
            let currOffset = vOffset;
            while (index < numPages && currOffset - this._pageSizes[index].height > 0) {
                currOffset -= this._pageSizes[index].height;
                index++;
            }
            return index;
        }
        return 0;
    }

    /**
     * Called by the Page class when it gets rendered, initializes the lists and
     * puts a placeholder with all of the correct page sizes when all of the pages have been loaded.
     */
    @action
    pageLoaded = (index: number, page: Pdfjs.PDFPageViewport): void => {
        if (this._loaded) {
            return;
        }
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        this.props.loaded(page.width, page.height);
        if (index > this._pageSizes.length) {
            this._pageSizes.push({ width: page.width, height: page.height });
        }
        else {
            this._pageSizes[index - 1] = { width: page.width, height: page.height };
        }
        if (index === numPages) {
            this._loaded = true;
            let divs = Array.from(Array(numPages).keys()).map(i => (
                <div key={`pdfviewer-placeholder-${i}`} className="pdfviewer-placeholder" style={{ width: this._pageSizes[i] ? this._pageSizes[i].width : 0, height: this._pageSizes[i] ? this._pageSizes[i].height : 0 }} />
            ));
            this._visibleElements = new Array<JSX.Element>(...divs);
        }
    }

    render() {
        return (
            <div className="viewer">
                {this._visibleElements}
            </div>
        );
    }
}

interface IPageProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
    name: string;
    numPages: number;
    page: number;
    pageLoaded: (index: number, page: Pdfjs.PDFPageViewport) => void;
}

@observer
class Page extends React.Component<IPageProps> {
    @observable private _state: string = "N/A";
    @observable private _width: number = 0;
    @observable private _height: number = 0;
    @observable private _page: Opt<Pdfjs.PDFPageProxy>;
    @observable private _currPage: number = this.props.page + 1;

    private _canvas: React.RefObject<HTMLCanvasElement>;
    private _currentAnnotations: HTMLDivElement[] = [];
    private _textLayer: React.RefObject<HTMLDivElement>;

    constructor(props: IPageProps) {
        super(props);
        this._canvas = React.createRef();
        this._textLayer = React.createRef();
    }

    componentDidMount() {
        if (this.props.pdf) {
            this.update(this.props.pdf);
        }
    }

    componentDidUpdate() {
        if (this.props.pdf) {
            this.update(this.props.pdf);
        }
    }

    private update = (pdf: Pdfjs.PDFDocumentProxy) => {
        if (pdf) {
            this.loadPage(pdf);
        }
        else {
            this._state = "loading";
        }
    }

    private loadPage = (pdf: Pdfjs.PDFDocumentProxy) => {
        if (this._state === "rendering" || this._page) return;

        pdf.getPage(this._currPage).then(
            (page: Pdfjs.PDFPageProxy) => {
                this._state = "rendering";
                this.renderPage(page);
            }
        );
    }

    @action
    private renderPage = (page: Pdfjs.PDFPageProxy) => {
        let scale = 1;
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
                page.render({ canvasContext: ctx, viewport: viewport })
                // renders text onto the text container
                page.getTextContent().then((res: Pdfjs.TextContent) => {
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

    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0) {
            e.stopPropagation();
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);
            if (!e.ctrlKey) {
                for (let anno of this._currentAnnotations) {
                    anno.remove();
                }
            }
        }
    }

    onPointerMove = (e: PointerEvent) => {
        if (e.button === 0) {
            e.stopPropagation();
        }
    }

    startAnnotation = (e: DragEvent) => {
        console.log("drag starting");
    }

    pointerDownCancel = (e: PointerEvent) => {
        e.stopPropagation();
    }

    onPointerUp = (e: PointerEvent) => {
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
                        annoBox.ondragstart = this.startAnnotation;
                        annoBox.onpointerdown = this.pointerDownCancel;
                        this._textLayer.current.appendChild(annoBox);
                        this._currentAnnotations.push(annoBox);
                    }
                }
            }
        }
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        return (
            <div onPointerDown={this.onPointerDown} className={this.props.name} style={{ "width": this._width, "height": this._height }}>
                <div className="canvasContainer">
                    <canvas ref={this._canvas} />
                </div>
                <div className="textlayer" ref={this._textLayer} style={{ "position": "relative", "top": `-${this._height}px`, "height": `${this._height}px` }} />
            </div>
        );
    }
}