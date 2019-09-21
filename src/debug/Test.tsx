import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { DocServer } from '../client/DocServer';
import { Doc } from '../new_fields/Doc';
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Utils } from '../Utils';
import { scale } from '../client/views/pdf/PDFViewer';
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");

const protoId = "protoDoc";
const delegateId = "delegateDoc";
class Test extends React.Component {
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _pageSizes: Array<{ width: number, height: number }> = [];
    _pdfViewer: PDFJSViewer.PDFViewer;
    _pdfFindController: PDFJSViewer.PDFFindController;
    _page: number = 0;

    componentDidMount = () => {
        let pdfUrl = Utils.CorsProxy("https://www.hq.nasa.gov/alsj/a17/A17_FlightPlan.pdf");
        Pdfjs.getDocument(pdfUrl).promise.then(async pdf => {
            if (this._mainCont.current) {
                let simpleLinkService = new SimpleLinkService(this);
                this._pdfViewer = new PDFJSViewer.PDFViewer({
                    container: this._mainCont.current,
                    viewer: this._viewer.current,
                    linkService: simpleLinkService
                });
                simpleLinkService.setPDFJSview(this._pdfViewer);
                this._mainCont.current.addEventListener("pagesinit", () => {
                    this._pdfViewer.currentScaleValue = 1;
                    console.log(this._pdfViewer);
                });
                this._mainCont.current.addEventListener("pagerendered", () => console.log("rendered"));
                this._pdfViewer.setDocument(pdf);
                this._pageSizes = Array<{ width: number, height: number }>(pdf.numPages);
                this._pdfFindController = new PDFJSViewer.PDFFindController(this._pdfViewer);
                this._pdfViewer.findController = this._pdfFindController;
                await Promise.all(this._pageSizes.map<Pdfjs.PDFPromise<any>>((val, i) =>
                    pdf.getPage(i + 1).then((page: Pdfjs.PDFPageProxy) => {
                        this._pageSizes.splice(i, 1, {
                            width: (page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]) * scale,
                            height: (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0]) * scale
                        });
                    }
                    )));
            }
        });
    }

    goToPage = (page: number) => {
        if (this._mainCont.current) {
            // this._mainCont.current.scrollTo()
        }
    }

    render() {
        return (
            <div ref={this._mainCont}>
                <div ref={this._viewer} />
            </div>
        )
    }
}

class SimpleLinkService {
    _viewer: Test;
    _pdfjsView: any;

    constructor(viewer: Test) {
        this._viewer = viewer;
    }
    setPDFJSview(v: any) { this._pdfjsView = v; }

    navigateTo() { }

    getDestinationHash() { return "#"; }

    getAnchorUrl() { return "#"; }

    setHash() { }

    isPageVisible(page: number) { return true; }

    executeNamedAction() { }

    cachePageRef() { }

    get pagesCount() { return this._viewer._pdfViewer.pagesCount; }

    get page() { return this._viewer._page; }
    set page(p: number) {
        this._pdfjsView._ensurePdfPageLoaded(this._pdfjsView._pages[p - 1]).then(() => {
            this._pdfjsView.renderingQueue.renderView(this._pdfjsView._pages[p - 1]);
            if (this._viewer.goToPage) {
                this._viewer.goToPage(p);
            }
        });
    }


    get rotation() { return 0; }
    set rotation(value: any) { }
}

DocServer.init(window.location.protocol, window.location.hostname, 4321, "test");
ReactDOM.render(
    <Test />,
    document.getElementById('root')
);