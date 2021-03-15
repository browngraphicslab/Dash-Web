import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Dictionary } from "typescript-collections";
import * as WebRequest from 'web-request';
import { Doc, DocListCast, HeightSym, Opt, StrListCast, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { HtmlField } from "../../../fields/HtmlField";
import { InkTool } from "../../../fields/InkField";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { WebField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { emptyFunction, OmitKeys, returnOne, returnTrue, returnZero, smoothScroll, Utils } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from "../../util/CurrentUserUtils";
import { DragManager } from "../../util/DragManager";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { undoBatch } from "../../util/UndoManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CollectionStackingView } from "../collections/CollectionStackingView";
import { CollectionViewType } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { MarqueeAnnotator } from "../MarqueeAnnotator";
import { AnchorMenu } from "../pdf/AnchorMenu";
import { Annotation } from "../pdf/Annotation";
import { SearchBox } from "../search/SearchBox";
import { StyleProp } from "../StyleProvider";
import { FieldView, FieldViewProps } from './FieldView';
import { FormattedTextBox } from "./formattedText/FormattedTextBox";
import { LinkDocPreview } from "./LinkDocPreview";
import "./WebBox.scss";
import React = require("react");
import { LightboxView } from "../LightboxView";
const htmlToText = require("html-to-text");

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _outerRef: React.RefObject<HTMLDivElement> = React.createRef();
    private _disposers: { [name: string]: IReactionDisposer } = {};
    private _longPressSecondsHack?: NodeJS.Timeout;
    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    private _iframeIndicatorRef = React.createRef<HTMLDivElement>();
    private _iframeDragRef = React.createRef<HTMLDivElement>();
    private _keyInput = React.createRef<HTMLInputElement>();
    private _scrollTimer: any;
    private _initialScroll: Opt<number>;
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);
    @observable private _marqueeing: number[] | undefined;
    @observable private _url: string = "hello";
    @observable private _pressX: number = 0;
    @observable private _pressY: number = 0;
    @observable private _isAnnotating = false;
    @observable private _iframe: HTMLIFrameElement | null = null;
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    @computed get scrollHeight() { return 100000; }//this._iframe?.scrollHeight || 1000; }
    @computed get inlineTextAnnotations() { return this.allAnnotations.filter(a => a.textInlineAnnotations); }

    constructor(props: any) {
        super(props);
        if (this.dataDoc[this.fieldKey] instanceof WebField) {
            Doc.SetNativeWidth(this.dataDoc, Doc.NativeWidth(this.dataDoc) || 850);
            Doc.SetNativeHeight(this.dataDoc, Doc.NativeHeight(this.dataDoc) || this.Document[HeightSym]() / this.Document[WidthSym]() * 850);
        }
        if (this.layoutDoc[this.fieldKey + "-contentWidth"] === undefined) {
            this.layoutDoc[this.fieldKey + "-contentWidth"] = Doc.NativeWidth(this.layoutDoc);
        }
        this._annotationKey = "annotations-" + this.urlHash(this._url);
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
        if (sel.empty) {  // Chrome
            sel.empty();
        } else if (sel.removeAllRanges) {  // Firefox
            sel.removeAllRanges();
        }
    }

    @action
    ptrUp = (e: PointerEvent) => {
        if (this._iframe?.contentWindow && this._iframe.contentDocument && !this._iframe.contentWindow.getSelection()?.isCollapsed) {
            this._iframe.contentDocument.addEventListener("pointerup", this.ptrUp);
            const mainContBounds = Utils.GetScreenTransform(this._mainCont.current!);
            const scale = (this.props.scaling?.() || 1) * mainContBounds.scale;
            const sel = this._iframe.contentWindow.getSelection();
            if (sel) {
                this.createTextAnnotation(sel, sel.getRangeAt(0))
                AnchorMenu.Instance.jumpTo(e.clientX * scale + mainContBounds.translateX,
                    e.clientY * scale + mainContBounds.translateY - NumCast(this.layoutDoc._scrollTop) * scale);
            }
        } else AnchorMenu.Instance.fadeOut(true);
    }
    getWordAtPoint = (elem: any, x: number, y: number): Opt<string> => {
        if (elem.nodeType == elem.TEXT_NODE) {
            var range = elem.ownerDocument.createRange();
            range.selectNodeContents(elem);
            var currentPos = 0;
            var endPos = range.endOffset;
            while (currentPos + 1 < endPos) {
                range.setStart(elem, currentPos);
                range.setEnd(elem, currentPos + 1);
                const rangeRect = range.getBoundingClientRect();
                if (rangeRect.left <= x && rangeRect.right >= x &&
                    rangeRect.top <= y && rangeRect.bottom >= y) {
                    range.expand("word");
                    var ret = range.toString();
                    range.detach();
                    return (ret);
                }
                currentPos += 1;
            }
        } else {
            for (var i = 0; i < elem.childNodes.length; i++) {
                var range = elem.childNodes[i].ownerDocument.createRange();
                range.selectNodeContents(elem.childNodes[i]);
                const rangeRect = range.getBoundingClientRect();
                if (rangeRect.left <= x && rangeRect.right >= x &&
                    rangeRect.top <= y && rangeRect.bottom >= y) {
                    range.detach();
                    const word = this.getWordAtPoint(elem.childNodes[i], x, y);
                    if (word) return word;
                } else {
                    range.detach();
                }
            }
        }
        return undefined;
    }
    @action
    ptrDown = (e: PointerEvent) => {
        const mainContBounds = Utils.GetScreenTransform(this._mainCont.current!);
        const scale = (this.props.scaling?.() || 1) * mainContBounds.scale;
        const word = this.getWordAtPoint(e.target, e.clientX, e.clientY);
        this._marqueeing = [e.clientX * scale + mainContBounds.translateX,
        e.clientY * scale + mainContBounds.translateY - NumCast(this.layoutDoc._scrollTop) * scale];
        if (word) {
            this._iframe?.contentDocument?.addEventListener("pointerup", this.ptrUp);
            setTimeout(action(() => this._marqueeing = undefined), 100); // bcz: hack .. anchor menu is setup within MarqueeAnnotator so we need to at least create the marqueeAnnotator even though we aren't using it.
        } else {
            this._isAnnotating = true;
            this.props.select(false);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    iframeLoaded = (e: any) => {
        const iframe = this._iframe;
        if (iframe?.contentDocument) {
            iframe?.contentDocument.addEventListener("pointerdown", this.ptrDown);
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
                if (href) {
                    this.submitURL(href.replace(Utils.prepend(""), Cast(this.dataDoc[this.fieldKey], WebField, null)?.url.origin));
                    if (this._outerRef.current) {
                        this._outerRef.current.scrollTop = NumCast(this.layoutDoc._scrollTop);
                        this._outerRef.current.scrollLeft = 0;
                    }
                }
            })));
            iframe.contentDocument.addEventListener('wheel', this.iframeWheel, false);
            iframe.contentDocument.addEventListener('scroll', () => !this.active() && this._iframe && (this._iframe.scrollTop = NumCast(this.layoutDoc._scrollTop), false));
        }
    }

    resetIgnoreScroll = (timeout: number = 250) => {
        this._scrollTimer && clearTimeout(this._scrollTimer);
        this._scrollTimer = setTimeout(() => {
            this._scrollTimer = undefined;
            if (!LinkDocPreview.LinkInfo && this._outerRef.current &&
                (!LightboxView.LightboxDoc || LightboxView.IsLightboxDocView(this.props.docViewPath()))) {
                this.layoutDoc._scrollTop = this._outerRef.current.scrollTop;
            }
        }, timeout);
    }
    iframeWheel = (e: any) => e.stopPropagation();
    onScroll = (e: any) => this.resetIgnoreScroll();
    scrollFocus = (doc: Doc, smooth: boolean) => {
        let focusSpeed: Opt<number>;
        if (doc !== this.rootDoc && this._outerRef.current) {
            const scrollTo = doc.type === DocumentType.TEXTANCHOR ? NumCast(doc.y) : Utils.scrollIntoView(NumCast(doc.y), doc[HeightSym](), NumCast(this.layoutDoc._scrollTop), this.props.PanelHeight() / (this.props.scaling?.() || 1));
            if (scrollTo !== undefined) {
                this._initialScroll !== undefined && (this._initialScroll = scrollTo);
                this.goTo(scrollTo, focusSpeed = smooth ? 500 : 0);
            }
        } else {
            this._initialScroll = NumCast(doc.y);
        }

        return focusSpeed;
    }

    getAnchor = () => {
        const anchor = Docs.Create.TextanchorDocument({
            title: StrCast(this.rootDoc.title + " " + this.layoutDoc._scrollTop),
            useLinkSmallAnchor: true,
            hideLinkButton: true,
            annotationOn: this.rootDoc,
            y: NumCast(this.layoutDoc._scrollTop),
        });
        this.addDocument(anchor);
        return anchor;
    }

    async componentDidMount() {
        this.props.setContentView?.(this); // this tells the DocumentView that this AudioBox is the "content" of the document.  this allows the DocumentView to indirectly call getAnchor() on the AudioBox when making a link.

        const urlField = Cast(this.dataDoc[this.props.fieldKey], WebField);
        runInAction(() => this._url = urlField?.url.toString() || "");

        this._disposers.selection = reaction(() => this.props.isSelected(),
            selected => !selected && setTimeout(() => {
                this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
                this._savedAnnotations.clear();
            }));

        document.addEventListener("pointerup", this.onLongPressUp);
        document.addEventListener("pointermove", this.onLongPressMove);
        const field = Cast(this.rootDoc[this.props.fieldKey], WebField);
        if (field?.url.href.indexOf("youtube") !== -1) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = Doc.NativeWidth(this.layoutDoc);
            const nativeHeight = Doc.NativeHeight(this.layoutDoc);
            if (field) {
                if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                    if (!nativeWidth) Doc.SetNativeWidth(this.layoutDoc, 600);
                    Doc.SetNativeHeight(this.layoutDoc, (nativeWidth || 600) / youtubeaspect);
                    this.layoutDoc._height = this.layoutDoc[WidthSym]() / youtubeaspect;
                }
            } // else it's an HTMLfield
        } else if (field?.url && !this.dataDoc.text) {
            const result = await WebRequest.get(Utils.CorsProxy(field.url.href));
            if (result) {
                this.dataDoc.text = htmlToText.fromString(result.content);
            }
        }

        var quickScroll = true;
        this._disposers.scrollReaction = reaction(() => NumCast(this.layoutDoc._scrollTop),
            (scrollTop) => {
                if (quickScroll) {
                    this._initialScroll = scrollTop;
                }
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

    goTo = (scrollTop: number, duration: number) => {
        if (this._outerRef.current) {
            if (duration) {
                smoothScroll(duration, [this._outerRef.current], scrollTop);
                this.resetIgnoreScroll(duration);
            } else {
                this.resetIgnoreScroll();
            }
        }
    }

    componentWillUnmount() {
        Object.values(this._disposers).forEach(disposer => disposer?.());
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
        this._iframe?.removeEventListener('wheel', this.iframeWheel);
    }

    @action
    forward = () => {
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
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
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
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
    submitURL = (newUrl: string) => {
        if (!newUrl.startsWith("http")) newUrl = "http://" + newUrl;
        try {
            const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
            const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
            const url = Cast(this.dataDoc[this.fieldKey], WebField, null)?.url.toString();
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

    menuControls = () => this.urlEditor;
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
                    <button className="submitUrl" onClick={this.back}>
                        <FontAwesomeIcon icon="caret-left" size="lg"></FontAwesomeIcon>
                    </button>
                    <button className="submitUrl" onClick={this.forward}>
                        <FontAwesomeIcon icon="caret-right" size="lg"></FontAwesomeIcon>
                    </button>
                </div>
            </div>
        );
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => this._ignore = e.timeStamp;
    onPrePointer = (e: React.PointerEvent) => this._ignore = e.timeStamp;
    onPostPointer = (e: React.PointerEvent) => this._ignore !== e.timeStamp && e.stopPropagation();
    onPostWheel = (e: React.WheelEvent) => this._ignore !== e.timeStamp && e.stopPropagation();

    onLongPressDown = (e: React.PointerEvent) => {
        this._pressX = e.clientX;
        this._pressY = e.clientY;

        // find the pressed element in the iframe (currently only works if its an img)
        let pressedElement: HTMLElement | undefined;
        let pressedBound: ClientRect | undefined;
        let selectedText: string = "";
        let pressedImg: boolean = false;
        if (this._iframe) {
            const B = this._iframe.getBoundingClientRect();
            const iframeDoc = this._iframe.contentDocument;
            if (B && iframeDoc) {
                // TODO: this only works when scale = 1 as it is currently only inteded for mobile upload
                const element = iframeDoc.elementFromPoint(this._pressX - B.left, this._pressY - B.top);
                if (element && element.nodeName === "IMG") {
                    pressedBound = element.getBoundingClientRect();
                    pressedElement = element.cloneNode(true) as HTMLElement;
                    pressedImg = true;
                } else {
                    // check if there is selected text
                    const text = iframeDoc.getSelection();
                    if (text && text.toString().length > 0) {
                        selectedText = text.toString();

                        // get html of the selected text
                        const range = text.getRangeAt(0);
                        const contents = range.cloneContents();
                        const div = document.createElement("div");
                        div.appendChild(contents);
                        pressedElement = div;

                        pressedBound = range.getBoundingClientRect();
                    }
                }
            }
        }

        // mark the pressed element
        if (pressedElement && pressedBound) {
            if (this._iframeIndicatorRef.current) {
                this._iframeIndicatorRef.current.style.top = pressedBound.top + "px";
                this._iframeIndicatorRef.current.style.left = pressedBound.left + "px";
                this._iframeIndicatorRef.current.style.width = pressedBound.width + "px";
                this._iframeIndicatorRef.current.style.height = pressedBound.height + "px";
                this._iframeIndicatorRef.current.classList.add("active");
            }
        }

        // start dragging the pressed element if long pressed
        this._longPressSecondsHack = setTimeout(() => {
            if (pressedImg && pressedElement && pressedBound) {
                e.stopPropagation();
                e.preventDefault();
                if (pressedElement.nodeName === "IMG") {
                    const src = pressedElement.getAttribute("src"); // TODO: may not always work
                    if (src) {
                        const doc = Docs.Create.ImageDocument(src);
                        ImageUtils.ExtractExif(doc);

                        // add clone to div so that dragging ghost is placed properly
                        if (this._iframeDragRef.current) this._iframeDragRef.current.appendChild(pressedElement);

                        const dragData = new DragManager.DocumentDragData([doc]);
                        DragManager.StartDocumentDrag([pressedElement], dragData, this._pressX, this._pressY, { hideSource: true });
                    }
                }
            } else if (selectedText && pressedBound && pressedElement) {
                e.stopPropagation();
                e.preventDefault();
                // create doc with the selected text's html
                const doc = Docs.Create.HtmlDocument(pressedElement.innerHTML);

                // create dragging ghost with the selected text
                if (this._iframeDragRef.current) this._iframeDragRef.current.appendChild(pressedElement);

                // start the drag
                const dragData = new DragManager.DocumentDragData([doc]);
                DragManager.StartDocumentDrag([pressedElement], dragData, this._pressX - pressedBound.top, this._pressY - pressedBound.top, { hideSource: true });
            }
        }, 1500);
    }
    onLongPressMove = (e: PointerEvent) => {
        // this._pressX = e.clientX;
        // this._pressY = e.clientY;
    }
    onLongPressUp = (e: PointerEvent) => {
        this._longPressSecondsHack && clearTimeout(this._longPressSecondsHack);
        this._iframeIndicatorRef.current?.classList.remove("active");
        while (this._iframeDragRef.current?.firstChild) this._iframeDragRef.current.removeChild(this._iframeDragRef.current.firstChild);
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.useCors ? "Don't Use" : "Use") + " Cors", event: () => this.layoutDoc.useCors = !this.layoutDoc.useCors, icon: "snowflake" });
        funcs.push({ description: (this.layoutDoc[this.fieldKey + "-contentWidth"] ? "Unfreeze" : "Freeze") + " Content Width", event: () => this.layoutDoc[this.fieldKey + "-contentWidth"] = this.layoutDoc[this.fieldKey + "-contentWidth"] ? undefined : Doc.NativeWidth(this.layoutDoc), icon: "snowflake" });
        funcs.push({ description: "Toggle Annotation View ", event: () => this.Document._showSidebar = !this.Document._showSidebar, icon: "expand-arrows-alt" });
        cm.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });
    }

    @computed
    get urlContent() {
        const field = this.dataDoc[this.props.fieldKey];
        let view;
        if (field instanceof HtmlField) {
            view = <span className="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />;
        } else if (field instanceof WebField) {
            const url = this.layoutDoc.useCors ? Utils.CorsProxy(field.url.href) : field.url.href;
            //    view = <iframe className="webBox-iframe" src={url} onLoad={e => { e.currentTarget.before((e.currentTarget.contentDocument?.body || e.currentTarget.contentDocument)?.children[0]!); e.currentTarget.remove(); }}
            view = <iframe className="webBox-iframe" enable-annotation={"true"} ref={action((r: HTMLIFrameElement | null) => this._iframe = r)} src={url} onLoad={this.iframeLoaded}
                // the 'allow-top-navigation' and 'allow-top-navigation-by-user-activation' attributes are left out to prevent iframes from redirecting the top-level Dash page
                // sandbox={"allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"} />;
                sandbox={"allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin"} />;
        } else {
            view = <iframe className="webBox-iframe" enable-annotation={"true"} ref={action((r: HTMLIFrameElement | null) => this._iframe = r)} src={"https://crossorigin.me/https://cs.brown.edu"} />;
        }
        return view;
    }

    anchorMenuClick = (anchor: Doc) => {
        this.Document._showSidebar = true;
        const startup = StrListCast(this.rootDoc.docFilters).map(filter => filter.split(":")[0]).join(" ");
        const target = Docs.Create.TextDocument(startup, {
            title: "anno",
            annotationOn: this.rootDoc, _width: 200, _height: 50, _fitWidth: true, _autoHeight: true, _fontSize: StrCast(Doc.UserDoc().fontSize),
            _fontFamily: StrCast(Doc.UserDoc().fontFamily)
        });
        FormattedTextBox.SelectOnLoad = target[Id];
        FormattedTextBox.DontSelectInitialText = true;
        this.allTags.map(tag => target[tag] = tag);
        DocUtils.MakeLink({ doc: anchor }, { doc: target }, "inline markup", "annotation");
        this.sidebarAddDocument(target);
    }
    toggleSidebar = () => {
        if (this.layoutDoc.nativeWidth === this.layoutDoc[this.fieldKey + "-nativeWidth"]) {
            this.layoutDoc.nativeWidth = 250 + NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]);
        } else {
            this.layoutDoc.nativeWidth = NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]);
        }
        this.layoutDoc._width = NumCast(this.layoutDoc._nativeWidth) * (NumCast(this.layoutDoc[this.fieldKey + "-nativeWidth"]) / NumCast(this.layoutDoc[this.fieldKey + "-nativeHeight"]))
    }
    sidebarKey = () => this.fieldKey + "-sidebar";
    sidebarFiltersHeight = () => 50;
    sidebarTransform = () => this.props.ScreenToLocalTransform().translate(Doc.NativeWidth(this.dataDoc), 0).scale(this.props.scaling?.() || 1);
    sidebarWidth = () => !this.layoutDoc._showSidebar ? 0 : (NumCast(this.layoutDoc.nativeWidth) - Doc.NativeWidth(this.dataDoc)) * this.props.PanelWidth() / NumCast(this.layoutDoc.nativeWidth);
    sidebarHeight = () => this.props.PanelHeight() - this.sidebarFiltersHeight() - 20;
    sidebarAddDocument = (doc: Doc | Doc[]) => this.addDocument(doc, this.sidebarKey());
    sidebarMoveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean) => this.moveDocument(doc, targetCollection, addDocument, this.sidebarKey());
    sidebarRemDocument = (doc: Doc | Doc[]) => this.removeDocument(doc, this.sidebarKey());
    sidebarDocFilters = () => [...StrListCast(this.layoutDoc._docFilters), ...StrListCast(this.layoutDoc[this.sidebarKey() + "-docFilters"])];
    @computed get allTags() {
        const keys = new Set<string>();
        DocListCast(this.rootDoc[this.sidebarKey()]).forEach(doc => SearchBox.documentKeys(doc).forEach(key => keys.add(key)));
        return Array.from(keys.keys()).filter(key => key[0]).filter(key => !key.startsWith("_") && (key[0] === "#" || key[0] === key[0].toUpperCase())).sort();
    }
    renderTag = (tag: string) => {
        const active = StrListCast(this.rootDoc[this.sidebarKey() + "-docFilters"]).includes(`${tag}:${tag}:check`);
        return <div className={`webBox-filterTag${active ? "-active" : ""}`}
            onClick={e => Doc.setDocFilter(this.rootDoc, tag, tag, "check", true, this.sidebarKey())}>
            {tag}
        </div>;
    }
    @computed get sidebarOverlay() {
        return !this.layoutDoc._showSidebar ? (null) :
            <div style={{
                position: "absolute", pointerEvents: this.active() ? "all" : undefined, top: 0, right: 0,
                background: this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.WidgetColor),
                width: `${this.sidebarWidth()}px`,
                height: "100%"
            }}>
                <div style={{ width: "100%", height: this.sidebarHeight(), position: "relative" }}>
                    <CollectionStackingView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                        NativeWidth={returnZero}
                        NativeHeight={returnZero}
                        PanelHeight={this.sidebarHeight}
                        PanelWidth={this.sidebarWidth}
                        xMargin={0}
                        yMargin={0}
                        docFilters={this.sidebarDocFilters}
                        chromeStatus={"enabled"}
                        scaleField={this.sidebarKey() + "-scale"}
                        isAnnotationOverlay={false}
                        select={emptyFunction}
                        active={this.annotationsActive}
                        scaling={returnOne}
                        whenActiveChanged={this.whenActiveChanged}
                        childHideDecorationTitle={returnTrue}
                        removeDocument={this.sidebarRemDocument}
                        moveDocument={this.sidebarMoveDocument}
                        addDocument={this.sidebarAddDocument}
                        CollectionView={undefined}
                        ScreenToLocalTransform={this.sidebarTransform}
                        renderDepth={this.props.renderDepth + 1}
                        viewType={CollectionViewType.Stacking}
                        fieldKey={this.sidebarKey()}
                        pointerEvents={"all"}
                    />
                </div>
                <div className="webBox-tagList" style={{ height: this.sidebarFiltersHeight(), width: this.sidebarWidth() }}>
                    {this.allTags.map(tag => this.renderTag(tag))}
                </div>
            </div>;
    }

    @computed
    get content() {
        const frozen = !this.active() || DocumentDecorations.Instance?.Interacting;
        const scale = this.props.scaling?.() || 1;
        return (<>
            <div className={"webBox-cont" + (this.active() && CurrentUserUtils.SelectedTool === InkTool.None && !DocumentDecorations.Instance?.Interacting ? "-interactive" : "")}
                style={{
                    width: NumCast(this.layoutDoc[this.fieldKey + "-contentWidth"]) || `${100 / scale}%`,
                    height: `${100 / scale}%`,
                }}
                onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {this.urlContent}
            </div>
            {!frozen ? (null) :
                <div className="webBox-overlay" style={{ pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? undefined : "all" }}
                    onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer}>
                    <div className="touch-iframe-overlay" onPointerDown={this.onLongPressDown} >
                        <div className="indicator" ref={this._iframeIndicatorRef}></div>
                        <div className="dragger" ref={this._iframeDragRef}></div>
                    </div>
                </div>}
        </>);
    }

    showInfo = action((anno: Opt<Doc>) => this._overlayAnnoInfo = anno);
    @observable private _overlayAnnoInfo: Opt<Doc>;
    @computed get allAnnotations() {
        return DocListCast(this.dataDoc[this.annotationKey]);
    }
    @computed get annotationLayer() {
        TraceMobx();
        return <div className="webBox-annotationLayer" style={{ height: Doc.NativeHeight(this.Document) || undefined }} ref={this._annotationLayer}>
            {this.inlineTextAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} fieldKey={this.annotationKey} showInfo={this.showInfo} dataDoc={this.dataDoc} anno={anno} key={`${anno[Id]}-annotation`} />)
            }
        </div>;
    }

    @action
    onMarqueeDown = (e: React.PointerEvent) => {
        if (!e.altKey && e.button === 0 && this.active(true)) {
            this._marqueeing = [e.clientX, e.clientY];
            this.props.select(false);
        }
    }
    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;
    @action finishMarquee = (x?: number, y?: number) => {
        this._marqueeing = undefined;
        this._isAnnotating = false;
        x !== undefined && y !== undefined && this._setPreviewCursor?.(x, y, false);
    }

    panelWidth = () => this.props.PanelWidth() / (this.props.scaling?.() || 1) - this.sidebarWidth(); // (this.Document.scrollHeight || Doc.NativeHeight(this.Document) || 0);
    panelHeight = () => this.props.PanelHeight() / (this.props.scaling?.() || 1); // () => this._pageSizes.length && this._pageSizes[0] ? this._pageSizes[0].width : Doc.NativeWidth(this.Document);
    scrollXf = () => this.props.ScreenToLocalTransform().translate(0, NumCast(this.layoutDoc._scrollTop));
    render() {
        const inactiveLayer = this.props.layerProvider?.(this.layoutDoc) === false;
        const scale = this.props.scaling?.() || 1;
        return (
            <div className="webBox" ref={this._mainCont} >
                <div className={`webBox-container`}
                    style={{ pointerEvents: inactiveLayer ? "none" : undefined }}
                    onContextMenu={this.specificContextMenu}>
                    <base target="_blank" />
                    <div className={"webBox-outerContent"} ref={this._outerRef}
                        style={{
                            width: `calc(${100 / scale}% - ${this.sidebarWidth()}px)`,
                            height: `${100 / scale}%`,
                            transform: `scale(${scale})`,
                            pointerEvents: inactiveLayer ? "none" : "all"
                        }}
                        onScroll={this.onScroll}
                        onPointerDown={this.onMarqueeDown}
                    >
                        <div className={"webBox-innerContent"} style={{
                            height: NumCast(this.scrollHeight, 50),
                            pointerEvents: inactiveLayer ? "none" : undefined
                        }}>
                            {this.content}
                            <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight", "setContentView"]).omit}
                                renderDepth={this.props.renderDepth + 1}
                                CollectionView={undefined}
                                fieldKey={this.annotationKey}
                                isAnnotationOverlay={true}
                                scaling={returnOne}
                                pointerEvents={this._isAnnotating ? "all" : "none"}
                                PanelWidth={this.panelWidth}
                                PanelHeight={this.panelHeight}
                                ScreenToLocalTransform={this.scrollXf}
                                setPreviewCursor={this.setPreviewCursor}
                                removeDocument={this.removeDocument}
                                moveDocument={this.moveDocument}
                                addDocument={this.addDocument}
                                select={emptyFunction}
                                active={this.active}
                                whenActiveChanged={this.whenActiveChanged} />
                            {this.annotationLayer}
                        </div>
                    </div>
                    {!this._marqueeing || !this._mainCont.current || !this._annotationLayer.current ? (null) :
                        <MarqueeAnnotator rootDoc={this.rootDoc}
                            anchorMenuClick={this.anchorMenuClick}
                            scrollTop={0}
                            down={this._marqueeing} scaling={returnOne}
                            addDocument={this.addDocument}
                            finishMarquee={this.finishMarquee}
                            savedAnnotations={this._savedAnnotations}
                            annotationLayer={this._annotationLayer.current}
                            mainCont={this._mainCont.current} />}
                </div >
                <button className="webBox-overlayButton-sidebar" key="sidebar" title="Toggle Sidebar" style={{ right: this.sidebarWidth() + 7 }}
                    onPointerDown={e => e.stopPropagation()} onClick={e => this.toggleSidebar()} >
                    <FontAwesomeIcon style={{ color: "white" }} icon={"chevron-left"} size="sm" />
                </button>
                {this.sidebarOverlay}
            </div>);
    }
}