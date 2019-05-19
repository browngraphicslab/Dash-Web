import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction } from "mobx";
import { RouteStore } from "../../../server/RouteStore";
import * as Pdfjs from "pdfjs-dist";
import { Opt } from "../../../new_fields/Doc";
import "./PDFViewer.scss";

interface IPDFViewerProps {
    url: string;
}

@observer
export class PDFViewer extends React.Component<IPDFViewerProps> {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;

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
        console.log("PDFVIEWER");
        console.log(this._pdf);
        return (
            <div>
                <Viewer pdf={this._pdf} />
            </div>
        );
    }
}

interface IViewerProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
}

class Viewer extends React.Component<IViewerProps> {
    render() {
        console.log("VIEWER");
        let numPages = this.props.pdf ? this.props.pdf.numPages : 0;
        console.log(numPages);
        return (
            <div className="viewer">
                {Array.from(Array(numPages).keys()).map((i) => (
                    <Page
                        pdf={this.props.pdf}
                        numPages={numPages}
                        page={i}
                        key={`${this.props.pdf ? this.props.pdf.fingerprint + `page${i}` : "undefined"}`}
                        name={`${this.props.pdf ? this.props.pdf.fingerprint + `page${i}` : "undefined"}`}
                        {...this.props}
                    />
                ))} }
            </div>
        );
    }
}

interface IPageProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
    name: string;
    numPages: number;
    page: number;
}

@observer
class Page extends React.Component<IPageProps> {
    @observable _state: string = "N/A";
    @observable _width: number = 0;
    @observable _height: number = 0;
    @observable _page: Opt<Pdfjs.PDFPageProxy>;
    canvas: React.RefObject<HTMLCanvasElement>;
    textLayer: React.RefObject<HTMLDivElement>;
    @observable _currPage: number = this.props.page;

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
                console.log("PAGE");
                console.log(page);
                this._state = "rendering";
                this.renderPage(page);
            }
        )
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

    render() {
        return (
            <div className={this.props.name} style={{ "width": this._width, "height": this._height }}>
                <div className="canvasContainer">
                    <canvas ref={this.canvas} />
                </div>
                <div className="textlayer" style={{ "position": "relative", "top": `-${this._height}px`, "height": `${this._height}px` }} ref={this.textLayer} />
            </div>
        );
    }
}