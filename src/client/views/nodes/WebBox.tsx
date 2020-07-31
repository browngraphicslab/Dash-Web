import { faMousePointer, faPen, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Dictionary } from "typescript-collections";
import * as WebRequest from 'web-request';
import { Doc, DocListCast, Opt } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { Id } from "../../../fields/FieldSymbols";
import { HtmlField } from "../../../fields/HtmlField";
import { InkTool } from "../../../fields/InkField";
import { List } from "../../../fields/List";
import { listSpec, makeInterface } from "../../../fields/Schema";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { WebField } from "../../../fields/URLField";
import { TraceMobx } from "../../../fields/util";
import { addStyleSheet, clearStyleSheetRules, emptyFunction, returnOne, returnZero, Utils, returnTrue } from "../../../Utils";
import { Docs, DocUtils } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { undoBatch } from "../../util/UndoManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import Annotation from "../pdf/Annotation";
import PDFMenu from "../pdf/PDFMenu";
import { PdfViewerMarquee } from "../pdf/PDFViewer";
import { FieldView, FieldViewProps } from './FieldView';
import "./WebBox.scss";
import "../pdf/PDFViewer.scss";
import React = require("react");
const htmlToText = require("html-to-text");

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {

    private _annotationLayer: React.RefObject<HTMLDivElement> = React.createRef();
    static _annotationStyle: any = addStyleSheet();
    private _mainCont: React.RefObject<HTMLDivElement> = React.createRef();
    private _startX: number = 0;
    private _startY: number = 0;
    @observable private _marqueeX: number = 0;
    @observable private _marqueeY: number = 0;
    @observable private _marqueeWidth: number = 0;
    @observable private _marqueeHeight: number = 0;
    @observable private _marqueeing: boolean = false;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    get _collapsed() { return StrCast(this.layoutDoc._chromeStatus) !== "enabled"; }
    set _collapsed(value) { this.layoutDoc._chromeStatus = !value ? "enabled" : "disabled"; }
    @observable private _url: string = "hello";
    @observable private _pressX: number = 0;
    @observable private _pressY: number = 0;
    @observable private _savedAnnotations: Dictionary<number, HTMLDivElement[]> = new Dictionary<number, HTMLDivElement[]>();
    private _selectionReactionDisposer?: IReactionDisposer;
    private _scrollReactionDisposer?: IReactionDisposer;
    private _moveReactionDisposer?: IReactionDisposer;
    private _keyInput = React.createRef<HTMLInputElement>();
    private _longPressSecondsHack?: NodeJS.Timeout;
    private _outerRef = React.createRef<HTMLDivElement>();
    private _iframeRef = React.createRef<HTMLIFrameElement>();
    private _iframeIndicatorRef = React.createRef<HTMLDivElement>();
    private _iframeDragRef = React.createRef<HTMLDivElement>();
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);

    iframeLoaded = action((e: any) => {
        const iframe = this._iframeRef.current;
        if (iframe && iframe.contentDocument) {
            iframe.setAttribute("enable-annotation", "true");
            iframe.contentDocument.addEventListener('pointerdown', this.iframedown, false);
            iframe.contentDocument.addEventListener('scroll', this.iframeScrolled, false);
            this.layoutDoc.scrollHeight = iframe.contentDocument.children?.[0].scrollHeight || 1000;
            iframe.contentDocument.children[0].scrollTop = NumCast(this.layoutDoc._scrollTop);
            iframe.contentDocument.children[0].scrollLeft = NumCast(this.layoutDoc._scrollLeft);
        }
        this._scrollReactionDisposer?.();
        this._scrollReactionDisposer = reaction(() => ({ y: this.layoutDoc._scrollY, x: this.layoutDoc._scrollX }),
            ({ x, y }) => this.updateScroll(x, y),
            { fireImmediately: true }
        );
    });

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
    iframedown = (e: PointerEvent) => {
        this._setPreviewCursor?.(e.screenX, e.screenY, false);
    }
    iframeScrolled = (e: any) => {
        const scrollTop = e.target?.children?.[0].scrollTop;
        const scrollLeft = e.target?.children?.[0].scrollLeft;
        this.layoutDoc._scrollTop = this._outerRef.current!.scrollTop = scrollTop;
        this.layoutDoc._scrollLeft = this._outerRef.current!.scrollLeft = scrollLeft;
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
            const nativeWidth = NumCast(this.layoutDoc._nativeWidth);
            const nativeHeight = NumCast(this.layoutDoc._nativeHeight);
            if (field) {
                if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                    if (!nativeWidth) this.layoutDoc._nativeWidth = 600;
                    this.layoutDoc._nativeHeight = NumCast(this.layoutDoc._nativeWidth) / youtubeaspect;
                    this.layoutDoc._height = NumCast(this.layoutDoc._width) / youtubeaspect;
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
        this._scrollReactionDisposer?.();
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
        this._iframeRef.current?.contentDocument?.removeEventListener('pointerdown', this.iframedown);
        this._iframeRef.current?.contentDocument?.removeEventListener('scroll', this.iframeScrolled);
    }

    @action
    onURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._url = e.target.value;
    }

    onUrlDragover = (e: React.DragEvent) => {
        e.preventDefault();
    }
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

    toggleAnnotationMode = () => {
        this.layoutDoc.isAnnotating = !this.layoutDoc.isAnnotating;
    }

    urlEditor() {
        return (
            <div className="webBox-urlEditor"
                onDrop={this.onUrlDrop}
                onDragOver={this.onUrlDragover} style={{ top: this._collapsed ? -70 : 0 }}>
                <div className="urlEditor">
                    <div className="editorBase">
                        <button className="editor-collapse"
                            style={{
                                top: this._collapsed ? 70 : 0,
                                transform: `rotate(${this._collapsed ? 180 : 0}deg) scale(${this._collapsed ? 0.5 : 1}) translate(${this._collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: (this._collapsed && !this.props.isSelected()) ? 0 : 0.9,
                                left: (this._collapsed ? 0 : "unset"),
                            }}
                            title="Collapse Url Editor" onClick={this.toggleCollapse}>
                            <FontAwesomeIcon icon="caret-up" size="2x" />
                        </button>
                        <div className="webBox-buttons"
                            onDrop={this.onUrlDrop}
                            onDragOver={this.onUrlDragover} style={{ display: this._collapsed ? "none" : "flex" }}>
                            <div className="webBox-freeze" title={"Annotate"} style={{ background: this.layoutDoc.isAnnotating ? "lightBlue" : "gray" }} onClick={this.toggleAnnotationMode} >
                                <FontAwesomeIcon icon={faPen} size={"2x"} />
                            </div>
                            <div className="webBox-freeze" title={"Select"} style={{ background: !this.layoutDoc.isAnnotating ? "lightBlue" : "gray" }} onClick={this.toggleAnnotationMode} >
                                <FontAwesomeIcon icon={faMousePointer} size={"2x"} />
                            </div>
                            <input className="webpage-urlInput"
                                placeholder="ENTER URL"
                                value={this._url}
                                onDrop={this.onUrlDrop}
                                onDragOver={this.onUrlDragover}
                                onChange={this.onURLChange}
                                onKeyDown={this.onValueKeyDown}
                                onClick={(e) => {
                                    this._keyInput.current!.select();
                                    e.stopPropagation();
                                }}
                                ref={this._keyInput}
                            />
                            <div style={{
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-between",
                                maxWidth: "120px",
                            }}>
                                <button className="submitUrl" onClick={this.submitURL}
                                    onDragOver={this.onUrlDragover} onDrop={this.onUrlDrop}>
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
                    </div>
                </div>
            </div>
        );
    }


    @action
    toggleCollapse = () => {
        this._collapsed = !this._collapsed;
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
        if (this._iframeRef.current) {
            const B = this._iframeRef.current.getBoundingClientRect();
            const iframeDoc = this._iframeRef.current.contentDocument;
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


    @undoBatch
    @action
    toggleNativeDimensions = () => {
        Doc.toggleNativeDimensions(this.layoutDoc, this.props.ContentScaling(), this.props.NativeWidth(), this.props.NativeHeight());
    }
    specificContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        const funcs: ContextMenuProps[] = [];
        funcs.push({ description: (this.layoutDoc.UseCors ? "Don't Use" : "Use") + " Cors", event: () => this.layoutDoc.UseCors = !this.layoutDoc.UseCors, icon: "snowflake" });
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
            const url = this.layoutDoc.UseCors ? Utils.CorsProxy(field.url.href) : field.url.href;
            view = <iframe className="webBox-iframe" enable-annotation={true} ref={this._iframeRef} src={url} onLoad={this.iframeLoaded} />;
        } else {
            view = <iframe className="webBox-iframe" enable-annotation={true} ref={this._iframeRef} src={"https://crossorigin.me/https://cs.brown.edu"} />;
        }
        return view;
    }
    @computed
    get content() {
        const view = this.urlContent;
        const decInteracting = DocumentDecorations.Instance?.Interacting;

        const frozen = !this.props.isSelected() || decInteracting;

        return (<>
            <div className={"webBox-cont" + (this.props.isSelected() && Doc.GetSelectedTool() === InkTool.None && !decInteracting ? "-interactive" : "")}
                style={{ width: Number.isFinite(this.props.ContentScaling()) ? `${Math.max(100, 100 / this.props.ContentScaling())}% ` : "100%" }}
                onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {view}
            </div>;
            {!frozen ? (null) :
                <div className="webBox-overlay" style={{ pointerEvents: this.layoutDoc.isBackground ? undefined : "all" }}
                    onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer}>
                    <div className="touch-iframe-overlay" onPointerDown={this.onLongPressDown} >
                        <div className="indicator" ref={this._iframeIndicatorRef}></div>
                        <div className="dragger" ref={this._iframeDragRef}></div>
                    </div>
                </div>}
            {this.urlEditor()}
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
        return <div className="webBox-annotationLayer" style={{ height: NumCast(this.Document._nativeHeight) }} ref={this._annotationLayer}>
            {this.nonDocAnnotations.sort((a, b) => NumCast(a.y) - NumCast(b.y)).map(anno =>
                <Annotation {...this.props} focus={this.props.focus} dataDoc={this.dataDoc} fieldKey={this.props.fieldKey} anno={anno} key={`${anno[Id]}-annotation`} />)
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
        const annotationDoc = this.makeAnnotationDocument(color);
        annotationDoc && Doc.AddDocToList(this.props.Document, this.annotationKey, annotationDoc);
        return annotationDoc;
    }
    /**
     * This is temporary for creating annotations from highlights. It will
     * start a drag event and create or put the necessary info into the drag event.
     */
    @action
    startDrag = async (e: PointerEvent, ele: HTMLElement) => {
        e.preventDefault();
        e.stopPropagation();

        const clipDoc = Doc.MakeAlias(this.dataDoc);
        clipDoc._fitWidth = true;
        clipDoc._width = this.marqueeWidth();
        clipDoc._height = this.marqueeHeight();
        clipDoc._scrollTop = this.marqueeY();
        const targetDoc = Docs.Create.TextDocument("", { _width: 125, _height: 125, title: "Note linked to " + this.props.Document.title });
        Doc.GetProto(targetDoc).data = new List<Doc>([clipDoc]);
        clipDoc.rootDocument = targetDoc;
        targetDoc.layoutKey = "layout";
        const annotationDoc = this.highlight("rgba(146, 245, 95, 0.467)"); // yellowish highlight color when dragging out a text selection
        if (annotationDoc) {
            DragManager.StartPdfAnnoDrag([ele], new DragManager.PdfAnnoDragData(this.props.Document, annotationDoc, targetDoc), e.pageX, e.pageY, {
                dragComplete: e => {
                    if (!e.aborted && e.annoDragData && !e.annoDragData.linkedToDoc) {
                        DocUtils.MakeLink({ doc: annotationDoc }, { doc: e.annoDragData.dropDocument }, "Annotation");
                        annotationDoc.isLinkButton = true;
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
                const boundingRect = this._mainCont.current.getBoundingClientRect();
                const boundingHeight = (this.Document._nativeHeight || 1) / (this.Document._nativeWidth || 1) * boundingRect.width;
                this._startX = (e.clientX - boundingRect.left) / boundingRect.width * (this.Document._nativeWidth || 1);
                this._startY = (e.clientY - boundingRect.top) / boundingHeight * (this.Document._nativeHeight || 1);
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
            const boundingHeight = (this.Document._nativeHeight || 1) / (this.Document._nativeWidth || 1) * boundingRect.width;
            const curX = (e.clientX - boundingRect.left) / boundingRect.width * (this.Document._nativeWidth || 1);
            const curY = (e.clientY - boundingRect.top) / boundingHeight * (this.Document._nativeHeight || 1);
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
    visibleHeiht = () => {
        if (this._mainCont.current) {
            const boundingRect = this._mainCont.current.getBoundingClientRect();
            const scalin = (this.Document._nativeWidth || 0) / boundingRect.width;
            return Math.min(boundingRect.height * scalin, this.props.PanelHeight() * scalin);
        }
        return this.props.PanelHeight();
    }
    scrollXf = () => this.props.ScreenToLocalTransform().translate(NumCast(this.layoutDoc._scrollLeft), NumCast(this.layoutDoc._scrollTop));
    render() {
        return (<div className="webBox" ref={this._mainCont} >
            <div className={`webBox-container`}
                style={{
                    position: undefined,
                    transform: `scale(${this.props.ContentScaling()})`,
                    width: Number.isFinite(this.props.ContentScaling()) ? `${100 / this.props.ContentScaling()}% ` : "100%",
                    height: Number.isFinite(this.props.ContentScaling()) ? `${100 / this.props.ContentScaling()}% ` : "100%",
                    pointerEvents: this.layoutDoc.isBackground ? "none" : undefined
                }}
                onContextMenu={this.specificContextMenu}>
                <base target="_blank" />
                {this.content}
                <div className={"webBox-outerContent"} ref={this._outerRef}
                    style={{
                        width: Number.isFinite(this.props.ContentScaling()) ? `${Math.max(100, 100 / this.props.ContentScaling())}% ` : "100%",
                        pointerEvents: this.layoutDoc.isAnnotating && !this.layoutDoc.isBackground ? "all" : "none"
                    }}
                    onWheel={e => e.stopPropagation()}
                    onPointerDown={this.onMarqueeDown}
                    onScroll={e => {
                        const iframe = this._iframeRef?.current?.contentDocument;
                        const outerFrame = this._outerRef.current;
                        if (iframe && outerFrame) {
                            if (iframe.children[0].scrollTop !== outerFrame.scrollTop) {
                                iframe.children[0].scrollTop = outerFrame.scrollTop;
                            }
                            if (iframe.children[0].scrollLeft !== outerFrame.scrollLeft) {
                                iframe.children[0].scrollLeft = outerFrame.scrollLeft;
                            }
                        }
                        //this._outerRef.current!.scrollTop !== this._scrollTop && (this._outerRef.current!.scrollTop = this._scrollTop)
                    }}>
                    <div className={"webBox-innerContent"} style={{
                        height: NumCast(this.layoutDoc.scrollHeight),
                        pointerEvents: this.layoutDoc.isBackground ? "none" : undefined
                    }}>
                        <CollectionFreeFormView {...this.props}
                            PanelHeight={this.props.PanelHeight}
                            PanelWidth={this.props.PanelWidth}
                            annotationsKey={this.annotationKey}
                            NativeHeight={returnZero}
                            NativeWidth={returnZero}
                            VisibleHeight={this.visibleHeiht}
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
                            ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                        </CollectionFreeFormView>
                    </div>
                </div>
                {this.annotationLayer}
                <PdfViewerMarquee isMarqueeing={this.marqueeing} width={this.marqueeWidth} height={this.marqueeHeight} x={this.marqueeX} y={this.marqueeY} />
            </div >
        </div>);
    }
}