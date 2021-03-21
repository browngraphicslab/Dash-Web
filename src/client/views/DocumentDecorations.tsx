import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { AclAdmin, AclEdit, DataSym, Doc, Field, HeightSym, WidthSym } from "../../fields/Doc";
import { Document } from '../../fields/documentSchemas';
import { HtmlField } from '../../fields/HtmlField';
import { InkField } from "../../fields/InkField";
import { ScriptField } from '../../fields/ScriptField';
import { Cast, NumCast } from "../../fields/Types";
import { GetEffectiveAcl } from '../../fields/util';
import { setupMoveUpEvents, emptyFunction, returnFalse } from "../../Utils";
import { Docs, DocUtils } from "../documents/Documents";
import { DocumentType } from '../documents/DocumentTypes';
import { CurrentUserUtils } from '../util/CurrentUserUtils';
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { SnappingManager } from '../util/SnappingManager';
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from './collections/CollectionDockingView';
import { DocumentButtonBar } from './DocumentButtonBar';
import './DocumentDecorations.scss';
import { KeyManager } from './GlobalKeyHandler';
import { InkStrokeProperties } from './InkStrokeProperties';
import { LightboxView } from './LightboxView';
import { DocumentView } from "./nodes/DocumentView";
import React = require("react");

@observer
export class DocumentDecorations extends React.Component<{ boundsLeft: number, boundsTop: number }, { value: string }> {
    static Instance: DocumentDecorations;
    private _resizeHdlId = "";
    private _keyinput = React.createRef<HTMLInputElement>();
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 20 + 3; // link button height + margin
    private _titleHeight = 20;
    private _resizeUndo?: UndoManager.Batch;
    private _rotateUndo?: UndoManager.Batch;
    private _offX = 0; _offY = 0;  // offset from click pt to inner edge of resize border
    private _snapX = 0; _snapY = 0; // last snapped location of resize border
    private _prevY = 0;
    private _dragHeights = new Map<Doc, { start: number, lowest: number }>();
    private _inkCenterPts: { doc: Doc, X: number, Y: number }[] = [];
    private _inkDragDocs: { doc: Doc, x: number, y: number, width: number, height: number }[] = [];

    @observable private _accumulatedTitle = "";
    @observable private _titleControlString: string = "#title";
    @observable private _edtingTitle = false;
    @observable private _hidden = false;

    @observable public Interacting = false;
    @observable public pushIcon: IconProp = "arrow-alt-circle-up";
    @observable public pullIcon: IconProp = "arrow-alt-circle-down";
    @observable public pullColor: string = "white";

    constructor(props: any) {
        super(props);
        DocumentDecorations.Instance = this;
        reaction(() => SelectionManager.Views().slice(), action(docs => this._edtingTitle = false));
    }

    @computed
    get Bounds() {
        return SelectionManager.Views().map(dv => dv.getBounds()).reduce((bounds, rect) =>
            !rect ? bounds :
                {
                    x: Math.min(rect.left, bounds.x),
                    y: Math.min(rect.top, bounds.y),
                    r: Math.max(rect.right, bounds.r),
                    b: Math.max(rect.bottom, bounds.b)
                },
            { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }

    @action
    titleBlur = () => {
        this._edtingTitle = false;
        if (this._accumulatedTitle.startsWith("#") || this._accumulatedTitle.startsWith("=")) {
            this._titleControlString = this._accumulatedTitle;
        } else if (this._titleControlString.startsWith("#")) {
            const titleFieldKey = this._titleControlString.substring(1);
            UndoManager.RunInBatch(() => titleFieldKey && SelectionManager.Views().forEach(d => {
                titleFieldKey === "title" && (d.dataDoc["title-custom"] = !this._accumulatedTitle.startsWith("-"));
                //@ts-ignore
                Doc.SetInPlace(d.rootDoc, titleFieldKey, +this._accumulatedTitle == this._accumulatedTitle ? +this._accumulatedTitle : this._accumulatedTitle, true);
            }), "title blur");
        }
    }

    titleEntered = (e: React.KeyboardEvent) => e.key === "Enter" && (e.target as any).blur();

    @action onTitleDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, e => this.onBackgroundMove(true, e), (e) => { }, action((e) => {
            !this._edtingTitle && (this._accumulatedTitle = this._titleControlString.startsWith("#") ? this.selectionTitle : this._titleControlString);
            this._edtingTitle = true;
            setTimeout(() => this._keyinput.current!.focus(), 0);
        }));
    }

    onBackgroundDown = (e: React.PointerEvent) => setupMoveUpEvents(this, e, e => this.onBackgroundMove(false, e), emptyFunction, emptyFunction);

    @action
    onBackgroundMove = (dragTitle: boolean, e: PointerEvent): boolean => {
        const dragDocView = SelectionManager.Views()[0];
        const dragData = new DragManager.DocumentDragData(SelectionManager.Views().map(dv => dv.props.Document));
        const { left, top } = dragDocView.getBounds() || { left: 0, top: 0 };
        dragData.offset = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.ContentScale()).transformDirection(e.x - left, e.y - top);
        dragData.moveDocument = dragDocView.props.moveDocument;
        dragData.isSelectionMove = true;
        dragData.canEmbed = dragTitle;
        dragData.dropAction = dragDocView.props.dropAction;
        this._hidden = this.Interacting = true;
        DragManager.StartDocumentDrag(SelectionManager.Views().map(dv => dv.ContentDiv!), dragData, e.x, e.y, {
            dragComplete: action(e => {
                dragData.canEmbed && SelectionManager.DeselectAll();
                this._hidden = this.Interacting = false;
            }),
            hideSource: true
        });
        return true;
    }

    @undoBatch
    onCloseClick = () => {
        const selected = SelectionManager.Views().slice();
        SelectionManager.DeselectAll();
        selected.map(dv => dv.props.removeDocument?.(dv.props.Document));
    }
    @undoBatch
    @action
    onMaximizeClick = (e: any): void => {
        const selectedDocs = SelectionManager.Views();
        if (selectedDocs.length) {
            if (e.ctrlKey) {    // open an alias in a new tab with Ctrl Key
                selectedDocs[0].props.Document._fullScreenView = Doc.MakeAlias(selectedDocs[0].props.Document);
                (selectedDocs[0].props.Document._fullScreenView as Doc).context = undefined;
                CollectionDockingView.AddSplit(selectedDocs[0].props.Document._fullScreenView as Doc, "right");
            } else if (e.shiftKey) {   // open centered in a new workspace with Shift Key
                const alias = Doc.MakeAlias(selectedDocs[0].props.Document);
                alias.context = undefined;
                alias.x = -alias[WidthSym]() / 2;
                alias.y = -alias[HeightSym]() / 2;
                CollectionDockingView.AddSplit(Docs.Create.FreeformDocument([alias], { title: "Tab for " + alias.title }), "right");
            } else if (e.altKey) {    // open same document in new tab
                CollectionDockingView.ToggleSplit(Cast(selectedDocs[0].props.Document._fullScreenView, Doc, null) || selectedDocs[0].props.Document, "right");
            } else {
                LightboxView.SetLightboxDoc(selectedDocs[0].props.Document, undefined, selectedDocs.slice(1).map(view => view.props.Document));
            }
        }
        SelectionManager.DeselectAll();
    }

    @undoBatch
    onIconifyClick = (): void => {
        SelectionManager.Views().forEach(dv => dv?.iconify());
        SelectionManager.DeselectAll();
    }

    onSelectorClick = () => SelectionManager.Views()?.[0]?.props.ContainingCollectionView?.props.select(false);

    onRadiusDown = (e: React.PointerEvent): void => {
        this._resizeUndo = UndoManager.StartBatch("DocDecs set radius");
        setupMoveUpEvents(this, e, (e, down) => {
            const dist = Math.sqrt((e.clientX - down[0]) * (e.clientX - down[0]) + (e.clientY - down[1]) * (e.clientY - down[1]));
            SelectionManager.Views().map(dv => dv.props.Document).map(doc => doc.layout instanceof Doc ? doc.layout : doc.isTemplateForField ? doc : Doc.GetProto(doc)).
                map(d => d.borderRounding = `${Math.max(0, dist < 3 ? 0 : dist)}px`);
            return false;
        }, (e) => this._resizeUndo?.end(), (e) => { });
    }

    @action
    onRotateDown = (e: React.PointerEvent): void => {
        this._rotateUndo = UndoManager.StartBatch("rotatedown");

        setupMoveUpEvents(this, e, this.onRotateMove, () => this._rotateUndo?.end(), emptyFunction);
        this._prevY = e.clientY;
        this._inkCenterPts = SelectionManager.Views()
            .filter(dv => dv.rootDoc.type === DocumentType.INK)
            .map(dv => ({ ink: Cast(dv.rootDoc.data, InkField)?.inkData ?? [{ X: 0, Y: 0 }], doc: dv.rootDoc }))
            .map(({ ink, doc }) => ({ doc, X: Math.min(...ink.map(p => p.X)), Y: Math.min(...ink.map(p => p.Y)) }));
    }

    @action
    onRotateMove = (e: PointerEvent, down: number[]): boolean => {
        const distance = Math.abs(this._prevY - e.clientY);
        const angle = e.clientY > this._prevY ? distance * (Math.PI / 180) : e.clientY < this._prevY ? - distance * (Math.PI / 180) : 0;
        this._prevY = e.clientY;
        this._inkCenterPts.map(({ doc, X, Y }) => ({ doc, X, Y, inkData: Cast(doc.data, InkField)?.inkData }))
            .forEach(pair => {
                const newPoints = pair.inkData?.map(ink => ({
                    X: Math.cos(angle) * (ink.X - pair.X) - Math.sin(angle) * (ink.Y - pair.Y) + pair.X,
                    Y: Math.sin(angle) * (ink.X - pair.X) + Math.cos(angle) * (ink.Y - pair.Y) + pair.Y
                })) || [];
                Doc.SetInPlace(pair.doc, "data", new InkField(newPoints), true);

                pair.doc._width = ((xs) => (Math.max(...xs) - Math.min(...xs)))(newPoints.map(p => p.X) || [0]);
                pair.doc._height = ((ys) => (Math.max(...ys) - Math.min(...ys)))(newPoints.map(p => p.Y) || [0]);
                pair.doc.rotation = NumCast(pair.doc.rotation) + angle;
            });
        return false;
    }

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        DragManager.docsBeingDragged = SelectionManager.Views().map(dv => dv.rootDoc);
        this._inkDragDocs = DragManager.docsBeingDragged
            .filter(doc => doc.type === DocumentType.INK)
            .map(doc => {
                if (InkStrokeProperties.Instance?._lock) {
                    Doc.SetNativeHeight(doc, NumCast(doc._height));
                    Doc.SetNativeWidth(doc, NumCast(doc._width));
                }
                return ({ doc, x: NumCast(doc.x), y: NumCast(doc.y), width: NumCast(doc._width), height: NumCast(doc._height) });
            });

        setupMoveUpEvents(this, e, this.onPointerMove, this.onPointerUp, emptyFunction);
        this.Interacting = true; // turns off pointer events on things like youtube videos and web pages so that dragging doesn't get "stuck" when cursor moves over them
        this._resizeHdlId = e.currentTarget.className;
        const bounds = e.currentTarget.getBoundingClientRect();
        this._offX = this._resizeHdlId.toLowerCase().includes("left") ? bounds.right - e.clientX : bounds.left - e.clientX;
        this._offY = this._resizeHdlId.toLowerCase().includes("top") ? bounds.bottom - e.clientY : bounds.top - e.clientY;
        this._resizeUndo = UndoManager.StartBatch("DocDecs resize");
        this._snapX = e.pageX;
        this._snapY = e.pageY;
        DragManager.docsBeingDragged.forEach(doc => this._dragHeights.set(doc, { start: NumCast(doc._height), lowest: NumCast(doc._height) }));
    }

    onPointerMove = (e: PointerEvent, down: number[], move: number[]): boolean => {
        const first = SelectionManager.Views()[0];
        let thisPt = { thisX: e.clientX - this._offX, thisY: e.clientY - this._offY };
        var fixedAspect = Doc.NativeAspect(first.layoutDoc);
        InkStrokeProperties.Instance?._lock && SelectionManager.Views().filter(dv => dv.rootDoc.type === DocumentType.INK)
            .forEach(dv => fixedAspect = Doc.NativeAspect(dv.rootDoc));

        if (fixedAspect && (this._resizeHdlId === "documentDecorations-bottomRightResizer" || this._resizeHdlId === "documentDecorations-topLeftResizer")) { // need to generalize for bl and tr drag handles
            const project = (p: number[], a: number[], b: number[]) => {
                const atob = [b[0] - a[0], b[1] - a[1]];
                const atop = [p[0] - a[0], p[1] - a[1]];
                const len = atob[0] * atob[0] + atob[1] * atob[1];
                let dot = atop[0] * atob[0] + atop[1] * atob[1];
                const t = dot / len;
                dot = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
                return [a[0] + atob[0] * t, a[1] + atob[1] * t];
            };
            const tl = first.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            const drag = project([e.clientX + this._offX, e.clientY + this._offY], tl, [tl[0] + fixedAspect, tl[1] + 1]);
            thisPt = DragManager.snapDragAspect(drag, fixedAspect);
        } else {
            thisPt = DragManager.snapDrag(e, -this._offX, -this._offY, this._offX, this._offY);
        }

        move[0] = thisPt.thisX - this._snapX;
        move[1] = thisPt.thisY - this._snapY;
        this._snapX = thisPt.thisX;
        this._snapY = thisPt.thisY;
        let dragBottom = false, dragRight = false, dragBotRight = false;
        let dX = 0, dY = 0, dW = 0, dH = 0;
        switch (this._resizeHdlId) {
            case "": break;
            case "documentDecorations-topLeftResizer":
                dX = -1;
                dY = -1;
                dW = -move[0];
                dH = -move[1];
                break;
            case "documentDecorations-topRightResizer":
                dW = move[0];
                dY = -1;
                dH = -move[1];
                break;
            case "documentDecorations-topResizer":
                dY = -1;
                dH = -move[1];
                break;
            case "documentDecorations-bottomLeftResizer":
                dX = -1;
                dW = -move[0];
                dH = move[1];
                break;
            case "documentDecorations-bottomRightResizer":
                dW = move[0];
                dH = move[1];
                dragBotRight = true;
                break;
            case "documentDecorations-bottomResizer":
                dH = move[1];
                dragBottom = true;
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -move[0];
                break;
            case "documentDecorations-rightResizer":
                dW = move[0];
                dragRight = true;
                break;
        }

        SelectionManager.Views().forEach(action((docView: DocumentView) => {
            if (e.ctrlKey && !Doc.NativeHeight(docView.props.Document)) docView.toggleNativeDimensions();
            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = Document(docView.rootDoc);
                const nwidth = docView.nativeWidth;
                const nheight = docView.nativeHeight;
                const width = (doc._width || 0);
                let height = (doc._height || (nheight / nwidth * width));
                height = !height || isNaN(height) ? 20 : height;
                const scale = docView.props.ScreenToLocalTransform().Scale;
                if (nwidth && nheight) {
                    if (nwidth / nheight !== width / height && !dragBottom) {
                        height = nheight / nwidth * width;
                    }
                    if (e.ctrlKey && !dragBottom) { // ctrl key enables modification of the nativeWidth or nativeHeight durin the interaction
                        if (Math.abs(dW) > Math.abs(dH)) dH = dW * nheight / nwidth;
                        else dW = dH * nwidth / nheight;
                    }
                }
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = (nwidth && nheight);
                if (e.ctrlKey && [DocumentType.IMG, DocumentType.SCREENSHOT, DocumentType.VID].includes(doc.type as DocumentType)) {
                    dW !== 0 && runInAction(() => {
                        const dataDoc = doc[DataSym];
                        const nw = Doc.NativeWidth(dataDoc);
                        const nh = Doc.NativeHeight(dataDoc);
                        Doc.SetNativeWidth(dataDoc, nw + (dW > 0 ? 10 : -10));
                        Doc.SetNativeHeight(dataDoc, nh + (dW > 0 ? 10 : -10) * nh / nw);
                    });
                }
                else if (fixedAspect) {
                    if ((Math.abs(dW) > Math.abs(dH) && (!dragBottom || !e.ctrlKey)) || dragRight) {
                        if (dragRight && e.ctrlKey) {
                            doc._nativeWidth = actualdW / (doc._width || 1) * Doc.NativeWidth(doc);
                        } else {
                            if (!doc._fitWidth) doc._height = nheight / nwidth * actualdW;
                            else if (!e.ctrlKey || dragBotRight) doc._height = actualdH;
                        }
                        doc._width = actualdW;
                    }
                    else {
                        if (dragBottom && (e.ctrlKey || docView.layoutDoc._fitWidth)) { // frozen web pages and others that fitWidth can't grow horizontally to match a vertical resize so the only choice is to change the nativeheight even if the ctrl key isn't used
                            doc._nativeHeight = actualdH / (doc._height || 1) * Doc.NativeHeight(doc);
                            doc._autoHeight = false;
                        } else {
                            if (!doc._fitWidth) doc._width = nwidth / nheight * actualdH;
                            else if (!e.ctrlKey || dragBotRight) doc._width = actualdW;
                        }
                        doc._height = actualdH;
                    }
                } else {
                    dH && (doc._height = actualdH);
                    dW && (doc._width = actualdW);
                    dH && (doc._autoHeight = false);
                }
            }
            const val = this._dragHeights.get(docView.layoutDoc);
            if (val) this._dragHeights.set(docView.layoutDoc, { start: val.start, lowest: Math.min(val.lowest, NumCast(docView.layoutDoc._height)) });
        }));
        return false;
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        this._resizeHdlId = "";
        this.Interacting = false;
        this._resizeUndo?.end();
        SnappingManager.clearSnapLines();

        // detect autoHeight gesture and apply
        DragManager.docsBeingDragged.map(doc => ({ doc, hgts: this._dragHeights.get(doc) }))
            .filter(pair => pair.hgts && pair.hgts.lowest < pair.hgts.start && pair.hgts.lowest <= 20)
            .forEach(pair => pair.doc._autoHeight = true);
        //need to change points for resize, or else rotation/control points will fail.
        this._inkDragDocs.map(oldbds => ({ oldbds, inkPts: Cast(oldbds.doc.data, InkField)?.inkData || [] }))
            .forEach(({ oldbds: { doc, x, y, width, height }, inkPts }) => {
                Doc.SetInPlace(doc, "data", new InkField(inkPts.map(ipt =>  // (new x — oldx) + newWidth * (oldxpoint /oldWidth)
                    ({
                        X: (NumCast(doc.x) - x) + NumCast(doc.width) * ipt.X / width,
                        Y: (NumCast(doc.y) - y) + NumCast(doc.height) * ipt.Y / height
                    }))), true);
                Doc.SetNativeWidth(doc, undefined);
                Doc.SetNativeHeight(doc, undefined);
            });
    }

    @computed
    get selectionTitle(): string {
        if (SelectionManager.Views().length === 1) {
            const selected = SelectionManager.Views()[0];
            if (this._titleControlString.startsWith("=")) {
                return ScriptField.MakeFunction(this._titleControlString.substring(1), { doc: Doc.name })!.script.run({ self: selected.rootDoc, this: selected.layoutDoc }, console.log).result?.toString() || "";
            }
            if (this._titleControlString.startsWith("#")) {
                return Field.toString(selected.props.Document[this._titleControlString.substring(1)] as Field) || "-unset-";
            }
            return this._accumulatedTitle;
        }
        return SelectionManager.Views().length > 1 ? "-multiple-" : "-unset-";
    }

    render() {
        const bounds = this.Bounds;
        const seldoc = SelectionManager.Views().lastElement();
        if (SnappingManager.GetIsDragging() || bounds.r - bounds.x < 1 || bounds.x === Number.MAX_VALUE || !seldoc || this._hidden || isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            return (null);
        }
        const canOpen = SelectionManager.Views().some(docView => !docView.props.Document._stayInCollection);
        const canDelete = SelectionManager.Views().some(docView => {
            const collectionAcl = docView.props.ContainingCollectionView ? GetEffectiveAcl(docView.props.ContainingCollectionDoc?.[DataSym]) : AclEdit;
            return (!docView.rootDoc._stayInCollection || docView.rootDoc.isInkMask) &&
                (collectionAcl === AclAdmin || collectionAcl === AclEdit || GetEffectiveAcl(docView.rootDoc) === AclAdmin);
        });
        const topBtn = (key: string, icon: string, click: (e: any) => void, title: string) => (
            <Tooltip key={key} title={<div className="dash-tooltip">{title}</div>} placement="top">
                <div className={`documentDecorations-${key}Button`} onContextMenu={e => e.preventDefault()}
                    onPointerDown={e => setupMoveUpEvents(this, e, returnFalse, click, emptyFunction)} >
                    <FontAwesomeIcon icon={icon as any} />
                </div>
            </Tooltip>);

        const titleArea = this._edtingTitle ?
            <input ref={this._keyinput} className="documentDecorations-title" style={{ width: `calc(100% - ${seldoc?.props.hideResizeHandles ? 0 : 20}px` }} type="text" name="dynbox" autoComplete="on" value={this._accumulatedTitle}
                onBlur={e => this.titleBlur()} onChange={action(e => this._accumulatedTitle = e.target.value)} onKeyPress={this.titleEntered} /> :
            <div className="documentDecorations-title" style={{ width: `calc(100% - ${seldoc?.props.hideResizeHandles ? 0 : 20}px` }} key="title" onPointerDown={this.onTitleDown} >
                <span className="documentDecorations-titleSpan">{`${this.selectionTitle}`}</span>
            </div>;

        let inMainMenuPanel = false;
        for (let node = seldoc.ContentDiv; node && !inMainMenuPanel; node = node?.parentNode as any) {
            if (node.className === "mainView-mainContent") inMainMenuPanel = true;
        }
        const leftBounds = inMainMenuPanel ? 0 : this.props.boundsLeft;
        const topBounds = LightboxView.LightboxDoc ? 0 : this.props.boundsTop;
        bounds.x = Math.max(leftBounds, bounds.x - this._resizeBorderWidth / 2) + this._resizeBorderWidth / 2;
        bounds.y = Math.max(topBounds, bounds.y - this._resizeBorderWidth / 2 - this._titleHeight) + this._resizeBorderWidth / 2 + this._titleHeight;
        const borderRadiusDraggerWidth = 15;
        bounds.r = Math.max(bounds.x, Math.max(leftBounds, Math.min(window.innerWidth, bounds.r + borderRadiusDraggerWidth + this._resizeBorderWidth / 2) - this._resizeBorderWidth / 2 - borderRadiusDraggerWidth));
        bounds.b = Math.max(bounds.y, Math.max(topBounds, Math.min(window.innerHeight, bounds.b + this._resizeBorderWidth / 2 + this._linkBoxHeight) - this._resizeBorderWidth / 2 - this._linkBoxHeight));
        const useRotation = seldoc.rootDoc.type === DocumentType.INK;

        return (<div className="documentDecorations" style={{ background: CurrentUserUtils.ActiveDashboard?.darkScheme ? "dimgray" : "" }} >
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: KeyManager.Instance.ShiftPressed || this.Interacting ? "none" : "all",
                display: SelectionManager.Views().length <= 1 ? "none" : undefined
            }} onPointerDown={this.onBackgroundDown} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} />
            {bounds.r - bounds.x < 15 && bounds.b - bounds.y < 15 ? (null) : <>
                <div className="documentDecorations-container" key="container" style={{
                    width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                    height: (bounds.b - bounds.y + this._resizeBorderWidth + this._titleHeight) + "px",
                    left: bounds.x - this._resizeBorderWidth / 2,
                    top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
                }}>
                    {!canDelete ? <div /> : topBtn("close", "times", this.onCloseClick, "Close")}
                    {seldoc.props.hideDecorationTitle || seldoc.props.Document.type === DocumentType.EQUATION ? (null) : titleArea}
                    {seldoc.props.hideResizeHandles || seldoc.props.Document.type === DocumentType.EQUATION ? (null) :
                        <>
                            {SelectionManager.Views().length !== 1 || seldoc.Document.type === DocumentType.INK ? (null) :
                                topBtn("iconify", `window-${seldoc.finalLayoutKey.includes("icon") ? "restore" : "minimize"}`, this.onIconifyClick, `${seldoc.finalLayoutKey.includes("icon") ? "De" : ""}Iconify Document`)}
                            {!canOpen ? (null) : topBtn("open", "external-link-alt", this.onMaximizeClick, "Open in Tab (ctrl: as alias, shift: in new collection)")}
                            <div key="tl" className="documentDecorations-topLeftResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="t" className="documentDecorations-topResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="tr" className="documentDecorations-topRightResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="l" className="documentDecorations-leftResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="c" className="documentDecorations-centerCont"></div>
                            <div key="r" className="documentDecorations-rightResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="bl" className="documentDecorations-bottomLeftResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="b" className="documentDecorations-bottomResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />
                            <div key="br" className="documentDecorations-bottomRightResizer" onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()} />

                            {seldoc.props.renderDepth <= 1 || !seldoc.props.ContainingCollectionView ? (null) :
                                topBtn("selector", "arrow-alt-circle-up", this.onSelectorClick, "tap to select containing document")}
                        </>
                    }
                    <div key="rot" className={`documentDecorations-${useRotation ? "rotation" : "borderRadius"}`}
                        onPointerDown={useRotation ? this.onRotateDown : this.onRadiusDown} onContextMenu={(e) => e.preventDefault()}>{useRotation && "⟲"}</div>
                </div >
                {seldoc?.Document.type === DocumentType.FONTICON ? (null) : <div className="link-button-container" key="links" style={{ left: bounds.x - this._resizeBorderWidth / 2 + 10, top: bounds.b + this._resizeBorderWidth / 2 }}>
                    <DocumentButtonBar views={SelectionManager.Views} />
                </div>}
            </>}
        </div >
        );
    }
}