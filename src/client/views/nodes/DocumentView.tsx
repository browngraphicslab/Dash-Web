import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, Opt } from "../../../new_fields/Doc";
import { Document, PositionDocument } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { InkTool } from '../../../new_fields/InkField';
import { RichTextField } from '../../../new_fields/RichTextField';
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { AudioField, ImageField, PdfField, VideoField } from '../../../new_fields/URLField';
import { TraceMobx } from '../../../new_fields/util';
import { GestureUtils } from '../../../pen-gestures/GestureUtils';
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, returnOne, returnTransparent, returnTrue, Utils } from "../../../Utils";
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { DocServer } from "../../DocServer";
import { Docs, DocumentOptions, DocUtils } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { ClientUtils } from '../../util/ClientUtils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType } from "../../util/DragManager";
import { InteractionUtils } from '../../util/InteractionUtils';
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from "../../util/SelectionManager";
import SharingManager from '../../util/SharingManager';
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { EditableView } from '../EditableView';
import { InkingControl } from '../InkingControl';
import { OverlayView } from '../OverlayView';
import { ScriptBox } from '../ScriptBox';
import { ScriptingRepl } from '../ScriptingRepl';
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import { FormattedTextBox } from './FormattedTextBox';
import React = require("react");
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';


library.add(fa.faEdit, fa.faTrash, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faCompressArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt, fa.faAlignCenter, fa.faCaretSquareRight,
    fa.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faLink, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock, fa.faLock, fa.faLaptopCode, fa.faMale,
    fa.faCopy, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    Document: Doc;
    DataDoc?: Doc;
    LayoutDoc?: () => Opt<Doc>;
    LibraryPath: Doc[];
    fitToBox?: boolean;
    onClick?: ScriptField;
    dragDivName?: string;
    addDocument?: (doc: Doc) => boolean;
    removeDocument?: (doc: Doc) => boolean;
    moveDocument?: (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    renderDepth: number;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Doc, willZoom: boolean, scale?: number, afterFocus?: () => boolean) => void;
    parentActive: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    addDocTab: (doc: Doc, where: string, libraryPath?: Doc[]) => boolean;
    pinToPres: (document: Doc) => void;
    zoomToScale: (scale: number) => void;
    backgroundHalo?: () => boolean;
    backgroundColor?: (doc: Doc) => string | undefined;
    getScale: () => number;
    ChromeHeight?: () => number;
    dontRegisterView?: boolean;
    layoutKey?: string;
    radialMenu?: String[];
}

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    private _doubleTap = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _gestureEventDisposer?: GestureUtils.GestureEventDisposer;
    private _titleRef = React.createRef<EditableView>();

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    @computed get active() { return SelectionManager.IsSelected(this, true) || this.props.parentActive(true); }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get nativeWidth() { return this.layoutDoc._nativeWidth || 0; }
    @computed get nativeHeight() { return this.layoutDoc._nativeHeight || 0; }
    @computed get onClickHandler() { return this.props.onClick || this.layoutDoc.onClick || this.Document.onClick; }

    private _firstX: number = 0;
    private _firstY: number = 0;


    // handle1PointerHoldStart = (e: React.TouchEvent): any => {
    //     this.onRadialMenu(e);
    //     const pt = InteractionUtils.GetMyTargetTouches(e, this.prevPoints, true)[0];
    //     this._firstX = pt.pageX;
    //     this._firstY = pt.pageY;
    //     e.stopPropagation();
    //     e.preventDefault();

    //     document.removeEventListener("touchmove", this.onTouch);
    //     document.removeEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.addEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.removeEventListener("touchend", this.handle1PointerHoldEnd);
    //     document.addEventListener("touchend", this.handle1PointerHoldEnd);
    // }

    // handle1PointerHoldMove = (e: TouchEvent): void => {
    //     const pt = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true)[0];
    //     if (Math.abs(pt.pageX - this._firstX) > 150 || Math.abs(pt.pageY - this._firstY) > 150) {
    //         this.handleRelease();
    //     }
    //     document.removeEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.addEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.removeEventListener("touchend", this.handle1PointerHoldEnd);
    //     document.addEventListener("touchend", this.handle1PointerHoldEnd);
    // }

    // handleRelease() {
    //     RadialMenu.Instance.closeMenu();
    //     document.removeEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.removeEventListener("touchend", this.handle1PointerHoldEnd);
    // }

    // handle1PointerHoldEnd = (e: TouchEvent): void => {
    //     RadialMenu.Instance.closeMenu();
    //     document.removeEventListener("touchmove", this.handle1PointerHoldMove);
    //     document.removeEventListener("touchend", this.handle1PointerHoldEnd);
    // }

    // @action
    // onRadialMenu = (e: React.TouchEvent): void => {
    //     const pt = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true)[0];

    //     RadialMenu.Instance.openMenu();

    //     RadialMenu.Instance.addItem({ description: "Open Fields", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 }), "onRight"), icon: "layer-group", selected: -1 });
    //     RadialMenu.Instance.addItem({ description: "Delete this document", event: () => this.props.ContainingCollectionView?.removeDocument(this.props.Document), icon: "trash", selected: -1 });
    //     RadialMenu.Instance.addItem({ description: "Open in a new tab", event: () => this.props.addDocTab(this.props.Document, "onRight"), icon: "folder", selected: -1 });
    //     RadialMenu.Instance.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin", selected: -1 });

    //     RadialMenu.Instance.displayMenu(pt.pageX - 15, pt.pageY - 15);
    //     if (!SelectionManager.IsSelected(this, true)) {
    //         SelectionManager.SelectDoc(this, false);
    //     }
    //     e.stopPropagation();
    // }

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));

        !this.props.dontRegisterView && DocumentManager.Instance.DocumentViews.push(this);
    }

    @action
    componentDidUpdate() {
        this._dropDisposer && this._dropDisposer();
        this._gestureEventDisposer && this._gestureEventDisposer();
        this.multiTouchDisposer && this.multiTouchDisposer();
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));
    }

    @action
    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        Doc.UnBrushDoc(this.props.Document);
        !this.props.dontRegisterView && DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    startDragging(x: number, y: number, dropAction: dropActionType) {
        if (this._mainCont.current) {
            const dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.moveDocument = this.props.moveDocument;//  this.Document.onDragStart ? undefined : this.props.moveDocument;
            dragData.dragDivName = this.props.dragDivName;
            this.props.Document.anchor1Context = this.props.ContainingCollectionDoc; // bcz: !! shouldn't need this ... use search find the document's context dynamically
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, { hideSource: !dropAction && !this.Document.onDragStart });
        }
    }

    public static FloatDoc(topDocView: DocumentView, x: number, y: number) {
        const topDoc = topDocView.props.Document;
        const de = new DragManager.DocumentDragData([topDoc]);
        de.dragDivName = topDocView.props.dragDivName;
        de.moveDocument = topDocView.props.moveDocument;
        undoBatch(action(() => topDoc.z = topDoc.z ? 0 : 1))();
        setTimeout(() => {
            const newDocView = DocumentManager.Instance.getDocumentView(topDoc);
            if (newDocView) {
                const contentDiv = newDocView.ContentDiv!;
                const xf = contentDiv.getBoundingClientRect();
                DragManager.StartDocumentDrag([contentDiv], de, x, y, { offsetX: x - xf.left, offsetY: y - xf.top, hideSource: true });
            }
        }, 0);
    }

    onKeyDown = (e: React.KeyboardEvent) => {
        if (e.altKey && !(e.nativeEvent as any).StopPropagationForReal) {
            (e.nativeEvent as any).StopPropagationForReal = true; // e.stopPropagation() doesn't seem to work...
            e.stopPropagation();
            e.preventDefault();
            if (e.key === "†" || e.key === "t") {
                if (!StrCast(this.layoutDoc._showTitle)) this.layoutDoc._showTitle = "title";
                if (!this._titleRef.current) setTimeout(() => this._titleRef.current?.setIsFocused(true), 0);
                else if (!this._titleRef.current.setIsFocused(true)) { // if focus didn't change, focus on interior text...
                    {
                        this._titleRef.current?.setIsFocused(false);
                        const any = (this._mainCont.current?.getElementsByClassName("ProseMirror")?.[0] as any);
                        any.keeplocation = true;
                        any?.focus();
                    }
                }
            } else if (e.key === "f") {
                const ex = (e.nativeEvent.target! as any).getBoundingClientRect().left;
                const ey = (e.nativeEvent.target! as any).getBoundingClientRect().top;
                DocumentView.FloatDoc(this, ex, ey);
            }
        }
    }

    onClick = (e: React.MouseEvent | React.PointerEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick && CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            e.stopPropagation();
            let preventDefault = true;
            if (this._doubleTap && this.props.renderDepth && !this.onClickHandler?.script) { // disable double-click to show full screen for things that have an on click behavior since clicking them twice can be misinterpreted as a double click
                const fullScreenAlias = Doc.MakeAlias(this.props.Document);
                if (StrCast(fullScreenAlias.layoutKey) !== "layout_fullScreen" && fullScreenAlias.layout_fullScreen) {
                    fullScreenAlias.layoutKey = "layout_fullScreen";
                }
                UndoManager.RunInBatch(() => this.props.addDocTab(fullScreenAlias, "inTab"), "double tap");
                SelectionManager.DeselectAll();
                Doc.UnBrushDoc(this.props.Document);
            } else if (this.onClickHandler && this.onClickHandler.script) {
                SelectionManager.DeselectAll();
                UndoManager.RunInBatch(() => this.onClickHandler!.script.run({ this: this.Document.isTemplateForField && this.props.DataDoc ? this.props.DataDoc : this.props.Document, containingCollection: this.props.ContainingCollectionDoc, shiftKey: e.shiftKey }, console.log), "on click");
            } else if (this.Document.type === DocumentType.BUTTON) {
                UndoManager.RunInBatch(() => ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", e.clientX, e.clientY), "on button click");
            } else if (this.Document.isButton) {
                SelectionManager.SelectDoc(this, e.ctrlKey); // don't think this should happen if a button action is actually triggered.
                UndoManager.RunInBatch(() => this.buttonClick(e.altKey, e.ctrlKey), "on link button follow");
            } else {
                SelectionManager.SelectDoc(this, e.ctrlKey);
                preventDefault = false;
            }
            preventDefault && e.preventDefault();
        }
    }

    buttonClick = async (altKey: boolean, ctrlKey: boolean) => {
        const linkDocs = DocListCast(this.props.Document.links);
        if (linkDocs.length) {
            DocumentManager.Instance.FollowLink(undefined, this.props.Document,
                // open up target if it's not already in view ... by zooming into the button document first and setting flag to reset zoom afterwards
                (doc: Doc, maxLocation: string) => this.props.focus(this.props.Document, true, 1, () => this.props.addDocTab(doc, maxLocation)),
                ctrlKey, altKey, this.props.ContainingCollectionDoc);
        }
    }

    handle1PointerDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        if (this.Document.onPointerDown) return;
        const touch = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true)[0];
        console.log("down");
        if (touch) {
            this._downX = touch.clientX;
            this._downY = touch.clientY;
            if (!e.nativeEvent.cancelBubble) {
                if ((this.active || this.Document.onDragStart || this.Document.onClick) && !e.ctrlKey && !this.Document.lockedPosition && !this.Document.inOverlay) e.stopPropagation();
                this.removeMoveListeners();
                this.addMoveListeners();
                this.removeEndListeners();
                this.addEndListeners();
                e.stopPropagation();
            }
        }
    }

    handle1PointerMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        if ((e as any).formattedHandled) { e.stopPropagation; return; }
        if (e.cancelBubble && this.active) {
            this.removeMoveListeners();
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.Document.onDragStart || this.Document.onClick) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            const touch = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true)[0];
            if (Math.abs(this._downX - touch.clientX) > 3 || Math.abs(this._downY - touch.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.Document.onClick)) {
                    this.cleanUpInteractions();
                    this.startDragging(this._downX, this._downY, this.Document.dropAction ? this.Document.dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();

        }
    }

    handle2PointersDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        if (!e.nativeEvent.cancelBubble && !this.isSelected()) {
            e.stopPropagation();
            e.preventDefault();

            this.removeMoveListeners();
            this.addMoveListeners();
            this.removeEndListeners();
            this.addEndListeners();
        }
    }

    @action
    handle2PointersMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
        const pt1 = myTouches[0];
        const pt2 = myTouches[1];
        const oldPoint1 = this.prevPoints.get(pt1.identifier);
        const oldPoint2 = this.prevPoints.get(pt2.identifier);
        const pinching = InteractionUtils.Pinning(pt1, pt2, oldPoint1!, oldPoint2!);
        if (pinching !== 0 && oldPoint1 && oldPoint2) {
            // let dX = (Math.min(pt1.clientX, pt2.clientX) - Math.min(oldPoint1.clientX, oldPoint2.clientX));
            // let dY = (Math.min(pt1.clientY, pt2.clientY) - Math.min(oldPoint1.clientY, oldPoint2.clientY));
            // let dX = Math.sign(Math.abs(pt1.clientX - oldPoint1.clientX) - Math.abs(pt2.clientX - oldPoint2.clientX));
            // let dY = Math.sign(Math.abs(pt1.clientY - oldPoint1.clientY) - Math.abs(pt2.clientY - oldPoint2.clientY));
            // let dW = -dX;
            // let dH = -dY;
            const dW = (Math.abs(pt1.clientX - pt2.clientX) - Math.abs(oldPoint1.clientX - oldPoint2.clientX));
            const dH = (Math.abs(pt1.clientY - pt2.clientY) - Math.abs(oldPoint1.clientY - oldPoint2.clientY));
            const dX = -1 * Math.sign(dW);
            const dY = -1 * Math.sign(dH);

            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = PositionDocument(this.props.Document);
                const layoutDoc = PositionDocument(Doc.Layout(this.props.Document));
                let nwidth = layoutDoc._nativeWidth || 0;
                let nheight = layoutDoc._nativeHeight || 0;
                const width = (layoutDoc._width || 0);
                const height = (layoutDoc._height || (nheight / nwidth * width));
                const scale = this.props.ScreenToLocalTransform().Scale * this.props.ContentScaling();
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = e.ctrlKey || (nwidth && nheight);
                if (fixedAspect && (!nwidth || !nheight)) {
                    layoutDoc._nativeWidth = nwidth = layoutDoc._width || 0;
                    layoutDoc._nativeHeight = nheight = layoutDoc._height || 0;
                }
                if (nwidth > 0 && nheight > 0) {
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
            e.stopPropagation();
            e.preventDefault();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        // console.log(e.button)
        // console.log(e.nativeEvent)
        // continue if the event hasn't been canceled AND we are using a moues or this is has an onClick or onDragStart function (meaning it is a button document)
        if (!(InteractionUtils.IsType(e, InteractionUtils.MOUSETYPE) || InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            if (!InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
                e.stopPropagation();
            }
            return;
        }
        if (!e.nativeEvent.cancelBubble || this.onClickHandler || this.Document.onDragStart) {
            this._downX = e.clientX;
            this._downY = e.clientY;
            if ((this.active || this.Document.onDragStart || this.onClickHandler) &&
                !e.ctrlKey &&
                (e.button === 0 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) &&
                !this.Document.lockedPosition &&
                !this.Document.inOverlay) {
                e.stopPropagation(); // events stop at the lowest document that is active.  if right dragging, we let it go through though to allow for context menu clicks. PointerMove callbacks should remove themselves if the move event gets stopPropagated by a lower-level handler (e.g, marquee drag);
            }
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointerup", this.onPointerUp);

            if ((e.nativeEvent as any).formattedHandled) { e.stopPropagation(); }
        }
    }

    onPointerMove = (e: PointerEvent): void => {

        if ((e as any).formattedHandled) { e.stopPropagation(); return; }
        if ((InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) return;
        if (e.cancelBubble && this.active) {
            document.removeEventListener("pointermove", this.onPointerMove); // stop listening to pointerMove if something else has stopPropagated it (e.g., the MarqueeView)
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.Document.onDragStart || this.onClickHandler) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.onClickHandler) && (e.buttons === 1 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE))) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, this.props.ContainingCollectionDoc?.childDropAction ? this.props.ContainingCollectionDoc?.childDropAction : this.Document.dropAction ? this.Document.dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
        this._lastTap = Date.now();
    }

    onGesture = (e: Event, ge: GestureUtils.GestureEvent) => {
        switch (ge.gesture) {
            case GestureUtils.Gestures.Line:
                ge.callbackFn && ge.callbackFn(this.props.Document);
                e.stopPropagation();
                break;
        }
    }

    @undoBatch
    deleteClicked = (): void => { SelectionManager.DeselectAll(); this.props.removeDocument?.(this.props.Document); }

    static makeNativeViewClicked = (doc: Doc) => {
        undoBatch(() => Doc.setNativeView(doc))();
    }

    static makeCustomViewClicked = (doc: Doc, dataDoc: Opt<Doc>, creator: (documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc, name: string = "custom", docLayoutTemplate?: Doc) => {
        const batch = UndoManager.StartBatch("CustomViewClicked");
        const customName = "layout_" + name;
        if (!StrCast(doc.title).endsWith(name)) doc.title = doc.title + "_" + name;
        if (doc[customName] === undefined) {
            const _width = NumCast(doc._width);
            const _height = NumCast(doc._height);
            const options = { title: "data", _width, x: -_width / 2, y: - _height / 2, _showSidebar: false };

            const field = doc.data;
            let fieldTemplate: Opt<Doc>;
            if (field instanceof RichTextField || typeof (field) === "string") {
                fieldTemplate = Docs.Create.TextDocument("", options);
            } else if (field instanceof PdfField) {
                fieldTemplate = Docs.Create.PdfDocument("http://www.msn.com", options);
            } else if (field instanceof VideoField) {
                fieldTemplate = Docs.Create.VideoDocument("http://www.cs.brown.edu", options);
            } else if (field instanceof AudioField) {
                fieldTemplate = Docs.Create.AudioDocument("http://www.cs.brown.edu", options);
            } else if (field instanceof ImageField) {
                fieldTemplate = Docs.Create.ImageDocument("http://www.cs.brown.edu", options);
            }

            if (fieldTemplate) {
                fieldTemplate.backgroundColor = doc.backgroundColor;
                fieldTemplate.heading = 1;
                fieldTemplate._autoHeight = true;
            }

            const docTemplate = docLayoutTemplate || creator(fieldTemplate ? [fieldTemplate] : [], { title: customName + "(" + doc.title + ")", isTemplateDoc: true, _width: _width + 20, _height: Math.max(100, _height + 45) });

            fieldTemplate && Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(docTemplate));
            Doc.ApplyTemplateTo(docTemplate, doc, customName, undefined);
        } else {
            doc.layoutKey = customName;
        }
        batch.end();
    }

    @undoBatch
    toggleButtonBehavior = (): void => {
        if (this.Document.isButton || this.Document.onClick || this.Document.ignoreClick) {
            this.Document.isButton = false;
            this.Document.ignoreClick = false;
            this.Document.onClick = undefined;
        } else {
            this.Document.isButton = true;
        }
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.complete.annoDragData) {
            /// this whole section for handling PDF annotations looks weird.  Need to rethink this to make it cleaner
            e.stopPropagation();
            de.complete.annoDragData.linkedToDoc = true;

            DocUtils.MakeLink({ doc: de.complete.annoDragData.annotationDocument }, { doc: this.props.Document, ctx: this.props.ContainingCollectionDoc },
                `Link from ${StrCast(de.complete.annoDragData.annotationDocument.title)}`);
        }
        if (de.complete.linkDragData) {
            e.stopPropagation();
            // const docs = await SearchUtil.Search(`data_l:"${destDoc[Id]}"`, true);
            // const views = docs.map(d => DocumentManager.Instance.getDocumentView(d)).filter(d => d).map(d => d as DocumentView);
            de.complete.linkDragData.linkSourceDocument !== this.props.Document &&
                (de.complete.linkDragData.linkDocument = DocUtils.MakeLink({ doc: de.complete.linkDragData.linkSourceDocument },
                    { doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, `link from ${de.complete.linkDragData.linkSourceDocument.title} to ${this.props.Document.title}`)); // TODODO this is where in text links get passed
        }
    }

    @undoBatch
    @action
    public static unfreezeNativeDimensions(layoutDoc: Doc) {
        layoutDoc._nativeWidth = undefined;
        layoutDoc._nativeHeight = undefined;
    }

    toggleNativeDimensions = () => {
        if (this.Document._nativeWidth || this.Document._nativeHeight) {
            DocumentView.unfreezeNativeDimensions(this.layoutDoc);
        }
        else {
            Doc.freezeNativeDimensions(this.layoutDoc, this.props.PanelWidth(), this.props.PanelHeight());
        }
    }

    @undoBatch
    @action
    makeIntoPortal = async () => {
        const portalLink = DocListCast(this.Document.links).find(d => d.anchor1 === this.props.Document);
        if (!portalLink) {
            const portal = Docs.Create.FreeformDocument([], { _width: (this.layoutDoc._width || 0) + 10, _height: this.layoutDoc._height || 0, title: StrCast(this.props.Document.title) + ".portal" });
            DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: portal }, "portal link", "portal link");
        }
        this.Document.isButton = true;
    }

    @undoBatch
    @action
    setCustomView =
        (custom: boolean, layout: string): void => {
            // if (this.props.ContainingCollectionView?.props.DataDoc || this.props.ContainingCollectionView?.props.Document.isTemplateDoc) {
            //     Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.ContainingCollectionView.props.Document);
            // } else 
            if (custom) {
                DocumentView.makeNativeViewClicked(this.props.Document);

                let foundLayout: Opt<Doc>;
                DocListCast(Cast(Doc.UserDoc().expandingButtons, Doc, null)?.data)?.concat([Cast(Doc.UserDoc().iconView, Doc, null)]).
                    map(btnDoc => (btnDoc.dragFactory as Doc) || btnDoc).filter(doc => doc.isTemplateDoc).forEach(tempDoc => {
                        if (StrCast(tempDoc.title) === layout) {
                            foundLayout = tempDoc;
                        }
                    });
                DocumentView.
                    makeCustomViewClicked(this.props.Document, this.props.DataDoc, Docs.Create.StackingDocument, layout, foundLayout);
            } else {
                DocumentView.makeNativeViewClicked(this.props.Document);
            }
        }

    @undoBatch
    @action
    makeBackground = (): void => {
        this.Document.isBackground = !this.Document.isBackground;
        this.Document.isBackground && this.props.bringToFront(this.Document, true);
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.Document.lockedPosition = this.Document.lockedPosition ? undefined : true;
    }

    @undoBatch
    @action
    toggleLockTransform = (): void => {
        this.Document.lockedTransform = this.Document.lockedTransform ? undefined : true;
    }

    @action
    onContextMenu = async (e: React.MouseEvent): Promise<void> => {
        // the touch onContextMenu is button 0, the pointer onContextMenu is button 2
        if (e.button === 0 && !e.ctrlKey) {
            e.preventDefault();
            return;
        }
        e.persist();
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3 ||
            e.isDefaultPrevented()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        const cm = ContextMenu.Instance;
        const templateDoc = Cast(this.props.Document[StrCast(this.props.Document.layoutKey)], Doc, null);

        const existing = cm.findByDescription("Layout...");
        const layoutItems: ContextMenuProps[] = existing && "subitems" in existing ? existing.subitems : [];
        layoutItems.push({ description: this.Document.isBackground ? "As Foreground" : "As Background", event: this.makeBackground, icon: this.Document.lockedPosition ? "unlock" : "lock" });
        layoutItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });

        layoutItems.push({ description: `${this.Document._chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document._chromeStatus = (this.Document._chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });
        layoutItems.push({ description: `${this.Document._autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc._autoHeight = !this.layoutDoc._autoHeight, icon: "plus" });
        layoutItems.push({ description: !this.Document._nativeWidth || !this.Document._nativeHeight ? "Freeze" : "Unfreeze", event: this.toggleNativeDimensions, icon: "snowflake" });
        layoutItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
        layoutItems.push({ description: this.Document.lockedTransform ? "Unlock Transform" : "Lock Transform", event: this.toggleLockTransform, icon: BoolCast(this.Document.lockedTransform) ? "unlock" : "lock" });
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        !existing && cm.addItem({ description: "Layout...", subitems: layoutItems, icon: "compass" });

        const open = ContextMenu.Instance.findByDescription("Open...");
        const openItems: ContextMenuProps[] = open && "subitems" in open ? open.subitems : [];
        openItems.push({ description: "Open Full Screen", event: () => CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(this, this.props.LibraryPath), icon: "desktop" });
        openItems.push({ description: "Open Tab        ", event: () => this.props.addDocTab(this.props.Document, "inTab", this.props.LibraryPath), icon: "folder" });
        openItems.push({ description: "Open Right      ", event: () => this.props.addDocTab(this.props.Document, "onRight", this.props.LibraryPath), icon: "caret-square-right" });
        openItems.push({ description: "Open Alias Tab  ", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), "inTab"), icon: "folder" });
        openItems.push({ description: "Open Alias Right", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), "onRight"), icon: "caret-square-right" });
        openItems.push({ description: "Open Fields     ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), "onRight"), icon: "layer-group" });
        templateDoc && openItems.push({ description: "Open Template   ", event: () => this.props.addDocTab(templateDoc, "onRight"), icon: "eye" });
        openItems.push({ description: "Open Repl", icon: "laptop-code", event: () => OverlayView.Instance.addWindow(<ScriptingRepl />, { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" }) });
        !open && cm.addItem({ description: "Open...", subitems: openItems, icon: "external-link-alt" });


        const existingOnClick = cm.findByDescription("OnClick...");
        const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
        onClicks.push({ description: "Toggle Detail", event: () => this.Document.onClick = ScriptField.MakeScript(`toggleDetail(this, "${this.props.Document.layoutKey}")`), icon: "window-restore" });
        onClicks.push({ description: this.Document.ignoreClick ? "Select" : "Do Nothing", event: () => this.Document.ignoreClick = !this.Document.ignoreClick, icon: this.Document.ignoreClick ? "unlock" : "lock" });
        onClicks.push({ description: this.Document.isButton || this.Document.onClick ? "Remove Click Behavior" : "Follow Link", event: this.toggleButtonBehavior, icon: "concierge-bell" });
        onClicks.push({ description: "Edit onClick Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", obj.x, obj.y) });
        !existingOnClick && cm.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });

        const funcs: ContextMenuProps[] = [];
        if (this.Document.onDragStart) {
            funcs.push({ description: "Drag an Alias", icon: "edit", event: () => this.Document.dragFactory && (this.Document.onDragStart = ScriptField.MakeFunction('getAlias(this.dragFactory)')) });
            funcs.push({ description: "Drag a Copy", icon: "edit", event: () => this.Document.dragFactory && (this.Document.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)')) });
            funcs.push({ description: "Drag Document", icon: "edit", event: () => this.Document.onDragStart = undefined });
            cm.addItem({ description: "OnDrag...", subitems: funcs, icon: "asterisk" });
        }

        const more = cm.findByDescription("More...");
        const moreItems: ContextMenuProps[] = more && "subitems" in more ? more.subitems : [];

        if (!ClientUtils.RELEASE) {
            // let copies: ContextMenuProps[] = [];
            moreItems.push({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]), icon: "fingerprint" });
            // cm.addItem({ description: "Copy...", subitems: copies, icon: "copy" });
        }
        if (Cast(this.props.Document.data, ImageField)) {
            moreItems.push({ description: "Export to Google Photos", event: () => GooglePhotos.Transactions.UploadImages([this.props.Document]), icon: "caret-square-right" });
        }
        if (Cast(Doc.GetProto(this.props.Document).data, listSpec(Doc))) {
            moreItems.push({ description: "Export to Google Photos Album", event: () => GooglePhotos.Export.CollectionToAlbum({ collection: this.props.Document }).then(console.log), icon: "caret-square-right" });
            moreItems.push({ description: "Tag Child Images via Google Photos", event: () => GooglePhotos.Query.TagChildImages(this.props.Document), icon: "caret-square-right" });
            moreItems.push({ description: "Write Back Link to Album", event: () => GooglePhotos.Transactions.AddTextEnrichment(this.props.Document), icon: "caret-square-right" });
        }
        moreItems.push({
            description: "Download document", icon: "download", event: async () =>
                console.log(JSON.parse(await rp.get(Utils.CorsProxy("http://localhost:8983/solr/dash/select"), {
                    qs: { q: 'world', fq: 'NOT baseProto_b:true AND NOT deleted:true', start: '0', rows: '100', hl: true, 'hl.fl': '*' }
                })))
            // const a = document.createElement("a");
            // const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
            // a.href = url;
            // a.download = `DocExport-${this.props.Document[Id]}.zip`;
            // a.click();
        });

        moreItems.push({ description: "Publish", event: () => DocUtils.Publish(this.props.Document, this.Document.title || "", this.props.addDocument, this.props.removeDocument), icon: "file" });
        moreItems.push({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        moreItems.push({ description: "Undo Debug Test", event: () => UndoManager.TraceOpenBatches(), icon: "exclamation" });
        !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
        runInAction(() => {
            if (!ClientUtils.RELEASE) {
                const setWriteMode = (mode: DocServer.WriteMode) => {
                    DocServer.AclsMode = mode;
                    const mode1 = mode;
                    const mode2 = mode === DocServer.WriteMode.Default ? mode : DocServer.WriteMode.Playground;
                    DocServer.setFieldWriteMode("x", mode1);
                    DocServer.setFieldWriteMode("y", mode1);
                    DocServer.setFieldWriteMode("_width", mode1);
                    DocServer.setFieldWriteMode("_height", mode1);

                    DocServer.setFieldWriteMode("_panX", mode2);
                    DocServer.setFieldWriteMode("_panY", mode2);
                    DocServer.setFieldWriteMode("scale", mode2);
                    DocServer.setFieldWriteMode("_viewType", mode2);
                };
                const aclsMenu: ContextMenuProps[] = [];
                aclsMenu.push({ description: "Default (write/read all)", event: () => setWriteMode(DocServer.WriteMode.Default), icon: DocServer.AclsMode === DocServer.WriteMode.Default ? "check" : "exclamation" });
                aclsMenu.push({ description: "Playground (write own/no read)", event: () => setWriteMode(DocServer.WriteMode.Playground), icon: DocServer.AclsMode === DocServer.WriteMode.Playground ? "check" : "exclamation" });
                aclsMenu.push({ description: "Live Playground (write own/read others)", event: () => setWriteMode(DocServer.WriteMode.LivePlayground), icon: DocServer.AclsMode === DocServer.WriteMode.LivePlayground ? "check" : "exclamation" });
                aclsMenu.push({ description: "Live Readonly (no write/read others)", event: () => setWriteMode(DocServer.WriteMode.LiveReadonly), icon: DocServer.AclsMode === DocServer.WriteMode.LiveReadonly ? "check" : "exclamation" });
                cm.addItem({ description: "Collaboration ACLs...", subitems: aclsMenu, icon: "share" });
            }
        });
        runInAction(() => {
            cm.addItem({
                description: "Share",
                event: () => SharingManager.Instance.open(this),
                icon: "external-link-alt"
            });

            if (!this.topMost) {
                // DocumentViews should stop propagation of this event
                e.stopPropagation();
            }
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
            if (!SelectionManager.IsSelected(this, true)) {
                SelectionManager.SelectDoc(this, false);
            }
        });
        const path = this.props.LibraryPath.reduce((p: string, d: Doc) => p + "/" + (Doc.AreProtosEqual(d, (Doc.UserDoc().LibraryBtn as Doc).sourcePanel as Doc) ? "" : d.title), "");
        cm.addItem({
            description: `path: ${path}`, event: () => {
                this.props.LibraryPath.map(lp => Doc.GetProto(lp).treeViewOpen = lp.treeViewOpen = true);
                Doc.linkFollowHighlight(this.props.Document);
            }, icon: "check"
        });
    }

    isSelected = (outsideReaction?: boolean) => SelectionManager.IsSelected(this, outsideReaction);
    select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    chromeHeight = () => {
        const showTitle = StrCast(this.layoutDoc._showTitle);
        const showTextTitle = showTitle && (StrCast(this.layoutDoc.layout).indexOf("PresBox") !== -1 || StrCast(this.layoutDoc.layout).indexOf("FormattedTextBox") !== -1) ? showTitle : undefined;
        return showTextTitle ? 25 : 1;
    }

    @computed get finalLayoutKey() {
        if (typeof this.props.layoutKey === "string") {
            return this.props.layoutKey;
        }
        const fallback = Cast(this.props.Document.layoutKey, "string");
        return typeof fallback === "string" ? fallback : "layout";
    }
    childScaling = () => (this.layoutDoc._fitWidth ? this.props.PanelWidth() / this.nativeWidth : this.props.ContentScaling());
    @computed get contents() {
        TraceMobx();
        return (<DocumentContentsView ContainingCollectionView={this.props.ContainingCollectionView}
            ContainingCollectionDoc={this.props.ContainingCollectionDoc}
            Document={this.props.Document}
            DataDoc={this.props.DataDoc}
            LayoutDoc={this.props.LayoutDoc}
            fitToBox={this.props.fitToBox}
            LibraryPath={this.props.LibraryPath}
            addDocument={this.props.addDocument}
            removeDocument={this.props.removeDocument}
            moveDocument={this.props.moveDocument}
            ScreenToLocalTransform={this.props.ScreenToLocalTransform}
            renderDepth={this.props.renderDepth}
            ContentScaling={this.childScaling}
            PanelWidth={this.props.PanelWidth}
            PanelHeight={this.props.PanelHeight}
            focus={this.props.focus}
            parentActive={this.props.parentActive}
            whenActiveChanged={this.props.whenActiveChanged}
            bringToFront={this.props.bringToFront}
            addDocTab={this.props.addDocTab}
            pinToPres={this.props.pinToPres}
            zoomToScale={this.props.zoomToScale}
            backgroundColor={this.props.backgroundColor}
            getScale={this.props.getScale}
            ChromeHeight={this.chromeHeight}
            isSelected={this.isSelected}
            select={this.select}
            onClick={this.onClickHandler}
            layoutKey={this.finalLayoutKey} />);
    }
    linkEndpoint = (linkDoc: Doc) => Doc.LinkEndpoint(linkDoc, this.props.Document);

    // used to decide whether a link document should be created or not.
    // if it's a tempoarl link (currently just for Audio), then the audioBox will display the anchor and we don't want to display it here.
    // would be good to generalize this some way.
    isNonTemporalLink = (linkDoc: Doc) => {
        const anchor = Cast(Doc.AreProtosEqual(this.props.Document, Cast(linkDoc.anchor1, Doc) as Doc) ? linkDoc.anchor1 : linkDoc.anchor2, Doc) as Doc;
        const ept = Doc.AreProtosEqual(this.props.Document, Cast(linkDoc.anchor1, Doc) as Doc) ? linkDoc.anchor1Timecode : linkDoc.anchor2Timecode;
        return anchor.type === DocumentType.AUDIO && NumCast(ept) ? false : true;
    }

    // bcz: ARGH!  these  two are the same as in DocumentContentsView (without the _).  They should be reconciled to be the same functions...
    get _dataDoc() {
        if (this.props.DataDoc === undefined && typeof Doc.LayoutField(this.props.Document) !== "string") {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document has a layout document (not a layout string), 
            // then we render the layout document as a template and use this document as the data context for the template layout.
            const proto = Doc.GetProto(this.props.Document);
            return proto instanceof Promise ? undefined : proto;
        }
        return this.props.DataDoc instanceof Promise ? undefined : this.props.DataDoc;
    }
    get _layoutDoc() {
        if (this.props.LayoutDoc || (this.props.DataDoc === undefined && typeof Doc.LayoutField(this.props.Document) !== "string")) {
            // if there is no dataDoc (ie, we're not rendering a template layout), but this document has a layout document (not a layout string), 
            // then we render the layout document as a template and use this document as the data context for the template layout.
            return Doc.expandTemplateLayout(this.props.LayoutDoc?.() || Doc.Layout(this.props.Document), this.props.Document);
        }
        return Doc.Layout(this.props.Document);
    }

    @computed get innards() {
        TraceMobx();
        const showTitle = StrCast(this.layoutDoc._showTitle);
        const showTitleHover = StrCast(this.layoutDoc._showTitleHover);
        const showCaption = StrCast(this.layoutDoc._showCaption);
        const showTextTitle = showTitle && (StrCast(this.layoutDoc.layout).indexOf("PresBox") !== -1 || StrCast(this.layoutDoc.layout).indexOf("FormattedTextBox") !== -1) ? showTitle : undefined;
        const searchHighlight = (!this.Document.searchFields ? (null) :
            <div className="documentView-searchHighlight">
                {this.Document.searchFields}
            </div>);
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper">
                <FormattedTextBox {...this.props} onClick={this.onClickHandler}
                    DataDoc={this._dataDoc} active={returnTrue} Document={this._layoutDoc || this.props.Document}
                    isSelected={this.isSelected} focus={emptyFunction} select={this.select}
                    hideOnLeave={true} fieldKey={showCaption}
                />
            </div>);
        const titleView = (!showTitle ? (null) :
            <div className={`documentView-titleWrapper${showTitleHover ? "-hover" : ""}`} style={{
                position: showTextTitle ? "relative" : "absolute",
                pointerEvents: SelectionManager.GetIsDragging() || this.onClickHandler || this.Document.ignoreClick ? "none" : "all",
            }}>
                <EditableView ref={this._titleRef}
                    contents={(this.props.DataDoc || this.props.Document)[showTitle]?.toString()}
                    display={"block"} height={72} fontSize={12}
                    GetValue={() => (this.props.DataDoc || this.props.Document)[showTitle]?.toString()}
                    SetValue={undoBatch((value: string) => (Doc.GetProto(this.props.DataDoc || this.props.Document)[showTitle] = value) ? true : true)}
                />
            </div>);
        return <>
            {this.Document.links && DocListCast(this.Document.links).filter(d => !d.hidden).filter(this.isNonTemporalLink).map((d, i) =>
                <div className="documentView-docuLinkWrapper" key={`${d[Id]}`}>
                    <DocumentView {...this.props} ContentScaling={returnOne} ContainingCollectionDoc={this.props.Document} Document={d} layoutKey={this.linkEndpoint(d)} backgroundColor={returnTransparent} removeDocument={undoBatch(doc => doc.hidden = true)} />
                </div>)}
            {!showTitle && !showCaption ?
                this.Document.searchFields ?
                    (<div className="documentView-searchWrapper">
                        {this.contents}
                        {searchHighlight}
                    </div>)
                    :
                    this.contents
                :
                <div className="documentView-styleWrapper" >
                    <div className="documentView-styleContentWrapper" style={{ height: showTextTitle ? `calc(100% - ${this.chromeHeight()}px)` : "100%", top: showTextTitle ? this.chromeHeight() : undefined }}>
                        {this.contents}
                    </div>
                    {titleView}
                    {captionView}
                    {searchHighlight}
                </div>
            }
        </>;
    }
    @computed get ignorePointerEvents() {
        return (this.Document.isBackground && !this.isSelected()) || this.props.layoutKey?.includes("layout_key") || (this.Document.type === DocumentType.INK && InkingControl.Instance.selectedTool !== InkTool.None);
    }

    @observable _animate = 0;
    switchViews = action((custom: boolean, view: string) => {
        SelectionManager.SetIsDragging(true);
        this._animate = 0.1;
        setTimeout(action(() => {
            this.setCustomView(custom, view);
            this._animate = 1;
            setTimeout(action(() => {
                this._animate = 0;
                SelectionManager.SetIsDragging(false);
            }), 400);
        }), 400);
    });

    render() {
        if (!(this.props.Document instanceof Doc)) return (null);
        const backgroundColor = StrCast(this.layoutDoc._backgroundColor) || StrCast(this.layoutDoc.backgroundColor) || StrCast(this.Document.backgroundColor) || this.props.backgroundColor?.(this.Document);
        const finalColor = this.layoutDoc.type === DocumentType.FONTICON || this.layoutDoc._viewType === CollectionViewType.Linear ? undefined : backgroundColor;
        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.layoutDoc.borderRounding;
        const localScale = fullDegree;

        const highlightColors = Cast(Doc.UserDoc().activeWorkspace, Doc, null)?.darkScheme ?
            ["transparent", "#65350c", "#65350c", "yellow", "magenta", "cyan", "orange"] :
            ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"];
        const highlightStyles = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"];
        let highlighting = fullDegree && this.layoutDoc.type !== DocumentType.FONTICON && this.layoutDoc._viewType !== CollectionViewType.Linear;
        highlighting = highlighting && this.props.focus !== emptyFunction;  // bcz: hack to turn off highlighting onsidebar panel documents.  need to flag a document as not highlightable in a more direct way
        return <div id={this.props.Document[Id]} className={`documentView-node${this.topMost ? "-topmost" : ""}`} ref={this._mainCont} onKeyDown={this.onKeyDown}
            onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
            onPointerEnter={e => Doc.BrushDoc(this.props.Document)} onPointerLeave={e => Doc.UnBrushDoc(this.props.Document)}
            style={{
                transformOrigin: this._animate ? "center center" : undefined,
                transform: this._animate ? `scale(${this._animate})` : undefined,
                transition: !this._animate ? StrCast(this.Document.transition) : this._animate < 1 ? "transform 0.5s ease-in" : "transform 0.5s ease-out",
                pointerEvents: this.ignorePointerEvents ? "none" : "all",
                color: StrCast(this.layoutDoc.color, "inherit"),
                outline: highlighting && !borderRounding ? `${highlightColors[fullDegree]} ${highlightStyles[fullDegree]} ${localScale}px` : "solid 0px",
                border: highlighting && borderRounding ? `${highlightStyles[fullDegree]} ${highlightColors[fullDegree]} ${localScale}px` : undefined,
                boxShadow: this.props.Document.isTemplateForField ? "black 0.2vw 0.2vw 0.8vw" : undefined,
                background: finalColor,
                width: "100%",
                height: "100%",
                opacity: this.Document.opacity
            }}>
            {this.Document.isBackground ? <div className="documentView-lock"> <FontAwesomeIcon icon="unlock" size="lg" /> </div> : (null)}
            {this.onClickHandler && this.props.ContainingCollectionView?.props.Document._viewType === CollectionViewType.Time ? <>
                {this.innards}
                <div className="documentView-contentBlocker" />
            </> :
                this.innards}
        </div>;
    }
}

Scripting.addGlobal(function toggleDetail(doc: any, layoutKey: string) {
    const dv = DocumentManager.Instance.getDocumentView(doc);
    if (dv?.props.Document.layoutKey === layoutKey) dv?.switchViews(false, "");
    else dv?.switchViews(true, layoutKey.replace("layout_", ""));
});