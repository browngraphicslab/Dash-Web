import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, computed, IReactionDisposer, reaction } from "mobx";
import { RouteStore } from "../../../server/RouteStore";
import * as Pdfjs from "pdfjs-dist";
import * as htmlToImage from "html-to-image";
import { Opt, WidthSym } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { number } from "prop-types";
import { JSXElement } from "babel-types";
import { PDFBox } from "../nodes/PDFBox";
import { NumCast, FieldValue, Cast } from "../../../new_fields/Types";
import { SearchBox } from "../SearchBox";
import { Utils } from "../../../Utils";
import { Id } from "../../../new_fields/FieldSymbols";
import { DocServer } from "../../DocServer";
import { ImageField, PdfField } from "../../../new_fields/URLField";
var path = require("path");

interface IPDFViewerProps {
    url: string;
    loaded: (nw: number, nh: number) => void;
    scrollY: number;
    parent: PDFBox;
}

@observer
export class PDFViewer extends React.Component<IPDFViewerProps> {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    private _mainDiv = React.createRef<HTMLDivElement>();

    @action
    componentDidMount() {
        // const pdfUrl = window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
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

@observer
class Viewer extends React.Component<IViewerProps> {
    @observable.shallow private _visibleElements: JSX.Element[] = [];
    @observable private _isPage: boolean[] = [];
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _startIndex: number = 0;
    @observable private _endIndex: number = 1;
    @observable private _loaded: boolean = false;
    @observable private _pdf: Opt<Pdfjs.PDFDocumentProxy>;
    @observable private _renderAsSvg = false;

    private _pageBuffer: number = 1;
    private _reactionDisposer?: IReactionDisposer;
    private _widthReactionDisposer?: IReactionDisposer;
    private _width: number = 0;

    componentDidMount = () => {
        let wasSelected = this.props.parent.props.isSelected();
        this._reactionDisposer = reaction(
            () => [this.props.parent.props.isSelected(), this.startIndex],
            () => {
                if (wasSelected && !this.props.parent.props.isSelected()) {
                    this.saveThumbnail();
                }
                else if (!wasSelected && this.props.parent.props.isSelected()) {
                    this.renderPages(this.startIndex, this.endIndex, true);
                }
                wasSelected = this.props.parent.props.isSelected();
            },
            { fireImmediately: true }
        );

        // this._widthReactionDisposer = reaction(
        //     () => [this._docWidth],
        //     () => {
        //         if (this._width !== this._docWidth) {
        //             this._width = this._docWidth;
        //             this.renderPages(this.startIndex, this.endIndex, true);
        //             console.log(this._width);
        //         }
        //     },
        //     { fireImmediately: true }
        // )

        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        setTimeout(() => this.renderPages(this.startIndex, this.endIndex, true), 1000);
    }

    componentWillUnmount = () => {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
    }

    @action
    saveThumbnail = () => {
        const address: string = this.props.url;
        console.log(address);
        for (let i = 0; i < this._visibleElements.length; i++) {
            if (this._isPage[i]) {
                let thisAddress = `${address.substring(0, address.length - ".pdf".length)}-${i + 1}.PNG`;
                let nWidth = this._pageSizes[i].width;
                let nHeight = this._pageSizes[i].height;
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
            this.renderPages(this.startIndex, this.endIndex);
        }
    }

    @action
    renderPages = (startIndex: number, endIndex: number, forceRender: boolean = false) => {
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        if (!this.props.pdf) {
            return;
        }

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

        if (startIndex === this._startIndex && endIndex === this._endIndex && !forceRender) {
            return;
        }

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
        console.log(`START: ${this.startIndex}`);
        console.log(`END: ${this.endIndex}`)
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        return (
            <div className="viewer">
                {/* {Array.from(Array(numPages).keys()).map((i) => (
                    <Page
                        pdf={this.props.pdf}
                        page={i}
                        numPages={numPages}
                        key={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        name={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        pageLoaded={this.pageLoaded}
                        {...this.props}
                    />
                ))} */}
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
    @observable _state: string = "N/A";
    @observable _width: number = 0;
    @observable _height: number = 0;
    @observable _page: Opt<Pdfjs.PDFPageProxy>;
    canvas: React.RefObject<HTMLCanvasElement>;
    textLayer: React.RefObject<HTMLDivElement>;
    @observable _currPage: number = this.props.page + 1;

    constructor(props: IPageProps) {
        super(props);
        this.canvas = React.createRef();
        this.textLayer = React.createRef();
    }

    componentDidMount() {
        console.log(this.props.pdf);
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
        let canvas = this.canvas.current;
        let textLayer = this.textLayer.current;
        if (canvas && textLayer) {
            let ctx = canvas.getContext("2d");
            canvas.width = viewport.width;
            this._width = viewport.width;
            canvas.height = viewport.height;
            this._height = viewport.height;
            this.props.pageLoaded(this._currPage, viewport);
            if (ctx) {
                page.render({ canvasContext: ctx, viewport: viewport })
                page.getTextContent().then((res: Pdfjs.TextContent) => {
                    //@ts-ignore
                    Pdfjs.renderTextLayer({
                        textContent: res,
                        container: textLayer,
                        viewport: viewport
                    });
                    // textLayer._render();
                });

                this._page = page;
            }
        }
    }

    onPointerDown = (e: React.PointerEvent) => {
        console.log("down");
        e.stopPropagation();
    }

    onPointerMove = (e: React.PointerEvent) => {
        console.log("move")
        e.stopPropagation();
    }

    render() {
        return (
            <div onPointerDown={this.onPointerDown} onPointerMove={this.onPointerMove} className={this.props.name} style={{ "width": this._width, "height": this._height }}>
                <div className="canvasContainer">
                    <canvas ref={this.canvas} />
                </div>
                <div className="textlayer" ref={this.textLayer} style={{ "position": "relative", "top": `-${this._height}px`, "height": `${this._height}px` }} />
            </div>
        );
    }
}