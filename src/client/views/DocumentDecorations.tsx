import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../new_fields/Doc";
import { PositionDocument } from '../../new_fields/documentSchemas';
import { ObjectField } from '../../new_fields/ObjectField';
import { ScriptField } from '../../new_fields/ScriptField';
import { Cast, StrCast } from "../../new_fields/Types";
import { CurrentUserUtils } from '../../server/authentication/models/current_user_utils';
import { Utils } from "../../Utils";
import { DocUtils } from "../documents/Documents";
import { DocumentType } from '../documents/DocumentTypes';
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { DocumentButtonBar } from './DocumentButtonBar';
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import { IconBox } from "./nodes/IconBox";
import React = require("react");
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faLink);
library.add(faTag);
library.add(faTimes);
library.add(faArrowAltCircleDown);
library.add(faArrowAltCircleUp);
library.add(faStopCircle);
library.add(faCheckCircle);
library.add(faCloudUploadAlt);
library.add(faSyncAlt);
library.add(faShare);

@observer
export class DocumentDecorations extends React.Component<{}, { value: string }> {
    static Instance: DocumentDecorations;
    private _isPointerDown = false;
    private _resizing = "";
    private _keyinput: React.RefObject<HTMLInputElement>;
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 20 + 3; // link button height + margin
    private _titleHeight = 20;
    private _downX = 0;
    private _downY = 0;
    private _resizeUndo?: UndoManager.Batch;
    private _radiusDown = [0, 0];
    @observable private _accumulatedTitle = "";
    @observable private _titleControlString: string = "#title";
    @observable private _edtingTitle = false;
    @observable private _hidden = false;
    @observable private _opacity = 1;
    @observable public Interacting = false;

    @observable public pushIcon: IconProp = "arrow-alt-circle-up";
    @observable public pullIcon: IconProp = "arrow-alt-circle-down";
    @observable public pullColor: string = "white";
    @observable public openHover = false;

    constructor(props: Readonly<{}>) {
        super(props);
        DocumentDecorations.Instance = this;
        this._keyinput = React.createRef();
        reaction(() => SelectionManager.SelectedDocuments().slice(), docs => this.titleBlur(false));
    }

    @action titleChanged = (event: any) => this._accumulatedTitle = event.target.value;

    titleBlur = undoBatch(action((commit: boolean) => {
        this._edtingTitle = false;
        if (commit) {
            if (this._accumulatedTitle.startsWith("#") || this._accumulatedTitle.startsWith("=")) {
                this._titleControlString = this._accumulatedTitle;
            } else if (this._titleControlString.startsWith("#")) {
                const selectionTitleFieldKey = this._titleControlString.substring(1);
                selectionTitleFieldKey === "title" && (SelectionManager.SelectedDocuments()[0].props.Document.customTitle = !this._accumulatedTitle.startsWith("-"));
                selectionTitleFieldKey && SelectionManager.SelectedDocuments().forEach(d =>
                    Doc.SetInPlace(d.props.Document, selectionTitleFieldKey, typeof d.props.Document[selectionTitleFieldKey] === "number" ? +this._accumulatedTitle : this._accumulatedTitle, true)
                );
            }
        }
    }));

    @action titleEntered = (e: any) => {
        const key = e.keyCode || e.which;
        // enter pressed
        if (key === 13) {
            const text = e.target.value;
            if (text.startsWith("::")) {
                const targetID = text.slice(2, text.length);
                const promoteDoc = SelectionManager.SelectedDocuments()[0];
                DocUtils.Publish(promoteDoc.props.Document, targetID, promoteDoc.props.addDocument, promoteDoc.props.removeDocument);
            } else if (text.startsWith(">")) {
                const fieldTemplateView = SelectionManager.SelectedDocuments()[0];
                SelectionManager.DeselectAll();
                const fieldTemplate = fieldTemplateView.props.Document;
                const containerView = fieldTemplateView.props.ContainingCollectionView;
                const docTemplate = fieldTemplateView.props.ContainingCollectionDoc;
                if (containerView && docTemplate) {
                    const metaKey = text.startsWith(">>") ? text.slice(2, text.length) : text.slice(1, text.length);
                    if (metaKey !== containerView.props.fieldKey && containerView.props.DataDoc) {
                        const fd = fieldTemplate.data;
                        fd instanceof ObjectField && (Doc.GetProto(containerView.props.DataDoc)[metaKey] = ObjectField.MakeCopy(fd));
                    }
                    fieldTemplate.title = metaKey;
                    Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(docTemplate));
                    if (text.startsWith(">>")) {
                        Doc.GetProto(docTemplate).layout = StrCast(fieldTemplateView.props.Document.layout).replace(/fieldKey={'[^']*'}/, `fieldKey={"${metaKey}"}`);
                    }
                }
            }
            e.target.blur();
        }
    }
    @action onTitleDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        document.addEventListener("pointermove", this.onTitleMove);
        document.addEventListener("pointerup", this.onTitleUp);
    }
    @action onTitleMove = (e: PointerEvent): void => {
        if (Math.abs(e.clientX - this._downX) > 4 || Math.abs(e.clientY - this._downY) > 4) {
            this.Interacting = true;
        }
        if (this.Interacting) this.onBackgroundMove(e);
        e.stopPropagation();
    }
    @action onTitleUp = (e: PointerEvent): void => {
        if (Math.abs(e.clientX - this._downX) < 4 || Math.abs(e.clientY - this._downY) < 4) {
            !this._edtingTitle && (this._accumulatedTitle = this._titleControlString.startsWith("#") ? this.selectionTitle : this._titleControlString);
            this._edtingTitle = true;
            setTimeout(() => this._keyinput.current!.focus(), 0);
        }
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        this.onBackgroundUp(e);
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        return SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.renderDepth === 0 ||
                Doc.AreProtosEqual(documentView.props.Document, CurrentUserUtils.UserDocument)) {
                return bounds;
            }
            const transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            if (documentView.props.Document.type === DocumentType.LINK) {
                const rect = documentView.ContentDiv!.getElementsByClassName("docuLinkBox-cont")[0].getBoundingClientRect();
                sptX = rect.left;
                sptY = rect.top;
                bptX = rect.right;
                bptY = rect.bottom;
            }
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }

    onBackgroundDown = (e: React.PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.addEventListener("pointermove", this.onBackgroundMove);
        document.addEventListener("pointerup", this.onBackgroundUp);
        e.stopPropagation();
    }

    @action
    onBackgroundMove = (e: PointerEvent): void => {
        const dragDocView = SelectionManager.SelectedDocuments()[0];
        const dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
        dragData.offset = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.x - left, e.y - top);
        dragData.moveDocument = SelectionManager.SelectedDocuments()[0].props.moveDocument;
        dragData.isSelectionMove = true;
        this.Interacting = true;
        this._hidden = true;
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.removeEventListener("pointermove", this.onTitleMove);
        document.removeEventListener("pointerup", this.onTitleUp);
        DragManager.StartDocumentDrag(SelectionManager.SelectedDocuments().map(documentView => documentView.ContentDiv!), dragData, e.x, e.y, {
            dragComplete: action(e => this._hidden = this.Interacting = false),
            hideSource: true
        });
        e.stopPropagation();
    }

    @action
    onBackgroundUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        e.stopPropagation();
        e.preventDefault();
    }

    onCloseDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            document.removeEventListener("pointermove", this.onCloseMove);
            document.addEventListener("pointermove", this.onCloseMove);
            document.removeEventListener("pointerup", this.onCloseUp);
            document.addEventListener("pointerup", this.onCloseUp);
        }
    }
    onCloseMove = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
        }
    }
    @undoBatch
    @action
    onCloseUp = async (e: PointerEvent) => {
        e.stopPropagation();
        if (e.button === 0) {
            const recent = Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc) as Doc;
            const selected = SelectionManager.SelectedDocuments().slice();
            SelectionManager.DeselectAll();
            selected.map(dv => {
                recent && Doc.AddDocToList(recent, "data", dv.props.Document, undefined, true, true);
                dv.props.removeDocument && dv.props.removeDocument(dv.props.Document);
            });
            document.removeEventListener("pointermove", this.onCloseMove);
            document.removeEventListener("pointerup", this.onCloseUp);
        }
    }
    @action
    onMinimizeDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.addEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
            document.addEventListener("pointerup", this.onMinimizeUp);
        }
    }

    @action
    onMinimizeMove = (e: PointerEvent): void => {
        e.stopPropagation();
        if (Math.abs(e.pageX - this._downX) > Utils.DRAG_THRESHOLD ||
            Math.abs(e.pageY - this._downY) > Utils.DRAG_THRESHOLD) {
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
        }
    }
    @undoBatch
    @action
    onMinimizeUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
            const selectedDocs = SelectionManager.SelectedDocuments().map(sd => sd);
            selectedDocs.map(dv => {
                const layoutKey = Cast(dv.props.Document.layoutKey, "string", null);
                const collapse = layoutKey !== "layout_icon";
                if (collapse) {
                    if (layoutKey) dv.props.Document.deiconifyLayout = layoutKey.replace("layout_", "");
                    dv.setCustomView(collapse, "icon");
                } else {
                    const deiconifyLayout = Cast(dv.props.Document.deiconifyLayout, "string", null);
                    dv.setCustomView(deiconifyLayout ? true : false, deiconifyLayout);
                    dv.props.Document.deiconifyLayout = undefined;
                }
            });
        }
    }

    @action
    onRadiusDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._radiusDown = [e.clientX, e.clientY];
            this._isPointerDown = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs set radius");
            document.removeEventListener("pointermove", this.onRadiusMove);
            document.removeEventListener("pointerup", this.onRadiusUp);
            document.addEventListener("pointermove", this.onRadiusMove);
            document.addEventListener("pointerup", this.onRadiusUp);
        }
    }

    onRadiusMove = (e: PointerEvent): void => {
        let dist = Math.sqrt((e.clientX - this._radiusDown[0]) * (e.clientX - this._radiusDown[0]) + (e.clientY - this._radiusDown[1]) * (e.clientY - this._radiusDown[1]));
        dist = dist < 3 ? 0 : dist;
        SelectionManager.SelectedDocuments().map(dv => dv.props.Document.layout instanceof Doc ? dv.props.Document.layout : dv.props.Document.isTemplateForField ? dv.props.Document : Doc.GetProto(dv.props.Document)).
            map(d => d.borderRounding = `${Math.min(100, dist)}%`);
        e.stopPropagation();
        e.preventDefault();
    }

    onRadiusUp = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        this._isPointerDown = false;
        this._resizeUndo && this._resizeUndo.end();
        document.removeEventListener("pointermove", this.onRadiusMove);
        document.removeEventListener("pointerup", this.onRadiusUp);
    }

    _lastX = 0;
    _lastY = 0;
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._lastX = e.clientX;
            this._lastY = e.clientY;
            this._isPointerDown = true;
            this._resizing = e.currentTarget.id;
            this.Interacting = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs resize");
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }


    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        const moveX = e.clientX - this._lastX; // e.movementX;
        const moveY = e.clientY - this._lastY; // e.movementY;
        this._lastX = e.clientX;
        this._lastY = e.clientY;

        switch (this._resizing) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1;
                dY = -1;
                dW = -moveX;
                dH = -moveY;
                break;
            case "documentDecorations-topRightResizer":
                dW = moveX;
                dY = -1;
                dH = -moveY;
                break;
            case "documentDecorations-topResizer":
                dY = -1;
                dH = -moveY;
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1;
                dW = -moveX;
                dH = moveY;
                break;
            case "documentDecorations-bottomRightResizer":
                dW = moveX;
                dH = moveY;
                break;
            case "documentDecorations-bottomResizer":
                dH = moveY;
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -moveX;
                break;
            case "documentDecorations-rightResizer":
                dW = moveX;
                break;
        }

        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = PositionDocument(element.props.Document);
                const layoutDoc = PositionDocument(Doc.Layout(element.props.Document));
                let nwidth = layoutDoc._nativeWidth || 0;
                let nheight = layoutDoc._nativeHeight || 0;
                const width = (layoutDoc._width || 0);
                const height = (layoutDoc._height || (nheight / nwidth * width));
                const scale = element.props.ScreenToLocalTransform().Scale * element.props.ContentScaling();
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = e.ctrlKey || (!layoutDoc.ignoreAspect && nwidth && nheight);
                if (fixedAspect && e.ctrlKey && layoutDoc.ignoreAspect) {
                    layoutDoc.ignoreAspect = false;
                    layoutDoc._nativeWidth = nwidth = layoutDoc._width || 0;
                    layoutDoc._nativeHeight = nheight = layoutDoc._height || 0;
                }
                if (fixedAspect && (!nwidth || !nheight)) {
                    layoutDoc._nativeWidth = nwidth = layoutDoc._width || 0;
                    layoutDoc._nativeHeight = nheight = layoutDoc._height || 0;
                }
                if (nwidth > 0 && nheight > 0 && !layoutDoc.ignoreAspect) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        if (!fixedAspect) {
                            layoutDoc._nativeWidth = actualdW / (layoutDoc._width || 1) * (layoutDoc._nativeWidth || 0);
                        }
                        layoutDoc._width = actualdW;
                        if (fixedAspect && !layoutDoc._fitWidth) layoutDoc._height = nheight / nwidth * layoutDoc._width;
                        else layoutDoc._height = actualdH;
                    }
                    else {
                        if (!fixedAspect) {
                            layoutDoc._nativeHeight = actualdH / (layoutDoc._height || 1) * (doc._nativeHeight || 0);
                        }
                        layoutDoc._height = actualdH;
                        if (fixedAspect && !layoutDoc._fitWidth) layoutDoc._width = nwidth / nheight * layoutDoc._height;
                        else layoutDoc._width = actualdW;
                    }
                } else {
                    dW && (layoutDoc._width = actualdW);
                    dH && (layoutDoc._height = actualdH);
                    dH && layoutDoc._autoHeight && (layoutDoc._autoHeight = false);
                }
            }
        }));
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        this._resizing = "";
        this.Interacting = false;
        if (e.button === 0) {
            e.preventDefault();
            this._isPointerDown = false;
            this._resizeUndo && this._resizeUndo.end();
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    @computed
    get selectionTitle(): string {
        if (SelectionManager.SelectedDocuments().length === 1) {
            const selected = SelectionManager.SelectedDocuments()[0];
            if (this._titleControlString.startsWith("=")) {
                return ScriptField.MakeFunction(this._titleControlString.substring(1), { doc: Doc.name })!.script.run({ this: selected.props.Document }, console.log).result?.toString() || "";
            }
            if (this._titleControlString.startsWith("#")) {
                return selected.props.Document[this._titleControlString.substring(1)]?.toString() || "-unset-";
            }
            return this._accumulatedTitle;
        } else if (SelectionManager.SelectedDocuments().length > 1) {
            return "-multiple-";
        }
        return "-unset-";
    }

    TextBar: HTMLDivElement | undefined;
    private setTextBar = (ele: HTMLDivElement) => {
        if (ele) {
            this.TextBar = ele;
        }
    }
    render() {
        const bounds = this.Bounds;
        const seldoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
        if (SelectionManager.GetIsDragging() || bounds.x === Number.MAX_VALUE || !seldoc || this._hidden || isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            return (null);
        }
        const minimizeIcon = (
            <div className="documentDecorations-minimizeButton" onPointerDown={this.onMinimizeDown}>
                {/* Currently, this is set to be enabled if there is no ink selected. It might be interesting to think about minimizing ink if it's useful? -syip2*/}
                {SelectionManager.SelectedDocuments().length === 1 ? IconBox.DocumentIcon(StrCast(SelectionManager.SelectedDocuments()[0].props.Document.layout, "...")) : "..."}
            </div>);

        bounds.x = Math.max(0, bounds.x - this._resizeBorderWidth / 2) + this._resizeBorderWidth / 2;
        bounds.y = Math.max(0, bounds.y - this._resizeBorderWidth / 2 - this._titleHeight) + this._resizeBorderWidth / 2 + this._titleHeight;
        const borderRadiusDraggerWidth = 15;
        bounds.r = Math.min(window.innerWidth, bounds.r + borderRadiusDraggerWidth + this._resizeBorderWidth / 2) - this._resizeBorderWidth / 2 - borderRadiusDraggerWidth;
        bounds.b = Math.min(window.innerHeight, bounds.b + this._resizeBorderWidth / 2 + this._linkBoxHeight) - this._resizeBorderWidth / 2 - this._linkBoxHeight;
        if (bounds.x > bounds.r) {
            bounds.x = bounds.r - this._resizeBorderWidth;
        }
        if (bounds.y > bounds.b) {
            bounds.y = bounds.b - (this._resizeBorderWidth + this._linkBoxHeight + this._titleHeight);
        }
        return (<div className="documentDecorations">
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: this.Interacting ? "none" : "all",
                zIndex: SelectionManager.SelectedDocuments().length > 1 ? 900 : 0,
            }} onPointerDown={this.onBackgroundDown} onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }} >
            </div>
            <div className="documentDecorations-container" ref={this.setTextBar} style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth + this._linkBoxHeight + this._titleHeight + 3) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
                opacity: this._opacity
            }}>
                {minimizeIcon}

                {this._edtingTitle ?
                    <input ref={this._keyinput} className="title" type="text" name="dynbox" value={this._accumulatedTitle} onBlur={e => this.titleBlur(true)} onChange={this.titleChanged} onKeyPress={this.titleEntered} /> :
                    <div className="title" onPointerDown={this.onTitleDown} ><span>{`${this.selectionTitle}`}</span></div>}
                <div className="documentDecorations-closeButton" title="Close Document" onPointerDown={this.onCloseDown}>
                    <FontAwesomeIcon className="documentdecorations-times" icon={faTimes} size="lg" />
                </div>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-borderRadius" className="documentDecorations-radius" onPointerDown={this.onRadiusDown} onContextMenu={(e) => e.preventDefault()}><span className="borderRadiusTooltip" title="Drag Corner Radius"></span></div>
                <div className="link-button-container">
                    <DocumentButtonBar views={SelectionManager.SelectedDocuments()} />
                </div>
            </div >
        </div>
        );
    }
}