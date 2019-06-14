import { observer } from "mobx-react";
import React = require("react");
import { observable, action, runInAction, computed, IReactionDisposer, reaction, trace } from "mobx";
import * as Pdfjs from "pdfjs-dist";
import { Opt, HeightSym, WidthSym, Doc, DocListCast } from "../../../new_fields/Doc";
import "./PDFViewer.scss";
import "pdfjs-dist/web/pdf_viewer.css";
import { PDFBox } from "../nodes/PDFBox";
import Page from "./Page";
import { NumCast, Cast, BoolCast, StrCast } from "../../../new_fields/Types";
import { Id } from "../../../new_fields/FieldSymbols";
import { DocUtils, Docs } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { SelectionManager } from "../../util/SelectionManager";
import { List } from "../../../new_fields/List";
import { DocumentContentsView } from "../nodes/DocumentContentsView";
import { CollectionFreeFormDocumentView } from "../nodes/CollectionFreeFormDocumentView";
import { Transform } from "../../util/Transform";
import { emptyFunction, returnTrue, returnFalse } from "../../../Utils";
import { DocumentView } from "../nodes/DocumentView";
import { DragManager } from "../../util/DragManager";
import { Dictionary } from "typescript-collections";

export const scale = 2;
interface IPDFViewerProps {
    url: string;
    loaded: (nw: number, nh: number, np: number) => void;
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
        console.log("pdf starting to load")
        let promise = Pdfjs.getDocument(pdfUrl).promise;

        promise.then((pdf: Pdfjs.PDFDocumentProxy) => {
            runInAction(() => {
                console.log("pdf url received");
                this._pdf = pdf;
            });
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
    loaded: (nw: number, nh: number, np: number) => void;
    scrollY: number;
    parent: PDFBox;
    mainCont: React.RefObject<HTMLDivElement>;
    url: string;
}

const PinRadius = 25;

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
    @observable private _pointerEvents: "all" | "none" = "all";
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();

    private _pageBuffer: number = 1;
    private _annotationLayer: React.RefObject<HTMLDivElement>;
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _pagesLoaded: number = 0;
    private _dropDisposer?: DragManager.DragDropDisposer;

    constructor(props: IViewerProps) {
        super(props);

        this._annotationLayer = React.createRef();
    }

    @action
    componentDidMount = () => {
        let wasSelected = this.props.parent.props.active();
        // reaction for when document gets (de)selected
        this._reactionDisposer = reaction(
            () => [this.props.parent.props.active(), this.startIndex],
            () => {
                // if deselected, render images in place of pdf
                if (wasSelected && !this.props.parent.props.active()) {
                    this.saveThumbnail();
                }
                // if selected, render pdf
                else if (!wasSelected && this.props.parent.props.active()) {
                    this.renderPages(this.startIndex, this.endIndex, true);
                }
                wasSelected = this.props.parent.props.active();
                this._pointerEvents = wasSelected ? "none" : "all";
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

        setTimeout(() => {
            this.renderPages(this.startIndex, this.endIndex, true);
        }, 1000);
    }

    private mainCont = (div: HTMLDivElement | null) => {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        if (div) {
            this._dropDisposer = DragManager.MakeDropTarget(div, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }

    makeAnnotationDocument = (sourceDoc: Doc | undefined): Doc => {
        let annoDocs: Doc[] = [];
        this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => {
            for (let anno of value) {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left) / scale;
                if (anno.style.top) annoDoc.y = parseInt(anno.style.top) / scale;
                if (anno.style.height) annoDoc.height = parseInt(anno.style.height) / scale;
                if (anno.style.width) annoDoc.width = parseInt(anno.style.width) / scale;
                annoDoc.page = key;
                annoDoc.target = sourceDoc;
                annoDoc.type = AnnotationTypes.Region;
                annoDocs.push(annoDoc);
                anno.remove();
            }
        });

        let annoDoc = new Doc();
        annoDoc.annotations = new List<Doc>(annoDocs);
        if (sourceDoc) {
            DocUtils.MakeLink(sourceDoc, annoDoc, undefined, `Annotation from ${StrCast(this.props.parent.Document.title)}`, "", StrCast(this.props.parent.Document.title));
        }
        this._savedAnnotations.clear();
        return annoDoc;
    }

    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.makeAnnotationDocument(sourceDoc);
            let targetAnnotations = DocListCast(this.props.parent.Document.annotations);
            if (targetAnnotations) {
                targetAnnotations.push(destDoc);
                this.props.parent.Document.annotations = new List<Doc>(targetAnnotations);
            }
            else {
                this.props.parent.Document.annotations = new List<Doc>([destDoc]);
            }
            e.stopPropagation();
        }
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
        let width = this._pageSizes.map(i => i ? i.width : 0);
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

        if (this._pageSizes.length !== numPages) {
            this._pageSizes = new Array(numPages).map(i => ({ width: 0, height: 0 }));
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
                    makePin={this.createPinAnnotation}
                    createAnnotation={this.createAnnotation}
                    sendAnnotations={this.receiveAnnotations}
                    makeAnnotationDocuments={this.makeAnnotationDocument}
                    receiveAnnotations={this.sendAnnotations}
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
                        makePin={this.createPinAnnotation}
                        renderAnnotations={this.renderAnnotations}
                        createAnnotation={this.createAnnotation}
                        sendAnnotations={this.receiveAnnotations}
                        makeAnnotationDocuments={this.makeAnnotationDocument}
                        receiveAnnotations={this.sendAnnotations}
                        {...this.props} />
                );
                this._isPage[i] = true;
            }
        }

        this._startIndex = startIndex;
        this._endIndex = endIndex;

        return;
    }

    @action
    receiveAnnotations = (annotations: HTMLDivElement[], page: number) => {
        if (page === -1) {
            this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, annotations));
        }
        else {
            this._savedAnnotations.setValue(page, annotations);
        }
    }

    sendAnnotations = (page: number): HTMLDivElement[] | undefined => {
        return this._savedAnnotations.getValue(page);
    }

    createPinAnnotation = (x: number, y: number, page: number): void => {
        let targetDoc = Docs.TextDocument({ width: 100, height: 50, title: "New Pin Annotation" });

        let pinAnno = new Doc();
        pinAnno.x = x;
        pinAnno.y = y + this.getPageHeight(page);
        pinAnno.width = pinAnno.height = PinRadius;
        pinAnno.page = page;
        pinAnno.target = targetDoc;
        pinAnno.type = AnnotationTypes.Pin;
        // this._annotations.push(pinAnno);
        let annoDoc = new Doc();
        annoDoc.annotations = new List<Doc>([pinAnno]);
        let annotations = DocListCast(this.props.parent.Document.annotations);
        if (annotations && annotations.length) {
            annotations.push(annoDoc);
            this.props.parent.Document.annotations = new List<Doc>(annotations);
        }
        else {
            this.props.parent.Document.annotations = new List<Doc>([annoDoc]);
        }
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
        this.props.loaded(page.width, page.height, numPages);
        this._pageSizes[index - 1] = { width: page.width, height: page.height };
        this._pagesLoaded++;
        if (this._pagesLoaded === numPages) {
            this._loaded = true;
            let divs = Array.from(Array(numPages).keys()).map(i => (
                <div key={`pdfviewer-placeholder-${i}`} className="pdfviewer-placeholder" style={{ width: this._pageSizes[i] ? this._pageSizes[i].width : 0, height: this._pageSizes[i] ? this._pageSizes[i].height : 0 }} />
            ));
            this._visibleElements = new Array<JSX.Element>(...divs);
            this.renderPages(this.startIndex, this.endIndex, true);
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

    createAnnotation = (div: HTMLDivElement, page: number) => {
        if (this._annotationLayer.current) {
            if (div.style.top) {
                div.style.top = (parseInt(div.style.top) + this.getPageHeight(page)).toString();
            }
            this._annotationLayer.current.append(div);
            let savedPage = this._savedAnnotations.getValue(page);
            if (savedPage) {
                savedPage.push(div);
                this._savedAnnotations.setValue(page, savedPage);
            }
            else {
                this._savedAnnotations.setValue(page, [div]);
            }
        }
    }

    renderAnnotation = (anno: Doc): JSX.Element[] => {
        let annotationDocs = DocListCast(anno.annotations);
        let res = annotationDocs.map(a => {
            let type = NumCast(a.type);
            switch (type) {
                case AnnotationTypes.Pin:
                    return <PinAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                case AnnotationTypes.Region:
                    return <RegionAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                default:
                    return <div></div>;
            }
        });
        return res;
    }

    render() {
        trace();
        return (
            <div ref={this.mainCont} style={{ pointerEvents: "all" }}>
                <div className="viewer">
                    {this._visibleElements}
                </div>
                <div className="pdfViewer-annotationLayer" style={{ height: this.props.parent.Document.nativeHeight, width: `100%`, pointerEvents: this._pointerEvents }}>
                    <div className="pdfViewer-annotationLayer-subCont" ref={this._annotationLayer}>
                        {this._annotations.map(anno => this.renderAnnotation(anno))}
                    </div>
                </div>
            </div>
        );
    }
}

export enum AnnotationTypes {
    Region, Pin
}

interface IAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    parent: Viewer;
    document: Doc;
}

@observer
class PinAnnotation extends React.Component<IAnnotationProps> {
    @observable private _backgroundColor: string = "green";
    @observable private _display: string = "initial";

    private _mainCont: React.RefObject<HTMLDivElement>;

    constructor(props: IAnnotationProps) {
        super(props);
        this._mainCont = React.createRef();
    }

    componentDidMount = () => {
        let selected = this.props.document.selected;
        if (!BoolCast(selected)) {
            runInAction(() => {
                this._backgroundColor = "red";
                this._display = "none";
            });
        }
        if (selected) {
            if (BoolCast(selected)) {
                runInAction(() => {
                    this._backgroundColor = "green";
                    this._display = "initial";
                });
            }
            else {
                runInAction(() => {
                    this._backgroundColor = "red";
                    this._display = "none";
                });
            }
        }
        else {
            runInAction(() => {
                this._backgroundColor = "red";
                this._display = "none";
            });
        }
    }

    @action
    pointerDown = (e: React.PointerEvent) => {
        let selected = this.props.document.selected;
        if (selected && BoolCast(selected)) {
            this._backgroundColor = "red";
            this._display = "none";
            this.props.document.selected = false;
        }
        else {
            this._backgroundColor = "green";
            this._display = "initial";
            this.props.document.selected = true;
        }
        e.preventDefault();
        e.stopPropagation();
    }

    @action
    doubleClick = (e: React.MouseEvent) => {
        if (this._mainCont.current) {
            let annotations = DocListCast(this.props.parent.props.parent.Document.annotations);
            if (annotations && annotations.length) {
                let index = annotations.indexOf(this.props.document);
                annotations.splice(index, 1);
                this.props.parent.props.parent.Document.annotations = new List<Doc>(annotations);
            }
            // this._mainCont.current.childNodes.forEach(e => e.remove());
            this._mainCont.current.style.display = "none";
            // if (this._mainCont.current.parentElement) {
            //     this._mainCont.current.remove();
            // }
        }
        e.stopPropagation();
    }

    render() {
        let targetDoc = Cast(this.props.document.target, Doc);
        if (targetDoc instanceof Doc) {
            return (
                <div className="pdfViewer-pinAnnotation" onPointerDown={this.pointerDown}
                    onDoubleClick={this.doubleClick} ref={this._mainCont}
                    style={{
                        top: this.props.y * scale - PinRadius / 2, left: this.props.x * scale - PinRadius / 2, width: PinRadius,
                        height: PinRadius, pointerEvents: "all", backgroundColor: this._backgroundColor
                    }}>
                    <div style={{
                        position: "absolute", top: "25px", left: "25px", transform: "scale(3)", transformOrigin: "top left",
                        display: this._display, width: targetDoc[WidthSym](), height: targetDoc[HeightSym]()
                    }}>
                        <DocumentView Document={targetDoc}
                            ContainingCollectionView={undefined}
                            ScreenToLocalTransform={this.props.parent.props.parent.props.ScreenToLocalTransform}
                            isTopMost={false}
                            ContentScaling={() => 1}
                            PanelWidth={() => NumCast(this.props.parent.props.parent.Document.nativeWidth)}
                            PanelHeight={() => NumCast(this.props.parent.props.parent.Document.nativeHeight)}
                            focus={emptyFunction}
                            selectOnLoad={false}
                            parentActive={this.props.parent.props.parent.props.active}
                            whenActiveChanged={this.props.parent.props.parent.props.whenActiveChanged}
                            bringToFront={emptyFunction}
                            addDocTab={this.props.parent.props.parent.props.addDocTab}
                        />
                    </div>
                </div >
            );
        }
        return null;
    }
}

class RegionAnnotation extends React.Component<IAnnotationProps> {
    @observable private _backgroundColor: string = "red";

    onPointerDown = (e: React.PointerEvent) => {
        let targetDoc = Cast(this.props.document.target, Doc, null);
        if (targetDoc) {
            DocumentManager.Instance.jumpToDocument(targetDoc);
        }
    }

    render() {
        return (
            <div className="pdfViewer-annotationBox" onPointerDown={this.onPointerDown}
                style={{ top: this.props.y * scale, left: this.props.x * scale, width: this.props.width * scale, height: this.props.height * scale, pointerEvents: "all", backgroundColor: this._backgroundColor }}></div>
        );
    }
}