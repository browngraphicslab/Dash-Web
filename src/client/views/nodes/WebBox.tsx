import { library } from "@fortawesome/fontawesome-svg-core";
import { faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { Doc, FieldResult } from "../../../new_fields/Doc";
import { HtmlField } from "../../../new_fields/HtmlField";
import { InkTool } from "../../../new_fields/InkField";
import { makeInterface } from "../../../new_fields/Schema";
import { Cast, NumCast } from "../../../new_fields/Types";
import { WebField } from "../../../new_fields/URLField";
import { emptyFunction, returnOne, Utils } from "../../../Utils";
import { Docs } from "../../documents/Documents";
import { SelectionManager } from "../../util/SelectionManager";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { DocumentDecorations } from "../DocumentDecorations";
import { InkingControl } from "../InkingControl";
import { FieldView, FieldViewProps } from './FieldView';
import { KeyValueBox } from "./KeyValueBox";
import "./WebBox.scss";
import React = require("react");
import { DocAnnotatableComponent } from "../DocComponent";
import { documentSchema } from "../../../new_fields/documentSchemas";
import { Id } from "../../../new_fields/FieldSymbols";
import { DragManager } from "../../util/DragManager";
import { ImageUtils } from "../../util/Import & Export/ImageUtils";

library.add(faStickyNote);

type WebDocument = makeInterface<[typeof documentSchema]>;
const WebDocument = makeInterface(documentSchema);

@observer
export class WebBox extends DocAnnotatableComponent<FieldViewProps, WebDocument>(WebDocument) {

    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(WebBox, fieldKey); }
    @observable private collapsed: boolean = true;
    @observable private url: string = "";

    private _longPressSecondsHack?: NodeJS.Timeout;
    private _iframeRef = React.createRef<HTMLIFrameElement>();
    private _iframeDragRef = React.createRef<HTMLDivElement>();
    @observable private _pressX: number = 0;
    @observable private _pressY: number = 0;

    componentWillMount() {

        const field = Cast(this.props.Document[this.props.fieldKey], WebField);
        if (field && field.url.href.indexOf("youtube") !== -1) {
            const youtubeaspect = 400 / 315;
            const nativeWidth = NumCast(this.layoutDoc.nativeWidth);
            const nativeHeight = NumCast(this.layoutDoc.nativeHeight);
            if (!nativeWidth || !nativeHeight || Math.abs(nativeWidth / nativeHeight - youtubeaspect) > 0.05) {
                if (!nativeWidth) this.layoutDoc.nativeWidth = 600;
                this.layoutDoc.nativeHeight = NumCast(this.layoutDoc.nativeWidth) / youtubeaspect;
                this.layoutDoc.height = NumCast(this.layoutDoc.width) / youtubeaspect;
            }
        }

        this.setURL();
    }

    componentDidMount() {
        document.addEventListener("pointerup", this.onLongPressUp);
        document.addEventListener("pointermove", this.onLongPressMove);
        // this._iframeRef.current?.contentWindow?.document.addEventListener("mousedown", (event: MouseEvent) => {
        //     console.log("clicked inside the iframe?");
        // });
        // const iframe = document.getElementById(this.props.Document.proto![Id]);
        // if (iframe) {
        //     iframe.addEventListener('pointerdown', function (event) {
        //         const B = iframe.getBoundingClientRect();
        //         const e = new CustomEvent('pointerdown', { bubbles: true, cancelable: false });
        //         // e.clientX = e.clientX + B?.left;
        //         // e.clientY = e.clientY + B?.top;
        //         console.log("custom event pointer down");
        //         iframe.dispatchEvent(e);
        //     })
        // }
        // if (this._iframeRef.current) {
        //     console.log("resetting iframes events");
        //     const self = this;
        //     this._iframeRef.current.addEventListener('pointermove', function (event) {
        //         const B = self._iframeRef.current?.getBoundingClientRect();
        //         const e = new CustomEvent('pointermove', { bubbles: true, cancelable: false });
        //         // e.clientX = e.clientX + B?.left;
        //         // e.clientY = e.clientY + B?.top;
        //         self._iframeRef.current?.dispatchEvent(e);
        //     });
        //     this._iframeRef.current.addEventListener('pointerdown', function (event) {
        //         const B = self._iframeRef.current?.getBoundingClientRect();
        //         const e = new CustomEvent('pointerdown', { bubbles: true, cancelable: false });
        //         // e.clientX = e.clientX + B?.left;
        //         // e.clientY = e.clientY + B?.top;
        //         console.log("custom event pointer down");
        //         self._iframeRef.current?.dispatchEvent(e);
        //     })
        // }
    }

    componentWillUnmount() {
        document.removeEventListener("pointerup", this.onLongPressUp);
        document.removeEventListener("pointermove", this.onLongPressMove);
    }

    @action
    onURLChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        this.url = e.target.value;
    }

    @action
    submitURL = () => {
        const script = KeyValueBox.CompileKVPScript(`new WebField("${this.url}")`);
        if (!script) return;
        KeyValueBox.ApplyKVPScript(this.props.Document, "data", script);
    }

    @action
    setURL() {
        const urlField: FieldResult<WebField> = Cast(this.props.Document.data, WebField);
        if (urlField) this.url = urlField.url.toString();
        else this.url = "";
    }

    onValueKeyDown = async (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            e.stopPropagation();
            this.submitURL();
        }
    }


    switchToText = () => {
        let url: string = "";
        const field = Cast(this.props.Document[this.props.fieldKey], WebField);
        if (field) url = field.url.href;

        const newBox = Docs.Create.TextDocument({
            x: NumCast(this.props.Document.x),
            y: NumCast(this.props.Document.y),
            title: url,
            width: 200,
            height: 70,
            documentText: "@@@" + url
        });

        SelectionManager.SelectedDocuments().map(dv => {
            dv.props.addDocument && dv.props.addDocument(newBox);
            dv.props.removeDocument && dv.props.removeDocument(dv.props.Document);
        });

        Doc.BrushDoc(newBox);
    }

    urlEditor() {
        return (
            <div className="webView-urlEditor" style={{ top: this.collapsed ? -70 : 0 }}>
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
                                <div className="switchToText" title="Convert web to text doc" onClick={this.switchToText} style={{ display: "flex", alignItems: "center", justifyContent: "center" }} >
                                    <FontAwesomeIcon icon={faStickyNote} size={"lg"} />
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

    // TODO: make this actually a long press
    onLongPressDown = (e: React.PointerEvent) => {

        console.log("press down", e.clientX, e.clientX);
        this._pressX = e.clientX;
        this._pressY = e.clientY;
        this._longPressSecondsHack = setTimeout(() => {
            console.log("start the drag!!");
            const B = this._iframeRef.current?.getBoundingClientRect();
            const iframeDoc = this._iframeRef.current?.contentDocument;
            if (B && iframeDoc) {
                console.log("frame doc", iframeDoc);
                console.log("get point", this._pressX, B.left, this._pressY, B.top);
                const element = iframeDoc.elementFromPoint(this._pressX - B.left, this._pressY - B.top);
                console.log("found element", element);
                if (element) {
                    e.stopPropagation();
                    e.preventDefault();
                    const clone = element.cloneNode(true) as HTMLElement;

                    if (clone.nodeName === "IMG") {
                        const src = clone.getAttribute("src"); // TODO: may not always work

                        if (src) {
                            const doc = Docs.Create.ImageDocument(src, { width: 300 });
                            ImageUtils.ExtractExif(doc);

                            console.log("start image drag", this._pressX, this._pressY, doc);
                            // document.dispatchEvent()
                            const dragData = new DragManager.DocumentDragData([doc]);
                            DragManager.StartDocumentDrag([clone], dragData, this._pressX, this._pressY);
                        }
                    }
                }
            }
        }, 1500);
        // e.stopPropagation();
        // e.preventDefault();
    }

    onLongPressMove = (e: PointerEvent) => {
        this._pressX = e.clientX;
        this._pressY = e.clientY;
    }

    onLongPressUp = (e: PointerEvent) => {
        console.log("press up");
        if (this._longPressSecondsHack) {
            clearTimeout(this._longPressSecondsHack);
            console.log("long press cancelled");
        }
        // e.stopPropagation();
        // e.preventDefault();
    }


    @computed
    get content() {
        const field = this.dataDoc[this.props.fieldKey];
        let view;
        if (field instanceof HtmlField) {
            view = <span id="webBox-htmlSpan" dangerouslySetInnerHTML={{ __html: field.html }} />;
        } else if (field instanceof WebField) {
            view = <iframe ref={this._iframeRef} src={Utils.CorsProxy(field.url.href)} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        } else {
            view = <iframe ref={this._iframeRef} src={"https://crossorigin.me/https://cs.brown.edu"} style={{ position: "absolute", width: "100%", height: "100%", top: 0 }} />;
        }
        const content =
            <div style={{ width: "100%", height: "100%", position: "absolute" }} onWheel={this.onPostWheel} onPointerDown={this.onPostPointer} onPointerMove={this.onPostPointer} onPointerUp={this.onPostPointer}>
                {this.urlEditor()}
                {view}
            </div>;

        const decInteracting = DocumentDecorations.Instance && DocumentDecorations.Instance.Interacting;

        const frozen = !this.props.isSelected() || decInteracting;

        const classname = "webBox-cont" + (this.props.isSelected() && InkingControl.Instance.selectedTool === InkTool.None && !decInteracting ? "-interactive" : "");
        return (
            <>
                <div className={classname}  >
                    {content}
                </div>
                <div className="mobileIframeDragger" ref={this._iframeDragRef} draggable></div>
                {!frozen ? (null) : <div className="webBox-overlay" onWheel={this.onPreWheel} onPointerDown={this.onPrePointer} onPointerMove={this.onPrePointer} onPointerUp={this.onPrePointer} />}
                {/* onPointerDown={(e) => { this.onPrePointer(e); this.onLongPressDown(e) }} onPointerMove={this.onPrePointer} onPointerUp={(e) => { this.onPrePointer(e); }} />} */}
            </>);
    }
    render() {
        return (<div className={"webBox-container"} >
            <CollectionFreeFormView {...this.props}
                PanelHeight={this.props.PanelHeight}
                PanelWidth={this.props.PanelWidth}
                annotationsKey={this.annotationsKey}
                focus={this.props.focus}
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
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                ruleProvider={undefined}
                renderDepth={this.props.renderDepth + 1}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                chromeCollapsed={true}>
                {() => [this.content]}
            </CollectionFreeFormView>
        </div >);
    }
}