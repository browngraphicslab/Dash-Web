import { action, computed, IReactionDisposer, observable, ObservableMap, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as Pdfjs from "pdfjs-dist";
import "pdfjs-dist/web/pdf_viewer.css";
import { DataSym, Doc, DocListCast, Field, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { InkTool } from "../../../fields/InkField";
import { createSchema } from "../../../fields/Schema";
import { Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { PdfField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { addStyleSheet, addStyleSheetRule, clearStyleSheetRules, emptyFunction, OmitKeys, smoothScroll, Utils, returnFalse } from "../../../Utils";
import { DocUtils } from "../../documents/Documents";
import { Networking } from "../../Network";
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { CompiledScript, CompileScript } from "../../util/Scripting";
import { SelectionManager } from "../../util/SelectionManager";
import { SharingManager } from "../../util/SharingManager";
import { SnappingManager } from "../../util/SnappingManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { FieldViewProps } from "../nodes/FieldView";
import { LinkDocPreview } from "../nodes/LinkDocPreview";
import { AnchorMenu } from "./AnchorMenu";
import { Annotation } from "./Annotation";
import "./PDFViewer.scss";
const pdfjs = require('pdfjs-dist/es5/build/pdf.js');
import React = require("react");
const PDFJSViewer = require("pdfjs-dist/web/pdf_viewer");
const pdfjsLib = require("pdfjs-dist");
const _global = (window /* browser */ || global /* node */) as any;

//pdfjsLib.GlobalWorkerOptions.workerSrc = `/assets/pdf.worker.js`;
// The workerSrc property shall be specified.
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@2.4.456/build/pdf.worker.min.js";

interface IViewerProps extends FieldViewProps {
    Document: Doc;
    rootDoc: Doc;
    dataDoc: Doc;
    layoutDoc: Doc;
    fieldKey: string;
    pdf: Pdfjs.PDFDocumentProxy;
    url: string;
    startupLive: boolean;
    loaded?: (nw: number, nh: number, np: number) => void;
    setPdfViewer: (view: PDFViewer) => void;
    ContentScaling?: () => number;
    sidebarWidth: () => number;
    anchorMenuClick?: (anchor: Doc) => void;
}

/**
 * Handles rendering and virtualization of the pdf
 */
@observer
export class PDFViewer extends React.Component<IViewerProps> {
    static _annotationStyle: any = addStyleSheet();
    @observable private _pageSizes: { width: number, height: number }[] = [];
    @observable private _savedAnnotations = new ObservableMap<number, HTMLDivElement[]>();
    @observable private _script: CompiledScript = CompileScript("return true") as CompiledScript;
    @observable private _marqueeing: number[] | undefined;
    @observable private _textSelecting = true;
    @observable private _showWaiting = true;
    @observable private _showCover = false;
    @observable private _zoomed = 1;
    @observable private _overlayAnnoInfo: Opt<Doc>;
    @observable private Index: number = -1;

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
    private _ignoreScroll = false;
    private _initialScroll: Opt<number>;
    private _forcedScroll = true;


    // key where data is stored
    @computed get allAnnotations() {
        return DocUtils.FilterDocs(DocListCast(this.props.dataDoc[this.props.fieldKey + "-annotations"]), this.props.docFilters(), this.props.docRangeFilters(), undefined);
    }
    @computed get inlineTextAnnotations() { return this.allAnnotations.filter(a => a.textInlineAnnotations); }

    componentDidMount = async () => {
        // change the address to be the file address of the PNG version of each page
        // file address of the pdf
        const { url: { href } } = Cast(this.props.dataDoc[this.props.fieldKey], PdfField)!;
        const { url: relative } = this.props;
        if (relative.includes("/pdfs/")) {
            const pathComponents = relative.split("/pdfs/")[1].split("/");
            const coreFilename = pathComponents.pop()!.split(".")[0];
            const params: any = {
                coreFilename,
                pageNum: Math.min(this.props.pdf.numPages, Math.max(1, NumCast(this.props.Document._curPage, 1))),
            };
            if (pathComponents.length) {
                params.subtree = `${pathComponents.join("/")}/`;
            }
            this._coverPath = href.startsWith(window.location.origin) ? await Networking.PostToServer("/thumbnail", params) : { width: 100, height: 100, path: "" };
        } else {
            const params: any = {
                coreFilename: relative.split("/")[relative.split("/").length - 1],
                pageNum: Math.min(this.props.pdf.numPages, Math.max(1, NumCast(this.props.Document._curPage, 1))),
            };
            this._coverPath = "http://cs.brown.edu/~bcz/face.gif";//href.startsWith(window.location.origin) ? await Networking.PostToServer("/thumbnail", params) : { width: 100, height: 100, path: "" };
        }
        runInAction(() => this._showWaiting = true);
        this.props.startupLive && this.setupPdfJsViewer();
        this._mainCont.current?.addEventListener("scroll", e => (e.target as any).scrollLeft = 0);

        this._disposers.autoHeight = reaction(() => this.props.layoutDoc._autoHeight,
            () => {
                this.props.layoutDoc._nativeHeight = NumCast(this.props.Document[this.props.fieldKey + "-nativeHeight"]);
                this.props.setHeight(NumCast(this.props.Document[this.props.fieldKey + "-nativeHeight"]) * (this.props.scaling?.() || 1));
            });

        this._disposers.searchMatch = reaction(() => Doc.IsSearchMatch(this.props.rootDoc),
            m => {
                if (m) (this._lastSearch = true) && this.search(Doc.SearchQuery(), m.searchMatch > 0);
                else !(this._lastSearch = false) && setTimeout(() => !this._lastSearch && this.search("", false, true), 200);
            }, { fireImmediately: true });

        this._disposers.selected = reaction(() => this.props.isSelected(),
            selected => {
                if (!selected) {
                    Array.from(this._savedAnnotations.values()).forEach(v => v.forEach(a => a.remove()));
                    Array.from(this._savedAnnotations.keys()).forEach(k => this._savedAnnotations.set(k, []));
                }
                (SelectionManager.Views().length === 1) && this.setupPdfJsViewer();
            },
            { fireImmediately: true });
        this._disposers.curPage = reaction(() => Cast(this.props.Document._curPage, "number", null),
            (page) => page !== undefined && page !== this._pdfViewer?.currentPageNumber && this.gotoPage(page),
            { fireImmediately: true }
        );
    }

    componentWillUnmount = () => {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        document.removeEventListener("copy", this.copy);
    }

    copy = (e: ClipboardEvent) => {
        if (this.props.isContentActive() && e.clipboardData) {
            e.clipboardData.setData("text/plain", this._selectionText);
            e.preventDefault();
        }
    }

    @action
    initialLoad = async () => {
        if (this._pageSizes.length === 0) {
            this._pageSizes = Array<{ width: number, height: number }>(this.props.pdf.numPages);
            await Promise.all(this._pageSizes.map<Pdfjs.PDFPromise<any>>((val, i) =>
                this.props.pdf.getPage(i + 1).then(action((page: Pdfjs.PDFPageProxy) => {
                    const page0or180 = page.rotate === 0 || page.rotate === 180;
                    this._pageSizes.splice(i, 1, {
                        width: (page.view[page0or180 ? 2 : 3] - page.view[page0or180 ? 0 : 1]),
                        height: (page.view[page0or180 ? 3 : 2] - page.view[page0or180 ? 1 : 0])
                    });
                    if (i === this.props.pdf.numPages - 1) {
                        this.props.loaded?.(page.view[page0or180 ? 2 : 3] - page.view[page0or180 ? 0 : 1],
                            page.view[page0or180 ? 3 : 2] - page.view[page0or180 ? 1 : 0], i);
                    }
                }))));
            this.props.Document.scrollHeight = this._pageSizes.reduce((size, page) => size + page.height, 0) * 96 / 72;
        }
    }

    // scrolls to focus on a nested annotation document.  if this is part a link preview then it will jump to the scroll location,
    // otherwise it will scroll smoothly.
    scrollFocus = (doc: Doc, smooth: boolean) => {
        const mainCont = this._mainCont.current;
        let focusSpeed: Opt<number>;
        if (doc !== this.props.rootDoc && mainCont && this._pdfViewer) {
            const scrollTo = Utils.scrollIntoView(NumCast(doc.y), doc[HeightSym](), NumCast(this.props.layoutDoc._scrollTop), this.props.PanelHeight() / (this.props.scaling?.() || 1));
            if (scrollTo !== undefined) {
                focusSpeed = 500;

                if (smooth) smoothScroll(focusSpeed, mainCont, scrollTo);
                else this._mainCont.current?.scrollTo({ top: Math.abs(scrollTo || 0) });
            }
        } else {
            this._initialScroll = NumCast(doc.y);
        }
        return focusSpeed;
    }

    @action
    setupPdfJsViewer = async () => {
        if (this._viewerIsSetup) return;
        this._viewerIsSetup = true;
        this._showWaiting = true;
        this.props.setPdfViewer(this);
        await this.initialLoad();

        this._disposers.filterScript = reaction(
            () => ScriptCast(this.props.Document.filterScript),
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

    pagesinit = () => {
        if (this._pdfViewer._setDocumentViewerElement.offsetParent) {
            runInAction(() => this._pdfViewer.currentScaleValue = this._zoomed = 1);
            this.gotoPage(NumCast(this.props.Document._curPage, 1));
        }
        document.removeEventListener("pagesinit", this.pagesinit);
        var quickScroll: string | undefined = this._initialScroll ? this._initialScroll.toString() : "";
        this._disposers.scroll = reaction(
            () => Math.abs(NumCast(this.props.Document._scrollTop)),
            (pos) => {
                if (!this._ignoreScroll) {
                    (this._showCover || this._showWaiting) && this.setupPdfJsViewer();
                    const viewTrans = quickScroll ?? StrCast(this.props.Document._viewTransition);
                    const durationMiliStr = viewTrans.match(/([0-9]*)ms/);
                    const durationSecStr = viewTrans.match(/([0-9.]*)s/);
                    const duration = durationMiliStr ? Number(durationMiliStr[1]) : durationSecStr ? Number(durationSecStr[1]) * 1000 : 0;
                    this._forcedScroll = true;
                    if (duration) {
                        setTimeout(() => {
                            this._mainCont.current && smoothScroll(duration, this._mainCont.current, pos);
                            setTimeout(() => this._forcedScroll = false, duration);
                        }, this._mainCont.current ? 0 : 250); // wait for mainCont and try again to scroll
                    } else {
                        this._mainCont.current?.scrollTo({ top: pos });
                        this._forcedScroll = false;
                    }
                }
            },
            { fireImmediately: true }
        );
        quickScroll = undefined;
        if (this._initialScroll !== undefined && this._mainCont.current) {
            this._mainCont.current?.scrollTo({ top: Math.abs(this._initialScroll || 0) });
            this._initialScroll = undefined;
        }
    }

    createPdfViewer() {
        if (!this._mainCont.current) { // bcz: I don't think this is ever triggered or needed
            console.log("PDFViewer- I guess we got here");
            if (this._retries < 5) {
                this._retries++;
                console.log("PDFViewer- retry num:" + this._retries);
                setTimeout(() => this.createPdfViewer(), 1000);
            }
            return;
        }
        document.removeEventListener("copy", this.copy);
        document.addEventListener("copy", this.copy);
        const eventBus = new PDFJSViewer.EventBus(true);
        eventBus._on("pagesinit", this.pagesinit);
        eventBus._on("pagerendered", action(() => this._showWaiting = false));
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
    scrollToAnnotation = (scrollToAnnotation: Doc) => {
        if (scrollToAnnotation) {
            this.scrollFocus(scrollToAnnotation, true);
            Doc.linkFollowHighlight(scrollToAnnotation);
        }
    }

    onScroll = (e: React.UIEvent<HTMLElement>) => {
        if (this._mainCont.current && !this._forcedScroll) {
            this._ignoreScroll = true; // the pdf scrolled, so we need to tell the Doc to scroll but we don't want the doc to then try to set the PDF scroll pos (which would interfere with the smooth scroll animation)
            if (!LinkDocPreview.LinkInfo) {
                this.props.layoutDoc._scrollTop = this._mainCont.current.scrollTop;
            }
            this._ignoreScroll = false;
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
        const findOpts = {
            caseSensitive: false,
            findPrevious: !fwd,
            highlightAll: true,
            phraseSearch: true,
            query: searchString
        };
        if (clear) {
            this._pdfViewer?.findController.executeCommand('reset', { query: "" });
        } else if (!searchString) {
            fwd ? this.nextAnnotation() : this.prevAnnotation();
        } else if (this._pdfViewer?.pageViewsReady) {
            this._pdfViewer.findController.executeCommand('findagain', findOpts);
        }
        else if (this._mainCont.current) {
            const executeFind = () => this._pdfViewer.findController.executeCommand('find', findOpts);
            this._mainCont.current.addEventListener("pagesloaded", executeFind);
            this._mainCont.current.addEventListener("pagerendered", executeFind);
        }
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        // const hit = document.elementFromPoint(e.clientX, e.clientY);
        // bcz: Change. drag selecting requires that preventDefault is NOT called.  This used to happen in DocumentView,
        //      but that's changed, so this shouldn't be needed.
        // if (hit && hit.localName === "span" && this.annotationsActive(true)) {  // drag selecting text stops propagation
        //     e.button === 0 && e.stopPropagation();
        // }
        // if alt+left click, drag and annotate
        this._downX = e.clientX;
        this._downY = e.clientY;
        if ((this.props.Document._viewScale || 1) !== 1) return;
        if ((e.button !== 0 || e.altKey) && this.props.isContentActive(true)) {
            this._setPreviewCursor?.(e.clientX, e.clientY, true);
        }
        if (!e.altKey && e.button === 0 && this.props.isContentActive(true)) {
            this.props.select(false);
            this._marqueeing = [e.clientX, e.clientY];
            if (e.target && ((e.target as any).className.includes("endOfContent") || ((e.target as any).parentElement.className !== "textLayer"))) {
                this._textSelecting = false;
                document.addEventListener("pointermove", this.onSelectMove); // need this to prevent document from being dragged if stopPropagation doesn't get called
            } else {
                // if textLayer is hit, then we select text instead of using a marquee so clear out the marquee.
                setTimeout(action(() => this._marqueeing = undefined), 100); // bcz: hack .. anchor menu is setup within MarqueeAnnotator so we need to at least create the marqueeAnnotator even though we aren't using it.
                // clear out old marquees and initialize menu for new selection
                AnchorMenu.Instance.Status = "marquee";
                Array.from(this._savedAnnotations.values()).forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
                this._styleRule = addStyleSheetRule(PDFViewer._annotationStyle, "htmlAnnotation", { "pointer-events": "none" });
                document.addEventListener("pointerup", this.onSelectEnd);
                document.addEventListener("pointermove", this.onSelectMove);
            }
        }
    }

    @action
    finishMarquee = (x?: number, y?: number) => {
        this._marqueeing = undefined;
        this._textSelecting = true;
        document.removeEventListener("pointermove", this.onSelectMove);
    }

    onSelectMove = (e: PointerEvent) => e.stopPropagation();

    @action
    onSelectEnd = (e: PointerEvent): void => {
        clearStyleSheetRules(PDFViewer._annotationStyle);
        this.props.select(false);
        document.removeEventListener("pointermove", this.onSelectMove);
        document.removeEventListener("pointerup", this.onSelectEnd);

        const sel = window.getSelection();
        if (sel?.type === "Range") {
            this.createTextAnnotation(sel, sel.getRangeAt(0));
            AnchorMenu.Instance.jumpTo(e.clientX, e.clientY);
        }
    }

    @action
    createTextAnnotation = (sel: Selection, selRange: Range) => {
        if (this._mainCont.current) {
            const boundingRect = this._mainCont.current.getBoundingClientRect();
            const clientRects = selRange.getClientRects();
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects.item(i);
                if (rect && rect.width !== this._mainCont.current.clientWidth) {
                    const scaleX = this._mainCont.current.offsetWidth / boundingRect.width;
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
        this._selectionText = selRange.cloneContents().textContent || "";

        // clear selection
        if (sel.empty) {  // Chrome
            sel.empty();
        } else if (sel.removeAllRanges) {  // Firefox
            sel.removeAllRanges();
        }
    }

    scrollXf = () => {
        return this._mainCont.current ? this.props.ScreenToLocalTransform().translate(0, NumCast(this.props.layoutDoc._scrollTop)) : this.props.ScreenToLocalTransform();
    }

    onClick = (e: React.MouseEvent) => {
        if (this._setPreviewCursor && e.button === 0 &&
            Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
            Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD) {
            this._setPreviewCursor(e.clientX, e.clientY, false);
        }
        // e.stopPropagation();  // bcz: not sure why this was here.  We need to allow the DocumentView to get clicks to process doubleClicks
    }

    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;

    getCoverImage = () => {
        if (!this.props.Document[HeightSym]() || !Doc.NativeHeight(this.props.Document)) {
            setTimeout((() => {
                this.props.Document._height = this.props.Document[WidthSym]() * this._coverPath.height / this._coverPath.width;
                Doc.SetNativeWidth(this.props.Document, (Doc.NativeWidth(this.props.Document) || 0) * this._coverPath.height / this._coverPath.width);
            }).bind(this), 0);
        }
        const nativeWidth = Doc.NativeWidth(this.props.Document);
        const nativeHeight = Doc.NativeHeight(this.props.Document);
        const resolved = Utils.prepend(this._coverPath.path);
        return <img key={resolved} src={resolved} onError={action(() => this._coverPath.path = "http://www.cs.brown.edu/~bcz/face.gif")} onLoad={action(() => this._showWaiting = false)}
            style={{ position: "absolute", display: "inline-block", top: 0, left: 0, width: `${nativeWidth}px`, height: `${nativeHeight}px` }} />;
    }

    @action
    onZoomWheel = (e: React.WheelEvent) => {
        if (this.props.isContentActive(true)) {
            e.stopPropagation();
            if (e.ctrlKey) {
                const curScale = Number(this._pdfViewer.currentScaleValue);
                this._pdfViewer.currentScaleValue = Math.max(1, Math.min(10, curScale - curScale * e.deltaY / 1000));
                this._zoomed = Number(this._pdfViewer.currentScaleValue);
            }
        }
    }

    @computed get annotationLayer() {
        return <div className="pdfViewerDash-annotationLayer" style={{ height: Doc.NativeHeight(this.props.Document), transform: `scale(${this._zoomed})` }} ref={this._annotationLayer}>
            {this.inlineTextAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} fieldKey={this.props.fieldKey + "-annotations"} showInfo={this.showInfo} dataDoc={this.props.dataDoc} anno={anno} key={`${anno[Id]}-annotation`} />)
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
    panelWidth = () => this.props.PanelWidth() / (this.props.scaling?.() || 1); // (this.Document.scrollHeight || Doc.NativeHeight(this.Document) || 0);
    panelHeight = () => this.props.PanelHeight() / (this.props.scaling?.() || 1); // () => this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width : Doc.NativeWidth(this.Document);
    @computed get overlayLayer() {
        return <div className={`pdfViewerDash-overlay${CurrentUserUtils.SelectedTool !== InkTool.None || SnappingManager.GetIsDragging() ? "-inking" : ""}`}
            style={{
                pointerEvents: SnappingManager.GetIsDragging() ? "all" : undefined,
                mixBlendMode: this.allAnnotations.some(anno => anno.mixBlendMode) ? "hard-light" : undefined,
                transform: `scale(${this._zoomed})`
            }}>
            <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                isAnnotationOverlay={true}
                isContentActive={returnFalse}
                fieldKey={this.props.fieldKey + "-annotations"}
                setPreviewCursor={this.setPreviewCursor}
                PanelHeight={this.panelHeight}
                PanelWidth={this.panelWidth}
                dropAction={"alias"}
                select={emptyFunction}
                ContentScaling={this.contentZoom}
                bringToFront={emptyFunction}
                CollectionView={undefined}
                ScreenToLocalTransform={this.overlayTransform}
                renderDepth={this.props.renderDepth + 1}
                childPointerEvents={true} />
        </div>;
    }
    @computed get pdfViewerDiv() {
        return <div className={"pdfViewerDash-text" + (this._textSelecting && (this.props.isSelected() || this.props.isContentActive()) ? "-selected" : "")} ref={this._viewer} />;
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
        return <div className="pdfViewer-content">
            <div className={`pdfViewerDash${this.props.isContentActive() ? "-interactive" : ""}`} ref={this._mainCont}
                onScroll={this.onScroll} onWheel={this.onZoomWheel} onPointerDown={this.onPointerDown} onClick={this.onClick}
                style={{
                    overflowX: this._zoomed !== 1 ? "scroll" : undefined,
                    width: !this.props.Document._fitWidth && (window.screen.width > 600) ? Doc.NativeWidth(this.props.Document) - this.props.sidebarWidth() / this.contentScaling : `calc(${100 / this.contentScaling}% - ${this.props.sidebarWidth() / this.contentScaling}px)`,
                    height: !this.props.Document._fitWidth && (window.screen.width > 600) ? Doc.NativeHeight(this.props.Document) : `${100 / this.contentScaling}%`,
                    transform: `scale(${this.contentScaling})`
                }}  >
                {this.pdfViewerDiv}
                {this.annotationLayer}
                {this.overlayLayer}
                {this.overlayInfo}
                {this.standinViews}
                {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                    <MarqueeAnnotator rootDoc={this.props.rootDoc} scrollTop={0} down={this._marqueeing}
                        anchorMenuClick={this.props.anchorMenuClick}
                        addDocument={(doc: Doc | Doc[]) => this.props.addDocument!(doc)}
                        finishMarquee={this.finishMarquee}
                        docView={this.props.docViewPath().lastElement()}
                        getPageFromScroll={this.getPageFromScroll}
                        savedAnnotations={this._savedAnnotations}
                        annotationLayer={this._annotationLayer.current} mainCont={this._mainCont.current} />}
            </div>
        </div>;
    }
}