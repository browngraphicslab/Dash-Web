import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, computed, IReactionDisposer, reaction } from "mobx";
import * as Pdfjs from "pdfjs-dist";
import { Opt, HeightSym, WidthSym, Doc, DocListCast } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFBox } from "../nodes/PDFBox";
import Page from "./Page";
import { NumCast } from "../../../new_fields/Types";

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
    @observable private _annotations: Doc[] = [];

    private _pageBuffer: number = 1;
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;

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

        if (this.props.parent.Document) {
            this._annotationReactionDisposer = reaction(
                () => DocListCast(this.props.parent.Document.annotations),
                () => {
                    let annotations = DocListCast(this.props.parent.Document.annotations);
                    if (annotations && annotations.length) {
                        this.renderAnnotations(annotations, true);
                    }
                },
                { fireImmediately: true }
            );
        }

        // On load, render pdf
        setTimeout(() => this.renderPages(this.startIndex, this.endIndex, true), 1000);
    }

    componentWillUnmount = () => {
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
        if (this._annotationReactionDisposer) {
            this._annotationReactionDisposer();
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

    @action
    private renderAnnotations = (annotations: Doc[], removeOldAnnotations: boolean): void => {
        if (removeOldAnnotations) {
            this._annotations = annotations;
        }
        else {
            this._annotations.push(...annotations);
            this._annotations = new Array<Doc>(...this._annotations);
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
                    parent={this.props.parent}
                    renderAnnotations={this.renderAnnotations}
                    {...this.props} />
            ));
            let arr = Array.from(Array(numPages).keys()).map(() => false);
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
            if (!this._isPage[i] || (this._isPage[i] && forceRender)) {
                this._visibleElements[i] = (
                    <Page
                        pdf={this.props.pdf}
                        page={i}
                        numPages={numPages}
                        key={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        name={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${i + 1}` : "undefined"}`}
                        pageLoaded={this.pageLoaded}
                        parent={this.props.parent}
                        renderAnnotations={this.renderAnnotations}
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

    getPageHeight = (index: number): number => {
        let counter = 0;
        if (this.props.pdf && index < this.props.pdf.numPages) {
            for (let i = 0; i < index; i++) {
                if (this._pageSizes[i]) {
                    counter += this._pageSizes[i].height;
                }
            }
        }
        return counter;
    }

    render() {
        return (
            <div>
                <div className="viewer">
                    {this._visibleElements}
                </div>
                <div className="pdfViewer-annotationLayer" style={{ height: this.props.parent.Document.nativeHeight }}>
                    <div className="pdfViewer-annotationLayer-subCont" style={{ transform: `translateY(${-this.scrollY}px)` }}>
                        {this._annotations.map(anno => <RegionAnnotation x={NumCast(anno.x)} y={NumCast(anno.y) + this.getPageHeight(NumCast(anno.page))} width={anno[WidthSym]()} height={anno[HeightSym]()} />)}
                    </div>
                </div>
            </div>
        );
    }
}

interface IAnnotation {
    x: number;
    y: number;
    width: number;
    height: number;
}

class RegionAnnotation extends React.Component<IAnnotation> {
    onPointerDown = (e: React.PointerEvent) => {
        console.log("clicked!");
    }

    render() {
        return (
            <div className="pdfViewer-annotationBox" onPointerDown={this.onPointerDown} style={{ top: this.props.y, left: this.props.x, width: this.props.width, height: this.props.height }}></div>
        );
    }
}