import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, computed, IReactionDisposer, reaction } from "mobx";
import { RouteStore } from "../../../server/RouteStore";
import * as Pdfjs from "pdfjs-dist";
import * as htmlToImage from "html-to-image";
import { Opt } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { number } from "prop-types";
import { JSXElement } from "babel-types";
import { PDFBox } from "../nodes/PDFBox";
import { NumCast, FieldValue } from "../../../new_fields/Types";
import { SearchBox } from "../SearchBox";
import { Utils } from "../../../Utils";
import { Id } from "../../../new_fields/FieldSymbols";
import { DocServer } from "../../DocServer";
import { ImageField } from "../../../new_fields/URLField";
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
                <Viewer pdf={this._pdf} loaded={this.props.loaded} scrollY={this.props.scrollY} parent={this.props.parent} mainCont={this._mainDiv} />
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

    @computed private get thumbnailY() { return NumCast(this.props.parent.Document.thumbnailY, -1); }

    componentDidMount = () => {
        let wasSelected = this.props.parent.props.isSelected();
        this._reactionDisposer = reaction(
            () => [this.props.parent.props.isSelected(), this.startIndex],
            () => {
                if (this.startIndex >= 0 && !this.props.parent.props.isTopMost && this.scrollY !== this.thumbnailY && wasSelected && !this.props.parent.props.isSelected()) {
                    this.saveThumbnail();
                }
                wasSelected = this.props.parent.props.isSelected();
            },
            { fireImmediately: true }
        );
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        this.renderPages(0, numPages - 1, true);
    }

    saveThumbnail = () => {
        this.props.parent.props.Document.thumbnailY = FieldValue(this.scrollY, 0);
        this._renderAsSvg = false;
        setTimeout(() => {
            let nwidth = FieldValue(this.props.parent.Document.nativeWidth, 0);
            htmlToImage.toPng(this.props.mainCont.current!, { width: nwidth, height: nwidth, quality: 0.8, })
                .then(action((dataUrl: string) => {
                    SearchBox.convertDataUri(dataUrl, `icon${this.props.parent.Document[Id]}_${this.startIndex}`).then((returnedFilename) => {
                        if (returnedFilename) {
                            let url = DocServer.prepend(returnedFilename);
                            this.props.parent.props.Document.thumbnail = new ImageField(new URL(url));
                        }
                        runInAction(() => this._renderAsSvg = true);
                    });
                }))
                .catch(function (error: any) {
                    console.error("Oops, something went wrong!", error);
                });
        }, 1250);
    }

    @computed get scrollY(): number {
        return this.props.scrollY;
    }

    @computed get imageProxyRenderer() {
        let thumbField = this.props.parent.props.Document.thumbnail;
        if (thumbField && this._renderAsSvg && NumCast(this.props.parent.props.Document.startY, 0) === this.scrollY) {
            let pw = typeof this.props.parent.props.PanelWidth === "function" ? this.props.parent.props.PanelWidth() : typeof this.props.parent.props.PanelWidth === "number" ? (this.props.parent.props.PanelWidth as any) as number : 50;
            let path = thumbField instanceof ImageField ? thumbField.url.href : "http://cs.brown.edu/people/bcz/prairie.jpg";
            let field = thumbField;
            if (field instanceof ImageField) path = this.choosePath(field.url);
            return <img className="pdfBox-thumbnail" key={path} src={path} onError={this.onError} />;
        }
    }

    @action onError = () => {
    }

    choosePath(url: URL) {
        if (url.protocol === "data" || url.href.indexOf(window.location.origin) === -1) {
            return url.href;
        }
        let ext = path.extname(url.href);
        ///TODO: Not done lol - syip2
        return url.href;
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

        for (let i = startIndex; i <= endIndex; i++) {
            if (this._isPage[i] && forceRender) {
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
            else if (!this._isPage[i]) {
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

        for (let i = 0; i < numPages; i++) {
            if (i < startIndex || i > endIndex) {
                if (this._isPage[i]) {
                    this._visibleElements[i] = (
                        <div key={`pdfviewer-placeholder-${i}`} className="pdfviewer-placeholder" style={{ width: this._pageSizes[i] ? this._pageSizes[i].width : 0, height: this._pageSizes[i] ? this._pageSizes[i].height : 0 }} />
                    );
                    this._isPage[i] = false;
                }
            }
        }

        return;
    }

    getIndex = (vOffset: number) => {
        if (this._loaded) {
            let index = 0;
            let currOffset = vOffset;
            while (currOffset - this._pageSizes[index].height > 0) {
                currOffset -= this._pageSizes[index].height;
                index++;
            }
            return index;
        }
        return 0;
    }

    @action
    pageLoaded = (index: number, page: Pdfjs.PDFPageViewport): void => {
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
                {this._renderAsSvg ? this.imageProxyRenderer : this._visibleElements}
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
        if (canvas) {
            let context = canvas.getContext("2d");
            canvas.width = viewport.width;
            this._width = viewport.width;
            canvas.height = viewport.height;
            this._height = viewport.height;
            this.props.pageLoaded(this._currPage, viewport);
            if (context) {
                page.render({ canvasContext: context, viewport: viewport });
                page.getTextContent().then((res: Pdfjs.TextContent) => {
                    //@ts-ignore
                    let textLayer = Pdfjs.renderTextLayer({
                        textContent: res,
                        container: this.textLayer.current,
                        viewport: viewport
                    });
                    // textLayer._render();
                    this._state = "rendered";
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