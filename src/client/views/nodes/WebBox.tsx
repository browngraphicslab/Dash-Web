import { library } from "@fortawesome/fontawesome-svg-core";
import { faStickyNote, faLock, faUnlock } from '@fortawesome/free-solid-svg-icons';
import { action, computed, observable, trace, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc, FieldResult } from "../../../new_fields/Doc";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { HtmlField } from "../../../new_fields/HtmlField";
import { InkTool } from "../../../new_fields/InkField";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast } from "../../../new_fields/Types";
import { WebField } from "../../../new_fields/URLField";
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
import { DocumentView } from "./DocumentView";
const htmlToText = require("html-to-text");

library.add(faStickyNote);

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends ViewBoxAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    @observable private collapsed: boolean = true;
    @observable private url: string = "hello";
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
        this._iframeRef.current!.contentDocument?.addEventListener('pointerdown', this.iframedown, false);
        this._iframeRef.current!.contentDocument?.addEventListener('scroll', this.iframeScrolled, false);
        this.layoutDoc.scrollHeight = this._iframeRef.current!.contentDocument?.children?.[0].scrollHeight || 1000;
        this._iframeRef.current!.contentDocument!.children[0].scrollTop = NumCast(this.layoutDoc.scrollTop);
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
        const scroll = (e.target as any)?.children?.[0].scrollTop;
        this.layoutDoc.scrollTop = this._outerRef.current!.scrollTop = scroll;
    }
    async componentDidMount() {

        this.setURL();

        this._iframeRef.current!.setAttribute("enable-annotation", "true");

        document.addEventListener("pointerup", this.onLongPressUp);
        document.addEventListener("pointermove", this.onLongPressMove);
        const field = Cast(this.rootDoc[this.props.fieldKey], WebField);
        if (field?.url.href.indexOf("youtube") !== -1) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = NumCast(this.layoutDoc._nativeWidth);
            const nativeHeight = NumCast(this.layoutDoc._nativeHeight);
            if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                if (!nativeWidth) this.layoutDoc._nativeWidth = 600;
                this.layoutDoc._nativeHeight = NumCast(this.layoutDoc._nativeWidth) / youtubeaspect;
                this.layoutDoc._height = NumCast(this.layoutDoc._width) / youtubeaspect;
            }
        } else if (field?.url) {
            const result = await WebRequest.get(Utils.CorsProxy(field.url.href));
            this.dataDoc.text = htmlToText.fromString(result.content);
        }
    }

    componentWillUnmount() {
        this._reactionDisposer?.();
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
        this._iframeRef.current!.contentDocument?.removeEventListener('pointerdown', this.iframedown);
        this._iframeRef.current!.contentDocument?.removeEventListener('scroll', this.iframeScrolled);
    }

    @action
    onURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.url = e.target.value;
    }

    @action
    submitURL = () => {
        this.dataDoc[this.props.fieldKey] = new WebField(new URL(this.url));
    }

    @action
    setURL() {
        const urlField: FieldResult<WebField> = Cast(this.dataDoc[this.props.fieldKey], WebField);
        if (urlField) this.url = urlField.url.toString();
        else this.url = "";
    }

    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
            this.submitURL();
        }
    }

    toggleNativeDimensions = () => {
        if (this.Document._nativeWidth || this.Document._nativeHeight) {
            DocumentView.unfreezeNativeDimensions(this.layoutDoc);
            this.layoutDoc.lockedTransform = false;
        }
        else {
            Doc.freezeNativeDimensions(this.layoutDoc, this.props.PanelWidth(), this.props.PanelHeight());
            this.layoutDoc.lockedTransform = true;
        }
    }

    urlEditor() {
        const frozen = this.layoutDoc._nativeWidth && this.layoutDoc._nativeHeight;
        return (
            <div className="webBox-urlEditor" style={{ top: this.collapsed ? -70 : 0 }}>
                <div className="urlEditor">
                    <div className="editorBase">
                        <button className="editor-collapse"
                            style={{
                                top: this.collapsed ? 70 : 10,
                                transform: `rotate(${this.collapsed ? 180 : 0}deg) scale(${this.collapsed ? 0.5 : 1}) translate(${this.collapsed ? "-100%, -100%" : "0, 0"})`,
                                opacity: (this.collapsed && !this.props.isSelected()) ? 0 : 0.9,
                                left: (this.collapsed ? 0 : "unset"),
                            }}
                            title="Collapse Url Editor" onClick={this.toggleCollapse}>
                            <FontAwesomeIcon icon="caret-up" size="2x" />
                        </button>
                        <div style={{ marginLeft: 54, width: "100%", display: this.collapsed ? "none" : "flex" }}>
                            <input className="webpage-urlInput"
                                placeholder="ENTER URL"
                                value={this.url}
                                onChange={this.onURLChange}
                                onKeyDown={this.onValueKeyDown}
                            />
                            <div style={{
                                display: "flex",
                                flexDirection: "row",
                                justifyContent: "space-between",
                                minWidth: "100px",
                            }}>
                                <button className="submitUrl" onClick={this.submitURL}>
                                    SUBMIT
                                </button>
                                <div className="webBox-freeze" title={frozen ? "Unfreeze" : "Freeze Dimensions"} onClick={this.toggleNativeDimensions} >
                                    <FontAwesomeIcon icon={frozen ? faUnlock : faLock} size={"lg"} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    @action
    toggleCollapse = () => {
        this.collapsed = !this.collapsed;
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


    @computed
    get content() {
        const field = this.dataDoc[this.props.fieldKey];
        let view;
        if (field instanceof HtmlField) {
            view = <span id="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />;
        } else if (field instanceof WebField) {
            view = <iframe ref={this._iframeRef} onLoad={this.iframeLoaded} src={Utils.CorsProxy(field.url.href)} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        } else {
            view = <iframe ref={this._iframeRef} src={"https://crossorigin.me/https://cs.brown.edu"} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        }
        const content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {this.urlEditor()}
                {view}
            </div>;

        const decInteracting = DocumentDecorations.Instance?.Interacting;

        const frozen = !this.props.isSelected() || decInteracting;

        return (
            <>
                <div className={"webBox-cont" + (this.props.isSelected() && InkingControl.Instance.selectedTool === InkTool.None && !decInteracting ? "-interactive" : "")}  >
                    {content}
                </div>
                {!frozen ? (null) :
                    <div className="webBox-overlay" style={{ pointerEvents: this.layoutDoc.isBackground ? undefined : "all" }}
                        onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer}>
                        <div className="touch-iframe-overlay" onPointerDown={this.onLongPressDown} >
                            <div className="indicator" ref={this._iframeIndicatorRef}></div>
                            <div className="dragger" ref={this._iframeDragRef}></div>
                        </div>
                    </div>}
            </>);
    }
    scrollXf = () => this.props.ScreenToLocalTransform().translate(0, NumCast(this.props.Document.scrollTop))
    render() {
        return (<div className={`webBox-container`}
            style={{
                transform: `scale(${this.props.ContentScaling()})`,
                width: `${100 / this.props.ContentScaling()}%`,
                height: `${100 / this.props.ContentScaling()}%`,
                pointerEvents: this.layoutDoc.isBackground ? "none" : undefined
            }} >
            {this.content}
            <div className={"webBox-outerContent"} ref={this._outerRef}
                style={{ pointerEvents: this.layoutDoc._nativeHeight && !this.layoutDoc.isBackground ? "all" : "none" }}
                onWheel={e => e.stopPropagation()}
                onScroll={e => {
                    if (this._iframeRef.current!.contentDocument!.children[0].scrollTop !== this._outerRef.current!.scrollTop) {
                        this._iframeRef.current!.contentDocument!.children[0].scrollTop = this._outerRef.current!.scrollTop;
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