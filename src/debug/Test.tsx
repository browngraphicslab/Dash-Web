import * as React from 'react';
import * as ReactDOM from 'react-dom';
// import { Document, Page, Pdf } from "react-pdf/dist/entry.webpack";
import { computed, observable, action } from 'mobx';
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

class PDFTest extends React.Component {
    render() {
        return <PDFViewer />;
    }
}

@observer
class PDFViewer extends React.Component {
    @observable _pdf: Opt<Pdfjs.PDFDocumentProxy>;

    @action
    componentDidMount() {
        const pdfUrl = "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";
        let promise = Pdfjs.getDocument(pdfUrl).promise;

        promise.then((pdf: Pdfjs.PDFDocumentProxy) => {
            this._pdf = pdf;
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
    index: number;
    name: string;
}

@observer
class Page extends React.Component<IPageProps> {
    @observable _state: string = "N/A";
    @observable _width: number = 0;
    @observable _height: number = 0;
    @observable _page: Opt<Pdfjs.PDFPageProxy>;
    canvas: React.RefObject<HTMLCanvasElement>;
    textLayer: React.RefObject<HTMLDivElement>;

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

        pdf.getPage(this.props.index).then(
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
                });

                this._state = "rendered";
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
                <div className="textlayer" ref={this.textLayer} />
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
                <Page
                    pdf={this.props.pdf}
                    index={1}
                    key={`${this.props.pdf ? this.props.pdf.fingerprint : "undefined"}-page-${1}`}
                    name={`${this.props.pdf ? this.props.pdf.fingerprint : "undefined"}-page-${1}`}
                    {...this.props}
                />
                {/* ))} */}
            </div>
        );
    }
}

ReactDOM.render((
    <PDFTest />),
    document.getElementById('root')
);