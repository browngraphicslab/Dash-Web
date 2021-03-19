import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, ObservableMap, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as WebRequest from 'web-request';
import { Doc, DocListCast, HeightSym, Opt, StrListCast, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { HtmlField } from "../../../fields/HtmlField";
import { InkTool } from "../../../fields/InkField";
import { List } from "../../../fields/List";
import { makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { WebField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, getWordAtPoint, OmitKeys, returnOne, smoothScroll, Utils } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { SnappingManager } from "../../util/SnappingManager";
import { undoBatch } from "../../util/UndoManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { LightboxView } from "../LightboxView";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { AnchorMenu } from "../pdf/AnchorMenu";
import { Annotation } from "../pdf/Annotation";
import { SidebarAnnos } from "../SidebarAnnos";
import { FieldView, FieldViewProps } from './FieldView';
import { LinkDocPreview } from "./LinkDocPreview";
import "./WebBox.scss";
import React = require("react");
const htmlToText = require("html-to-text");

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _outerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _keyInput = React.createRef<HTMLInputElement>();
    private _initialScroll: Opt<number>;
    private _sidebarRef = React.createRef<SidebarAnnos>();
    @observable private _scrollTimer: any;
    @observable private _overlayAnnoInfo: Opt<Doc>;
    @observable private _marqueeing: number[] | undefined;
    @observable private _url: string = "hello";
    @observable private _isAnnotating = false;
    @observable private _iframe: HTMLIFrameElement | null = null;
    @observable private _savedAnnotations = new ObservableMap<number, HTMLDivElement[]>();
    @observable private _scrollHeight = 1500;
    @computed get scrollHeight() { return this._scrollHeight; }
    @computed get allAnnotations() { return DocListCast(this.dataDoc[this.annotationKey]); }
    @computed get inlineTextAnnotations() { return this.allAnnotations.filter(a => a.textInlineAnnotations); }
    @computed get webField() { return Cast(this.dataDoc[this.props.fieldKey], WebField)?.url; }

    constructor(props: any) {
        super(props);
        if (this.webField) {
            Doc.SetNativeWidth(this.dataDoc, Doc.NativeWidth(this.dataDoc) || 850);
            Doc.SetNativeHeight(this.dataDoc, Doc.NativeHeight(this.dataDoc) || this.Document[HeightSym]() / this.Document[WidthSym]() * 850);
        }
        if (this.layoutDoc[this.fieldKey + "-contentWidth"] === undefined) {
            this.layoutDoc[this.fieldKey + "-contentWidth"] = Doc.NativeWidth(this.layoutDoc);
        }
        this._annotationKey = "annotations-" + this.urlHash(this._url);
    }

    async componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.

        runInAction(() => this._url = this.webField?.toString() || "");

        this._disposers.selection = reaction(() => this.props.isSelected(),
            selected => !selected && setTimeout(() => {
                Array.from(this._savedAnnotations.values()).forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
            }));

        if (this.webField?.href.indexOf("youtube") !== -1) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = Doc.NativeWidth(this.layoutDoc);
            const nativeHeight = Doc.NativeHeight(this.layoutDoc);
            if (this.webField) {
                if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                    if (!nativeWidth) Doc.SetNativeWidth(this.layoutDoc, 600);
                    Doc.SetNativeHeight(this.layoutDoc, (nativeWidth || 600) / youtubeaspect);
                    this.layoutDoc._height = this.layoutDoc[WidthSym]() / youtubeaspect;
                }
            } // else it's an HTMLfield
        } else if (this.webField && !this.dataDoc.text) {
            const result = await WebRequest.get(Utils.CorsProxy(this.webField.href));
            if (result) {
                this.dataDoc.text = htmlToText.fromString(result.content);
            }
        }

        var quickScroll = true;
        this._disposers.scrollReaction = reaction(() => NumCast(this.layoutDoc._scrollTop),
            (scrollTop) => {
                if (quickScroll) this._initialScroll = scrollTop;
                else {
                    const viewTrans = StrCast(this.Document._viewTransition);
                    const durationMiliStr = viewTrans.match(/([0-9]*)ms/);
                    const durationSecStr = viewTrans.match(/([0-9.]*)s/);
                    const duration = durationMiliStr ? Number(durationMiliStr[1]) : durationSecStr ? Number(durationSecStr[1]) * 1000 : 0;
                    this.goTo(scrollTop, duration);
                }
            },
            { fireImmediately: true }
        );
        quickScroll = false;
    }
    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        this._iframe?.removeEventListener('wheel', this.iframeWheel, true);
    }

    @action
    createTextAnnotation = (sel: Selection, selRange: Range) => {
        if (this._mainCont.current) {
            const clientRects = selRange.getClientRects();
            for (let i = 0; i < clientRects.length; i++) {
                const rect = clientRects.item(i);
                if (rect && rect.width !== this._mainCont.current.clientWidth) {
                    const annoBox = document.createElement("div");
                    annoBox.className = "marqueeAnnotator-annotationBox";
                    // transforms the positions from screen onto the pdf div
                    annoBox.style.top = (rect.top + this._mainCont.current.scrollTop).toString();
                    annoBox.style.left = (rect.left).toString();
                    annoBox.style.width = (rect.width).toString();
                    annoBox.style.height = (rect.height).toString();
                    this._annotationLayer.current && MarqueeAnnotator.previewNewAnnotation(this._savedAnnotations, this._annotationLayer.current, annoBox, 1);
                }
            }
        }
        //this._selectionText = selRange.cloneContents().textContent || "";

        // clear selection
        if (sel.empty) sel.empty();// Chrome
        else if (sel.removeAllRanges) sel.removeAllRanges();  // Firefox
    }

    menuControls = () => this.urlEditor; // controls to be added to the top bar when a document of this type is selected

    scrollFocus = (doc: Doc, smooth: boolean) => {
        if (this._sidebarRef?.current?.makeDocUnfiltered(doc)) return 1;
        if (doc !== this.rootDoc && this._outerRef.current) {
            const scrollTo = doc.type === DocumentType.TEXTANCHOR ? NumCast(doc.y) : Utils.scrollIntoView(NumCast(doc.y), doc[HeightSym](), NumCast(this.layoutDoc._scrollTop), this.props.PanelHeight() / (this.props.scaling?.() || 1));
            if (scrollTo !== undefined) {
                const focusSpeed = smooth ? 500 : 0;
                this._initialScroll !== undefined && (this._initialScroll = scrollTo);
                this.goTo(scrollTo, focusSpeed);
                return focusSpeed;
            }
        }
        this._initialScroll = NumCast(doc.y);
        return 0;
    }

    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            title: StrCast(this.rootDoc.title + " " + this.layoutDoc._scrollTop),
            annotationOn: this.rootDoc,
            y: NumCast(this.layoutDoc._scrollTop),
        });
        this.addDocument(anchor);
        return anchor;
    }

    @action
    iframeUp = (e: PointerEvent) => {
        if (this._iframe?.contentWindow && this._iframe.contentDocument && !this._iframe.contentWindow.getSelection()?.isCollapsed) {
            this._iframe.contentDocument.addEventListener("pointerup", this.iframeUp);
            const mainContBounds = Utils.GetScreenTransform(this._mainCont.current!);
            const scale = (this.props.scaling?.() || 1) * mainContBounds.scale;
            const sel = this._iframe.contentWindow.getSelection();
            if (sel) {
                this.createTextAnnotation(sel, sel.getRangeAt(0));
                AnchorMenu.Instance.jumpTo(e.clientX * scale + mainContBounds.translateX,
                    e.clientY * scale + mainContBounds.translateY - NumCast(this.layoutDoc._scrollTop) * scale);
            }
        } else AnchorMenu.Instance.fadeOut(true);
    }
    @action
    iframeDown = (e: PointerEvent) => {
        const mainContBounds = Utils.GetScreenTransform(this._mainCont.current!);
        const scale = (this.props.scaling?.() || 1) * mainContBounds.scale;
        const word = getWordAtPoint(e.target, e.clientX, e.clientY);
        this._marqueeing = [e.clientX * scale + mainContBounds.translateX,
        e.clientY * scale + mainContBounds.translateY - NumCast(this.layoutDoc._scrollTop) * scale];
        if (word) {
            this._iframe?.contentDocument?.addEventListener("pointerup", this.iframeUp);
            setTimeout(action(() => this._marqueeing = undefined), 100); // bcz: hack .. anchor menu is setup within MarqueeAnnotator so we need to at least create the marqueeAnnotator even though we aren't using it.
        } else {
            this._isAnnotating = true;
            this.props.select(false);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    iframeLoaded = (e: any) => {
        const iframe = this._iframe;
        if (iframe?.contentDocument) {
            iframe?.contentDocument.addEventListener("pointerdown", this.iframeDown);
            this._scrollHeight = Math.max(this.scrollHeight, iframe?.contentDocument.body.scrollHeight);
            setTimeout(action(() => this._scrollHeight = Math.max(this.scrollHeight, iframe?.contentDocument?.body.scrollHeight || 0)), 5000);
            if (this._initialScroll !== undefined && this._outerRef.current) {
                this._outerRef.current.scrollTop = this._initialScroll;
                this._initialScroll = undefined;
            }
            iframe.setAttribute("enable-annotation", "true");
            iframe.contentDocument.addEventListener("click", undoBatch(action(e => {
                let href = "";
                for (let ele = e.target; ele; ele = ele.parentElement) {
                    href = (typeof (ele.href) === "string" ? ele.href : ele.href?.baseVal) || ele.parentElement?.href || href;
                }
                if (href && this.webField?.origin) {
                    this.submitURL(href.replace(Utils.prepend(""), this.webField?.origin));
                    if (this._outerRef.current) {
                        this._outerRef.current.scrollTop = NumCast(this.layoutDoc._scrollTop);
                        this._outerRef.current.scrollLeft = 0;
                    }
                }
            })));
            iframe.contentDocument.addEventListener('wheel', this.iframeWheel, false);
            //iframe.contentDocument.addEventListener('scroll', () => !this.active() && this._iframe && (this._iframe.scrollTop = NumCast(this.layoutDoc._scrollTop), false));
        }
    }

    @action
    iframeWheel = (e: any) => {
        if (!this._scrollTimer) {
            this._scrollTimer = setTimeout(action(() => this._scrollTimer = undefined), 250); // this turns events off on the iframe which allows scrolling to change direction smoothly
        }
    }

    @action
    setDashScrollTop = (scrollTop: number, timeout: number = 250) => {
        const iframeHeight = Math.max(1000, this._scrollHeight - this.panelHeight());
        timeout = scrollTop > iframeHeight ? 0 : timeout;
        this._scrollTimer && clearTimeout(this._scrollTimer);
        this._scrollTimer = setTimeout(action(() => {
            this._scrollTimer = undefined;
            if (!LinkDocPreview.LinkInfo && this._outerRef.current &&
                (!LightboxView.LightboxDoc || LightboxView.IsLightboxDocView(this.props.docViewPath()))) {
                this.layoutDoc._scrollTop = this._outerRef.current.scrollTop = scrollTop > iframeHeight ? iframeHeight : scrollTop;
            }
        }), timeout);
    }

    goTo = (scrollTop: number, duration: number) => {
        if (this._outerRef.current) {
            const iframeHeight = Math.max(1000, this._scrollHeight - this.panelHeight());
            scrollTop = scrollTop > iframeHeight + 50 ? iframeHeight : scrollTop;
            if (duration) {
                smoothScroll(duration, [this._outerRef.current], scrollTop);
                this.setDashScrollTop(scrollTop, duration);
            } else {
                this.setDashScrollTop(scrollTop);
            }
        }
    }

    @action
    forward = () => {
        const future = StrListCast(this.dataDoc[this.fieldKey + "-future"]);
        const history = StrListCast(this.dataDoc[this.fieldKey + "-history"]);
        if (future.length) {
            history.push(this._url);
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = future.pop()!));
            this._annotationKey = "annotations-" + this.urlHash(this._url);
            return true;
        }
        return false;
    }

    @action
    back = () => {
        const future = StrListCast(this.dataDoc[this.fieldKey + "-future"]);
        const history = StrListCast(this.dataDoc[this.fieldKey + "-history"]);
        if (history.length) {
            if (future === undefined) this.dataDoc[this.fieldKey + "-future"] = new List<string>([this._url]);
            else future.push(this._url);
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = history.pop()!));
            this._annotationKey = "annotations-" + this.urlHash(this._url);
            return true;
        }
        return false;
    }

    urlHash(s: string) {
        return s.split('').reduce((a: any, b: any) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    }

    @action
    submitURL = (newUrl?: string) => {
        if (!newUrl) return;
        if (!newUrl.startsWith("http")) newUrl = "http://" + newUrl;
        try {
            const future = StrListCast(this.dataDoc[this.fieldKey + "-future"]);
            const history = StrListCast(this.dataDoc[this.fieldKey + "-history"]);
            const url = this.webField?.toString();
            if (url) {
                if (history === undefined) {
                    this.dataDoc[this.fieldKey + "-history"] = new List<string>([url]);
                } else {
                    history.push(url);
                }
                this.layoutDoc._scrollTop = 0;
                future && (future.length = 0);
            }
            this._url = newUrl;
            this._annotationKey = "annotations-" + this.urlHash(this._url);
            this.dataDoc[this.fieldKey] = new WebField(new URL(newUrl));
        } catch (e) {
            console.log("WebBox URL error:" + this._url);
        }
        return true;
    }

    onWebUrlDrop = (e: React.DragEvent) => {
        const { dataTransfer } = e;
        const html = dataTransfer.getData("text/html");
        const uri = dataTransfer.getData("text/uri-list");
        const url = uri || html || this._url || "";
        const newurl = url.startsWith(window.location.origin) ?
            url.replace(window.location.origin, this._url?.match(/http[s]?:\/\/[^\/]*/)?.[0] || "") : url;
        this.submitURL(newurl);
        e.stopPropagation();
    }
    onWebUrlValueKeyDown = (e: React.KeyboardEvent) => {
        e.key === "Enter" && this.submitURL(this._keyInput.current!.value);
        e.stopPropagation();
    }

    @computed get urlEditor() {
        return (
            <div className="collectionMenu-webUrlButtons" onDrop={this.onWebUrlDrop} onDragOver={e => e.preventDefault()} >
                <input className="collectionMenu-urlInput" key={this._url}
                    placeholder="ENTER URL"
                    defaultValue={this._url}
                    onDrop={this.onWebUrlDrop}
                    onDragOver={e => e.preventDefault()}
                    onKeyDown={this.onWebUrlValueKeyDown}
                    onClick={(e) => {
                        this._keyInput.current!.select();
                        e.stopPropagation();
                    }}
                    ref={this._keyInput}
                />
                <div style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", maxWidth: "250px", }}>
                    <button className="submitUrl" onClick={() => this.submitURL(this._keyInput.current!.value)} onDragOver={e => e.stopPropagation()} onDrop={this.onWebUrlDrop}>
                        GO
                    </button>
                    <button className="submitUrl" onClick={this.back}> <FontAwesomeIcon icon="caret-left" size="lg" /> </button>
                    <button className="submitUrl" onClick={this.forward}> <FontAwesomeIcon icon="caret-right" size="lg" />  </button>
                </div>
            </div>
        );
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.useCors ? "Don't Use" : "Use") + " Cors", event: () => this.layoutDoc.useCors = !this.layoutDoc.useCors, icon: "snowflake" });
        funcs.push({ description: (this.layoutDoc[this.fieldKey + "-contentWidth"] ? "Unfreeze" : "Freeze") + " Content Width", event: () => this.layoutDoc[this.fieldKey + "-contentWidth"] = this.layoutDoc[this.fieldKey + "-contentWidth"] ? undefined : Doc.NativeWidth(this.layoutDoc), icon: "snowflake" });
        funcs.push({ description: "Toggle Annotation View ", event: () => this.Document._showSidebar = !this.Document._showSidebar, icon: "expand-arrows-alt" });
        cm.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    @action
    onMarqueeDown = (e: React.PointerEvent) => {
        if (!e.altKey && e.button === 0 && this.active(true)) {
            this._marqueeing = [e.clientX, e.clientY];
            this.props.select(false);
        }
    }
    @action finishMarquee = (x?: number, y?: number) => {
        this._marqueeing = undefined;
        this._isAnnotating = false;
        x !== undefined && y !== undefined && this._setPreviewCursor?.(x, y, false);
    }

    @computed
    get urlContent() {
        const field = this.dataDoc[this.props.fieldKey];
        let view;
        if (field instanceof HtmlField) {
            view = <span className="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />;
        } else if (field instanceof WebField) {
            const url = this.layoutDoc.useCors ? Utils.CorsProxy(field.url.href) : field.url.href;
            view = <iframe className="webBox-iframe" enable-annotation={"true"}
                style={{ pointerEvents: this._scrollTimer ? "none" : undefined }}
                ref={action((r: HTMLIFrameElement | null) => this._iframe = r)} src={url} onLoad={this.iframeLoaded}
                // the 'allow-top-navigation' and 'allow-top-navigation-by-user-activation' attributes are left out to prevent iframes from redirecting the top-level Dash page
                // sandbox={"allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"} />;
                sandbox={"allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin"} />;
        } else {
            view = <iframe className="webBox-iframe" enable-annotation={"true"}
                style={{ pointerEvents: this._scrollTimer ? "none" : undefined }} // if we allow pointer events when scrolling is on, then reversing direction does not work smoothly
                ref={action((r: HTMLIFrameElement | null) => this._iframe = r)} src={"https://crossorigin.me/https://cs.brown.edu"} />;
        }
        return view;
    }

    toggleSidebar = () => {
        const nativeWidth = NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]);
        const nativeHeight = NumCast(this.layoutDoc[this.fieldKey + "-nativeHeight"]);
        this.layoutDoc.nativeWidth = nativeWidth + (this.layoutDoc.nativeWidth === nativeWidth ? 250 : 0);
        this.layoutDoc._width = NumCast(this.layoutDoc._nativeWidth) * (nativeWidth / nativeHeight);
    }
    sidebarWidth = () => !this.layoutDoc._showSidebar ? 0 : (NumCast(this.layoutDoc.nativeWidth) - Doc.NativeWidth(this.dataDoc)) * this.props.PanelWidth() / NumCast(this.layoutDoc.nativeWidth);

    @computed get content() {
        return <div className={"webBox-cont" + (!this.props.docViewPath().lastElement()?.docView?._pendingDoubleClick && this.active() && CurrentUserUtils.SelectedTool === InkTool.None && !DocumentDecorations.Instance?.Interacting ? "-interactive" : "")}
            style={{ width: NumCast(this.layoutDoc[this.fieldKey + "-contentWidth"]) || `${100 / (this.props.scaling?.() || 1)}%`, }}>
            {this.urlContent}
        </div>;
    }

    @computed get annotationLayer() {
        TraceMobx();
        return <div className="webBox-annotationLayer" style={{ height: Doc.NativeHeight(this.Document) || undefined }} ref={this._annotationLayer}>
            {this.inlineTextAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} fieldKey={this.annotationKey} showInfo={this.showInfo} dataDoc={this.dataDoc} anno={anno} key={`${anno[Id]}-annotation`} />)
            }
        </div>;
    }

    showInfo = action((anno: Opt<Doc>) => this._overlayAnnoInfo = anno);
    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;
    panelWidth = () => this.props.PanelWidth() / (this.props.scaling?.() || 1) - this.sidebarWidth(); // (this.Document.scrollHeight || Doc.NativeHeight(this.Document) || 0);
    panelHeight = () => this.props.PanelHeight() / (this.props.scaling?.() || 1); // () => this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width : Doc.NativeWidth(this.Document);
    scrollXf = () => this.props.ScreenToLocalTransform().translate(0, NumCast(this.layoutDoc._scrollTop));
    render() {
        const inactiveLayer = this.props.layerProvider?.(this.layoutDoc) === false;
        const scale = this.props.scaling?.() || 1;
        return (
            <div className="webBox" ref={this._mainCont} style={{ pointerEvents: this.annotationsActive() ? "all" : this.active() || SnappingManager.GetIsDragging() ? undefined : "none" }} >
                <div className={`webBox-container`}
                    style={{ pointerEvents: inactiveLayer ? "none" : undefined }}
                    onContextMenu={this.specificContextMenu}>
                    <base target="_blank" />
                    <div className={"webBox-outerContent"} ref={this._outerRef}
                        style={{
                            width: `calc(${100 / scale}% - ${this.sidebarWidth() / scale}px)`,
                            height: `${100 / scale}%`,
                            transform: `scale(${scale})`,
                            pointerEvents: inactiveLayer ? "none" : undefined
                        }}
                        onWheel={e => { e.stopPropagation(); e.preventDefault(); }} // block wheel events from propagating since they're handled by the iframe
                        onScroll={e => this.setDashScrollTop(this._outerRef.current?.scrollTop || 0)}
                        onPointerDown={this.onMarqueeDown}
                    >
                        <div className={"webBox-innerContent"} style={{
                            height: NumCast(this.scrollHeight, 50),
                            pointerEvents: inactiveLayer ? "none" : undefined
                        }}>
                            {this.content}
                            <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                                isAnnotationOverlay={true}
                                fieldKey={this.annotationKey}
                                setPreviewCursor={this.setPreviewCursor}
                                PanelWidth={this.panelWidth}
                                PanelHeight={this.panelHeight}
                                dropAction={"alias"}
                                select={emptyFunction}
                                active={this.active}
                                ContentScaling={returnOne}
                                bringToFront={emptyFunction}
                                whenActiveChanged={this.whenActiveChanged}
                                removeDocument={this.removeDocument}
                                moveDocument={this.moveDocument}
                                addDocument={this.addDocument}
                                CollectionView={undefined}
                                ScreenToLocalTransform={this.scrollXf}
                                renderDepth={this.props.renderDepth + 1}
                                scaling={returnOne}
                                childPointerEvents={true}
                                pointerEvents={this._isAnnotating || SnappingManager.GetIsDragging() ? "all" : "none"} />
                            {this.annotationLayer}
                        </div>
                    </div>
                    {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                        <MarqueeAnnotator rootDoc={this.rootDoc}
                            anchorMenuClick={this._sidebarRef.current?.anchorMenuClick}
                            scrollTop={0}
                            down={this._marqueeing} scaling={returnOne}
                            addDocument={this.addDocument}
                            docView={this.props.docViewPath().lastElement()}
                            finishMarquee={this.finishMarquee}
                            savedAnnotations={this._savedAnnotations}
                            annotationLayer={this._annotationLayer.current}
                            mainCont={this._mainCont.current} />}
                </div >
                <button className="webBox-overlayButton-sidebar" key="sidebar" title="Toggle Sidebar" style={{ right: this.sidebarWidth() + 7 }}
                    onPointerDown={e => e.stopPropagation()} onClick={e => this.toggleSidebar()} >
                    <FontAwesomeIcon style={{ color: "white" }} icon={"chevron-left"} size="sm" />
                </button>
                <SidebarAnnos ref={this._sidebarRef}
                    {...this.props}
                    annotationsActive={this.annotationsActive}
                    rootDoc={this.rootDoc}
                    layoutDoc={this.layoutDoc}
                    dataDoc={this.dataDoc}
                    addDocument={this.addDocument}
                    moveDocument={this.moveDocument}
                    removeDocument={this.removeDocument}
                    active={this.active}
                />
            </div>);
    }
}