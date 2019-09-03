import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import * as rp from "request-promise";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, FieldResult } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { Utils, numberRange } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
import { KeyCodes } from "../../northstar/utils/KeyCodes";
import { CompileScript, CompiledScript } from "../../util/Scripting";
import Annotation from "./Annotation";
import Page from "./Page";
import "./PDFViewer.scss";
import React = require("react");
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");

export const scale = 2;

interface IViewerProps {
    pdf: Pdfjs.PDFDocumentProxy;
    url: string;
    Document: Doc;
    DataDoc?: Doc;
    fieldExtensionDoc: Doc;
    fieldKey: string;
    loaded: (nw: number, nh: number, np: number) => void;
    panY: number;
    scrollTo: (y: number) => void;
    active: () => boolean;
    setPanY?: (n: number) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => void;
    pinToPres: (document: Doc) => void;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
}

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
export class PDFViewer extends React.Component<IViewerProps> {
    @observable.shallow private _visibleElements: JSX.Element[] = []; // _visibleElements is the array of JSX elements that gets rendered
    @observable private _isPage: string[] = [];// _isPage is an array that tells us whether or not an index is rendered as a page or as a placeholder
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompiledScript = CompileScript("return true") as CompiledScript;
    @observable private _searching: boolean = false;
    @observable private Index: number = -1;

    private _pageBuffer: number = 1;
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _filterReactionDisposer?: IReactionDisposer;
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _pdfViewer: any;
    private _pdfFindController: any;
    private _searchString: string = "";
    private _selectionText: string = "";

    @computed get panY(): number { return this.props.panY; }

    // startIndex: where to start rendering pages
    @computed get startIndex(): number { return Math.max(0, this.getPageFromScroll(this.panY) - this._pageBuffer); }

    // endIndex: where to end rendering pages
    @computed get endIndex(): number {
        return Math.min(this.props.pdf.numPages - 1, this.getPageFromScroll(this.panY + (this._pageSizes[0] ? this._pageSizes[0].height : 0)) + this._pageBuffer);
    }

    @computed get filteredAnnotations() {
        return this._annotations.filter(anno => {
            let run = this._script.run({ this: anno });
            return run.success ? run.result : true;
        });
    }

    componentDidUpdate = (prevProps: IViewerProps) => this.panY !== prevProps.panY && this.renderPages();

    componentDidMount = async () => {
        await this.initialLoad();

        this._reactionDisposer = reaction(
            () => [this.props.active(), this.startIndex, this._pageSizes.length ? this.endIndex : 0],
            () => this.renderPages(),
            { fireImmediately: true });

        this._annotationReactionDisposer = reaction(
            () => this.props.fieldExtensionDoc && DocListCast(this.props.fieldExtensionDoc.annotations),
            annotations => annotations && annotations.length && this.renderAnnotations(annotations, true),
            { fireImmediately: true });

        this._filterReactionDisposer = reaction(
            () => ({ scriptField: Cast(this.props.Document.filterScript, ScriptField), annos: this._annotations.slice() }),
            action(({ scriptField, annos }: { scriptField: FieldResult<ScriptField>, annos: Doc[] }) => {
                this._script = scriptField && scriptField.script.compiled ? scriptField.script : CompileScript("return true") as CompiledScript;
                annos.forEach(d => {
                    let run = this._script.run(d);
                    d.opacity = !run.success || run.result ? 1 : 0;
                });
                this.Index = -1;
            }),
            { fireImmediately: true }
        );

        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
        this._annotationReactionDisposer && this._annotationReactionDisposer();
        this._filterReactionDisposer && this._filterReactionDisposer();
        document.removeEventListener("copy", this.copy);
    }

    copy = (e: ClipboardEvent) => {
        if (this.props.active() && e.clipboardData) {
            e.clipboardData.setData("text/plain", this._selectionText);
            e.clipboardData.setData("dash/pdfOrigin", this.props.Document[Id]);
            e.clipboardData.setData("dash/pdfRegion", this.makeAnnotationDocument(undefined, "#0390fc")[Id]);
            e.preventDefault();
        }
    }

    paste = (e: ClipboardEvent) => {
        if (e.clipboardData && e.clipboardData.getData("dash/pdfOrigin") === this.props.Document[Id]) {
            let linkDocId = e.clipboardData.getData("dash/linkDoc");
            linkDocId && DocServer.GetRefField(linkDocId).then(async (link) =>
                (link instanceof Doc) && (Doc.GetProto(link).anchor2 = this.makeAnnotationDocument(await Cast(Doc.GetProto(link), Doc), "#0390fc", false)));
        }
    }

    searchStringChanged = (e: React.ChangeEvent<HTMLInputElement>) => this._searchString = e.currentTarget.value;

    pageLoaded = (page: Pdfjs.PDFPageViewport): void => this.props.loaded(page.width, page.height, this.props.pdf.numPages);

    setSelectionText = (text: string) => this._selectionText = text;

    getIndex = () => this.Index;

    @action
    initialLoad = async () => {
        if (this._pageSizes.length === 0) {
            this._isPage = Array<string>(this.props.pdf.numPages);
            this._pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            this._visibleElements = Array<JSX.Element>(this.props.pdf.numPages);
            await Promise.all(this._pageSizes.map<Pdfjs.PDFPromise<any>>((val, i) =>
                this.props.pdf.getPage(i + 1).then(action((page: Pdfjs.PDFPageProxy) => {
                    this._pageSizes.splice(i, 1, {
                        width: (page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]) * scale,
                        height: (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0]) * scale
                    });
                    this._visibleElements.splice(i, 1,
                        <div key={`${this.props.url}-placeholder-${i + 1}`} className="pdfviewer-placeholder"
                            style={{ width: this._pageSizes[i].width, height: this._pageSizes[i].height }}>
                            "PAGE IS LOADING... "
                </div>);
                    this.getPlaceholderPage(i);
                }))));
            this.props.loaded(Math.max(...this._pageSizes.map(i => i.width)), this._pageSizes[0].height, this.props.pdf.numPages);

            let startY = NumCast(this.props.Document.startY, NumCast(this.props.Document.panY));
            this.props.setPanY && this.props.setPanY(startY);
        }
    }

    @action
    makeAnnotationDocument = (sourceDoc: Doc | undefined, color: string, createLink: boolean = true): Doc => {
        let mainAnnoDoc = Docs.Create.InstanceFromProto(new Doc(), "", {});
        let mainAnnoDocProto = Doc.GetProto(mainAnnoDoc);
        let annoDocs: Doc[] = [];
        let minY = Number.MAX_VALUE;
        if (this._savedAnnotations.size() === 1 && this._savedAnnotations.values()[0].length === 1 && !createLink) {
            let anno = this._savedAnnotations.values()[0][0];
            let annoDoc = Docs.Create.FreeformDocument([], { backgroundColor: "rgba(255, 0, 0, 0.1)", title: "Annotation on " + StrCast(this.props.Document.title) });
            if (anno.style.left) annoDoc.x = parseInt(anno.style.left);
            if (anno.style.top) annoDoc.y = parseInt(anno.style.top);
            if (anno.style.height) annoDoc.height = parseInt(anno.style.height);
            if (anno.style.width) annoDoc.width = parseInt(anno.style.width);
            annoDoc.target = sourceDoc;
            annoDoc.group = mainAnnoDoc;
            annoDoc.color = color;
            annoDoc.type = AnnotationTypes.Region;
            annoDocs.push(annoDoc);
            annoDoc.isButton = true;
            anno.remove();
            this.props.addDocument && this.props.addDocument(annoDoc, false);
            mainAnnoDoc = annoDoc;
            mainAnnoDocProto = Doc.GetProto(annoDoc);
        } else {
            this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => value.map(anno => {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left);
                if (anno.style.top) annoDoc.y = parseInt(anno.style.top);
                if (anno.style.height) annoDoc.height = parseInt(anno.style.height);
                if (anno.style.width) annoDoc.width = parseInt(anno.style.width);
                annoDoc.target = sourceDoc;
                annoDoc.group = mainAnnoDoc;
                annoDoc.color = color;
                annoDoc.type = AnnotationTypes.Region;
                annoDocs.push(annoDoc);
                anno.remove();
                (annoDoc.y !== undefined) && (minY = Math.min(NumCast(annoDoc.y), minY));
            }));

            mainAnnoDocProto.y = Math.max(minY, 0);
            mainAnnoDocProto.annotations = new List<Doc>(annoDocs);
        }
        mainAnnoDocProto.title = "Annotation on " + StrCast(this.props.Document.title);
        mainAnnoDocProto.annotationOn = this.props.Document;
        if (sourceDoc && createLink) {
            DocUtils.MakeLink(sourceDoc, mainAnnoDocProto, undefined, `Annotation from ${StrCast(this.props.Document.title)}`);
        }
        this._savedAnnotations.clear();
        this.Index = -1;
        return mainAnnoDoc;
    }

    @action
    getPlaceholderPage = (page: number) => {
        if (this._isPage[page] !== "none") {
            this._isPage[page] = "none";
            this._visibleElements[page] = (
                <div key={`${this.props.url}-placeholder-${page + 1}`} className="pdfviewer-placeholder"
                    style={{ width: this._pageSizes[page].width, height: this._pageSizes[page].height }}>
                    "PAGE IS LOADING... "
                </div>);
        }
    }

    @action
    getRenderedPage = (page: number) => {
        if (this._isPage[page] !== "page") {
            this._isPage[page] = "page";
            this._visibleElements[page] = (<Page {...this.props}
                size={this._pageSizes[page]}
                numPages={this.props.pdf.numPages}
                setSelectionText={this.setSelectionText}
                page={page}
                key={`${this.props.url}-rendered-${page + 1}`}
                name={`${this.props.pdf.fingerprint + `-page${page + 1}`}`}
                pageLoaded={this.pageLoaded}
                renderAnnotations={this.renderAnnotations}
                createAnnotation={this.createAnnotation}
                sendAnnotations={this.receiveAnnotations}
                makeAnnotationDocuments={this.makeAnnotationDocument}
                getScrollFromPage={this.getScrollFromPage} />);
        }
    }

    // change the address to be the file address of the PNG version of each page
    // file address of the pdf
    @action
    getPageImage = async (page: number) => {
        if (this._isPage[page] !== "image") {
            this._isPage[page] = "image";
            try {
                let res = JSON.parse(await rp.get(Utils.prepend(`/thumbnail${this.props.url.substring("files/".length, this.props.url.length - ".pdf".length)}-${page + 1}.PNG`)));
                runInAction(() => this._visibleElements[page] =
                    <img key={res.path} src={res.path} onError={() => this.getRenderedPage(page)}
                        style={{ width: `${parseInt(res.width) * scale}px`, height: `${parseInt(res.height) * scale}px` }} />);
            } catch (e) {
                console.log(e);
            }
        }
    }

    renderPages = () => {
        numberRange(this.props.pdf.numPages).filter(p => this._isPage[p] !== undefined).map(i =>
            (i < this.startIndex || i > this.endIndex) ? this.getPlaceholderPage(i) : // pages outside of the pdf use empty stand-in divs
                this.props.active() ? this.getRenderedPage(i) : this.getPageImage(i));
    }

    @action
    renderAnnotations = (annotations: Doc[], removeOldAnnotations: boolean): void => {
        if (removeOldAnnotations) {
            this._annotations = annotations;
        }
        else {
            this._annotations.push(...annotations);
            this._annotations = new Array<Doc>(...this._annotations);
        }
    }

    @action
    prevAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.Index = Math.max(this.Index - 1, 0);
    }

    @action
    nextAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.Index = Math.min(this.Index + 1, this.filteredAnnotations.length - 1);
    }

    sendAnnotations = (page: number) => {
        return this._savedAnnotations.getValue(page);
    }

    receiveAnnotations = (annotations: HTMLDivElement[], page: number) => {
        if (page === -1) {
            this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, annotations));
        }
        else {
            this._savedAnnotations.setValue(page, annotations);
        }
    }

    // get the page index that the vertical offset passed in is on
    getPageFromScroll = (vOffset: number) => {
        let index = 0;
        let currOffset = vOffset;
        while (index < this._pageSizes.length && this._pageSizes[index] && currOffset - this._pageSizes[index].height > 0) {
            currOffset -= this._pageSizes[index++].height;
        }
        return index;
    }

    getScrollFromPage = (index: number): number => {
        return numberRange(Math.min(this.props.pdf.numPages, index)).reduce((counter, i) => counter + this._pageSizes[i].height, 0);
    }

    @action
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

    @action
    search = (searchString: string) => {
        if (this._pdfViewer._pageViewsReady) {
            this._pdfFindController.executeCommand('find', {
                caseSensitive: false,
                findPrevious: undefined,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
        }
        else if (this._mainCont.current) {
            let executeFind = () => this._pdfFindController.executeCommand('find', {
                caseSensitive: false,
                findPrevious: undefined,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
            this._mainCont.current.addEventListener("pagesloaded", executeFind);
            this._mainCont.current.addEventListener("pagerendered", executeFind);
        }
    }


    @action
    toggleSearch = (e: React.MouseEvent) => {
        e.stopPropagation();
        this._searching = !this._searching;

        if (this._searching) {
            if (!this._pdfFindController && this._mainCont.current && this._viewer.current) {
                let simpleLinkService = new SimpleLinkService();
                this._pdfViewer = new PDFJSViewer.PDFViewer({
                    container: this._mainCont.current,
                    viewer: this._viewer.current,
                    linkService: simpleLinkService
                });
                simpleLinkService.setPdf(this.props.pdf);
                this._mainCont.current.addEventListener("pagesinit", () => this._pdfViewer.currentScaleValue = 1);
                this._mainCont.current.addEventListener("pagerendered", () => console.log("rendered"));
                this._pdfViewer.setDocument(this.props.pdf);
                this._pdfFindController = new PDFJSViewer.PDFFindController(this._pdfViewer);
                this._pdfViewer.findController = this._pdfFindController;
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

    render() {
        return (<div className="pdfViewer-viewer" ref={this._mainCont} >
            <div className="pdfViewer-visibleElements" style={this._searching ? { position: "absolute", top: 0 } : {}}>
                {this._visibleElements}
            </div>
            <div className="pdfViewer-text" ref={this._viewer} />
            <div className="pdfViewer-annotationLayer" style={{ height: NumCast(this.props.Document.nativeHeight) }} ref={this._annotationLayer}>
                {this.filteredAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map((anno, index) =>
                    <Annotation {...this.props} ParentIndex={this.getIndex} anno={anno} index={index} key={`${anno[Id]}-annotation`} />)}
            </div>
            <div className="pdfViewer-overlayCont" onPointerDown={(e) => e.stopPropagation()}
                style={{ bottom: -this.props.panY, left: `${this._searching ? 0 : 100}%` }}>
                <button className="pdfViewer-overlayButton" title="Open Search Bar" />
                <input className="pdfViewer-overlaySearchBar" placeholder="Search" onChange={this.searchStringChanged}
                    onKeyDown={(e: React.KeyboardEvent) => e.keyCode === KeyCodes.ENTER ? this.search(this._searchString) : e.keyCode === KeyCodes.BACKSPACE ? e.stopPropagation() : true} />
                <button title="Search" onClick={() => this.search(this._searchString)}>
                    <FontAwesomeIcon icon="search" size="3x" color="white" /></button>
            </div>
            <button className="pdfViewer-overlayButton" onClick={this.prevAnnotation} title="Previous Annotation"
                style={{ bottom: -this.props.panY + 280, right: 10, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="3x" /></div>
            </button>
            <button className="pdfViewer-overlayButton" onClick={this.nextAnnotation} title="Next Annotation"
                style={{ bottom: -this.props.panY + 200, right: 10, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="3x" /></div>
            </button>
            <button className="pdfViewer-overlayButton" onClick={this.toggleSearch} title="Open Search Bar"
                style={{ bottom: -this.props.panY + 10, right: 0, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="3x" /></div>
            </button>
        </div >);
    }
}

export enum AnnotationTypes { Region }

class SimpleLinkService {
    externalLinkTarget: any = null;
    externalLinkRel: any = null;
    pdf: any = null;

    navigateTo() { }

    getDestinationHash() { return "#"; }

    getAnchorUrl() { return "#"; }

    setHash() { }

    executeNamedAction() { }

    cachePageRef() { }

    get pagesCount() { return this.pdf ? this.pdf.numPages : 0; }

    get page() { return 0; }

    setPdf(pdf: any) { this.pdf = pdf; }

    get rotation() { return 0; }
    set rotation(value: any) { }
}