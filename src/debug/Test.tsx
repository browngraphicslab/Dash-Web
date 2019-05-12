import * as React from 'react';
import * as ReactDOM from 'react-dom';
// import { Document, Page, Pdf } from "react-pdf/dist/entry.webpack";
import { computed, observable, action, runInAction } from 'mobx';
import Measure from 'react-measure';
import { RouteStore } from '../server/RouteStore';
import { observer } from 'mobx-react';
import * as Pdfjs from 'pdfjs-dist';
import 'pdfjs-dist/web/pdf_viewer.css';
import { Opt } from '../fields/Field';
import "./Test.scss";

const options = {
    cMapUrl: 'cmaps/',
    cMapPacked: true
};

// @observer
// class Test extends React.Component {
//     @observable private file: string = 'http://projects.wojtekmaj.pl/react-pdf/static/sample.pdf';
//     // @observable private file: string = 'http://www.pdf995.com/samples/pdf.pdf';
//     @observable private numPages: number = 2;

//     @action
//     onFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
//         if (event && event.target.files) {
//             let file = event.target.files.item(0);
//             if (file) {
//                 this.file = file.name;
//             }
//         }
//     }

//     onDocumentLoadSuccess = (pdf: Pdf) => {
//         if (pdf) {
//             this.numPages = pdf.numPages;
//         }
//     }

//     render() {
//         // let pdfUrl = "file:///C:/Users/Test/Desktop/layout.pdf";
//         // let pdfUrl = "http://cs.brown.edu/people/bcz/prairie.jpg";
//         let pdfUrl = new URL("http://www.pdf995.com/samples/pdf.pdf");
//         return (
//             <div className="Example">
//                 <header>
//                     <h1>react-pdf sample page</h1>
//                 </header>
//                 <div className="Example__container">
//                     <div className="Example__container__load">
//                         <label htmlFor="file">Load from file:</label>
//                         {' '}
//                         <input
//                             type="file"
//                             onChange={this.onFileChange}
//                         />
//                     </div>
//                     <div className="Example__container__document">
//                         <Document
//                             file={this.file}
//                             onLoadSuccess={this.onDocumentLoadSuccess}
//                             onSourceError={(error: Error) => {
//                                 console.log(error);
//                             }}
//                         >
//                             {
//                                 Array.from(
//                                     new Array(this.numPages),
//                                     (el, index) => (
//                                         <Page
//                                             key={`page_${index + 1}`}
//                                             pageNumber={index + 1}
//                                             onRenderError={(error: Error) => console.log(error)}
//                                         />
//                                     ),
//                                 )
//                             }
//                         </Document>
//                     </div>
//                 </div>
//             </div>
//         );
//     }
// }

export class PDFTest extends React.Component {
    render() {
        return <PDFViewer />;
    }
}

@observer
class PDFViewer extends React.Component {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;

    @action
    componentDidMount() {
        const pdfUrl = window.origin + RouteStore.corsProxy + "/https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
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

interface IPageProps {
    pdf: Opt<Pdfjs.PDFDocumentProxy>;
    name: string;
    numPages: number;
}

@observer
class Page2 extends React.Component<IPageProps> {
    @observable _state: string = "N/A";
    @observable _width: number = 0;
    @observable _height: number = 0;
    @observable _page: Opt<Pdfjs.PDFPageProxy>;
    canvas: React.RefObject<HTMLCanvasElement>;
    textLayer: React.RefObject<HTMLDivElement>;
    @observable _currPage: number = 1;

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

    @action
    prevPage = (e: React.MouseEvent) => {
        if (this._currPage > 2 && this._state !== "rendering") {
            this._currPage = Math.max(this._currPage - 1, 1);
            this._page = undefined;
            this.loadPage(this.props.pdf!);
            this._state = "rendering";
        }
    }

    @action
    nextPage = (e: React.MouseEvent) => {
        if (this._currPage < this.props.numPages - 1 && this._state !== "rendering") {
            this._currPage = Math.min(this._currPage + 1, this.props.numPages)
            this._page = undefined;
            this.loadPage(this.props.pdf!);
            this._state = "rendering";
        }
    }

    render() {
        return (
            <div className={this.props.name} style={{ "width": this._width, "height": this._height }}>
                <div className="canvasContainer">
                    <canvas ref={this.canvas} />
                </div>
                <div className="textlayer" ref={this.textLayer} />
                <div className="viewer-button-cont" style={{ "width": this._width / 10, "height": this._height / 20, "left": this._width * .9, "top": this._height * .95 }}>
                    <div className="viewer-previousPage" onClick={this.prevPage}>&lt;</div>
                    <div className="viewer-nextPage" onClick={this.nextPage}>&gt;</div>
                </div>
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
                {/* {Array.from(Array(numPages).keys()).map((i) => ( */}
                <Page2
                    pdf={this.props.pdf}
                    numPages={numPages}
                    key={`${this.props.pdf ? this.props.pdf.fingerprint : "undefined"}`}
                    name={`${this.props.pdf ? this.props.pdf.fingerprint : "undefined"}`}
                    {...this.props}
                />
                {/* ))} */}
            </div>
        );
    }
}
import "./../client/views/nodes/DocumentView.scss";

ReactDOM.render((
    <div className={`documentView-node`}
        style={{
            borderRadius: "inherit",
            width: "100%", height: "100%",
            transform: `scale(50%, 50%)`
        }}
    >
        <PDFTest />
    </div>
),
    document.getElementById('root')
);