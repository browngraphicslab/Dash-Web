import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import * as rp from "request-promise";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, HeightSym, Opt, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { BoolCast, Cast, NumCast, StrCast, FieldValue } from "../../../new_fields/Types";
import { emptyFunction } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils, DocumentOptions } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { DocumentView } from "../nodes/DocumentView";
import { PDFBox } from "../nodes/PDFBox";
import Page from "./Page";
import "./PDFViewer.scss";
import React = require("react");
import PDFMenu from "./PDFMenu";
import { UndoManager } from "../../util/UndoManager";
import { CompileScript, CompiledScript, CompileResult } from "../../util/Scripting";
import { ScriptField } from "../../../new_fields/ScriptField";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");
const PDFFindBar = require("pdfjs-dist/lib/web/pdf_find_bar");
const getGlobalEventBus = require("pdfjs-dist/lib/web/dom_events");

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
                {!this._pdf ? (null) :
                    <Viewer pdf={this._pdf} loaded={this.props.loaded} scrollY={this.props.scrollY} parent={this.props.parent} mainCont={this._mainDiv} url={this.props.url} />}
            </div>
        );
    }
}

interface IViewerProps {
    pdf: Pdfjs.PDFDocumentProxy;
    loaded: (nw: number, nh: number, np: number) => void;
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
    @observable private _isPage: string[] = [];
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompileResult | undefined;
    @observable private _searching: boolean = false;

    @observable public Index: number = -1;

    private _pageBuffer: number = 1;
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _filterReactionDisposer?: IReactionDisposer;
    private _activeReactionDisposer?: IReactionDisposer;
    private _viewer: React.RefObject<HTMLDivElement>;
    private _mainCont: React.RefObject<HTMLDivElement>;
    // private _textContent: Pdfjs.TextContent[] = [];
    private _pdfFindController: any;
    private _searchString: string = "";
    private _rendered: boolean = false;
    private _pageIndex: number = -1;
    private _matchIndex: number = 0;
    private _eventBus: any;
    private _findField: React.RefObject<HTMLInputElement>;
    private _searchCont: React.RefObject<HTMLDivElement>;
    private _searchToggle: React.RefObject<HTMLButtonElement>;
    private _nextButton: React.RefObject<HTMLButtonElement>;
    private _previousButton: React.RefObject<HTMLButtonElement>;
    private _entireWord: React.RefObject<HTMLInputElement>;
    private _caseSensitivity: React.RefObject<HTMLInputElement>;
    private _highlightAll: React.RefObject<HTMLInputElement>;

    constructor(props: IViewerProps) {
        super(props);

        let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
        this._script = scriptfield ? scriptfield.script : CompileScript("return true");
        this._viewer = React.createRef();
        this._mainCont = React.createRef();
        this._findField = React.createRef();
        this._searchCont = React.createRef();
        this._searchToggle = React.createRef();
        this._nextButton = React.createRef();
        this._previousButton = React.createRef();
        this._entireWord = React.createRef();
        this._caseSensitivity = React.createRef();
        this._highlightAll = React.createRef();
    }

    componentDidUpdate = (prevProps: IViewerProps) => {
        if (this.scrollY !== prevProps.scrollY) {
            this.renderPages();
        }
    }

    @action
    componentDidMount = () => {
        this._reactionDisposer = reaction(

            () => [this.props.parent.props.active(), this.startIndex, this._pageSizes.length ? this.endIndex : 0],
            async () => {
                await this.initialLoad();
                this.renderPages();
            }, { fireImmediately: true });

        this._annotationReactionDisposer = reaction(
            () => this.props.parent.Document && DocListCast(this.props.parent.Document.annotations),
            (annotations: Doc[]) =>
                annotations && annotations.length && this.renderAnnotations(annotations, true),
            { fireImmediately: true });

        this._activeReactionDisposer = reaction(
            () => this.props.parent.props.active(),
            () => {
                runInAction(() => {
                    if (!this.props.parent.props.active()) {
                        this._searching = false;
                        this._pdfFindController = null;
                        if (this._viewer.current) {
                            let cns = this._viewer.current.childNodes;
                            for (let i = cns.length - 1; i >= 0; i--) {
                                cns.item(i).remove();
                            }
                        }
                    }
                });
            }
        )

        if (this.props.parent.props.ContainingCollectionView) {
            this._filterReactionDisposer = reaction(
                () => this.props.parent.Document.filterScript,
                () => {
                    runInAction(() => {
                        let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
                        this._script = scriptfield ? scriptfield.script : CompileScript("return true");
                        if (this.props.parent.props.ContainingCollectionView) {
                            let ccvAnnos = DocListCast(this.props.parent.props.ContainingCollectionView.props.Document.annotations);
                            ccvAnnos.forEach(d => {
                                if (this._script && this._script.compiled) {
                                    let run = this._script.run(d);
                                    if (run.success) {
                                        d.opacity = run.result ? 1 : 0;
                                    }
                                }
                            })
                        }
                    });
                }
            );
        }

        if (this._mainCont.current) {
            this._dropDisposer = this._mainCont.current && DragManager.MakeDropTarget(this._mainCont.current, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
        this._annotationReactionDisposer && this._annotationReactionDisposer();
        this._filterReactionDisposer && this._filterReactionDisposer();
        this._dropDisposer && this._dropDisposer();
    }

    scrollTo(y: number) {
        this.props.parent.scrollTo(y);
    }

    @action
    initialLoad = async () => {
        if (this._pageSizes.length === 0) {
            let pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            this._isPage = Array<string>(this.props.pdf.numPages);
            // this._textContent = Array<Pdfjs.TextContent>(this.props.pdf.numPages);
            for (let i = 0; i < this.props.pdf.numPages; i++) {
                await this.props.pdf.getPage(i + 1).then(page => runInAction(() => {
                    // pageSizes[i] = { width: page.view[2] * scale, height: page.view[3] * scale };
                    let x = page.getViewport(scale);
                    // page.getTextContent().then((text: Pdfjs.TextContent) => {
                    //     // let tc = new Pdfjs.TextContentItem()
                    //     // let tc = {str: }
                    //     this._textContent[i] = text;
                    //     // text.items.forEach(t => {
                    //     //     tcStr += t.str;
                    //     // })
                    // });
                    pageSizes[i] = { width: x.width, height: x.height };
                }));
            }
            runInAction(() =>
                Array.from(Array((this._pageSizes = pageSizes).length).keys()).map(this.getPlaceholderPage));
            this.props.loaded(Math.max(...pageSizes.map(i => i.width)), pageSizes[0].height, this.props.pdf.numPages);
            // this.props.loaded(Math.max(...pageSizes.map(i => i.width)), pageSizes[0].height, this.props.pdf.numPages);

            let startY = NumCast(this.props.parent.Document.startY);
            let ccv = this.props.parent.props.ContainingCollectionView;
            if (ccv) {
                ccv.props.Document.panY = startY;
            }
            this.props.parent.Document.scrollY = 0;
            this.props.parent.Document.scrollY = startY + 1;
        }
    }

    makeAnnotationDocument = (sourceDoc: Doc | undefined, s: number, color: string): Doc => {
        let annoDocs: Doc[] = [];
        let mainAnnoDoc = Docs.CreateInstance(new Doc(), "", {});

        mainAnnoDoc.page = Math.round(Math.random());
        this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => {
            for (let anno of value) {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left) / scale;
                if (anno.style.top) annoDoc.y = parseInt(anno.style.top) / scale;
                if (anno.style.height) annoDoc.height = parseInt(anno.style.height) / scale;
                if (anno.style.width) annoDoc.width = parseInt(anno.style.width) / scale;
                annoDoc.page = key;
                annoDoc.target = sourceDoc;
                annoDoc.group = mainAnnoDoc;
                annoDoc.color = color;
                annoDoc.type = AnnotationTypes.Region;
                annoDocs.push(annoDoc);
                anno.remove();
            }
        });

        mainAnnoDoc.annotations = new List<Doc>(annoDocs);
        if (sourceDoc) {
            DocUtils.MakeLink(sourceDoc, mainAnnoDoc, undefined, `Annotation from ${StrCast(this.props.parent.Document.title)}`, "", StrCast(this.props.parent.Document.title));
        }
        this._savedAnnotations.clear();
        return mainAnnoDoc;
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
        this.props.loaded(page.width, page.height, this.props.pdf.numPages);
    }

    @action
    getPlaceholderPage = (page: number) => {
        if (this._isPage[page] !== "none") {
            this._isPage[page] = "none";
            this._visibleElements[page] = (
                <div key={`${this.props.url}-placeholder-${page + 1}`} className="pdfviewer-placeholder"
                    style={{ width: this._pageSizes[page].width, height: this._pageSizes[page].height }} />
            );
        }
    }

    @action
    getRenderedPage = (page: number) => {
        if (this._isPage[page] !== "page") {
            this._isPage[page] = "page";
            this._visibleElements[page] = (
                <Page
                    size={this._pageSizes[page]}
                    pdf={this.props.pdf}
                    page={page}
                    numPages={this.props.pdf.numPages}
                    key={`${this.props.url}-rendered-${page + 1}`}
                    name={`${this.props.pdf.fingerprint + `-page${page + 1}`}`}
                    pageLoaded={this.pageLoaded}
                    parent={this.props.parent}
                    makePin={emptyFunction}
                    renderAnnotations={this.renderAnnotations}
                    createAnnotation={this.createAnnotation}
                    sendAnnotations={this.receiveAnnotations}
                    makeAnnotationDocuments={this.makeAnnotationDocument}
                    getScrollFromPage={this.getScrollFromPage}
                    {...this.props} />
            );
        }
    }

    // change the address to be the file address of the PNG version of each page
    // file address of the pdf
    @action
    getPageImage = async (page: number) => {
        let handleError = () => this.getRenderedPage(page);
        if (this._isPage[page] !== "image") {
            this._isPage[page] = "image";
            const address = this.props.url;
            let res = JSON.parse(await rp.get(DocServer.prepend(`/thumbnail${address.substring("files/".length, address.length - ".pdf".length)}-${page + 1}.PNG`)));
            runInAction(() => this._visibleElements[page] =
                <img key={res.path} src={res.path} onError={handleError}
                    style={{ width: `${parseInt(res.width) * scale}px`, height: `${parseInt(res.height) * scale}px` }} />);
        }
    }

    @computed get scrollY(): number { return this.props.scrollY; }

    // startIndex: where to start rendering pages
    @computed get startIndex(): number { return Math.max(0, this.getPageFromScroll(this.scrollY) - this._pageBuffer); }

    // endIndex: where to end rendering pages
    @computed get endIndex(): number {
        return Math.min(this.props.pdf.numPages - 1, this.getPageFromScroll(this.scrollY + this._pageSizes[0].height) + this._pageBuffer);
    }

    @action
    renderPages = () => {
        for (let i = 0; i < this.props.pdf.numPages; i++) {
            if (i < this.startIndex || i > this.endIndex) {
                this.getPlaceholderPage(i);  // pages outside of the pdf use empty stand-in divs
            } else {
                if (this.props.parent.props.active()) {
                    this.getRenderedPage(i);
                } else {
                    this.getPageImage(i);
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

    // get the page index that the vertical offset passed in is on
    getPageFromScroll = (vOffset: number) => {
        let index = 0;
        let currOffset = vOffset;
        while (index < this._pageSizes.length && currOffset - this._pageSizes[index].height > 0) {
            currOffset -= this._pageSizes[index++].height;
        }
        return index;
    }

    getScrollFromPage = (index: number): number => {
        let counter = 0;
        for (let i = 0; i < Math.min(this.props.pdf.numPages, index); i++) {
            counter += this._pageSizes[i].height;
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

    renderAnnotation = (anno: Doc, index: number): JSX.Element[] => {
        let annotationDocs = DocListCast(anno.annotations);
        let res = annotationDocs.map(a => {
            let type = NumCast(a.type);
            switch (type) {
                // case AnnotationTypes.Pin:
                //     return <PinAnnotation parent={this} document={a} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                case AnnotationTypes.Region:
                    return <RegionAnnotation parent={this} document={a} index={index} x={NumCast(a.x)} y={NumCast(a.y)} width={a[WidthSym]()} height={a[HeightSym]()} key={a[Id]} />;
                default:
                    return <div></div>;
            }
        });
        return res;
    }

    @action
    pointerDown = () => {
        // this._searching = false;
    }

    @action
    search = (searchString: string) => {
        if (searchString.length === 0) {
            return;
        }

        if (this._rendered) {
            this._pdfFindController.executeCommand('find',
                {
                    caseSensitive: false,
                    findPrevious: undefined,
                    highlightAll: true,
                    phraseSearch: true,
                    query: searchString
                });
        }
        else {
            let container = this._mainCont.current;
            if (container) {
                container.addEventListener("pagerendered", () => {
                    console.log("rendered");
                    this._pdfFindController.executeCommand('find',
                        {
                            caseSensitive: false,
                            findPrevious: undefined,
                            highlightAll: true,
                            phraseSearch: true,
                            query: searchString
                        });
                    this._rendered = true;
                });
            }
        }

        // let viewer = this._viewer.current;

        // if (!this._pdfFindController) {
        //     if (container && viewer) {
        //         let simpleLinkService = new SimpleLinkService();
        //         let pdfViewer = new PDFJSViewer.PDFViewer({
        //             container: container,
        //             viewer: viewer,
        //             linkService: simpleLinkService
        //         });
        //         simpleLinkService.setPdf(this.props.pdf);
        //         container.addEventListener("pagesinit", () => {
        //             pdfViewer.currentScaleValue = 1;
        //         });
        //         container.addEventListener("pagerendered", () => {
        //             console.log("rendered");
        //             this._pdfFindController.executeCommand('find',
        //                 {
        //                     caseSensitive: false,
        //                     findPrevious: undefined,
        //                     highlightAll: true,
        //                     phraseSearch: true,
        //                     query: searchString
        //                 });
        //         });
        //         pdfViewer.setDocument(this.props.pdf);
        //         this._pdfFindController = new PDFJSViewer.PDFFindController(pdfViewer);
        //         // this._pdfFindController._linkService = pdfLinkService;
        //         pdfViewer.findController = this._pdfFindController;
        //     }
        // }
        // else {
        //     this._pdfFindController.executeCommand('find',
        //         {
        //             caseSensitive: false,
        //             findPrevious: undefined,
        //             highlightAll: true,
        //             phraseSearch: true,
        //             query: searchString
        //         });
        // }
    }

    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._searchString = e.currentTarget.value;
    }

    @action
    toggleSearch = (e: React.MouseEvent) => {
        e.stopPropagation();
        this._searching = !this._searching;

        if (this._searching) {
            let container = this._mainCont.current;
            let viewer = this._viewer.current;

            if (!this._pdfFindController) {
                if (container && viewer) {
                    this._eventBus = getGlobalEventBus.getGlobalEventBus();
                    let simpleLinkService = new SimpleLinkService();
                    let pdfViewer = new PDFJSViewer.PDFViewer({
                        container: container,
                        viewer: viewer,
                        linkService: simpleLinkService
                    });
                    simpleLinkService.setPdf(this.props.pdf);
                    container.addEventListener("pagesinit", () => {
                        pdfViewer.currentScaleValue = 1;
                    });
                    container.addEventListener("pagerendered", () => {
                        console.log("rendered");
                        this._rendered = true;
                    });
                    let options = {
                        bar: this._searchCont.current,
                        toggleButton: this._searchToggle.current,
                        findField: this._findField.current,
                        highlightAllCheckbox: this._highlightAll.current,
                        caseSensitiveCheckbox: this._caseSensitivity.current,
                        entireWordCheckbox: this._entireWord.current,
                        findMsg: document.getElementById('findMsg'),
                        findResultsCount: document.getElementById('findResultsCount'),
                        findPreviousButton: this._previousButton.current,
                        findNextButton: this._nextButton.current,
                    }
                    let findBar = new PDFFindBar.PDFFindBar(options, this._eventBus);
                    this._eventBus.on("find", (evt: any) => {
                        // this._pdfFindController.executeCommand('find', {
                        //     query: "the",
                        //     phraseSearch: true,
                        //     caseSensitive: false,
                        //     highlightAll: true,
                        //     findPrevious: undefined
                        // });
                        this._pdfFindController.executeCommand('find' + evt.type, {
                            query: evt.query,
                            phraseSearch: evt.phraseSearch,
                            caseSensitive: evt.caseSensitive,
                            entireWord: evt.entireWord,
                            highlightAll: true,
                            findPrevious: evt.findPrevious
                        });
                    });
                    pdfViewer.setDocument(this.props.pdf);
                    this._pdfFindController = new PDFJSViewer.PDFFindController(pdfViewer);
                    this._pdfFindController._eventBus = this._eventBus;
                    pdfViewer.eventBus = this._eventBus;
                    // findBar.open();
                    // this._pdfFindController._linkService = pdfLinkService;
                    pdfViewer.findController = this._pdfFindController;
                }
            }
        }
        else {
            this._pdfFindController = null;
            if (this._viewer.current) {
                let cns = this._viewer.current.childNodes;
                for (let i = cns.length - 1; i >= 0; i--) {
                    cns.item(i).remove();
                }
            }
        }
    }

    @action
    prevAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (this.Index > 0) {
            this.Index--;
        }
    }

    @action
    nextAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();

        let compiled = this._script;
        if (this.Index < this._annotations.filter(anno => {
            if (compiled && compiled.compiled) {
                let run = compiled.run({ this: anno });
                if (run.success) {
                    return run.result;
                }
            }
            return true;
        }).length) {
            this.Index++;
        }
    }

    nextResult = () => {
        // if (this._viewer.current) {
        //     let results = this._pdfFindController.pageMatches;
        //     if (results && results.length) {
        //         if (this._pageIndex === this.props.pdf.numPages && this._matchIndex === results[this._pageIndex].length - 1) {
        //             return;
        //         }
        //         if (this._pageIndex === -1 || this._matchIndex === results[this._pageIndex].length - 1) {
        //             this._matchIndex = 0;
        //             this._pageIndex++;
        //         }
        //         else {
        //             this._matchIndex++;
        //         }
        //         this._pdfFindController._nextMatch()
        // let nextMatch = this._viewer.current.children[this._pageIndex].children[1].children[results[this._pageIndex][this._matchIndex]];
        // rconsole.log(nextMatch);
        // this.props.parent.scrollTo(nextMatch.getBoundingClientRect().top);
        // nextMatch.setAttribute("style", nextMatch.getAttribute("style") ? nextMatch.getAttribute("style") + ", background-color: green" : "background-color: green");
        // }
        // }
    }

    render() {
        let compiled = this._script;
        return (
            <div ref={this._mainCont} style={{ pointerEvents: "all" }} onPointerDown={this.pointerDown}>
                <div className="viewer" style={this._searching ? { position: "absolute", top: 0 } : {}}>
                    {this._visibleElements}
                </div>
                <div className="pdfViewer-text" ref={this._viewer} style={{ transform: "scale(1.5)", transformOrigin: "top left" }} />
                <div className="pdfViewer-annotationLayer"
                    style={{
                        height: this.props.parent.Document.nativeHeight, width: `100%`,
                        pointerEvents: this.props.parent.props.active() ? "none" : "all"
                    }}>
                    <div className="pdfViewer-annotationLayer-subCont" ref={this._annotationLayer}>
                        {this._annotations.filter(anno => {
                            if (compiled && compiled.compiled) {
                                let run = compiled.run({ this: anno });
                                if (run.success) {
                                    return run.result;
                                }
                            }
                            return true;
                        }).map((anno: Doc, index: number) => this.renderAnnotation(anno, index))}
                    </div>
                </div>
                <div className="pdfViewer-overlayCont" onPointerDown={(e) => e.stopPropagation()}
                    style={{
                        bottom: -this.props.scrollY,
                        left: `${this._searching ? 0 : 100}%`
                    }} ref={this._searchCont}>
                    <button className="pdfViewer-overlayButton" title="Open Search Bar"></button>
                    <input type="checkbox" ref={this._highlightAll} />
                    <input type="checkbox" ref={this._caseSensitivity} />
                    <input type="checkbox" ref={this._entireWord} />
                    <button title="Previous Result" ref={this._previousButton}><FontAwesomeIcon icon="arrow-up" size="3x" color="white" /></button>
                    <button title="Next Result" ref={this._nextButton}><FontAwesomeIcon icon="arrow-down" size="3x" color="white" /></button>
                    <input placeholder="Search" ref={this._findField} className="pdfViewer-overlaySearchBar" onChange={this.searchStringChanged} />
                    <button title="Search" onClick={() => this.search(this._searchString)}><FontAwesomeIcon icon="search" size="3x" color="white" /></button>
                </div>
                <button className="pdfViewer-overlayButton" onClick={this.prevAnnotation} title="Previous Annotation"
                    style={{ bottom: -this.props.scrollY + 280, right: 10, display: this.props.parent.props.active() ? "flex" : "none" }}>
                    <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="3x" />
                    </div>
                </button>
                <button className="pdfViewer-overlayButton" onClick={this.nextAnnotation} title="Next Annotation"
                    style={{ bottom: -this.props.scrollY + 200, right: 10, display: this.props.parent.props.active() ? "flex" : "none" }}>
                    <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="3x" />
                    </div>
                </button>
                <button className="pdfViewer-overlayButton" onClick={this.toggleSearch} title="Open Search Bar" ref={this._searchToggle}
                    style={{ bottom: -this.props.scrollY + 10, right: 0, display: this.props.parent.props.active() ? "flex" : "none" }}>
                    <div className="pdfViewer-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                    <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                        <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="3x" />
                    </div>
                </button>
            </div >
        );
    }
}

export enum AnnotationTypes {
    Region
}

interface IAnnotationProps {
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    parent: Viewer;
    document: Doc;
}

@observer
class RegionAnnotation extends React.Component<IAnnotationProps> {
    @observable private _backgroundColor: string = "red";

    private _reactionDisposer?: IReactionDisposer;
    private _scrollDisposer?: IReactionDisposer;
    private _mainCont: React.RefObject<HTMLDivElement>;

    constructor(props: IAnnotationProps) {
        super(props);

        this._mainCont = React.createRef();
    }

    componentDidMount() {
        this._reactionDisposer = reaction(
            () => BoolCast(this.props.document.delete),
            () => {
                if (BoolCast(this.props.document.delete)) {
                    if (this._mainCont.current) {
                        this._mainCont.current.style.display = "none";
                    }
                }
            },
            { fireImmediately: true }
        );

        this._scrollDisposer = reaction(
            () => this.props.parent.Index,
            () => {
                if (this.props.parent.Index === this.props.index) {
                    this.props.parent.scrollTo(this.props.y - 50);
                }
            }
        )
    }

    componentWillUnmount() {
        this._reactionDisposer && this._reactionDisposer();
        this._scrollDisposer && this._scrollDisposer();
    }

    deleteAnnotation = () => {
        let annotation = DocListCast(this.props.parent.props.parent.Document.annotations);
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group && annotation.indexOf(group) !== -1) {
            let newAnnotations = annotation.filter(a => a !== FieldValue(Cast(this.props.document.group, Doc)));
            this.props.parent.props.parent.Document.annotations = new List<Doc>(newAnnotations);
        }

        if (group) {
            let groupAnnotations = DocListCast(group.annotations);
            groupAnnotations.forEach(anno => anno.delete = true);
        }

        PDFMenu.Instance.fadeOut(true);
    }

    @action
    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0) {
            let targetDoc = Cast(this.props.document.target, Doc, null);
            if (targetDoc) {
                DocumentManager.Instance.jumpToDocument(targetDoc, false);
            }
        }
        if (e.button === 2) {
            PDFMenu.Instance.Status = "annotation";
            PDFMenu.Instance.Delete = this.deleteAnnotation.bind(this);
            PDFMenu.Instance.Pinned = false;
            PDFMenu.Instance.AddTag = this.addTag.bind(this);
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY, true);
        }
    }

    addTag = (key: string, value: string): boolean => {
        let group = FieldValue(Cast(this.props.document.group, Doc));
        if (group) {
            let valNum = parseInt(value);
            group[key] = isNaN(valNum) ? value : valNum;
            return true;
        }
        return false;
    }

    render() {
        return (
            <div className="pdfViewer-annotationBox" onPointerDown={this.onPointerDown} ref={this._mainCont}
                style={{
                    top: this.props.y * scale,
                    left: this.props.x * scale,
                    width: this.props.width * scale,
                    height: this.props.height * scale,
                    pointerEvents: "all",
                    backgroundColor: this.props.parent.Index === this.props.index ? "goldenrod" : StrCast(this.props.document.color)
                }}></div>
        );
    }
}

class SimpleLinkService {
    externalLinkTarget: any = null;
    externalLinkRel: any = null;
    pdf: any = null;
    _page: any = 0;

    navigateTo(dest: any) { }

    getDestinationHash(dest: any) { return "#"; }

    getAnchorUrl(hash: any) { return "#"; }

    setHash(hash: any) { }

    executeNamedAction(action: any) { }

    cachePageRef(pageNum: any, pageRef: any) { }

    get pagesCount() {
        return this.pdf ? this.pdf.numPages : 0;
    }

    get page() {
        return this._page;
    }

    set page(value: any) {
        this._page = value;
    }

    setPdf(pdf: any) {
        this.pdf = pdf;
    }

    get rotation() {
        return 0;
    }
    set rotation(value: any) { }
}