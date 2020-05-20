import { library } from "@fortawesome/fontawesome-svg-core";
import { faStickyNote, faPen, faMousePointer } from '@fortawesome/free-solid-svg-icons';
import { action, computed, observable, trace, IReactionDisposer, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, FieldResult } from "../../../fields/Doc";
import { documentSchema } from "../../../fields/documentSchemas";
import { HtmlField } from "../../../fields/HtmlField";
import { InkTool } from "../../../fields/InkField";
import { makeInterface, listSpec } from "../../../fields/Schema";
import { Cast, NumCast, BoolCast, StrCast } from "../../../fields/Types";
import { WebField } from "../../../fields/URLField";
import { Utils, returnOne, emptyFunction, returnZero } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { DragManager } from "../../util/DragManager";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";
import { ViewBoxAnnotatableComponent } from "../DocComponent";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import "./WebBox.scss";
import React = require("react");
import * as WebRequest from 'web-request';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from "../ContextMenuItem";
import { undoBatch } from "../../util/UndoManager";
import { List } from "../../../fields/List";
const htmlToText = require("html-to-text");

library.add(faStickyNote);

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    get _collapsed() { return StrCast(this.layoutDoc._chromeStatus) !== "enabled"; }
    set _collapsed(value) { this.layoutDoc._chromeStatus = !value ? "enabled" : "disabled"; }
    @observable private _url: string = "hello";
    @observable private _pressX: number = 0;
    @observable private _pressY: number = 0;

    private _longPressSecondsHack?: NodeJS.Timeout;
    private _outerRef = React.createRef<HTMLDivElement>();
    private _iframeRef = React.createRef<HTMLIFrameElement>();
    private _iframeIndicatorRef = React.createRef<HTMLDivElement>();
    private _iframeDragRef = React.createRef<HTMLDivElement>();
    private _reactionDisposer?: IReactionDisposer;
    private _setPreviewCursor: undefined | ((x: number, y: number, drag: boolean) => void);

    iframeLoaded = action((e: any) => {
        const iframe = this._iframeRef.current;
        if (iframe && iframe.contentDocument) {
            iframe.setAttribute("enable-annotation", "true");
            iframe.contentDocument.addEventListener('pointerdown', this.iframedown, false);
            iframe.contentDocument.addEventListener('scroll', this.iframeScrolled, false);
            this.layoutDoc.scrollHeight = iframe.contentDocument.children?.[0].scrollHeight || 1000;
            iframe.contentDocument.children[0].scrollTop = NumCast(this.layoutDoc.scrollTop);
        }
        this._reactionDisposer?.();
        this._reactionDisposer = reaction(() => this.layoutDoc.scrollY,
            (scrollY) => {
                if (scrollY !== undefined) {
                    this._outerRef.current!.scrollTop = scrollY;
                    this.layoutDoc.scrollY = undefined;
                }
            },
            { fireImmediately: true }
        );
    });
    setPreviewCursor = (func?: (x: number, y: number, drag: boolean) => void) => this._setPreviewCursor = func;
    iframedown = (e: PointerEvent) => {
        this._setPreviewCursor?.(e.screenX, e.screenY, false);
    }
    iframeScrolled = (e: any) => {
        const scroll = e.target?.children?.[0].scrollTop;
        this.layoutDoc.scrollTop = this._outerRef.current!.scrollTop = scroll;
    }
    async componentDidMount() {
        const urlField = Cast(this.dataDoc[this.props.fieldKey], WebField);
        runInAction(() => this._url = urlField?.url.toString() || "");

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
            this.dataDoc.text = htmlToText.fromString(result.content);
        }
    }

    componentWillUnmount() {
        this._reactionDisposer?.();
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
        this._iframeRef.current?.contentDocument?.removeEventListener('pointerdown', this.iframedown);
        this._iframeRef.current?.contentDocument?.removeEventListener('scroll', this.iframeScrolled);
    }

    @action
    onURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this._url = e.target.value;
    }

    @action
    forward = () => {
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
        if (future.length) {
            history.push(this._url);
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = future.pop()!));
        }
    }

    @action
    back = () => {
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
        if (history.length) {
            if (future === undefined) this.dataDoc[this.fieldKey + "-future"] = new List<string>([this._url]);
            else future.push(this._url);
            this.dataDoc[this.fieldKey] = new WebField(new URL(this._url = history.pop()!));
        }
    }

    @action
    submitURL = () => {
        if (!this._url.startsWith("http")) this._url = "http://" + this._url;
        const future = Cast(this.dataDoc[this.fieldKey + "-future"], listSpec("string"), null);
        const history = Cast(this.dataDoc[this.fieldKey + "-history"], listSpec("string"), null);
        const url = Cast(this.dataDoc[this.fieldKey], WebField, null)?.url.toString();
        if (url) {
            if (history === undefined) {
                this.dataDoc[this.fieldKey + "-history"] = new List<string>([url]);
            } else {
                history.push(url);
            }
            future && (future.length = 0);
        }
        this.dataDoc[this.fieldKey] = new WebField(new URL(this._url));
    }


    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
            this.submitURL();
        }
    }

    toggleAnnotationMode = () => {
        if (!this.layoutDoc.isAnnotating) {
            this.layoutDoc.lockedTransform = false;
            this.layoutDoc.isAnnotating = true;
        }
        else {
            this.layoutDoc.lockedTransform = true;
            this.layoutDoc.isAnnotating = false;
        }
    }

    urlEditor() {
        return (
            <div className="webBox-urlEditor" style={{ top: this._collapsed ? -70 : 0 }}>
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
                        <div className="webBox-buttons" style={{ display: this._collapsed ? "none" : "flex" }}>
                            <div className="webBox-freeze" title={"Annotate"} style={{ background: this.layoutDoc.isAnnotating ? "lightBlue" : "gray" }} onClick={this.toggleAnnotationMode} >
                                <FontAwesomeIcon icon={faPen} size={"2x"} />
                            </div>
                            <div className="webBox-freeze" title={"Select"} style={{ background: !this.layoutDoc.isAnnotating ? "lightBlue" : "gray" }} onClick={this.toggleAnnotationMode} >
                                <FontAwesomeIcon icon={faMousePointer} size={"2x"} />
                            </div>
                            <input className="webpage-urlInput"
                                placeholder="ENTER URL"
                                value={this._url}
                                onChange={this.onURLChange}
                                onKeyDown={this.onValueKeyDown}
                            />
                            <div style={{
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-between",
                                maxWidth: "120px",
                            }}>
                                <button className="submitUrl" onClick={this.submitURL}>
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
        funcs.push({ description: (!this.layoutDoc._nativeWidth || !this.layoutDoc._nativeHeight ? "Freeze" : "Unfreeze") + " Aspect", event: this.toggleNativeDimensions, icon: "snowflake" });
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
            view = <iframe className="webBox-iframe" ref={this._iframeRef} src={url} onLoad={this.iframeLoaded} />;
        } else {
            view = <iframe className="webBox-iframe" ref={this._iframeRef} src={"https://crossorigin.me/https://cs.brown.edu"} />;
        }
        return view;
    }
    @computed
    get content() {
        const view = this.urlContent;
        const decInteracting = DocumentDecorations.Instance?.Interacting;

        const frozen = !this.props.isSelected() || decInteracting;

        return (<>
            <div className={"webBox-cont" + (this.props.isSelected() && InkingControl.Instance.selectedTool === InkTool.None && !decInteracting ? "-interactive" : "")}
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
    scrollXf = () => this.props.ScreenToLocalTransform().translate(0, NumCast(this.props.Document.scrollTop));
    render() {
        return (<div className={`webBox-container`}
            style={{
                transform: `scale(${this.props.ContentScaling()})`,
                width: Number.isFinite(this.props.ContentScaling()) ? `${100 / this.props.ContentScaling()}%` : "100%",
                height: Number.isFinite(this.props.ContentScaling()) ? `${100 / this.props.ContentScaling()}%` : "100%",
                pointerEvents: this.layoutDoc.isBackground ? "none" : undefined
            }}
            onContextMenu={this.specificContextMenu}>
            <base target="_blank" />
            {this.content}
            <div className={"webBox-outerContent"} ref={this._outerRef}
                style={{ pointerEvents: this.layoutDoc.isAnnotating && !this.layoutDoc.isBackground ? "all" : "none" }}
                onWheel={e => e.stopPropagation()}
                onScroll={e => {
                    const iframe = this._iframeRef?.current?.contentDocument;
                    const outerFrame = this._outerRef.current;
                    if (iframe && outerFrame) {
                        if (iframe.children[0].scrollTop !== outerFrame.scrollTop) {
                            iframe.children[0].scrollTop = outerFrame.scrollTop;
                        }
                    }
                    //this._outerRef.current!.scrollTop !== this._scrollTop && (this._outerRef.current!.scrollTop = this._scrollTop)
                }}>
                <div className={"webBox-innerContent"} style={{ height: NumCast(this.layoutDoc.scrollHeight) }}>
                    <CollectionFreeFormView {...this.props}
                        PanelHeight={this.props.PanelHeight}
                        PanelWidth={this.props.PanelWidth}
                        annotationsKey={this.annotationKey}
                        NativeHeight={returnZero}
                        NativeWidth={returnZero}
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
                        ContainingCollectionDoc={this.props.ContainingCollectionDoc}>
                    </CollectionFreeFormView>
                </div>
            </div>
        </div >);
    }
}