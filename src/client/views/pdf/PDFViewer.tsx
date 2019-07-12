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
import { PDFBox, handleBackspace } from "../nodes/PDFBox";
import Page from "./Page";
import "./PDFViewer.scss";
import React = require("react");
import PDFMenu from "./PDFMenu";
import { UndoManager } from "../../util/UndoManager";
import { CompileScript, CompiledScript, CompileResult } from "../../util/Scripting";
import { ScriptField } from "../../../new_fields/ScriptField";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Annotation from "./Annotation";
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");

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
            <div className="pdfViewer-viewerCont" ref={this._mainDiv}>
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
export class Viewer extends React.Component<IViewerProps> {
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

    constructor(props: IViewerProps) {
        super(props);

        let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
        this._script = scriptfield ? scriptfield.script : CompileScript("return true");
        this._viewer = React.createRef();
        this._mainCont = React.createRef();
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
            () => {
                return this.props.parent && this.props.parent.fieldExtensionDoc && DocListCast(this.props.parent.fieldExtensionDoc.annotations);
            },
            (annotations: Doc[]) => {
                annotations && annotations.length && this.renderAnnotations(annotations, true);
            },
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
        );

        if (this.props.parent.props.ContainingCollectionView) {
            this._filterReactionDisposer = reaction(
                () => this.props.parent.Document.filterScript,
                () => {
                    runInAction(() => {
                        let scriptfield = Cast(this.props.parent.Document.filterScript, ScriptField);
                        this._script = scriptfield ? scriptfield.script : CompileScript("return true");
                        if (this.props.parent.props.ContainingCollectionView) {
                            let fieldDoc = Doc.resolvedFieldDataDoc(this.props.parent.props.ContainingCollectionView.props.DataDoc ?
                                this.props.parent.props.ContainingCollectionView.props.DataDoc : this.props.parent.props.ContainingCollectionView.props.Document, this.props.parent.props.ContainingCollectionView.props.fieldKey, "true");
                            let ccvAnnos = DocListCast(fieldDoc.annotations);
                            ccvAnnos.forEach(d => {
                                if (this._script && this._script.compiled) {
                                    let run = this._script.run(d);
                                    if (run.success) {
                                        d.opacity = run.result ? 1 : 0;
                                    }
                                }
                            });
                        }
                        this.Index = -1;
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
            const proms: Pdfjs.PDFPromise<any>[] = [];
            for (let i = 0; i < this.props.pdf.numPages; i++) {
                proms.push(this.props.pdf.getPage(i + 1).then(page => runInAction(() => {
                    pageSizes[i] = {
                        width: (page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]) * scale,
                        height: (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0]) * scale
                    };
                    // let x = page.getViewport(scale);
                    // page.getTextContent().then((text: Pdfjs.TextContent) => {
                    //     // let tc = new Pdfjs.TextContentItem()
                    //     // let tc = {str: }
                    //     this._textContent[i] = text;
                    //     // text.items.forEach(t => {
                    //     //     tcStr += t.str;
                    //     // })
                    // });
                    // pageSizes[i] = { width: x.width, height: x.height };
                })));
            }
            await Promise.all(proms);
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
        let mainAnnoDoc = Docs.Create.InstanceFromProto(new Doc(), "", {});

        mainAnnoDoc.title = "Annotation on " + StrCast(this.props.parent.Document.title);
        mainAnnoDoc.pdfDoc = this.props.parent.Document;
        let minY = Number.MAX_VALUE;
        this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => {
            for (let anno of value) {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left) / scale;
                if (anno.style.top) {
                    annoDoc.y = parseInt(anno.style.top) / scale;
                    minY = Math.min(parseInt(anno.style.top), minY);
                }
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

        mainAnnoDoc.y = Math.max(minY, 0);
        mainAnnoDoc.annotations = new List<Doc>(annoDocs);
        if (sourceDoc) {
            DocUtils.MakeLink(sourceDoc, mainAnnoDoc, undefined, `Annotation from ${StrCast(this.props.parent.Document.title)}`, "", StrCast(this.props.parent.Document.title));
        }
        this._savedAnnotations.clear();
        this.Index = -1;
        return mainAnnoDoc;
    }

    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.makeAnnotationDocument(sourceDoc, 1, "red");
            let targetAnnotations = DocListCast(this.props.parent.fieldExtensionDoc.annotations);
            if (targetAnnotations) {
                targetAnnotations.push(destDoc);
                this.props.parent.fieldExtensionDoc.annotations = new List<Doc>(targetAnnotations);
            }
            else {
                this.props.parent.fieldExtensionDoc.annotations = new List<Doc>([destDoc]);
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
            try {
                let res = JSON.parse(await rp.get(DocServer.prepend(`/thumbnail${address.substring("files/".length, address.length - ".pdf".length)}-${page + 1}.PNG`)));
                runInAction(() => this._visibleElements[page] =
                    <img key={res.path} src={res.path} onError={handleError}
                        style={{ width: `${parseInt(res.width) * scale}px`, height: `${parseInt(res.height) * scale}px` }} />);
            } catch (e) {

            }
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

    renderAnnotation = (anno: Doc, index: number): JSX.Element => {
        return <Annotation anno={anno} index={index} parent={this} key={`${anno[Id]}-annotation`} />;
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
                container.addEventListener("pagesloaded", () => {
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
                    pdfViewer.setDocument(this.props.pdf);
                    this._pdfFindController = new PDFJSViewer.PDFFindController(pdfViewer);
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

        // if (this.Index > 0) {
        //     this.Index--;
        // }
        this.Index = Math.max(this.Index - 1, 0);
    }

    @action
    nextAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();

        let compiled = this._script;
        let filtered = this._annotations.filter(anno => {
            if (compiled && compiled.compiled) {
                let run = compiled.run({ this: anno });
                if (run.success) {
                    return run.result;
                }
            }
            return true;
        });
        this.Index = Math.min(this.Index + 1, filtered.length - 1);
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
                        }).sort((a: Doc, b: Doc) => NumCast(a.y) - NumCast(b.y))
                            .map((anno: Doc, index: number) => this.renderAnnotation(anno, index))}
                    </div>
                </div>
                <div className="pdfViewer-overlayCont" onPointerDown={(e) => e.stopPropagation()}
                    style={{
                        bottom: -this.props.scrollY,
                        left: `${this._searching ? 0 : 100}%`
                    }}>
                    <button className="pdfViewer-overlayButton" title="Open Search Bar"></button>
                    {/* <button title="Previous Result" onClick={() => this.search(this._searchString)}><FontAwesomeIcon icon="arrow-up" size="3x" color="white" /></button>
                    <button title="Next Result" onClick={this.nextResult}><FontAwesomeIcon icon="arrow-down" size="3x" color="white" /></button> */}
                    <input onKeyDown={handleBackspace} placeholder="Search" className="pdfViewer-overlaySearchBar" onChange={this.searchStringChanged} />
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
                <button className="pdfViewer-overlayButton" onClick={this.toggleSearch} title="Open Search Bar"
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

class SimpleLinkService {
    externalLinkTarget: any = null;
    externalLinkRel: any = null;
    pdf: any = null;

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
        return 0;
    }

    setPdf(pdf: any) {
        this.pdf = pdf;
    }

    get rotation() {
        return 0;
    }
    set rotation(value: any) { }
}