import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import * as rp from "request-promise";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, FieldResult, WidthSym, DocListCastAsync } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast, BoolCast } from "../../../new_fields/Types";
import { Utils, numberRange } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
import { KeyCodes } from "../../northstar/utils/KeyCodes";
import { CompileScript, CompiledScript } from "../../util/Scripting";
import Annotation from "./Annotation";
import "./PDFViewer.scss";
import React = require("react");
import requestPromise = require("request-promise");
import PDFMenu from "./PDFMenu";
import { DragManager } from "../../util/DragManager";
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");

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
    setPanY?: (n: number) => void;
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
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _annotations: Doc[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompiledScript = CompileScript("return true") as CompiledScript;
    @observable private _searching: boolean = false;
    @observable private Index: number = -1;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;

    private _resizeReaction: IReactionDisposer | undefined;
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _filterReactionDisposer?: IReactionDisposer;
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    public _pdfViewer: any;
    private _searchString: string = "";
    private _selectionText: string = "";
    private _marquee: React.RefObject<HTMLDivElement> = React.createRef();
    private _marqueeing: boolean = false;
    private _startY: number = 0;
    private _startX: number = 0;


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
        this._reactionDisposer = reaction(
            () => this.props.Document.panY,
            () => this._mainCont.current && this._mainCont.current.scrollTo({ top: NumCast(this.props.Document.panY) || 0, behavior: "auto" })
        );

        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);
        setTimeout(this.setupPdfJsViewer, 1000);
    }

    componentWillUnmount = () => {
        this._resizeReaction && this._resizeReaction();
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

    setSelectionText = (text: string) => this._selectionText = text;

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
    setupPdfJsViewer = () => {
        this._reactionDisposer = reaction(() => this.props.Document[WidthSym](),
            () => this._pdfViewer.currentScaleValue = (this.props.Document[WidthSym]() / this._pageSizes[0].width));
        document.addEventListener("pagesinit", () => this._pdfViewer.currentScaleValue = (this.props.Document[WidthSym]() / this._pageSizes[0].width));
        document.addEventListener("pagerendered", () => console.log("rendered"));
        var pdfLinkService = new PDFJSViewer.PDFLinkService();
        let pdfFindController = new PDFJSViewer.PDFFindController({
            linkService: pdfLinkService,
        });
        this._pdfViewer = new PDFJSViewer.PDFViewer({
            container: this._mainCont.current,
            viewer: this._viewer.current,
            linkService: pdfLinkService,
            findController: pdfFindController,
            renderer: "svg"
        });
        pdfLinkService.setViewer(this._pdfViewer);
        pdfLinkService.setDocument(this.props.pdf, null);
        this._pdfViewer.setDocument(this.props.pdf);
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
            mainAnnoDocProto.y = annoDoc.y;
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
                div.style.top = (parseInt(div.style.top)/*+ this.getScrollFromPage(page)*/).toString();
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
            this._pdfViewer.findController.executeCommand('findagain', {
                caseSensitive: false,
                findPrevious: undefined,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
        }
        else if (this._mainCont.current) {
            let executeFind = () => {
                this._pdfViewer.findController.executeCommand('find', {
                    caseSensitive: false,
                    findPrevious: undefined,
                    highlightAll: true,
                    phraseSearch: true,
                    query: searchString
                });
            };
            this._mainCont.current.addEventListener("pagesloaded", executeFind);
            this._mainCont.current.addEventListener("pagerendered", executeFind);
        }
    }


    @action
    toggleSearch = (e: React.MouseEvent) => {
        e.stopPropagation();
        this._searching = !this._searching;
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        // if alt+left click, drag and annotate
        if (NumCast(this.props.Document.scale, 1) !== 1) return;
        if (!e.altKey && e.button === 0) {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
            PDFMenu.Instance.Snippet = this.createSnippet;
            PDFMenu.Instance.Status = "pdf";
            PDFMenu.Instance.fadeOut(true);
            if (e.target && (e.target as any).parentElement.className === "textLayer") {
                e.stopPropagation();
                if (!e.ctrlKey) {
                    this.receiveAnnotations([], -1);
                }
            }
            else {
                // set marquee x and y positions to the spatially transformed position
                if (this._mainCont.current) {
                    let boundingRect = this._mainCont.current.getBoundingClientRect();
                    this._startX = this._marqueeX = (e.clientX - boundingRect.left) * (this._mainCont.current.offsetWidth / boundingRect.width);
                    this._startY = this._marqueeY = (e.clientY - boundingRect.top) * (this._mainCont.current.offsetHeight / boundingRect.height) + this._mainCont.current.scrollTop;
                }
                this._marqueeing = true;
                this._marquee.current && (this._marquee.current.style.opacity = "0.2");
                this.receiveAnnotations([], -1);
            }
            document.removeEventListener("pointermove", this.onSelectStart);
            document.addEventListener("pointermove", this.onSelectStart);
            document.removeEventListener("pointerup", this.onSelectEnd);
            document.addEventListener("pointerup", this.onSelectEnd);
        }
    }

    @action
    onSelectStart = (e: PointerEvent): void => {
        if (this._marqueeing && this._mainCont.current) {
            // transform positions and find the width and height to set the marquee to
            let boundingRect = this._mainCont.current.getBoundingClientRect();
            this._marqueeWidth = ((e.clientX - boundingRect.left) * (this._mainCont.current.offsetWidth / boundingRect.width)) - this._startX;
            this._marqueeHeight = ((e.clientY - boundingRect.top) * (this._mainCont.current.offsetHeight / boundingRect.height)) - this._startY + this._mainCont.current.scrollTop;
            this._marqueeX = Math.min(this._startX, this._startX + this._marqueeWidth);
            this._marqueeY = Math.min(this._startY, this._startY + this._marqueeHeight);
            this._marqueeWidth = Math.abs(this._marqueeWidth);
            e.stopPropagation();
            e.preventDefault();
        }
        else if (e.target && (e.target as any).parentElement === this._mainCont.current) {
            e.stopPropagation();
        }
    }

    @action
    createTextAnnotation = (sel: Selection, selRange: Range) => {
        if (this._mainCont.current) {
            let boundingRect = this._mainCont.current.getBoundingClientRect();
            let clientRects = selRange.getClientRects();
            for (let i = 0; i < clientRects.length; i++) {
                let rect = clientRects.item(i);
                if (rect/* && rect.width !== this._mainCont.current.getBoundingClientRect().width && rect.height !== this._mainCont.current.getBoundingClientRect().height / this.props.pdf.numPages*/) {
                    let page = this.getPageFromScroll(rect.top);
                    let scaleY = this._mainCont.current.offsetHeight / boundingRect.height;
                    let scaleX = this._mainCont.current.offsetWidth / boundingRect.width;
                    if (rect.width !== this._mainCont.current.clientWidth) {
                        let annoBox = document.createElement("div");
                        annoBox.className = "pdfPage-annotationBox";
                        // transforms the positions from screen onto the pdf div
                        annoBox.style.top = ((rect.top - boundingRect.top) * scaleY + this._mainCont.current.scrollTop).toString();
                        annoBox.style.left = ((rect.left - boundingRect.left) * scaleX).toString();
                        annoBox.style.width = (rect.width * this._mainCont.current.offsetWidth / boundingRect.width).toString();
                        annoBox.style.height = (rect.height * this._mainCont.current.offsetHeight / boundingRect.height).toString();
                        this.createAnnotation(annoBox, this.getPageFromScroll(rect.top));
                    }
                }
            }
        }
        let text = selRange.cloneContents().textContent;
        text && this.setSelectionText(text);

        // clear selection
        if (sel.empty) {  // Chrome
            sel.empty();
        } else if (sel.removeAllRanges) {  // Firefox
            sel.removeAllRanges();
        }
    }

    @action
    onSelectEnd = (e: PointerEvent): void => {
        if (this._marqueeing) {
            this._marqueeing = false;
            if (this._marqueeWidth > 10 || this._marqueeHeight > 10) {
                if (this._marquee.current) { // make a copy of the marquee
                    let copy = document.createElement("div");
                    let style = this._marquee.current.style;
                    copy.style.left = style.left;
                    copy.style.top = style.top;
                    copy.style.width = style.width;
                    copy.style.height = style.height;
                    copy.style.border = style.border;
                    copy.style.opacity = style.opacity;
                    copy.className = "pdfPage-annotationBox";
                    this.createAnnotation(copy, this.getPageFromScroll(this._marqueeY));
                    this._marquee.current.style.opacity = "0";
                }

                if (!e.ctrlKey) {
                    PDFMenu.Instance.Status = "snippet";
                    PDFMenu.Instance.Marquee = { left: this._marqueeX, top: this._marqueeY, width: this._marqueeWidth, height: this._marqueeHeight };
                }
                PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
            }

            this._marqueeHeight = this._marqueeWidth = 0;
        }
        else {
            let sel = window.getSelection();
            if (sel && sel.type === "Range") {
                let selRange = sel.getRangeAt(0);
                this.createTextAnnotation(sel, selRange);
                PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
            }
        }

        if (PDFMenu.Instance.Highlighting) {
            this.highlight(undefined, "goldenrod");
        }
        else {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
        }
        document.removeEventListener("pointermove", this.onSelectStart);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }

    @action
    highlight = (targetDoc: Doc | undefined, color: string) => {
        // creates annotation documents for current highlights
        let annotationDoc = this.makeAnnotationDocument(targetDoc, color, false);
        Doc.AddDocToList(this.props.fieldExtensionDoc, "annotations", annotationDoc);
        return annotationDoc;
    }

    /**
     * This is temporary for creating annotations from highlights. It will
     * start a drag event and create or put the necessary info into the drag event.
     */
    @action
    startDrag = (e: PointerEvent, ele: HTMLElement): void => {
        e.preventDefault();
        e.stopPropagation();
        let targetDoc = Docs.Create.TextDocument({ width: 200, height: 200, title: "New Annotation" });
        targetDoc.targetPage = this.getPageFromScroll(this._marqueeY);
        let annotationDoc = this.highlight(undefined, "red");
        annotationDoc.linkedToDoc = false;
        let dragData = new DragManager.AnnotationDragData(this.props.Document, annotationDoc, targetDoc);
        DragManager.StartAnnotationDrag([ele], dragData, e.pageX, e.pageY, {
            handlers: {
                dragComplete: async () => {
                    if (!BoolCast(annotationDoc.linkedToDoc)) {
                        let annotations = await DocListCastAsync(annotationDoc.annotations);
                        annotations && annotations.forEach(anno => anno.target = targetDoc);
                        DocUtils.MakeLink(annotationDoc, targetDoc, dragData.targetContext, `Annotation from ${StrCast(this.props.Document.title)}`);
                    }
                }
            },
            hideSource: false
        });
    }

    createSnippet = (marquee: { left: number, top: number, width: number, height: number }): void => {
        let view = Doc.MakeAlias(this.props.Document);
        let data = Doc.MakeDelegate(Doc.GetProto(this.props.Document));
        data.title = StrCast(data.title) + "_snippet";
        view.proto = data;
        view.nativeHeight = marquee.height;
        view.height = (this.props.Document[WidthSym]() / NumCast(this.props.Document.nativeWidth)) * marquee.height;
        view.nativeWidth = this.props.Document.nativeWidth;
        view.startY = marquee.top;
        view.width = this.props.Document[WidthSym]();
        DragManager.StartDocumentDrag([], new DragManager.DocumentDragData([view]), 0, 0);
    }

    render() {
        let scaling = this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width / this.props.Document[WidthSym]() : 1;
        return (<div className="pdfViewer-viewer" ref={this._mainCont}>
            <div className="pdfViewer-text" style={{ transform: `scale(${scaling})` }}>
                <div key="viewerReal" ref={this._viewer} />
            </div>
            <div className="pdfPage-dragAnnotationBox" ref={this._marquee}
                style={{
                    left: `${this._marqueeX}px`, top: `${this._marqueeY}px`,
                    width: `${this._marqueeWidth}px`, height: `${this._marqueeHeight}px`,
                    border: `${this._marqueeWidth === 0 ? "" : "10px dashed black"}`
                }}>
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