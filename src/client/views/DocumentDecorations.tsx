import { action, computed, observable } from "mobx";
import { observer } from "mobx-react";
import { emptyFunction } from "../../Utils";
import { DragLinksAsDocuments, DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch } from "../util/UndoManager";
import './DocumentDecorations.scss';
import { MainOverlayTextBox } from "./MainOverlayTextBox";
import { DocumentView, PositionDocument } from "./nodes/DocumentView";
import { LinkMenu } from "./nodes/LinkMenu";
import React = require("react");
import { CompileScript } from "../util/Scripting";
import { IconBox } from "./nodes/IconBox";
import { Cast, FieldValue } from "../../new_fields/Types";
import { Doc } from "../../new_fields/Doc";
import { listSpec } from "../../new_fields/Schema";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

@observer
export class DocumentDecorations extends React.Component<{}, { value: string }> {
    static Instance: DocumentDecorations;
    private _resizer = "";
    private _isPointerDown = false;
    private keyinput: React.RefObject<HTMLInputElement>;
    private _documents: DocumentView[] = SelectionManager.SelectedDocuments();
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 30;
    private _titleHeight = 20;
    private _linkButton = React.createRef<HTMLDivElement>();
    private _linkerButton = React.createRef<HTMLDivElement>();
    //@observable private _title: string = this._documents[0].props.Document.Title;
    @observable private _title: string = this._documents.length > 0 ? Cast(this._documents[0].props.Document.title, "string", "") : "";
    @observable private _fieldKey: string = "title";
    @observable private _hidden = false;
    @observable private _opacity = 1;
    @observable private _dragging = false;
    @observable private _iconifying = false;


    constructor(props: Readonly<{}>) {
        super(props);
        DocumentDecorations.Instance = this;
        this.handleChange = this.handleChange.bind(this);
        this.keyinput = React.createRef();
    }

    @action
    handleChange = (event: any) => {
        this._title = event.target.value;
    }

    @action
    enterPressed = (e: any) => {
        var key = e.keyCode || e.which;
        // enter pressed
        if (key === 13) {
            var text = e.target.value;
            if (text[0] === '#') {
                let command = text.slice(1, text.length);
                this._fieldKey = command;
                // if (command === "Title" || command === "title") {
                //     this._fieldKey = KeyStore.Title;
                // }
                // else if (command === "Width" || command === "width") {
                //     this._fieldKey = KeyStore.Width;
                // }
                this._title = "changed";
                // TODO: Change field with switch statement
            }
            else {
                if (this._documents.length > 0) {
                    let field = this._documents[0].props.Document[this._fieldKey];
                    if (typeof field === "string") {
                        this._documents.forEach(d =>
                            d.props.Document[this._fieldKey] = this._title);
                    }
                    else if (typeof field === "number") {
                        this._documents.forEach(d =>
                            d.props.Document[this._fieldKey] = +this._title);
                    }
                    this._title = "changed";
                }
            }
            e.target.blur();
        }
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        this._documents = SelectionManager.SelectedDocuments();
        return SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.isTopMost) {
                return bounds;
            }
            let transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }


    @computed
    public get Hidden() { return this._hidden; }
    public set Hidden(value: boolean) { this._hidden = value; }

    _lastDrag: number[] = [0, 0];
    onBackgroundDown = (e: React.PointerEvent): void => {
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.addEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        document.addEventListener("pointerup", this.onBackgroundUp);
        this._lastDrag = [e.clientX, e.clientY];
        e.stopPropagation();
        if (e.currentTarget.localName !== "input") {
            e.preventDefault();
        }
    }

    @action
    onBackgroundMove = (e: PointerEvent): void => {
        let dragDocView = SelectionManager.SelectedDocuments()[0];
        const [left, top] = dragDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
        let dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        dragData.aliasOnDrop = false;
        dragData.xOffset = e.x - left;
        dragData.yOffset = e.y - top;
        let move = SelectionManager.SelectedDocuments()[0].props.moveDocument;
        dragData.moveDocument = move;
        this._dragging = true;
        document.removeEventListener("pointermove", this.onBackgroundMove);
        document.removeEventListener("pointerup", this.onBackgroundUp);
        DragManager.StartDocumentDrag(SelectionManager.SelectedDocuments().map(docView => docView.ContentDiv!), dragData, e.x, e.y, {
            handlers: {
                dragComplete: action(() => this._dragging = false),
            },
            hideSource: true
        });
        e.stopPropagation();
    }

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
    onCloseUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            SelectionManager.SelectedDocuments().map(dv => dv.props.removeDocument && dv.props.removeDocument(dv.props.Document));
            SelectionManager.DeselectAll();
            document.removeEventListener("pointermove", this.onCloseMove);
            document.removeEventListener("pointerup", this.onCloseUp);
        }
    }
    _downX = 0;
    _downY = 0;
    onMinimizeDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._downX = e.pageX;
            this._downY = e.pageY;
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.addEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
            document.addEventListener("pointerup", this.onMinimizeUp);
        }
    }

    @observable _minimizedX = 0;
    @observable _minimizedY = 0;
    @action
    onMinimizeMove = (e: PointerEvent): void => {
        e.stopPropagation();
        let dx = e.pageX - this._downX;
        let dy = e.pageY - this._downY;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
            this._iconifying = true;
            let xf = SelectionManager.SelectedDocuments()[0].props.ScreenToLocalTransform().scale(SelectionManager.SelectedDocuments()[0].props.ContentScaling()).inverse().transformPoint(0, 0);
            let dx = e.pageX - xf[0];
            let dy = e.pageY - xf[1];
            this._minimizedX = e.clientX;
            this._minimizedY = e.clientY;
            if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
                this._minimizedX = xf[0];
                this._minimizedY = xf[1];
            }
            SelectionManager.SelectedDocuments().map(dv => {
                let minDoc = FieldValue(Cast(dv.props.Document.minimizedDoc, Doc));
                if (minDoc) {
                    let where = (dv.props.ScreenToLocalTransform()).scale(dv.props.ContentScaling()).transformPoint(this._minimizedX, this._minimizedY);
                    minDoc.x = where[0] + Cast(dv.props.Document.x, "number", 0);
                    minDoc.y = where[1] + Cast(dv.props.Document.y, "number", 0);
                }
            });
        }
    }
    @action
    onMinimizeUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            let dx = e.clientX - this._downX;
            let dy = e.clientY - this._downY;
            if (Math.abs(dx) < 4 && Math.abs(dy) < 4 && !this._iconifying) {
                SelectionManager.SelectedDocuments().map(dv => dv.minimize());
                SelectionManager.DeselectAll();
            } else {
                this._minimizedX = this._minimizedY = 0;
            }
            document.removeEventListener("pointermove", this.onMinimizeMove);
            document.removeEventListener("pointerup", this.onMinimizeUp);
        }
        this._iconifying = false;
    }

    onPointerDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            this._isPointerDown = true;
            this._resizer = e.currentTarget.id;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }

    onLinkerButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.addEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        document.addEventListener("pointerup", this.onLinkerButtonUp);
    }
    onLinkerButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkerButtonMoved);
        document.removeEventListener("pointerup", this.onLinkerButtonUp);
        e.stopPropagation();
    }

    onLinkerButtonMoved = (e: PointerEvent): void => {
        if (this._linkerButton.current !== null) {
            document.removeEventListener("pointermove", this.onLinkerButtonMoved);
            document.removeEventListener("pointerup", this.onLinkerButtonUp);
            let dragData = new DragManager.LinkDragData(SelectionManager.SelectedDocuments()[0].props.Document);
            DragManager.StartLinkDrag(this._linkerButton.current, dragData, e.pageX, e.pageY, {
                handlers: {
                    dragComplete: action(emptyFunction),
                },
                hideSource: false
            });
        }
        e.stopPropagation();
    }

    onLinkButtonDown = (e: React.PointerEvent): void => {
        e.stopPropagation();
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.addEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        document.addEventListener("pointerup", this.onLinkButtonUp);
    }

    onLinkButtonUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onLinkButtonMoved);
        document.removeEventListener("pointerup", this.onLinkButtonUp);
        e.stopPropagation();
    }

    onLinkButtonMoved = async (e: PointerEvent) => {
        if (this._linkButton.current !== null && (e.movementX > 1 || e.movementY > 1)) {
            document.removeEventListener("pointermove", this.onLinkButtonMoved);
            document.removeEventListener("pointerup", this.onLinkButtonUp);

            DragLinksAsDocuments(this._linkButton.current, e.x, e.y, SelectionManager.SelectedDocuments()[0].props.Document);
        }
        e.stopPropagation();
    }

    onPointerMove = (e: PointerEvent): void => {
        e.stopPropagation();
        e.preventDefault();
        if (!this._isPointerDown) {
            return;
        }

        let dX = 0, dY = 0, dW = 0, dH = 0;

        switch (this._resizer) {
            case "":
                break;
            case "documentDecorations-topLeftResizer":
                dX = -1;
                dY = -1;
                dW = -(e.movementX);
                dH = -(e.movementY);
                break;
            case "documentDecorations-topRightResizer":
                dW = e.movementX;
                dY = -1;
                dH = -(e.movementY);
                break;
            case "documentDecorations-topResizer":
                dY = -1;
                dH = -(e.movementY);
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1;
                dW = -(e.movementX);
                dH = e.movementY;
                break;
            case "documentDecorations-bottomRightResizer":
                dW = e.movementX;
                dH = e.movementY;
                break;
            case "documentDecorations-bottomResizer":
                dH = e.movementY;
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -(e.movementX);
                break;
            case "documentDecorations-rightResizer":
                dW = e.movementX;
                break;
        }

        MainOverlayTextBox.Instance.SetTextDoc();
        SelectionManager.SelectedDocuments().forEach(element => {
            const rect = element.ContentDiv ? element.ContentDiv.getBoundingClientRect() : new DOMRect();

            if (rect.width !== 0) {
                let doc = PositionDocument(element.props.Document);
                let width = FieldValue(doc.width, 0);
                let nwidth = FieldValue(doc.nativeWidth, 0);
                let nheight = FieldValue(doc.nativeHeight, 0);
                let height = FieldValue(doc.height, nwidth ? nheight / nwidth * width : 0);
                let x = FieldValue(doc.x, 0);
                let y = FieldValue(doc.y, 0);
                let scale = width / rect.width;
                let actualdW = Math.max(width + (dW * scale), 20);
                let actualdH = Math.max(height + (dH * scale), 20);
                x += dX * (actualdW - width);
                y += dY * (actualdH - height);
                doc.x = x;
                doc.y = y;
                var nativeWidth = FieldValue(doc.nativeWidth, 0);
                var nativeHeight = FieldValue(doc.nativeHeight, 0);
                if (nativeWidth > 0 && nativeHeight > 0) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        actualdH = nativeHeight / nativeWidth * actualdW;
                    }
                    else actualdW = nativeWidth / nativeHeight * actualdH;
                }
                doc.width = actualdW;
                doc.height = actualdH;
            }
        });
    }

    onPointerUp = (e: PointerEvent): void => {
        e.stopPropagation();
        if (e.button === 0) {
            e.preventDefault();
            this._isPointerDown = false;
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
        }
    }

    getValue = (): string => {
        if (this._title === "changed" && this._documents.length > 0) {
            let field = this._documents[0].props.Document[this._fieldKey];
            if (typeof field === "string") {
                return field;
            }
            else if (typeof field === "number") {
                return field.toString();
            }
        }
        return this._title;
    }

    changeFlyoutContent = (): void => {

    }
    // buttonOnPointerUp = (e: React.PointerEvent): void => {
    //     e.stopPropagation();
    // }
    render() {
        var bounds = this.Bounds;
        let seldoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
        if (bounds.x === Number.MAX_VALUE || !seldoc) {
            return (null);
        }
        let selpos = this._minimizedX !== 0 || this._minimizedY !== 0 ?
            [this._minimizedX - 12 + (!this._iconifying ? 8 : 0), this._minimizedY - 12 + (!this._iconifying ? 28 : 0)] :
            [0, this._iconifying ? -18 : 0];
        let minimizeIcon = (
            <div className="documentDecorations-minimizeButton" onPointerDown={this.onMinimizeDown}
                style={{ transform: `translate(${selpos[0]}px,${selpos[1]}px)`, }}>
                {SelectionManager.SelectedDocuments().length === 1 ? IconBox.DocumentIcon(Cast(SelectionManager.SelectedDocuments()[0].props.Document.layout, "string", "...")) : "..."}
            </div>);
        if (this._iconifying) {
            return (<div className="documentDecorations-container" > {minimizeIcon} </div>);
        }

        if (this.Hidden) {
            return (null);
        }
        if (isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            console.log("DocumentDecorations: Bounds Error");
            return (null);
        }

        let linkButton = null;
        if (SelectionManager.SelectedDocuments().length > 0) {
            let selFirst = SelectionManager.SelectedDocuments()[0];
            let linkToSize = Cast(selFirst.props.Document.linkedToDocs, listSpec(Doc), []).length;
            let linkFromSize = Cast(selFirst.props.Document.linkedFromDocs, listSpec(Doc), []).length;
            let linkCount = linkToSize + linkFromSize;
            linkButton = (<Flyout
                anchorPoint={anchorPoints.RIGHT_TOP}
                content={<LinkMenu docView={selFirst}
                    changeFlyout={this.changeFlyoutContent} />}>
                {/* <div className={"linkButton-" + (selFirst.props.Document.GetData(KeyStore.LinkedToDocs, ListField, []).length ? "nonempty" : "empty")} onPointerDown={this.onLinkButtonDown} >{linkCount}</div> */}
                <div className={"linkButton-empty"} onPointerDown={this.onLinkButtonDown} >{linkCount}</div>
            </Flyout>);
        }
        return (<div className="documentDecorations">
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: this._dragging ? "none" : "all",
                zIndex: SelectionManager.SelectedDocuments().length > 1 ? 1000 : 0,
            }} onPointerDown={this.onBackgroundDown} onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); }} >
            </div>
            <div className="documentDecorations-container" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth + this._linkBoxHeight + this._titleHeight) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
                opacity: this._opacity
            }}>
                {minimizeIcon}

                <input ref={this.keyinput} className="title" type="text" name="dynbox" value={this.getValue()} onChange={this.handleChange} onPointerDown={this.onBackgroundDown} onKeyPress={this.enterPressed} />
                <div className="documentDecorations-closeButton" onPointerDown={this.onCloseDown}>X</div>
                <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-leftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-centerCont"></div>
                <div id="documentDecorations-rightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>

                <div title="View Links" className="linkFlyout" ref={this._linkButton}> {linkButton}  </div>
                <div className="linkButton-linker" ref={this._linkerButton} onPointerDown={this.onLinkerButtonDown}>∞</div>
            </div >
        </div>
        );
    }
}