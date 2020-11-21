import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Dictionary } from "typescript-collections";
import * as WebRequest from 'web-request';
import { Doc, DocListCast, Opt, AclAddonly, AclEdit, AclAdmin, DataSym, HeightSym, WidthSym } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { HtmlField } from "../../../fields/HtmlField";
import { InkTool } from "../../../fields/InkField";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { WebField } from "../../../fields/URLField";
import { TraceMobx, GetEffectiveAcl } from "../../../fields/util";
import { addStyleSheet, clearStyleSheetRules, emptyFunction, returnOne, returnZero, Utils, returnTrue, OmitKeys, smoothScroll } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { undoBatch } from "../../util/UndoManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { Annotation } from "../pdf/Annotation";
import { PDFMenu } from "../pdf/PDFMenu";
import { PdfViewerMarquee } from "../pdf/PDFViewer";
import { FieldView, FieldViewProps } from './FieldView';
import "./WebBox.scss";
import "../pdf/PDFViewer.scss";
import React = require("react");
import { Tooltip } from '@material-ui/core';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { FormattedTextBox } from './formattedText/FormattedTextBox';
const htmlToText = require("html-to-text");

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {

    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    static _annotationStyle: any = addStyleSheet();
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _startX: number = 0;
    private _startY: number = 0;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;
    @observable private _marqueeing: boolean = false;
    @observable private _url: string = "hello";
    @observable private _pressX: number = 0;
    @observable private _pressY: number = 0;
    @observable private _iframe: HTMLIFrameElement | null = null;
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    private _selectionReactionDisposer?: IReactionDisposer;
    private _scrollReactionDisposer?: IReactionDisposer;
    private _scrollTopReactionDisposer?: IReactionDisposer;
    private _moveReactionDisposer?: IReactionDisposer;
    private _longPressSecondsHack?: NodeJS.Timeout;
    private _outerRef = React.createRef<HTMLDivElement>();
    private _iframeIndicatorRef = React.createRef<HTMLDivElement>();
    private _iframeDragRef = React.createRef<HTMLDivElement>();
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);
    get scrollHeight() { return this.webpage?.scrollHeight || 1000; }
    get _collapsed() { return StrCast(this.layoutDoc._chromeStatus) !== "enabled"; }
    set _collapsed(value) { this.layoutDoc._chromeStatus = !value ? "enabled" : "disabled"; }
    get webpage() { return this._iframe?.contentDocument?.children[0]; }

    constructor(props: any) {
        super(props);
        if (this.dataDoc[this.fieldKey] instanceof WebField) {
            Doc.SetNativeWidth(this.dataDoc, Doc.NativeWidth(this.dataDoc) || 850);
            Doc.SetNativeHeight(this.dataDoc, Doc.NativeHeight(this.dataDoc) || this.Document[HeightSym]() / this.Document[WidthSym]() * 850);
        }
    }

    iframeLoaded = action((e: any) => {
        const iframe = this._iframe;
        if (iframe?.contentDocument) {
            iframe.setAttribute("enable-annotation", "true");
            iframe.contentDocument.addEventListener("click", undoBatch(action(e => {
                let href = "";
                for (let ele = e.target; ele; ele = ele.parentElement) {
                    href = (typeof (ele.href) === "string" ? ele.href : ele.href?.baseVal) || ele.parentElement?.href || href;
                }
                if (href) {
                    this._url = href.replace(Utils.prepend(""), Cast(this.dataDoc[this.fieldKey], WebField, null)?.url.origin);
                    this.submitURL();
                }
            })));
            iframe.contentDocument.addEventListener('wheel', this.iframeWheel, false);
            if (this.webpage) {
                this.webpage.scrollTop = NumCast(this.layoutDoc._scrollTop);
                this.webpage.scrollLeft = NumCast(this.layoutDoc._scrollLeft);
            }
        }
        this._scrollReactionDisposer?.();
        this._scrollReactionDisposer = reaction(() => ({ scrollY: this.layoutDoc._scrollY, scrollX: this.layoutDoc._scrollX }),
            ({ scrollY, scrollX }) => {
                const delay = this._outerRef.current ? 0 : 250; // wait for mainCont and try again to scroll
                const durationStr = StrCast(this.Document._viewTransition).match(/([0-9]*)ms/);
                const duration = durationStr ? Number(durationStr[1]) : 1000;
                if (scrollY !== undefined) {
                    this._forceSmoothScrollUpdate = true;
                    this.layoutDoc._scrollY = undefined;
                    setTimeout(() => this._outerRef.current && smoothScroll(duration, this._outerRef.current, Math.abs(scrollY || 0), () => this.layoutDoc._scrollTop = scrollY), delay);
                }
                if (scrollX !== undefined) {
                    this._forceSmoothScrollUpdate = true;
                    this.layoutDoc._scrollX = undefined;
                    setTimeout(() => this._outerRef.current && smoothScroll(duration, this._outerRef.current, Math.abs(scrollX || 0), () => this.layoutDoc._scrollLeft = scrollX), delay);
                }
            },
            { fireImmediately: true }
        );
        this._scrollTopReactionDisposer = reaction(() => this.layoutDoc._scrollTop,
            scrollTop => {
                const durationStr = StrCast(this.Document._viewTransition).match(/([0-9]*)ms/);
                const duration = durationStr ? Number(durationStr[1]) : 1000;
                if (scrollTop !== this._outerRef.current?.scrollTop && scrollTop !== undefined && this._forceSmoothScrollUpdate) {
                    this._outerRef.current && smoothScroll(duration, this._outerRef.current, Math.abs(scrollTop || 0), () => this._forceSmoothScrollUpdate = true);
                } else this._forceSmoothScrollUpdate = true;
            },
            { fireImmediately: true }
        );
    });
    _forceSmoothScrollUpdate = true;

    updateScroll = (x: Opt<number>, y: Opt<number>) => {
        if (y !== undefined) {
            this._outerRef.current!.scrollTop = y;
            this.layoutDoc._scrollY = undefined;
        }
        if (x !== undefined) {
            this._outerRef.current!.scrollLeft = x;
            this.layoutDoc.scrollX = undefined;
        }
    }

    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;
    iframeWheel = (e: any) => {
        if (this._forceSmoothScrollUpdate && e.target?.children) {
            this.webpage && setTimeout(action(() => {
                this.webpage!.scrollLeft = 0;
                const scrollTop = this.webpage!.scrollTop;
                const scrollLeft = this.webpage!.scrollLeft;
                this._outerRef.current!.scrollTop = scrollTop;
                this._outerRef.current!.scrollLeft = scrollLeft;
                if (this.layoutDoc._scrollTop !== scrollTop) {
                    this._forceSmoothScrollUpdate = false;
                    this.layoutDoc._scrollTop = scrollTop;
                }
                if (this.layoutDoc._scrollLeft !== scrollLeft) {
                    this._forceSmoothScrollUpdate = false;
                    this.layoutDoc._scrollLeft = scrollLeft;
                }
            }));
        }
    }
    async componentDidMount() {
        const urlField = Cast(this.dataDoc[this.props.fieldKey], WebField);
        runInAction(() => this._url = urlField?.url.toString() || "");

        this._moveReactionDisposer = reaction(() => this.layoutDoc.x || this.layoutDoc.y,
            () => this.updateScroll(this.layoutDoc._scrollLeft, this.layoutDoc._scrollTop));

        this._selectionReactionDisposer = reaction(() => this.props.isSelected(),
            selected => {
                if (!selected) {
                    this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
                    this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, []));
                    PDFMenu.Instance.fadeOut(true);
                }
            },
            { fireImmediately: true });

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
        } else if (field?.url) {
            const result = await WebRequest.get(Utils.CorsProxy(field.url.href));
            if (result) {
                this.dataDoc.text = htmlToText.fromString(result.content);
            }
        }
    }

    componentWillUnmount() {
        this._moveReactionDisposer?.();
        this._selectionReactionDisposer?.();
        this._scrollTopReactionDisposer?.();
        this._scrollReactionDisposer?.();
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
        this._iframe?.removeEventListener('wheel', this.iframeWheel);
    }

    onUrlDragover = (e: React.DragEvent) => {
        e.preventDefault();
    }

    @undoBatch
    @action
    onUrlDrop = (e: React.DragEvent) => {
        const { dataTransfer } = e;
        const html = dataTransfer.getData("text/html");
        const uri = dataTransfer.getData("text/uri-list");
        const url = uri || html || this._url;
        this._url = url.startsWith(window.location.origin) ?
            url.replace(window.location.origin, this._url.match(/http[s]?:\/\/[^\/]*/)?.[0] || "") : url;
        this.submitURL();
        e.stopPropagation();
    }

    @action
    forward = () => {
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
        if (future.length) {
            history.push(this._url);
            this.dataDoc[this.annotationKey + "-" + this.urlHash(this._url)] = new List<Doc>(DocListCast(this.dataDoc[this.annotationKey]));
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = future.pop()!));
            this.dataDoc[this.annotationKey] = new List<Doc>(DocListCast(this.dataDoc[this.annotationKey + "-" + this.urlHash(this._url)]));
        }
    }

    @action
    back = () => {
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
        if (history.length) {
            if (future === undefined) this.dataDoc[this.fieldKey + "-future"] = new List<string>([this._url]);
            else future.push(this._url);
            this.dataDoc[this.annotationKey + "-" + this.urlHash(this._url)] = new List<Doc>(DocListCast(this.dataDoc[this.annotationKey]));
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = history.pop()!));
            this.dataDoc[this.annotationKey] = new List<Doc>(DocListCast(this.dataDoc[this.annotationKey + "-" + this.urlHash(this._url)]));
        }
    }

    urlHash(s: string) {
        return s.split('').reduce((a: any, b: any) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a; }, 0);
    }
    @action
    submitURL = () => {
        if (!this._url.startsWith("http")) this._url = "http://" + this._url;
        try {
            const URLy = new URL(this._url);
            const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
            const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
            const annos = DocListCast(this.dataDoc[this.annotationKey]);
            const url = Cast(this.dataDoc[this.fieldKey], WebField, null)?.url.toString();
            if (url) {
                if (history === undefined) {
                    this.dataDoc[this.fieldKey + "-history"] = new List<string>([url]);

                } else {
                    history.push(url);
                }
                future && (future.length = 0);
                this.dataDoc[this.annotationKey + "-" + this.urlHash(url)] = new List<Doc>(annos);
            }
            this.dataDoc[this.fieldKey] = new WebField(URLy);
            this.dataDoc[this.annotationKey] = new List<Doc>([]);
        } catch (e) {
            console.log("WebBox URL error:" + this._url);
        }
    }

    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            this.submitURL();
        }
        e.stopPropagation();
    }

    editToggleBtn() {
        return <Tooltip title={<div className="dash-tooltip" >{`${this.props.Document.isAnnotating ? "Exit" : "Enter"} annotation mode`}</div>}>
            <div className="webBox-annotationToggle"
                style={{ color: this.props.Document.isAnnotating ? "black" : "white", backgroundColor: this.props.Document.isAnnotating ? "white" : "black" }}
                onClick={action(() => this.layoutDoc.isAnnotating = !this.layoutDoc.isAnnotating)}>
                <FontAwesomeIcon icon="edit" size="sm" />
            </div>
        </Tooltip>;
    }

    _ignore = 0;
    onPreWheel = (e: React.WheelEvent) => {
        this._ignore = e.timeStamp;
    }
    onPrePointer = (e: React.PointerEvent) => {
        this._ignore = e.timeStamp;
    }
    onPostPointer = (e: React.PointerEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }

    onPostWheel = (e: React.WheelEvent) => {
        if (this._ignore !== e.timeStamp) {
            e.stopPropagation();
        }
    }

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
        if (this._longPressSecondsHack) {
            clearTimeout(this._longPressSecondsHack);
        }
        if (this._iframeIndicatorRef.current) {
            this._iframeIndicatorRef.current.classList.remove("active");
        }
        if (this._iframeDragRef.current) {
            while (this._iframeDragRef.current.firstChild) this._iframeDragRef.current.removeChild(this._iframeDragRef.current.firstChild);
        }
    }

    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.useCors ? "Don't Use" : "Use") + " Cors", event: () => this.layoutDoc.useCors = !this.layoutDoc.useCors, icon: "snowflake" });
        funcs.push({ description: (this.layoutDoc[this.fieldKey + "-contentWidth"] ? "Unfreeze" : "Freeze") + " Content Width", event: () => this.layoutDoc[this.fieldKey + "-contentWidth"] = this.layoutDoc[this.fieldKey + "-contentWidth"] ? undefined : Doc.NativeWidth(this.layoutDoc), icon: "snowflake" });
        cm.addItem({ description: "Options...", subitems: funcs, icon: "asterisk" });

    }

    //const href = "https://brown365-my.sharepoint.com/personal/bcz_ad_brown_edu/_layouts/15/Doc.aspx?sourcedoc={31aa3178-4c21-4474-b367-877d0a7135e4}&action=embedview&wdStartOn=1";

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
                sandbox={"allow-forms allow-modals allow-orientation-lock allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"} />;
        } else {
            view = <iframe className="webBox-iframe" enable-annotation={"true"} ref={action((r: HTMLIFrameElement | null) => this._iframe = r)} src={"https://crossorigin.me/https://cs.brown.edu"} />;
        }
        return view;
    }
    @computed
    get content() {
        const view = this.urlContent;

        const frozen = !this.props.isSelected() || DocumentDecorations.Instance?.Interacting;

        return (<>
            <div className={"webBox-cont" + (this.props.isSelected() && Doc.GetSelectedTool() === InkTool.None && !DocumentDecorations.Instance?.Interacting ? "-interactive" : "")}
                style={{ width: NumCast(this.layoutDoc[this.fieldKey + "-contentWidth"]) || (Number.isFinite(this.props.ContentScaling()) ? `${Math.max(100, 100 / this.props.ContentScaling())}% ` : "100%") }}
                onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {view}
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



    @computed get allAnnotations() { return DocListCast(this.dataDoc[this.props.fieldKey + "-annotations"]); }
    @computed get nonDocAnnotations() { return this.allAnnotations.filter(a => a.annotations); }

    @undoBatch
    @action
    makeAnnotationDocument = (color: string): Opt<Doc> => {
        if (this._savedAnnotations.size() === 0) return undefined;
        const anno = this._savedAnnotations.values()[0][0];
        const annoDoc = Docs.Create.FreeformDocument([], { backgroundColor: color, annotationOn: this.props.Document, title: "Annotation on " + this.Document.title });
        if (anno.style.left) annoDoc.x = parseInt(anno.style.left);
        if (anno.style.top) annoDoc.y = NumCast(this.layoutDoc._scrollTop) + parseInt(anno.style.top);
        if (anno.style.height) annoDoc._height = parseInt(anno.style.height);
        if (anno.style.width) annoDoc._width = parseInt(anno.style.width);
        anno.remove();
        this._savedAnnotations.clear();
        return annoDoc;
    }
    @computed get annotationLayer() {
        TraceMobx();
        return <div className="webBox-annotationLayer" style={{ height: Doc.NativeHeight(this.Document) || undefined }} ref={this._annotationLayer}>
            {this.nonDocAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} showInfo={emptyFunction} focus={this.props.focus} dataDoc={this.dataDoc} fieldKey={this.props.fieldKey} anno={anno} key={`${anno[Id]}-annotation`} />)
            }
        </div>;
    }
    @action
    createAnnotation = (div: HTMLDivElement, page: number) => {
        if (this._annotationLayer.current) {
            if (div.style.top) {
                div.style.top = (parseInt(div.style.top)).toString();
            }
            this._annotationLayer.current.append(div);
            div.style.backgroundColor = "#ACCEF7";
            div.style.opacity = "0.5";
            const savedPage = this._savedAnnotations.getValue(page);
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
    highlight = (color: string) => {
        // creates annotation documents for current highlights
        const effectiveAcl = GetEffectiveAcl(this.props.Document[DataSym]);
        const annotationDoc = [AclAddonly, AclEdit, AclAdmin].includes(effectiveAcl) ? this.makeAnnotationDocument(color.replace(/[0-9.]*\)/, "0.3)")) : undefined;
        annotationDoc && this.addDocument?.(annotationDoc);
        return annotationDoc ?? undefined;
    }
    /**
     * This is temporary for creating annotations from highlights. It will
     * start a drag event and create or put the necessary info into the drag event.
     */
    @action
    startDrag = async (e: PointerEvent, ele: HTMLElement) => {
        e.preventDefault();
        e.stopPropagation();

        const targetDoc = CurrentUserUtils.GetNewTextDoc("Note linked to " + this.props.Document.title, 0, 0, 125, 125);
        FormattedTextBox.SelectOnLoad = targetDoc[Id];
        const annotationDoc = this.highlight("rgba(173, 216, 230, 0.35)"); // hyperlink color
        if (annotationDoc) {
            DragManager.StartPdfAnnoDrag([ele], new DragManager.PdfAnnoDragData(this.props.Document, annotationDoc, targetDoc), e.pageX, e.pageY, {
                dragComplete: e => {
                    if (!e.aborted && e.annoDragData && !e.annoDragData.linkDocument) {
                        e.annoDragData.linkDocument = DocUtils.MakeLink({ doc: annotationDoc }, { doc: e.annoDragData.dropDocument }, "Annotation");
                        annotationDoc.isLinkButton = true;
                        annotationDoc.isPushpin = e.annoDragData?.dropDocument.annotationOn === this.props.Document;
                    }
                }
            });
        }
    }
    @action
    onMarqueeDown = (e: React.PointerEvent) => {
        this._marqueeing = false;
        if (!e.altKey && e.button === 0 && this.active(true)) {
            // clear out old marquees and initialize menu for new selection
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
            PDFMenu.Instance.Status = "pdf";
            PDFMenu.Instance.fadeOut(true);
            this._savedAnnotations.values().forEach(v => v.forEach(a => a.remove()));
            this._savedAnnotations.keys().forEach(k => this._savedAnnotations.setValue(k, []));
            if ((e.target as any)?.parentElement.className === "textLayer") {
                // start selecting text if mouse down on textLayer spans
            }
            else if (this._mainCont.current) {
                // set marquee x and y positions to the spatially transformed position
                const nheight = Doc.NativeHeight(this.Document) || 1;
                const nwidth = Doc.NativeWidth(this.Document) || 1;
                const boundingRect = this._mainCont.current.getBoundingClientRect();
                const boundingHeight = nheight / nwidth * boundingRect.width;
                this._startX = (e.clientX - boundingRect.left) / boundingRect.width * nwidth;
                this._startY = (e.clientY - boundingRect.top) / boundingHeight * nheight;
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
            const boundingRect = this._mainCont.current.getBoundingClientRect();
            const boundingHeight = (Doc.NativeHeight(this.Document) || 1) / (Doc.NativeWidth(this.Document) || 1) * boundingRect.width;
            const curX = (e.clientX - boundingRect.left) / boundingRect.width * (Doc.NativeWidth(this.Document) || 1);
            const curY = (e.clientY - boundingRect.top) / boundingHeight * (Doc.NativeHeight(this.Document) || 1);
            this._marqueeWidth = curX - this._startX;
            this._marqueeHeight = curY - this._startY;
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
    onSelectEnd = (e: PointerEvent): void => {
        clearStyleSheetRules(WebBox._annotationStyle);
        this._savedAnnotations.clear();
        if (this._marqueeWidth > 10 || this._marqueeHeight > 10) {
            const marquees = this._mainCont.current!.getElementsByClassName("pdfViewerDash-dragAnnotationBox");
            if (marquees?.length) { // copy the marquee and convert it to a permanent annotation.
                const style = (marquees[0] as HTMLDivElement).style;
                const copy = document.createElement("div");
                copy.style.left = style.left;
                copy.style.top = style.top;
                copy.style.width = style.width;
                copy.style.height = style.height;
                copy.style.border = style.border;
                copy.style.opacity = style.opacity;
                (copy as any).marqueeing = true;
                copy.className = "webBox-annotationBox";
                this.createAnnotation(copy, 0);
            }

            if (!e.ctrlKey) {
                PDFMenu.Instance.Marquee = { left: this._marqueeX, top: this._marqueeY, width: this._marqueeWidth, height: this._marqueeHeight };
            }
            PDFMenu.Instance.jumpTo(e.clientX, e.clientY);
        }
        //this._marqueeing = false;

        if (PDFMenu.Instance.Highlighting) {// when highlighter has been toggled when menu is pinned, we auto-highlight immediately on mouse up
            this.highlight("rgba(245, 230, 95, 0.616)");  // yellowish highlight color for highlighted text (should match PDFMenu's highlight color)
        }
        else {
            PDFMenu.Instance.StartDrag = this.startDrag;
            PDFMenu.Instance.Highlight = this.highlight;
        }
        document.removeEventListener("pointermove", this.onSelectMove);
        document.removeEventListener("pointerup", this.onSelectEnd);
    }
    marqueeWidth = () => this._marqueeWidth;
    marqueeHeight = () => this._marqueeHeight;
    marqueeX = () => this._marqueeX;
    marqueeY = () => this._marqueeY;
    marqueeing = () => this._marqueeing;
    visibleHeight = () => {
        if (this._mainCont.current) {
            const boundingRect = this._mainCont.current.getBoundingClientRect();
            const scaling = (Doc.NativeWidth(this.Document) || 0) / boundingRect.width;
            return Math.min(boundingRect.height * scaling, this.props.PanelHeight() * scaling);
        }
        return this.props.PanelHeight();
    }
    scrollXf = () => this.props.ScreenToLocalTransform().translate(NumCast(this.layoutDoc._scrollLeft), NumCast(this.layoutDoc._scrollTop));
    render() {
        const scaling = Number.isFinite(this.props.ContentScaling()) ? this.props.ContentScaling() || 1 : 1;
        return (<div className="webBox" ref={this._mainCont} >
            <div className={`webBox-container`}
                style={{
                    position: undefined,
                    transform: `scale(${scaling})`,
                    width: `${100 / scaling}% `,
                    height: `${100 / scaling}% `,
                    pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined
                }}
                onContextMenu={this.specificContextMenu}>
                <base target="_blank" />
                {this.content}
                <div className={"webBox-outerContent"} ref={this._outerRef}
                    style={{
                        width: `${Math.max(100, 100 / scaling)}% `,
                        pointerEvents: this.layoutDoc.isAnnotating && this.props.layerProvider?.(this.layoutDoc) !== false ? "all" : "none"
                    }}
                    onWheel={e => {
                        const target = this._outerRef.current;
                        if (this._forceSmoothScrollUpdate && target && this.webpage) {
                            setTimeout(action(() => {
                                target.scrollLeft = 0;
                                const scrollTop = target.scrollTop;
                                const scrollLeft = target.scrollLeft;
                                this.webpage!.scrollTop = scrollTop;
                                this.webpage!.scrollLeft = scrollLeft;
                                if (this.layoutDoc._scrollTop !== scrollTop) this.layoutDoc._scrollTop = scrollTop;
                                if (this.layoutDoc._scrollLeft !== scrollLeft) this.layoutDoc._scrollLeft = scrollLeft;
                            }));
                        }
                        e.stopPropagation();
                    }}
                    onPointerDown={this.onMarqueeDown}
                    onScroll={e => e.stopPropagation()}
                >
                    <div className={"webBox-innerContent"} style={{
                        height: NumCast(this.scrollHeight, 50),
                        pointerEvents: this.props.layerProvider?.(this.layoutDoc) === false ? "none" : undefined
                    }}>
                        <CollectionFreeFormView {...OmitKeys(this.props, ["NativeWidth", "NativeHeight"]).omit}
                            PanelHeight={this.props.PanelHeight}
                            PanelWidth={this.props.PanelWidth}
                            annotationsKey={this.annotationKey}
                            VisibleHeight={this.visibleHeight}
                            focus={this.props.focus}
                            setPreviewCursor={this.setPreviewCursor}
                            isSelected={this.props.isSelected}
                            isAnnotationOverlay={true}
                            select={emptyFunction}
                            active={this.active}
                            ContentScaling={returnOne}
                            whenActiveChanged={this.whenActiveChanged}
                            removeDocument={this.removeDocument}
                            moveDocument={this.moveDocument}
                            addDocument={this.addDocument}
                            CollectionView={undefined}
                            ScreenToLocalTransform={this.scrollXf}
                            renderDepth={this.props.renderDepth + 1}
                            docFilters={this.props.docFilters}
                            docRangeFilters={this.props.docRangeFilters}
                            searchFilterDocs={this.props.searchFilterDocs}
                            ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                        </CollectionFreeFormView>
                    </div>
                </div>
                {this.annotationLayer}
                <PdfViewerMarquee isMarqueeing={this.marqueeing} width={this.marqueeWidth} height={this.marqueeHeight} x={this.marqueeX} y={this.marqueeY} />
            </div >

            {this.props.isSelected() ? this.editToggleBtn() : null}
        </div>);
    }
}