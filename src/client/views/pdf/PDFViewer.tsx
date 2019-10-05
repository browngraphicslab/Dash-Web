import { action, computed, IReactionDisposer, observable, reaction, trace, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, FieldResult, WidthSym, Opt, HeightSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { List } from "../../../new_fields/List";
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from "../../../new_fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import smoothScroll, { Utils, emptyFunction, returnOne, intersectRect } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { CompiledScript, CompileScript } from "../../util/Scripting";
import { Transform } from "../../util/Transform";
import PDFMenu from "./PDFMenu";
import "./PDFViewer.scss";
import React = require("react");
import * as rp from "request-promise";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import Annotation from "./Annotation";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { SelectionManager } from "../../util/SelectionManager";
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");
const pdfjsLib = require("pdfjs-dist");

pdfjsLib.GlobalWorkerOptions.workerSrc = `/assets/pdf.worker.js`;

interface IViewerProps {
    pdf: Pdfjs.PDFDocumentProxy;
    url: string;
    Document: Doc;
    DataDoc?: Doc;
    fieldExtensionDoc: Doc;
    fieldKey: string;
    fieldExt: string;
    PanelWidth: () => number;
    PanelHeight: () => number;
    ContentScaling: () => number;
    select: (isCtrlPressed: boolean) => void;
    startupLive: boolean;
    renderDepth: number;
    focus: (doc: Doc) => void;
    isSelected: () => boolean;
    loaded: (nw: number, nh: number, np: number) => void;
    active: () => boolean;
    GoToPage?: (n: number) => void;
    addDocTab: (document: Doc, dataDoc: Doc | undefined, where: string) => boolean;
    pinToPres: (document: Doc) => void;
    addDocument?: (doc: Doc, allowDuplicates?: boolean) => boolean;
    setPdfViewer: (view: PDFViewer) => void;
    ScreenToLocalTransform: () => Transform;
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    whenActiveChanged: (isActive: boolean) => void;
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
    @observable private Index: number = -1;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;
    @observable private _marqueeing: boolean = false;
    @observable private _showWaiting = true;
    @observable private _showCover = false;
    @observable private _zoomed = 1;
    @observable private _scrollTop = 0;

    private _pdfViewer: any;
    private _retries = 0; // number of times tried to create the PDF viewer 
    private _isChildActive = false;
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _reactionDisposer?: IReactionDisposer;
    private _selectionReactionDisposer?: IReactionDisposer;
    private _annotationReactionDisposer?: IReactionDisposer;
    private _filterReactionDisposer?: IReactionDisposer;
    private _searchReactionDisposer?: IReactionDisposer;
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _selectionText: string = "";
    private _startX: number = 0;
    private _startY: number = 0;
    private _downX: number = 0;
    private _downY: number = 0;
    private _coverPath: any;

    @computed get allAnnotations() {
        return DocListCast(this.props.fieldExtensionDoc.annotations).filter(
            anno => this._script.run({ this: anno }, console.log, true).result);
    }

    @computed get nonDocAnnotations() {
        return this._annotations.filter(anno => this._script.run({ this: anno }, console.log, true).result);
    }

    _lastSearch: string = "";
    componentDidMount = async () => {
        // change the address to be the file address of the PNG version of each page
        // file address of the pdf
        this._coverPath = JSON.parse(await rp.get(Utils.prepend(`/thumbnail${this.props.url.substring("files/".length, this.props.url.length - ".pdf".length)}-${NumCast(this.props.Document.curPage, 1)}.PNG`)));
        runInAction(() => this._showWaiting = this._showCover = true);
        this.props.startupLive && this.setupPdfJsViewer();
        this._searchReactionDisposer = reaction(() => StrCast(this.props.Document.search_string), searchString => {
            if (searchString) {
                this.search(searchString, true);
                this._lastSearch = searchString;
            }
            else {
                setTimeout(() => this._lastSearch === "mxytzlaf" && this.search("mxytzlaf", true), 200); // bcz: how do we clear search highlights?
                this._lastSearch && (this._lastSearch = "mxytzlaf");
            }
        }, { fireImmediately: true });

        this._selectionReactionDisposer = reaction(() => this.props.isSelected(), () => (this.props.isSelected() && SelectionManager.SelectedDocuments().length === 1) && this.setupPdfJsViewer(), { fireImmediately: true });
        this._reactionDisposer = reaction(
            () => this.props.Document.scrollY,
            (scrollY) => {
                if (scrollY !== undefined) {
                    if (this._showCover || this._showWaiting) {
                        this.setupPdfJsViewer();
                    }
                    this._mainCont.current && smoothScroll(1000, this._mainCont.current, NumCast(this.props.Document.scrollY) || 0);
                    this.props.Document.scrollY = undefined;
                }
            },
            { fireImmediately: true }
        );
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
        this._annotationReactionDisposer && this._annotationReactionDisposer();
        this._filterReactionDisposer && this._filterReactionDisposer();
        this._selectionReactionDisposer && this._selectionReactionDisposer();
        this._searchReactionDisposer && this._searchReactionDisposer();
        document.removeEventListener("copy", this.copy);
    }

    copy = (e: ClipboardEvent) => {
        if (this.props.active() && e.clipboardData) {
            let annoDoc = this.makeAnnotationDocument("#0390fc");
            if (annoDoc) {
                e.clipboardData.setData("text/plain", this._selectionText);
                e.clipboardData.setData("dash/pdfOrigin", this.props.Document[Id]);
                e.clipboardData.setData("dash/pdfRegion", annoDoc[Id]);
            }
            e.preventDefault();
        }
    }

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
            Doc.GetProto(this.props.Document).scrollHeight = this._pageSizes.reduce((size, page) => size + page.height, 0) * 96 / 72;
        }
    }

    @action
    setupPdfJsViewer = async () => {
        this._selectionReactionDisposer && this._selectionReactionDisposer();
        this._selectionReactionDisposer = undefined;
        this._showWaiting = true;
        this.props.setPdfViewer(this);
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

        this.createPdfViewer();
    }

    createPdfViewer() {
        if (!this._mainCont.current) {
            if (this._retries < 5) {
                this._retries++;
                setTimeout(() => this.createPdfViewer(), 1000);
            }
            return;
        }
        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);
        document.addEventListener("pagesinit", action(() => {
            this._pdfViewer.currentScaleValue = this._zoomed = 1;
            this.gotoPage(NumCast(this.props.Document.curPage, 1));
        }));
        document.addEventListener("pagerendered", action(() => this._showCover = this._showWaiting = false));
        var pdfLinkService = new PDFJSViewer.PDFLinkService();
        let pdfFindController = new PDFJSViewer.PDFFindController({
            linkService: pdfLinkService,
        });
        this._pdfViewer = new PDFJSViewer.PDFViewer({
            container: this._mainCont.current,
            viewer: this._viewer.current,
            linkService: pdfLinkService,
            findController: pdfFindController,
            renderer: "canvas",
        });
        pdfLinkService.setViewer(this._pdfViewer);
        pdfLinkService.setDocument(this.props.pdf, null);
        this._pdfViewer.setDocument(this.props.pdf);
    }

    @action
    makeAnnotationDocument = (color: string): Opt<Doc> => {
        if (this._savedAnnotations.size() === 0) return undefined;
        let mainAnnoDoc = Docs.Create.InstanceFromProto(new Doc(), "", {});
        let mainAnnoDocProto = Doc.GetProto(mainAnnoDoc);
        let annoDocs: Doc[] = [];
        let minY = Number.MAX_VALUE;
        if ((this._savedAnnotations.values()[0][0] as any).marqueeing) {
            let anno = this._savedAnnotations.values()[0][0];
            let annoDoc = Docs.Create.FreeformDocument([], { backgroundColor: color, title: "Annotation on " + StrCast(this.props.Document.title) });
            if (anno.style.left) annoDoc.x = parseInt(anno.style.left);
            if (anno.style.top) annoDoc.y = parseInt(anno.style.top);
            if (anno.style.height) annoDoc.height = parseInt(anno.style.height);
            if (anno.style.width) annoDoc.width = parseInt(anno.style.width);
            annoDoc.group = mainAnnoDoc;
            annoDoc.isButton = true;
            annoDocs.push(annoDoc);
            anno.remove();
            mainAnnoDoc = annoDoc;
            mainAnnoDocProto = Doc.GetProto(mainAnnoDoc);
            mainAnnoDocProto.y = annoDoc.y;
        } else {
            this._savedAnnotations.forEach((key: number, value: HTMLDivElement[]) => value.map(anno => {
                let annoDoc = new Doc();
                if (anno.style.left) annoDoc.x = parseInt(anno.style.left);
                if (anno.style.top) annoDoc.y = parseInt(anno.style.top);
                if (anno.style.height) annoDoc.height = parseInt(anno.style.height);
                if (anno.style.width) annoDoc.width = parseInt(anno.style.width);
                annoDoc.group = mainAnnoDoc;
                annoDoc.backgroundColor = color;
                annoDocs.push(annoDoc);
                anno.remove();
                (annoDoc.y !== undefined) && (minY = Math.min(NumCast(annoDoc.y), minY));
            }));

            mainAnnoDocProto.y = Math.max(minY, 0);
            mainAnnoDocProto.annotations = new List<Doc>(annoDocs);
        }
        mainAnnoDocProto.title = "Annotation on " + StrCast(this.props.Document.title);
        mainAnnoDocProto.annotationOn = this.props.Document;
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
    prevAnnotation = () => {
        this.Index = Math.max(this.Index - 1, 0);
        this.scrollToAnnotation(this.allAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y))[this.Index]);
    }

    @action
    nextAnnotation = () => {
        this.Index = Math.min(this.Index + 1, this.allAnnotations.length - 1);
        this.scrollToAnnotation(this.allAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y))[this.Index]);
    }

    @action
    gotoPage = (p: number) => {
        this._pdfViewer && this._pdfViewer.scrollPageIntoView({ pageNumber: Math.min(Math.max(1, p), this._pageSizes.length) });
    }

    @action
    scrollToAnnotation = (scrollToAnnotation: Doc) => {
        let offset = this.visibleHeight() / 2 * 96 / 72;
        this._mainCont.current && smoothScroll(500, this._mainCont.current, NumCast(scrollToAnnotation.y) - offset);
        Doc.linkFollowHighlight(scrollToAnnotation);
    }


    @action
    onScroll = (e: React.UIEvent<HTMLElement>) => {
        this._scrollTop = this._mainCont.current!.scrollTop;
        this._pdfViewer && (this.props.Document.curPage = this._pdfViewer.currentPageNumber);
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

    @action
    createAnnotation = (div: HTMLDivElement, page: number) => {
        if (this._annotationLayer.current) {
            if (div.style.top) {
                div.style.top = (parseInt(div.style.top)/*+ this.getScrollFromPage(page)*/).toString();
            }
            this._annotationLayer.current.append(div);
            div.style.backgroundColor = "yellow";
            div.style.opacity = "0.5";
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
    search = (searchString: string, fwd: boolean) => {
        if (!searchString) {
            fwd ? this.nextAnnotation() : this.prevAnnotation();
        }
        else if (this._pdfViewer._pageViewsReady) {
            this._pdfViewer.findController.executeCommand('findagain', {
                caseSensitive: false,
                findPrevious: !fwd,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
        }
        else if (this._mainCont.current) {
            let executeFind = () => {
                this._pdfViewer.findController.executeCommand('find', {
                    caseSensitive: false,
                    findPrevious: !fwd,
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
    onPointerDown = (e: React.PointerEvent): void => {
        // if alt+left click, drag and annotate
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (NumCast(this.props.Document.scale, 1) !== 1) return;
        if ((e.button !== 0 || e.altKey) && this.active()) {
            this._setPreviewCursor && this._setPreviewCursor(e.clientX, e.clientY, true);
        }
        this._marqueeing = false;
        if (!e.altKey && e.button === 0 && this.active()) {
            // clear out old marquees and initialize menu for new selection
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
            PDFMenu.Instance.Snippet = this.createSnippet;
            PDFMenu.Instance.Status = "pdf";
            PDFMenu.Instance.fadeOut(true);
            this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, []));
            if (e.target && (e.target as any).parentElement.className === "textLayer") {
                // start selecting text if mouse down on textLayer spans
            }
            else if (this._mainCont.current) {
                // set marquee x and y positions to the spatially transformed position
                let boundingRect = this._mainCont.current.getBoundingClientRect();
                this._startX = this._marqueeX = (e.clientX - boundingRect.left) * (this._mainCont.current.offsetWidth / boundingRect.width);
                this._startY = this._marqueeY = (e.clientY - boundingRect.top) * (this._mainCont.current.offsetHeight / boundingRect.height) + this._mainCont.current.scrollTop;
                this._marqueeHeight = this._marqueeWidth = 0;
                this._marqueeing = true;
            }
            document.removeEventListener("pointermove", this.onSelectMove);
            document.addEventListener("pointermove", this.onSelectMove);
            document.removeEventListener("pointerup", this.onSelectEnd);
            document.addEventListener("pointerup", this.onSelectEnd);
        }
    }

    @action
    onSelectMove = (e: PointerEvent): void => {
        if (this._marqueeing && this._mainCont.current) {
            // transform positions and find the width and height to set the marquee to
            let boundingRect = this._mainCont.current.getBoundingClientRect();
            this._marqueeWidth = ((e.clientX - boundingRect.left) * (this._mainCont.current.offsetWidth / boundingRect.width)) - this._startX;
            this._marqueeHeight = ((e.clientY - boundingRect.top) * (this._mainCont.current.offsetHeight / boundingRect.height)) - this._startY + this._mainCont.current.scrollTop;
            this._marqueeX = Math.min(this._startX, this._startX + this._marqueeWidth);
            this._marqueeY = Math.min(this._startY, this._startY + this._marqueeHeight);
            this._marqueeWidth = Math.abs(this._marqueeWidth);
            this._marqueeHeight = Math.abs(this._marqueeHeight);
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
                if (rect) {
                    let scaleY = this._mainCont.current.offsetHeight / boundingRect.height;
                    let scaleX = this._mainCont.current.offsetWidth / boundingRect.width;
                    if (rect.width !== this._mainCont.current.clientWidth &&
                        (i === 0 || !intersectRect(clientRects[i], clientRects[i - 1]))) {
                        let annoBox = document.createElement("div");
                        annoBox.className = "pdfViewer-annotationBox";
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
        this._selectionText = selRange.cloneContents().textContent || "";

        // clear selection
        if (sel.empty) {  // Chrome
            sel.empty();
        } else if (sel.removeAllRanges) {  // Firefox
            sel.removeAllRanges();
        }
    }

    @action
    onSelectEnd = (e: PointerEvent): void => {
        this._savedAnnotations.clear();
        if (this._marqueeing) {
            if (this._marqueeWidth > 10 || this._marqueeHeight > 10) {
                let marquees = this._mainCont.current!.getElementsByClassName("pdfViewer-dragAnnotationBox");
                if (marquees && marquees.length) { // copy the marquee and convert it to a permanent annotation. 
                    let style = (marquees[0] as HTMLDivElement).style;
                    let copy = document.createElement("div");
                    copy.style.left = style.left;
                    copy.style.top = style.top;
                    copy.style.width = style.width;
                    copy.style.height = style.height;
                    copy.style.border = style.border;
                    copy.style.opacity = style.opacity;
                    (copy as any).marqueeing = true;
                    copy.className = "pdfViewer-annotationBox";
                    this.createAnnotation(copy, this.getPageFromScroll(this._marqueeY));
                }

                if (!e.ctrlKey) {
                    PDFMenu.Instance.Status = "snippet";
                    PDFMenu.Instance.Marquee = { left: this._marqueeX, top: this._marqueeY, width: this._marqueeWidth, height: this._marqueeHeight };
                }
                PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
            }
            this._marqueeing = false;
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
            this.highlight("rgba(245, 230, 95, 0.616)");  // when highlighter has been toggled when menu is pinned, we auto-highlight immediately on mouse up
        }
        else {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
        }
        document.removeEventListener("pointermove", this.onSelectMove);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }

    @action
    highlight = (color: string) => {
        // creates annotation documents for current highlights
        let annotationDoc = this.makeAnnotationDocument(color);
        annotationDoc && Doc.AddDocToList(this.props.fieldExtensionDoc, this.props.fieldExt, annotationDoc);
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
        let targetDoc = Docs.Create.TextDocument({ width: 200, height: 200, title: "Note linked to " + this.props.Document.title });
        const annotationDoc = this.highlight("rgba(146, 245, 95, 0.467)");
        if (annotationDoc) {
            let dragData = new DragManager.AnnotationDragData(this.props.Document, annotationDoc, targetDoc);
            DragManager.StartAnnotationDrag([ele], dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: () => !(dragData as any).linkedToDoc &&
                        DocUtils.MakeLink({ doc: annotationDoc }, { doc: dragData.dropDocument, ctx: dragData.targetContext }, `Annotation from ${StrCast(this.props.Document.title)}`, "link from PDF")

                },
                hideSource: false
            });
        }
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

    // this is called with the document that was dragged and the collection to move it into.
    // if the target collection is the same as this collection, then the move will be allowed.
    // otherwise, the document being moved must be able to be removed from its container before
    // moving it into the target.  
    @action.bound
    moveDocument(doc: Doc, targetCollection: Doc, addDocument: (doc: Doc) => boolean): boolean {
        if (Doc.AreProtosEqual(this.props.Document, targetCollection)) {
            return true;
        }
        return this.removeDocument(doc) ? addDocument(doc) : false;
    }


    @action.bound
    removeDocument(doc: Doc): boolean {
        Doc.GetProto(doc).annotationOn = undefined;
        //TODO This won't create the field if it doesn't already exist
        let targetDataDoc = this.props.fieldExtensionDoc;
        let targetField = this.props.fieldExt;
        let value = Cast(targetDataDoc[targetField], listSpec(Doc), []);
        let index = value.reduce((p, v, i) => (v instanceof Doc && v === doc) ? i : p, -1);
        index = index !== -1 ? index : value.reduce((p, v, i) => (v instanceof Doc && Doc.AreProtosEqual(v, doc)) ? i : p, -1);
        index !== -1 && value.splice(index, 1);
        return true;
    }
    scrollXf = () => {
        return this._mainCont.current ? this.props.ScreenToLocalTransform().translate(0, this._scrollTop) : this.props.ScreenToLocalTransform();
    }
    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => {
        this._setPreviewCursor = func;
    }
    onClick = (e: React.MouseEvent) => {
        this._setPreviewCursor &&
            e.button === 0 &&
            Math.abs(e.clientX - this._downX) < 3 &&
            Math.abs(e.clientY - this._downY) < 3 &&
            this._setPreviewCursor(e.clientX, e.clientY, false);
    }
    whenActiveChanged = (isActive: boolean) => {
        this._isChildActive = isActive;
        this.props.whenActiveChanged(isActive);
    }
    active = () => {
        return this.props.isSelected() || this._isChildActive || this.props.renderDepth === 0;
    }

    getCoverImage = () => {
        if (!this.props.Document[HeightSym]() || !this.props.Document.nativeHeight) {
            setTimeout((() => {
                this.props.Document.height = this.props.Document[WidthSym]() * this._coverPath.height / this._coverPath.width;
                this.props.Document.nativeHeight = nativeWidth * this._coverPath.height / this._coverPath.width;
            }).bind(this), 0);
        }
        let nativeWidth = NumCast(this.props.Document.nativeWidth);
        let nativeHeight = NumCast(this.props.Document.nativeHeight);
        return <img key={this._coverPath.path} src={this._coverPath.path} onError={action(() => this._coverPath.path = "http://www.cs.brown.edu/~bcz/face.gif")} onLoad={action(() => this._showWaiting = false)}
            style={{ position: "absolute", display: "inline-block", top: 0, left: 0, width: `${nativeWidth}px`, height: `${nativeHeight}px` }} />;
    }


    @action
    onZoomWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        if (e.ctrlKey) {
            let curScale = Number(this._pdfViewer.currentScaleValue);
            this._pdfViewer.currentScaleValue = Math.max(1, Math.min(10, curScale + curScale * e.deltaY / 1000));
            this._zoomed = Number(this._pdfViewer.currentScaleValue);
        }
    }

    @computed get annotationLayer() {
        return <div className="pdfViewer-annotationLayer" style={{ height: NumCast(this.props.Document.nativeHeight) }} ref={this._annotationLayer}>
            {this.nonDocAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map((anno, index) =>
                <Annotation {...this.props} focus={this.props.focus} anno={anno} key={`${anno[Id]}-annotation`} />)}
            <div className="pdfViewer-overlay" id="overlay" style={{ transform: `scale(${this._zoomed})` }}>
                <CollectionFreeFormView {...this.props}
                    setPreviewCursor={this.setPreviewCursor}
                    PanelHeight={() => NumCast(this.props.Document.scrollHeight, NumCast(this.props.Document.nativeHeight))}
                    PanelWidth={() => this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width : NumCast(this.props.Document.nativeWidth)}
                    VisibleHeight={this.visibleHeight}
                    focus={this.props.focus}
                    isSelected={this.props.isSelected}
                    select={emptyFunction}
                    active={this.active}
                    ContentScaling={returnOne}
                    whenActiveChanged={this.whenActiveChanged}
                    removeDocument={this.removeDocument}
                    moveDocument={this.moveDocument}
                    addDocument={(doc: Doc, allow: boolean | undefined) => { Doc.GetProto(doc).annotationOn = this.props.Document; Doc.AddDocToList(this.props.fieldExtensionDoc, this.props.fieldExt, doc); return true; }}
                    CollectionView={this.props.ContainingCollectionView}
                    ScreenToLocalTransform={this.scrollXf}
                    ruleProvider={undefined}
                    renderDepth={this.props.renderDepth + 1}
                    ContainingCollectionDoc={this.props.ContainingCollectionView && this.props.ContainingCollectionView.props.Document}
                    chromeCollapsed={true}>
                </CollectionFreeFormView>
            </div>
        </div>;
    }
    @computed get pdfViewerDiv() {
        return <div className="pdfViewer-text" ref={this._viewer} style={{ transformOrigin: "left top" }} />;
    }
    @computed get standinViews() {
        return <>
            {this._showCover ? this.getCoverImage() : (null)}
            {this._showWaiting ? <img className="pdfViewer-waiting" key="waiting" src={"/assets/loading.gif"} /> : (null)}
        </>;
    }
    marqueeWidth = () => this._marqueeWidth;
    marqueeHeight = () => this._marqueeHeight;
    marqueeX = () => this._marqueeX;
    marqueeY = () => this._marqueeY;
    marqueeing = () => this._marqueeing;
    visibleHeight = () => this.props.PanelHeight() / this.props.ContentScaling() * 72 / 96;
    render() {
        return (<div className={"pdfViewer-viewer" + (this._zoomed !== 1 ? "-zoomed" : "")} onScroll={this.onScroll} onWheel={this.onZoomWheel} onPointerDown={this.onPointerDown} onClick={this.onClick} ref={this._mainCont}>
            {this.pdfViewerDiv}
            {this.annotationLayer}
            {this.standinViews}
            <PdfViewerMarquee isMarqueeing={this.marqueeing} width={this.marqueeWidth} height={this.marqueeHeight} x={this.marqueeX} y={this.marqueeY} />
        </div >);
    }
}

interface PdfViewerMarqueeProps {
    isMarqueeing: () => boolean;
    width: () => number;
    height: () => number;
    x: () => number;
    y: () => number;
}

@observer
class PdfViewerMarquee extends React.Component<PdfViewerMarqueeProps> {
    render() {
        return !this.props.isMarqueeing() ? (null) : <div className="pdfViewer-dragAnnotationBox"
            style={{
                left: `${this.props.x()}px`, top: `${this.props.y()}px`,
                width: `${this.props.width()}px`, height: `${this.props.height()}px`,
                border: `${this.props.width() === 0 ? "" : "2px dashed black"}`,
                opacity: 0.2
            }}>
        </div>;
    }
}