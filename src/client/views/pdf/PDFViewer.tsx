import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import * as rp from "request-promise";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, FieldResult, WidthSym } from "../../../new_fields/Doc";
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
import requestPromise = require("request-promise");
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
    scrollTo: (y: number) => void;
    active: () => boolean;
    GoToPage?: (n: number) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
}

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
export class PDFViewer extends React.Component<IViewerProps> {
    @observable public _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompiledScript = CompileScript("return true") as CompiledScript;
    @observable private _searching: boolean = false;
    @observable private Index: number = -1;

    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _filterReactionDisposer?: IReactionDisposer;
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    public _pdfViewer: any;
    private _pdfFindController: any;
    private _searchString: string = "";
    private _selectionText: string = "";

    @computed get allAnnotations() {
        return DocListCast(this.props.fieldExtensionDoc.annotations).filter(
            anno => this._script.run({ this: anno }, console.log, true).result);
    }

    @computed get nonDocAnnotations() {
        return this._annotations.filter(anno => this._script.run({ this: anno }, console.log, true).result);
    }

    componentDidMount = async () => {
        await this.initialLoad();

        this._annotationReactionDisposer = reaction(
            () => this.props.fieldExtensionDoc && DocListCast(this.props.fieldExtensionDoc.annotations),
            annotations => annotations && annotations.length && this.renderAnnotations(annotations, true),
            { fireImmediately: true });

        this._filterReactionDisposer = reaction(
            () => ({ scriptField: Cast(this.props.Document.filterScript, ScriptField), annos: this._annotations.slice() }),
            action(({ scriptField, annos }: { scriptField: FieldResult<ScriptField>, annos: Doc[] }) => {
                let oldScript = this._script.originalScript;
                this._script = scriptField && scriptField.script.compiled ? scriptField.script : CompileScript("return true") as CompiledScript;
                if (this._script.originalScript !== oldScript) {
                    this.Index = -1;
                }
                annos.forEach(d => d.opacity = this._script.run({ this: d }, console.log, 1).result ? 1 : 0);
            }),
            { fireImmediately: true }
        );

        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);

        setTimeout(() => this.toggleSearch(undefined as any), 1000);
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
            this._pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            await Promise.all(this._pageSizes.map<Pdfjs.PDFPromise<any>>((val, i) =>
                this.props.pdf.getPage(i + 1).then(action((page: Pdfjs.PDFPageProxy) => {
                    this._pageSizes.splice(i, 1, {
                        width: (page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]),
                        height: (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0])
                    });
                    i === this.props.pdf.numPages - 1 && this.props.loaded((page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]),
                        (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0]), i);
                }))));
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
        let scrollToAnnotation = this.allAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y))[this.Index];
        this.allAnnotations.forEach(d => Doc.UnBrushDoc(d));
        Doc.BrushDoc(scrollToAnnotation);
        this.props.scrollTo(NumCast(scrollToAnnotation.y));
    }

    @action
    nextAnnotation = (e: React.MouseEvent) => {
        e.stopPropagation();
        this.Index = Math.min(this.Index + 1, this.allAnnotations.length - 1);
        let scrollToAnnotation = this.allAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y))[this.Index];
        this.allAnnotations.forEach(d => Doc.UnBrushDoc(d));
        Doc.BrushDoc(scrollToAnnotation);
        this.props.scrollTo(NumCast(scrollToAnnotation.y));
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
            this._pdfFindController.executeCommand('findagain', {
                caseSensitive: false,
                findPrevious: undefined,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
        }
        else if (this._mainCont.current) {
            let executeFind = () => {
                this._pdfFindController.executeCommand('find', {
                    caseSensitive: false,
                    findPrevious: undefined,
                    highlightAll: true,
                    phraseSearch: true,
                    query: searchString
                });
            }
            this._mainCont.current.addEventListener("pagesloaded", executeFind);
            this._mainCont.current.addEventListener("pagerendered", executeFind);
        }
    }


    @action
    toggleSearch = (e: React.MouseEvent) => {
        e && e.stopPropagation();
        this._searching = !this._searching;

        if (this._searching) {
            if (!this._pdfFindController && this._mainCont.current && this._viewer.current && !this._pdfViewer) {
                document.addEventListener("pagesinit", () => this._pdfViewer.currentScaleValue = this.props.Document[WidthSym]() / this._pageSizes[0].width);
                document.addEventListener("pagerendered", () => console.log("rendered"));
                var pdfLinkService = new PDFJSViewer.PDFLinkService();
                this._pdfFindController = new PDFJSViewer.PDFFindController({
                    linkService: pdfLinkService,
                });
                this._pdfViewer = new PDFJSViewer.PDFViewer({
                    container: this._mainCont.current,
                    viewer: this._viewer.current,
                    linkService: pdfLinkService,
                    findController: this._pdfFindController,
                    renderer: "svg"
                });
                pdfLinkService.setViewer(this._pdfViewer);
                pdfLinkService.setDocument(this.props.pdf, null);
                this._pdfViewer.setDocument(this.props.pdf);
            }
        }
    }

    render() {
        trace();
        let scaling = this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width / this.props.Document[WidthSym]() : 1;
        return (<div className="pdfViewer-viewer" ref={this._mainCont}  >
            <div className="pdfViewer-text" key="viewerText" style={{ transform: `scale(${scaling})` }} >
                <div key="viewerReal" ref={this._viewer} />
            </div>
            <div className="pdfViewer-annotationLayer" style={{ height: NumCast(this.props.Document.nativeHeight) }} ref={this._annotationLayer}>
                {this.nonDocAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map((anno, index) =>
                    <Annotation {...this.props} anno={anno} key={`${anno[Id]}-annotation`} />)}
            </div>
            <div className="pdfViewer-overlayCont" onPointerDown={(e) => e.stopPropagation()}
                style={{ bottom: 0, left: `${this._searching ? 0 : 100}%` }}>
                <button className="pdfViewer-overlayButton" title="Open Search Bar" />
                <input className="pdfViewer-overlaySearchBar" placeholder="Search" onChange={this.searchStringChanged}
                    onKeyDown={(e: React.KeyboardEvent) => e.keyCode === KeyCodes.ENTER ? this.search(this._searchString) : e.keyCode === KeyCodes.BACKSPACE ? e.stopPropagation() : true} />
                <button title="Search" onClick={() => this.search(this._searchString)}>
                    <FontAwesomeIcon icon="search" size="3x" color="white" /></button>
            </div>
            <button className="pdfViewer-overlayButton" onClick={this.prevAnnotation} title="Previous Annotation"
                style={{ bottom: 280, right: 10, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-up"} size="3x" /></div>
            </button>
            <button className="pdfViewer-overlayButton" onClick={this.nextAnnotation} title="Next Annotation"
                style={{ bottom: 200, right: 10, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={"arrow-down"} size="3x" /></div>
            </button>
            <button className="pdfViewer-overlayButton" onClick={this.toggleSearch} title="Open Search Bar"
                style={{ bottom: 10, right: 0, display: this.props.active() ? "flex" : "none" }}>
                <div className="pdfViewer-overlayButton-arrow" onPointerDown={(e) => e.stopPropagation()}></div>
                <div className="pdfViewer-overlayButton-iconCont" onPointerDown={(e) => e.stopPropagation()}>
                    <FontAwesomeIcon style={{ color: "white" }} icon={this._searching ? "times" : "search"} size="3x" /></div>
            </button>
        </div >);
    }
}

export enum AnnotationTypes { Region }
