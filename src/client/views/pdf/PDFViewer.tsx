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
import * as rp from "request-promise";
import { restProperty } from "babel-types";
import { DocServer } from "../../DocServer";
import { number } from "prop-types";

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
        Pdfjs.getDocument(this.props.url).promise.then(pdf => runInAction(() => this._pdf = pdf));
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
    @observable private _isPage: string[] = [];
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _pointerEvents: "all" | "none" = "all";
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();

    private _pageBuffer: number = 1;
    private _annotationLayer: React.RefObject<HTMLDivElement>;
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _dropDisposer?: DragManager.DragDropDisposer;

    constructor(props: IViewerProps) {
        super(props);

        this._annotationLayer = React.createRef();
    }

    componentDidUpdate = (prevProps: IViewerProps) => {
        if (this.scrollY !== prevProps.scrollY && this._visibleElements.length) {
            this.renderPages(this.startIndex, this.endIndex, false);
        }
    }

    @action
    componentDidMount = () => {
        let wasSelected = this.props.parent.props.active();
        this._reactionDisposer = reaction(
            () => [this.props.parent.props.active(), this.startIndex, this.props.pdf],
            async () => {
                await this.initialLoad();
                wasSelected = this.props.parent.props.active();
                runInAction(() => this._pointerEvents = wasSelected ? "none" : "all");
                this.renderPages(this.startIndex, this.endIndex, false);
            }, { fireImmediately: true });

        this._annotationReactionDisposer = reaction(
            () => this.props.parent.Document && DocListCast(this.props.parent.Document.annotations),
            (annotations: Doc[]) =>
                annotations && annotations.length && this.renderAnnotations(annotations, true),
            { fireImmediately: true });
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
        this._annotationReactionDisposer && this._annotationReactionDisposer();
    }

    @action
    initialLoad = async () => {
        if (this.props.pdf && this._pageSizes.length === 0) {
            let pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            for (let i = 0; i < this.props.pdf.numPages; i++) {
                await this.props.pdf.getPage(i + 1).then(page => runInAction(() => {
                    pageSizes[i] = { width: page.view[2] * scale, height: page.view[3] * scale };
                    if (i === 0) this.props.loaded(pageSizes[i].width, pageSizes[i].height, this.props.pdf!.numPages);
                }));
            }
            runInAction(() => {
                this._pageSizes = pageSizes;
                let divs = Array.from(Array(this._pageSizes.length).keys()).map(i => (
                    <div key={`pdfviewer-placeholder-${i}`} className="pdfviewer-placeholder"
                        style={{ width: this._pageSizes[i] ? this._pageSizes[i].width : 0, height: this._pageSizes[i] ? this._pageSizes[i].height : 0 }} />
                ));
                this._isPage = Array.from(Array(this._pageSizes.length).map(p => "none"));
                this._visibleElements = new Array<JSX.Element>(...divs);
            })
        }
    }

    private mainCont = (div: HTMLDivElement | null) => {
        this._dropDisposer && this._dropDisposer();
        if (div) {
            this._dropDisposer = div && DragManager.MakeDropTarget(div, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    makeAnnotationDocument = (sourceDoc: Doc | undefined, s: number, color: string): Doc => {
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
                annoDoc.color = color;
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
            let destDoc = this.makeAnnotationDocument(sourceDoc, 1, "red");
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
    /**
     * Called by the Page class when it gets rendered, initializes the lists and
     * puts a placeholder with all of the correct page sizes when all of the pages have been loaded.
     */
    @action
    pageLoaded = (index: number, page: Pdfjs.PDFPageViewport): void => {
        this.props.pdf && this.props.loaded && this.props.loaded(page.width, page.height, this.props.pdf.numPages);
    }
    @action
    getPlaceholderPage = (page: number) => {
        if (this._isPage[page] !== "none") {
            this._isPage[page] = "none";
            this._visibleElements[page] = (
                <div key={`pdfviewer-placeholder-${page}`} className="pdfviewer-placeholder" style={{ width: this._pageSizes[page] ? this._pageSizes[page].width : 0, height: this._pageSizes[page] ? this._pageSizes[page].height : 0 }} />
            );
        }
    }
    @action
    getRenderedPage = (page: number) => {
        if (this._isPage[page] !== "page") {
            this._isPage[page] = "page";
            this._visibleElements[page] = (
                <Page
                    pdf={this.props.pdf}
                    page={page}
                    numPages={this.props.pdf!.numPages}
                    key={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${page + 1}` : "undefined"}`}
                    name={`${this.props.pdf ? this.props.pdf.fingerprint + `-page${page + 1}` : "undefined"}`}
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
        }
    }

    // change the address to be the file address of the PNG version of each page
    // file address of the pdf
    @action
    getPageImage = async (page: number) => {
        let handleError = () => this.getRenderedPage(page);
        if (this._isPage[page] != "image") {
            this._isPage[page] = "image";
            const address = this.props.url;
            let res = JSON.parse(await rp.get(DocServer.prepend(`/thumbnail${address.substring("files/".length, address.length - ".pdf".length)}-${page + 1}.PNG`)));
            runInAction(() => this._visibleElements[page] = <img key={res.path} src={res.path} onError={handleError}
                style={{ width: `${parseInt(res.width) * scale}px`, height: `${parseInt(res.height) * scale}px` }} />);
        }
    }

    @computed get scrollY(): number { return this.props.scrollY; }

    @computed get startIndex(): number { return Math.max(0, this.getPageFromScroll(this.scrollY) - this._pageBuffer); }

    @computed get endIndex(): number {
        let width = this._pageSizes.map(i => i ? i.width : 0);
        return Math.min(this.props.pdf ? this.props.pdf.numPages - 1 : 0, this.getPageFromScroll(this.scrollY + Math.max(...width)) + this._pageBuffer);
    }

    /**
     * @param startIndex: where to start rendering pages
     * @param endIndex: where to end rendering pages
     * @param forceRender: (optional), force pdfs to re-render, even if the page already exists
     */
    @action
    renderPages = (startIndex: number, endIndex: number, forceRender: boolean = false) => {
        if (this.props.pdf) {
            // unrender pages outside of the pdf by replacing them with empty stand-in divs
            for (let i = 0; i < this.props.pdf.numPages; i++) {
                if (i < startIndex || i > endIndex) {
                    this.getPlaceholderPage(i);
                } else {
                    if (this.props.parent.props.active()) {
                        this.getRenderedPage(i);
                    } else {
                        this.getPageImage(i);
                    }
                }
            }
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
        pinAnno.y = y + this.getScrollFromPage(page);
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
    getPageFromScroll = (vOffset: number) => {
        let index = 0;
        let currOffset = vOffset;
        while (index < this._pageSizes.length && currOffset - (this._pageSizes[index] ? this._pageSizes[index].height : 792 * scale) > 0) {
            currOffset -= this._pageSizes[index] ? this._pageSizes[index].height : this._pageSizes[0].height;
            index++;
        }
        return index;
    }


    getScrollFromPage = (index: number): number => {
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
                div.style.top = (parseInt(div.style.top) + this.getScrollFromPage(page)).toString();
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
                style={{ top: this.props.y * scale, left: this.props.x * scale, width: this.props.width * scale, height: this.props.height * scale, pointerEvents: "all", backgroundColor: StrCast(this.props.document.color) }}></div>
        );
    }
}