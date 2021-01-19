import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { Dictionary } from "typescript-collections";
import { Doc, DocListCast, Field, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { InkTool } from "../../../fields/InkField";
import { createSchema, makeInterface } from "../../../fields/Schema";
import { ScriptField } from "../../../fields/ScriptField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { PdfField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { addStyleSheet, addStyleSheetRule, clearStyleSheetRules, emptyFunction, OmitKeys, smoothScroll, Utils } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { Networking } from "../../Network";
import { CompiledScript, CompileScript } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { SharingManager } from "../../util/SharingManager";
import { SnappingManager } from "../../util/SnappingManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { FieldViewProps } from "../nodes/FieldView";
import { FormattedTextBoxComment } from "../nodes/formattedText/FormattedTextBoxComment";
import { LinkDocPreview } from "../nodes/LinkDocPreview";
import { Annotation } from "./Annotation";
import { PDFMenu } from "./PDFMenu";
import "./PDFViewer.scss";
const pdfjs = require('pdfjs-dist/es5/build/pdf.js');
import React = require("react");
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");
const pdfjsLib = require("pdfjs-dist");
const _global = (window /* browser */ || global /* node */) as any;

export const pageSchema = createSchema({
    _curPage: "number",
    rotation: "number",
    scrollHeight: "number",
    serachMatch: "boolean"
});

//pdfjsLib.GlobalWorkerOptions.workerSrc = `/assets/pdf.worker.js`;
// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@2.4.456/build/pdf.worker.min.js";

type PdfDocument = makeInterface<[typeof documentSchema, typeof pageSchema]>;
const PdfDocument = makeInterface(documentSchema, pageSchema);

interface IViewerProps extends FieldViewProps {
    pdf: Pdfjs.PDFDocumentProxy;
    url: string;
    startupLive: boolean;
    loaded?: (nw: number, nh: number, np: number) => void;
    isChildActive: (outsideReaction?: boolean) => boolean;
    setPdfViewer: (view: PDFViewer) => void;
    ContentScaling?: () => number;
}

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
export class PDFViewer extends ViewBoxAnnotatableComponent<IViewerProps, PdfDocument>(PdfDocument) {
    static _annotationStyle: any = addStyleSheet();
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @observable private _script: CompiledScript = CompileScript("return true") as CompiledScript;
    @observable private Index: number = -1;
    @observable private _marqueeing: number[] | undefined;
    @observable private _showWaiting = true;
    @observable private _showCover = false;
    @observable private _zoomed = 1;
    @observable private _overlayAnnoInfo: Opt<Doc>;

    private _pdfViewer: any;
    private _styleRule: any; // stylesheet rule for making hyperlinks clickable
    private _retries = 0; // number of times tried to create the PDF viewer
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _viewer: React.RefObject<HTMLDivElement> = React.createRef();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _selectionText: string = "";
    private _downX: number = 0;
    private _downY: number = 0;
    private _coverPath: any;
    private _lastSearch = false;
    private _viewerIsSetup = false;

    @computed get allAnnotations() {
        return DocUtils.FilterDocs(DocListCast(this.dataDoc[this.props.fieldKey + "-annotations"]), this.props.docFilters(), this.props.docRangeFilters(), undefined);
    }
    @computed get nonDocAnnotations() { return this.allAnnotations.filter(a => a.annotations); }

    componentDidMount = async () => {
        // change the address to be the file address of the PNG version of each page
        // file address of the pdf
        const { url: { href } } = Cast(this.dataDoc[this.props.fieldKey], PdfField)!;
        const { url: relative } = this.props;
        if (relative.includes("/pdfs/")) {
            const pathComponents = relative.split("/pdfs/")[1].split("/");
            const coreFilename = pathComponents.pop()!.split(".")[0];
            const params: any = {
                coreFilename,
                pageNum: Math.min(this.props.pdf.numPages, Math.max(1, this.Document._curPage || 1)),
            };
            if (pathComponents.length) {
                params.subtree = `${pathComponents.join("/")}/`;
            }
            this._coverPath = href.startsWith(window.location.origin) ? await Networking.PostToServer("/thumbnail", params) : { width: 100, height: 100, path: "" };
        } else {
            const params: any = {
                coreFilename: relative.split("/")[relative.split("/").length - 1],
                pageNum: Math.min(this.props.pdf.numPages, Math.max(1, this.Document._curPage || 1)),
            };
            this._coverPath = "http://cs.brown.edu/~bcz/face.gif";//href.startsWith(window.location.origin) ? await Networking.PostToServer("/thumbnail", params) : { width: 100, height: 100, path: "" };
        }
        runInAction(() => this._showWaiting = true);
        this.props.startupLive && this.setupPdfJsViewer();
        if (this._mainCont.current) {
            this._mainCont.current.scrollTop = this.layoutDoc._scrollTop || 0;
            const observer = new _global.ResizeObserver(action((entries: any) => this._mainCont.current && (this._mainCont.current.scrollTop = this.layoutDoc._scrollTop || 0)));
            observer.observe(this._mainCont.current);
            this._mainCont.current.addEventListener("scroll", (e) => (e.target as any).scrollLeft = 0);
        }

        this._disposers.searchMatch = reaction(() => Doc.IsSearchMatch(this.rootDoc),
            m => {
                if (m) (this._lastSearch = true) && this.search(Doc.SearchQuery(), m.searchMatch > 0);
                else !(this._lastSearch = false) && setTimeout(() => !this._lastSearch && this.search("", false, true), 200);
            }, { fireImmediately: true });

        this._disposers.selected = reaction(() => this.props.isSelected(),
            selected => {
                if (!selected) {
                    this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
                    this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, []));
                    PDFMenu.Instance.fadeOut(true);
                }
                (SelectionManager.Views().length === 1) && this.setupPdfJsViewer();
            },
            { fireImmediately: true });
        this._disposers.scrollY = reaction(
            () => this.Document._scrollY,
            (scrollY) => {
                if (scrollY !== undefined) {
                    (this._showCover || this._showWaiting) && this.setupPdfJsViewer();
                    if (this.props.renderDepth !== -1 && !LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc) {
                        const delay = this._mainCont.current ? 0 : 250; // wait for mainCont and try again to scroll
                        const durationStr = StrCast(this.Document._viewTransition).match(/([0-9]*)ms/);
                        const duration = durationStr ? Number(durationStr[1]) : 1000;
                        setTimeout(() => this._mainCont.current && smoothScroll(duration, this._mainCont.current, Math.abs(scrollY || 0)), delay);
                        setTimeout(() => { this.Document._scrollTop = scrollY; this.Document._scrollY = undefined; }, duration + delay);
                    }
                }
            },
            { fireImmediately: true }
        );
        this._disposers.scrollPreviewY = reaction(
            () => Cast(this.Document._scrollPreviewY, "number", null),
            (scrollY) => {
                if (scrollY !== undefined) {
                    (this._showCover || this._showWaiting) && this.setupPdfJsViewer();
                    if (this.props.renderDepth === -1 && scrollY >= 0) {
                        if (!this._mainCont.current) setTimeout(() => this._mainCont.current && smoothScroll(1000, this._mainCont.current, scrollY || 0));
                        else smoothScroll(1000, this._mainCont.current, scrollY || 0);
                        this.Document._scrollPreviewY = undefined;
                    }
                }
            },
            { fireImmediately: true }
        );
        this._disposers.curPage = reaction(
            () => this.Document._curPage,
            (page) => page !== undefined && page !== this._pdfViewer?.currentPageNumber && this.gotoPage(page),
            { fireImmediately: true }
        );
    }

    componentWillUnmount = () => {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        document.removeEventListener("copy", this.copy);
    }

    copy = (e: ClipboardEvent) => {
        if (this.active() && e.clipboardData) {
            //const annoDoc = this.makeAnnotationDocument("rgba(3,144,152,0.3)");  // copied text markup color (blueish)
            //if (annoDoc) {
            e.clipboardData.setData("text/plain", this._selectionText);
            // e.clipboardData.setData("dash/pdfOrigin", this.props.Document[Id]);
            // e.clipboardData.setData("dash/pdfRegion", annoDoc[Id]);
            //}
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
                    i === this.props.pdf.numPages - 1 && this.props.loaded?.((page.view[page.rotate === 0 || page.rotate === 180 ? 2 : 3] - page.view[page.rotate === 0 || page.rotate === 180 ? 0 : 1]),
                        (page.view[page.rotate === 0 || page.rotate === 180 ? 3 : 2] - page.view[page.rotate === 0 || page.rotate === 180 ? 1 : 0]), i);
                }))));
            this.Document.scrollHeight = this._pageSizes.reduce((size, page) => size + page.height, 0) * 96 / 72;
        }
    }

    @action
    setupPdfJsViewer = async () => {
        if (this._viewerIsSetup) return;
        else this._viewerIsSetup = true;
        this._showWaiting = true;
        this.props.setPdfViewer(this);
        await this.initialLoad();

        this._disposers.scrollTop = reaction(() => Cast(this.layoutDoc._scrollTop, "number", null),
            (stop) => {
                if (stop !== undefined && this.layoutDoc._scrollY === undefined && this._mainCont.current) {
                    (this._mainCont.current.scrollTop = stop);
                }
            },
            { fireImmediately: true });

        this._disposers.filterScript = reaction(
            () => Cast(this.Document.filterScript, ScriptField),
            action(scriptField => {
                const oldScript = this._script.originalScript;
                this._script = scriptField?.script.compiled ? scriptField.script : CompileScript("return true") as CompiledScript;
                if (this._script.originalScript !== oldScript) {
                    this.Index = -1;
                }
            }),
            { fireImmediately: true });

        this.createPdfViewer();
    }

    pagesinit = action(() => {
        if (this._pdfViewer._setDocumentViewerElement.offsetParent) {
            this._pdfViewer.currentScaleValue = this._zoomed = 1;
            this.gotoPage(this.Document._curPage || 1);
        }
        document.removeEventListener("pagesinit", this.pagesinit);
    });

    createPdfViewer() {
        if (!this._mainCont.current) { // bcz: I don't think this is ever triggered or needed
            if (this._retries < 5) {
                this._retries++;
                setTimeout(() => this.createPdfViewer(), 1000);
            }
            return;
        }
        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);
        const eventBus = new PDFJSViewer.EventBus(true);
        eventBus._on("pagesinit", this.pagesinit);
        eventBus._on("pagerendered", action(() => {
            this._showWaiting = false;
        }));
        const pdfLinkService = new PDFJSViewer.PDFLinkService({ eventBus });
        const pdfFindController = new PDFJSViewer.PDFFindController({ linkService: pdfLinkService, eventBus });
        this._pdfViewer = new PDFJSViewer.PDFViewer({
            container: this._mainCont.current,
            viewer: this._viewer.current,
            linkService: pdfLinkService,
            findController: pdfFindController,
            renderer: "canvas",
            eventBus
        });
        pdfLinkService.setViewer(this._pdfViewer);
        pdfLinkService.setDocument(this.props.pdf, null);
        this._pdfViewer.setDocument(this.props.pdf);
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
        if (this._pdfViewer?._setDocumentViewerElement?.offsetParent) {
            this._pdfViewer?.scrollPageIntoView({ pageNumber: Math.min(Math.max(1, p), this._pageSizes.length) });
        }
    }

    @action
    scrollToFrame = (duration: number, top: number) => {
        this._mainCont.current && smoothScroll(duration, this._mainCont.current, top);
    }

    @action
    scrollToAnnotation = (scrollToAnnotation: Doc) => {
        if (scrollToAnnotation) {
            const offset = (this.props.PanelHeight() / this.contentScaling) / 2;
            this._mainCont.current && smoothScroll(500, this._mainCont.current, NumCast(scrollToAnnotation.y) - offset);
            Doc.linkFollowHighlight(scrollToAnnotation);
        }
    }

    pageDelay: any;
    @action
    onScroll = (e: React.UIEvent<HTMLElement>) => {
        if (!LinkDocPreview.TargetDoc && !FormattedTextBoxComment.linkDoc) {
            this.pageDelay && clearTimeout(this.pageDelay);
            this.pageDelay = setTimeout(() => {
                this.Document._scrollY === undefined && this._mainCont.current && (this.layoutDoc._scrollTop = this._mainCont.current.scrollTop);
                this.pageDelay = undefined;
                //this._pdfViewer && (this.Document._curPage = this._pdfViewer.currentPageNumber);
            }, 1000);
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


    @action
    search = (searchString: string, fwd: boolean, clear: boolean = false) => {
        if (clear) {
            this._pdfViewer?.findController.executeCommand('reset', { query: "" });
        } else if (!searchString) {
            fwd ? this.nextAnnotation() : this.prevAnnotation();
        } else if (this._pdfViewer?.pageViewsReady) {
            this._pdfViewer.findController.executeCommand('findagain', {
                caseSensitive: false,
                findPrevious: !fwd,
                highlightAll: true,
                phraseSearch: true,
                query: searchString
            });
        }
        else if (this._mainCont.current) {
            const executeFind = () => {
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
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        if (hit && hit.localName === "span" && this.annotationsActive(true)) {  // drag selecting text stops propagation
            e.button === 0 && e.stopPropagation();
        }
        // if alt+left click, drag and annotate
        this._downX = e.clientX;
        this._downY = e.clientY;
        if ((this.Document._viewScale || 1) !== 1) return;
        if ((e.button !== 0 || e.altKey) && this.active(true)) {
            this._setPreviewCursor?.(e.clientX, e.clientY, true);
        }
        if (!e.altKey && e.button === 0 && this.active(true)) {
            if (e.target && (e.target as any).parentElement.className !== "textLayer") {
                this._marqueeing = [e.clientX, e.clientY];  // if texLayer is hit, then we select text instead of using a marquee
            } else {
                // clear out old marquees and initialize menu for new selection
                PDFMenu.Instance.Status = "pdf";
                PDFMenu.Instance.fadeOut(true);
                this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
                this._styleRule = addStyleSheetRule(PDFViewer._annotationStyle, "pdfAnnotation", { "pointer-events": "none" });
                document.addEventListener("pointermove", this.onSelectMove);
                document.addEventListener("pointerup", this.onSelectEnd);
            }
        }
    }

    @action
    finishMarquee = () => {
        this._marqueeing = undefined;
        this.props.select(false);
    }

    @action
    onSelectMove = (e: PointerEvent): void => {
        if (e.target && (e.target as any).parentElement === this._mainCont.current) e.stopPropagation();
    }

    @action
    onSelectEnd = (e: PointerEvent): void => {
        clearStyleSheetRules(PDFViewer._annotationStyle);
        this.props.select(false);
        document.removeEventListener("pointermove", this.onSelectMove);
        document.removeEventListener("pointerup", this.onSelectEnd);

        const sel = window.getSelection();
        if (sel?.type === "Range") {
            const selRange = sel.getRangeAt(0);
            this.createTextAnnotation(sel, selRange);
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
        }
    }

    @action
    createTextAnnotation = (sel: Selection, selRange: Range) => {
        if (this._mainCont.current) {
            const boundingRect = this._mainCont.current.getBoundingClientRect();
            const clientRects = selRange.getClientRects();
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects.item(i);
                if (rect) {
                    const scaleX = this._mainCont.current.offsetWidth / boundingRect.width;
                    if (rect.width !== this._mainCont.current.clientWidth) {
                        const annoBox = document.createElement("div");
                        annoBox.className = "marqueeAnnotator-annotationBox";
                        // transforms the positions from screen onto the pdf div
                        annoBox.style.top = ((rect.top - boundingRect.top) * scaleX / this._zoomed + this._mainCont.current.scrollTop).toString();
                        annoBox.style.left = ((rect.left - boundingRect.left) * scaleX / this._zoomed).toString();
                        annoBox.style.width = (rect.width * this._mainCont.current.offsetWidth / boundingRect.width / this._zoomed).toString();
                        annoBox.style.height = (rect.height * this._mainCont.current.offsetHeight / boundingRect.height / this._zoomed).toString();
                        this._annotationLayer.current && MarqueeAnnotator.previewNewAnnotation(this._savedAnnotations, this._annotationLayer.current, annoBox, this.getPageFromScroll(rect.top));
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

    scrollXf = () => {
        return this._mainCont.current ? this.props.ScreenToLocalTransform().translate(0, this.layoutDoc._scrollTop || 0) : this.props.ScreenToLocalTransform();
    }

    onClick = (e: React.MouseEvent) => {
        if (this._setPreviewCursor && e.button === 0 &&
            Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            this._setPreviewCursor(e.clientX, e.clientY, false);
        }
        e.stopPropagation();
    }

    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;

    getCoverImage = () => {
        if (!this.props.Document[HeightSym]() || !Doc.NativeHeight(this.props.Document)) {
            setTimeout((() => {
                this.Document._height = this.Document[WidthSym]() * this._coverPath.height / this._coverPath.width;
                Doc.SetNativeWidth(this.Document, (Doc.NativeWidth(this.Document) || 0) * this._coverPath.height / this._coverPath.width);
            }).bind(this), 0);
        }
        const nativeWidth = Doc.NativeWidth(this.Document);
        const nativeHeight = Doc.NativeHeight(this.Document);
        const resolved = Utils.prepend(this._coverPath.path);
        return <img key={resolved} src={resolved} onError={action(() => this._coverPath.path = "http://www.cs.brown.edu/~bcz/face.gif")} onLoad={action(() => this._showWaiting = false)}
            style={{ position: "absolute", display: "inline-block", top: 0, left: 0, width: `${nativeWidth}px`, height: `${nativeHeight}px` }} />;
    }

    @action
    onZoomWheel = (e: React.WheelEvent) => {
        if (this.active(true)) {
            e.stopPropagation();
            if (e.ctrlKey) {
                const curScale = Number(this._pdfViewer.currentScaleValue);
                this._pdfViewer.currentScaleValue = Math.max(1, Math.min(10, curScale - curScale * e.deltaY / 1000));
                this._zoomed = Number(this._pdfViewer.currentScaleValue);
            }
        }
    }

    @computed get annotationLayer() {
        TraceMobx();
        return <div className="pdfViewerDash-annotationLayer" style={{ height: Doc.NativeHeight(this.Document), transform: `scale(${this._zoomed})` }} ref={this._annotationLayer}>
            {this.nonDocAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} showInfo={this.showInfo} select={this.props.select} focus={this.props.focus} dataDoc={this.dataDoc} fieldKey={this.props.fieldKey} anno={anno} key={`${anno[Id]}-annotation`} />)
            }
        </div>;
    }

    @computed get overlayInfo() {
        return !this._overlayAnnoInfo || this._overlayAnnoInfo.author === Doc.CurrentUserEmail ? (null) :
            <div className="pdfViewerDash-overlayAnno" style={{ top: NumCast(this._overlayAnnoInfo.y), left: NumCast(this._overlayAnnoInfo.x) }}>
                <div className="pdfViewerDash-overlayAnno" style={{ right: -50, background: SharingManager.Instance.users.find(users => users.user.email === this._overlayAnnoInfo!.author)?.userColor }}>
                    {this._overlayAnnoInfo.author + " " + Field.toString(this._overlayAnnoInfo.creationDate as Field)}
                </div>
            </div>;
    }

    showInfo = action((anno: Opt<Doc>) => this._overlayAnnoInfo = anno);
    overlayTransform = () => this.scrollXf().scale(1 / this._zoomed);
    panelWidth = () => (this.Document.scrollHeight || Doc.NativeHeight(this.Document) || 0);
    panelHeight = () => this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width : Doc.NativeWidth(this.Document);
    @computed get overlayLayer() {
        return <div className={`pdfViewerDash-overlay${Doc.GetSelectedTool() !== InkTool.None || SnappingManager.GetIsDragging() ? "-inking" : ""}`}
            style={{
                pointerEvents: SnappingManager.GetIsDragging() ? "all" : undefined,
                mixBlendMode: this.allAnnotations.some(anno => anno.mixBlendMode) ? "hard-light" : undefined,
                transform: `scale(${this._zoomed})`
            }}>
            <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                isAnnotationOverlay={true}
                fieldKey={this.annotationKey}
                setPreviewCursor={this.setPreviewCursor}
                PanelHeight={this.panelWidth}
                PanelWidth={this.panelHeight}
                dropAction={"alias"}
                select={emptyFunction}
                active={this.annotationsActive}
                ContentScaling={this.contentZoom}
                bringToFront={emptyFunction}
                whenActiveChanged={this.whenActiveChanged}
                childPointerEvents={true}
                removeDocument={this.removeDocument}
                moveDocument={this.moveDocument}
                addDocument={this.addDocument}
                CollectionView={undefined}
                ScreenToLocalTransform={this.overlayTransform}
                renderDepth={this.props.renderDepth + 1}>
            </CollectionFreeFormView>
        </div>;
    }
    @computed get pdfViewerDiv() {
        return <div className={"pdfViewerDash-text" + ((this.props.isSelected() || this.props.isChildActive()) ? "-selected" : "")} ref={this._viewer} />;
    }
    @computed get contentScaling() { return this.props.ContentScaling?.() || 1; }
    @computed get standinViews() {
        return <>
            {this._showCover ? this.getCoverImage() : (null)}
            {this._showWaiting ? <img className="pdfViewerDash-waiting" key="waiting" src={"/assets/loading.gif"} /> : (null)}
        </>;
    }
    contentZoom = () => this._zoomed;
    render() {
        TraceMobx();
        return <div className={"pdfViewerDash" + (this.annotationsActive() ? "-interactive" : "")} ref={this._mainCont}
            onScroll={this.onScroll} onWheel={this.onZoomWheel} onPointerDown={this.onPointerDown} onClick={this.onClick}
            style={{
                overflowX: this._zoomed !== 1 ? "scroll" : undefined,
                width: !this.props.Document._fitWidth && (window.screen.width > 600) ? Doc.NativeWidth(this.props.Document) : `${100 / this.contentScaling}%`,
                height: !this.props.Document._fitWidth && (window.screen.width > 600) ? Doc.NativeHeight(this.props.Document) : `${100 / this.contentScaling}%`,
                transform: `scale(${this.contentScaling})`
            }}  >
            {this.pdfViewerDiv}
            {this.annotationLayer}
            {this.overlayLayer}
            {this.overlayInfo}
            {this.standinViews}
            {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                <MarqueeAnnotator rootDoc={this.rootDoc} down={this._marqueeing} addDocument={this.addDocument} finishMarquee={this.finishMarquee} getPageFromScroll={this.getPageFromScroll} savedAnnotations={this._savedAnnotations} annotationLayer={this._annotationLayer.current} mainCont={this._mainCont.current} />}
        </div >;
    }
}