import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, runInAction, trace, observable } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { Document, PositionDocument } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { ImageField, PdfField, VideoField, AudioField } from '../../../new_fields/URLField';
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, returnTransparent, returnTrue, Utils, returnOne } from "../../../Utils";
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { DocServer } from "../../DocServer";
import { Docs, DocUtils, DocumentOptions } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { ClientUtils } from '../../util/ClientUtils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType } from "../../util/DragManager";
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from "../../util/SelectionManager";
import SharingManager from '../../util/SharingManager';
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionViewType } from '../collections/CollectionView';
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { EditableView } from '../EditableView';
import { OverlayView } from '../OverlayView';
import { ScriptBox } from '../ScriptBox';
import { ScriptingRepl } from '../ScriptingRepl';
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import { FormattedTextBox } from './FormattedTextBox';
import React = require("react");
import { InteractionUtils } from '../../util/InteractionUtils';
import { InkingControl } from '../InkingControl';
import { InkTool } from '../../../new_fields/InkField';
import { TraceMobx } from '../../../new_fields/util';
import { List } from '../../../new_fields/List';
import { FormattedTextBoxComment } from './FormattedTextBoxComment';
import { GestureUtils } from '../../../pen-gestures/GestureUtils';
import { RadialMenu } from './RadialMenu';
import { RadialMenuProps } from './RadialMenuItem';

import { CollectionStackingView } from '../collections/CollectionStackingView';
import { RichTextField } from '../../../new_fields/RichTextField';
import { SchemaHeaderField } from '../../../new_fields/SchemaHeaderField';
import { ClientRecommender } from '../../ClientRecommender';
import { SearchUtil } from '../../util/SearchUtil';

library.add(fa.faEdit, fa.faTrash, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faCompressArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt, fa.faAlignCenter, fa.faCaretSquareRight,
    fa.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faLink, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock, fa.faLock, fa.faLaptopCode, fa.faMale,
    fa.faCopy, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    Document: Doc;
    DataDoc?: Doc;
    LibraryPath: Doc[];
    fitToBox?: boolean;
    onClick?: ScriptField;
    onPointerDown?: ScriptField;
    onPointerUp?: ScriptField;
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
    addDocTab: (doc: Doc, dataDoc: Doc | undefined, where: string, libraryPath?: Doc[]) => boolean;
    pinToPres: (document: Doc) => void;
    zoomToScale: (scale: number) => void;
    backgroundColor: (doc: Doc) => string | undefined;
    getScale: () => number;
    animateBetweenIcon?: (maximize: boolean, target: number[]) => void;
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
    private _hitTemplateDrag = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _showKPQuery: boolean = false;
    private _queries: string = "";
    private _gestureEventDisposer?: GestureUtils.GestureEventDisposer;
    private _titleRef = React.createRef<EditableView>();

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    private holdDisposer?: InteractionUtils.MultiTouchEventDisposer;

    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    @computed get active() { return SelectionManager.IsSelected(this, true) || this.props.parentActive(true); }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get nativeWidth() { return this.layoutDoc._nativeWidth || 0; }
    @computed get nativeHeight() { return this.layoutDoc._nativeHeight || 0; }
    @computed get onClickHandler() { return this.props.onClick ? this.props.onClick : this.Document.onClick; }
    @computed get onPointerDownHandler() { return this.props.onPointerDown ? this.props.onPointerDown : this.Document.onPointerDown; }
    @computed get onPointerUpHandler() { return this.props.onPointerUp ? this.props.onPointerUp : this.Document.onPointerUp; }

    private _firstX: number = -1;
    private _firstY: number = -1;



    handle1PointerHoldStart = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): any => {
        this.removeMoveListeners();
        this.removeEndListeners();
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        console.log(SelectionManager.SelectedDocuments());
        console.log("START");
        if (RadialMenu.Instance._display === false) {
            this.addHoldMoveListeners();
            this.addHoldEndListeners();
            this.onRadialMenu(e, me);
            const pt = me.touchEvent.touches[me.touchEvent.touches.length - 1];
            this._firstX = pt.pageX;
            this._firstY = pt.pageY;
        }

    }

    handle1PointerHoldMove = (e: Event, me: InteractionUtils.MultiTouchEvent<TouchEvent>): void => {

        const pt = me.touchEvent.touches[me.touchEvent.touches.length - 1];

        if (this._firstX === -1 || this._firstY === -1) {
            return;
        }
        if (Math.abs(pt.pageX - this._firstX) > 150 || Math.abs(pt.pageY - this._firstY) > 150) {
            this.handle1PointerHoldEnd(e, me);
        }
    }

    handle1PointerHoldEnd = (e: Event, me: InteractionUtils.MultiTouchEvent<TouchEvent>): void => {
        this.removeHoldMoveListeners();
        this.removeHoldEndListeners();
        RadialMenu.Instance.closeMenu();
        this._firstX = -1;
        this._firstY = -1;
        SelectionManager.DeselectAll();
        me.touchEvent.stopPropagation();
        me.touchEvent.preventDefault();
        e.stopPropagation();


    }

    @action
    onRadialMenu = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): void => {
        console.log("DISPLAYMENUUUU");
        console.log(me.touchEvent.touches);
        // console.log(InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true));
        // const pt = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true)[0];
        const pt = me.touchEvent.touches[me.touchEvent.touches.length - 1];
        RadialMenu.Instance.openMenu(pt.pageX - 15, pt.pageY - 15);

        RadialMenu.Instance.addItem({ description: "Open Fields", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 }), undefined, "onRight"), icon: "map-pin", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Delete this document", event: () => { this.props.ContainingCollectionView?.removeDocument(this.props.Document), RadialMenu.Instance.closeMenu() }, icon: "layer-group", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Open in a new tab", event: () => this.props.addDocTab(this.props.Document, undefined, "onRight"), icon: "trash", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.Document), icon: "folder", selected: -1 });

        // if (SelectionManager.IsSelected(this, true)) {
        //     SelectionManager.SelectDoc(this, false);
        // }
        SelectionManager.DeselectAll();


    }

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));
        // this._mainCont.current && (this.holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this)));

        !this.props.dontRegisterView && DocumentManager.Instance.DocumentViews.push(this);
    }

    @action
    componentDidUpdate() {
        this._dropDisposer && this._dropDisposer();
        this._gestureEventDisposer && this._gestureEventDisposer();
        this.multiTouchDisposer && this.multiTouchDisposer();
        this.holdDisposer && this.holdDisposer();
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));
        this._mainCont.current && (this.holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this)));
    }

    @action
    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
        this._gestureEventDisposer && this._gestureEventDisposer();
        this.multiTouchDisposer && this.multiTouchDisposer();
        this.holdDisposer && this.holdDisposer();
        Doc.UnBrushDoc(this.props.Document);
        !this.props.dontRegisterView && DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    startDragging(x: number, y: number, dropAction: dropActionType, applyAsTemplate?: boolean) {
        if (this._mainCont.current) {
            const dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.moveDocument = this.props.moveDocument;//  this.Document.onDragStart ? undefined : this.props.moveDocument;
            dragData.applyAsTemplate = applyAsTemplate;
            dragData.dragDivName = this.props.dragDivName;
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
                if (!StrCast(this.layoutDoc.showTitle)) this.layoutDoc.showTitle = "title";
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

    onClick = async (e: React.MouseEvent | React.PointerEvent) => {
        console.log(this.props.Document[Id])
        console.log(e.nativeEvent.cancelBubble);
        console.log(CurrentUserUtils.MainDocId !== this.props.Document[Id]);
        console.log(Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD);
        console.log(Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD);

        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick && CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            console.log("click");

            e.stopPropagation();
            let preventDefault = true;
            if (this._doubleTap && this.props.renderDepth && !this.onClickHandler?.script) { // disable double-click to show full screen for things that have an on click behavior since clicking them twice can be misinterpreted as a double click
                const fullScreenAlias = Doc.MakeAlias(this.props.Document);
                if (StrCast(fullScreenAlias.layoutKey) !== "layout_custom" && fullScreenAlias.layout_custom !== undefined) {
                    fullScreenAlias.layoutKey = "layout_custom";
                }
                this.props.addDocTab(fullScreenAlias, undefined, "inTab");
                SelectionManager.DeselectAll();
                Doc.UnBrushDoc(this.props.Document);
            } else if (this.onClickHandler && this.onClickHandler.script) {
                this.onClickHandler.script.run({ this: this.Document.isTemplateForField && this.props.DataDoc ? this.props.DataDoc : this.props.Document, containingCollection: this.props.ContainingCollectionDoc }, console.log);
            } else if (this.Document.type === DocumentType.BUTTON) {
                console.log("button");

                ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", e.clientX, e.clientY);
            } else if (this.props.Document.isButton === "Selector") {  // this should be moved to an OnClick script
                FormattedTextBoxComment.Hide();
                console.log("button2");

                this.Document.links?.[0] instanceof Doc && (Doc.UserDoc().SelectedDocs = new List([Doc.LinkOtherAnchor(this.Document.links[0], this.props.Document)]));
            } else if (this.Document.isButton) {
                console.log("button3");

                SelectionManager.SelectDoc(this, e.ctrlKey); // don't think this should happen if a button action is actually triggered.
                this.buttonClick(e.altKey, e.ctrlKey);
            } else {
                SelectionManager.SelectDoc(this, e.ctrlKey);
                preventDefault = false;
            }
            preventDefault && e.preventDefault();
        }
    }

    buttonClick = async (altKey: boolean, ctrlKey: boolean) => {
        const maximizedDocs = await DocListCastAsync(this.Document.maximizedDocs);
        const summarizedDocs = await DocListCastAsync(this.Document.summarizedDocs);
        const linkDocs = DocListCast(this.props.Document.links);
        let expandedDocs: Doc[] = [];
        expandedDocs = maximizedDocs ? [...maximizedDocs, ...expandedDocs] : expandedDocs;
        expandedDocs = summarizedDocs ? [...summarizedDocs, ...expandedDocs] : expandedDocs;
        // let expandedDocs = [ ...(maximizedDocs ? maximizedDocs : []), ...(summarizedDocs ? summarizedDocs : []),];
        if (expandedDocs.length) {
            SelectionManager.DeselectAll();
            let maxLocation = StrCast(this.Document.maximizeLocation, "inPlace");
            maxLocation = this.Document.maximizeLocation = (!ctrlKey ? !altKey ? maxLocation : (maxLocation !== "inPlace" ? "inPlace" : "onRight") : (maxLocation !== "inPlace" ? "inPlace" : "inTab"));
            if (maxLocation === "inPlace") {
                expandedDocs.forEach(maxDoc => this.props.addDocument && this.props.addDocument(maxDoc));
                const scrpt = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(NumCast(this.layoutDoc.width) / 2, NumCast(this.layoutDoc.height) / 2);
                DocumentManager.Instance.animateBetweenPoint(scrpt, expandedDocs);
            } else {
                expandedDocs.forEach(maxDoc => (!this.props.addDocTab(maxDoc, undefined, "close") && this.props.addDocTab(maxDoc, undefined, maxLocation)));
            }
        }
        else if (linkDocs.length) {
            DocumentManager.Instance.FollowLink(undefined, this.props.Document,
                // open up target if it's not already in view ... by zooming into the button document first and setting flag to reset zoom afterwards
                (doc: Doc, maxLocation: string) => this.props.focus(this.props.Document, true, 1, () => this.props.addDocTab(doc, undefined, maxLocation)),
                ctrlKey, altKey, this.props.ContainingCollectionDoc);
        }
    }

    handle1PointerDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        SelectionManager.DeselectAll();
        if (this.Document.onPointerDown) return;
        const touch = me.touchEvent.changedTouches.item(0);
        console.log("DOWN", SelectionManager.SelectedDocuments());
        console.log("down");
        if (touch) {
            this._downX = touch.clientX;
            this._downY = touch.clientY;
            if (!e.nativeEvent.cancelBubble) {
                this._hitTemplateDrag = false;
                for (let element = (e.target as any); element && !this._hitTemplateDrag; element = element.parentElement) {
                    if (element.className && element.className.toString() === "collectionViewBaseChrome-collapse") {
                        this._hitTemplateDrag = true;
                    }
                }
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

            const touch = me.touchEvent.changedTouches.item(0);
            if (Math.abs(this._downX - touch.clientX) > 3 || Math.abs(this._downY - touch.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.Document.onClick)) {
                    this.cleanUpInteractions();
                    this.startDragging(this._downX, this._downY, this.Document._dropAction ? this.Document._dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined, this._hitTemplateDrag);
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
            e.stopPropagation();
            e.preventDefault();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        console.log("ting");
        if (this.onPointerDownHandler && this.onPointerDownHandler.script) {
            this.onPointerDownHandler.script.run({ this: this.Document.isTemplateForField && this.props.DataDoc ? this.props.DataDoc : this.props.Document }, console.log);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
            return;
        }
        // console.log(e.button)
        // console.log(e.nativeEvent)
        // continue if the event hasn't been canceled AND we are using a moues or this is has an onClick or onDragStart function (meaning it is a button document)
        if (!(InteractionUtils.IsType(e, InteractionUtils.MOUSETYPE) || InkingControl.Instance.selectedTool === InkTool.Highlighter || InkingControl.Instance.selectedTool === InkTool.Pen)) {
            if (!InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
                e.stopPropagation();
            }
            return;
        }
        if (!e.nativeEvent.cancelBubble || this.Document.onClick || this.Document.onDragStart) {
            this._downX = e.clientX;
            this._downY = e.clientY;
            this._hitTemplateDrag = false;
            // this whole section needs to move somewhere else.  We're trying to initiate a special "template" drag where
            // this document is the template and we apply it to whatever we drop it on.
            for (let element = (e.target as any); element && !this._hitTemplateDrag; element = element.parentElement) {
                if (element.className && element.className.toString() === "collectionViewBaseChrome-collapse") {
                    this._hitTemplateDrag = true;
                }
            }
            if ((this.active || this.Document.onDragStart || this.Document.onClick) && !e.ctrlKey && (e.button === 0 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) && !this.Document.lockedPosition && !this.Document.inOverlay) e.stopPropagation(); // events stop at the lowest document that is active.  if right dragging, we let it go through though to allow for context menu clicks. PointerMove callbacks should remove themselves if the move event gets stopPropagated by a lower-level handler (e.g, marquee drag);
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
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.Document.onDragStart || this.Document.onClick) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.Document.onClick) && (e.buttons === 1 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE))) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, this.Document._dropAction ? this.Document._dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined, this._hitTemplateDrag);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        this.cleanUpInteractions();

        if (this.onPointerUpHandler && this.onPointerUpHandler.script && !InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
            this.onPointerUpHandler.script.run({ this: this.Document.isTemplateForField && this.props.DataDoc ? this.props.DataDoc : this.props.Document }, console.log);
            document.removeEventListener("pointerup", this.onPointerUp);
            return;
        }

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
    deleteClicked = (): void => { SelectionManager.DeselectAll(); this.props.removeDocument && this.props.removeDocument(this.props.Document); }

    static makeNativeViewClicked = (doc: Doc, prevLayout: string) => {
        undoBatch(() => {
            if (StrCast(doc.title).endsWith("_" + prevLayout)) doc.title = StrCast(doc.title).replace("_" + prevLayout, "");
            doc.layoutKey = "layout";
        })();
    }

    static makeCustomViewClicked = (doc: Doc, dataDoc: Opt<Doc>, creator: (documents: Array<Doc>, options: DocumentOptions, id?: string) => Doc, name: string = "custom", docLayoutTemplate?: Doc) => {
        const batch = UndoManager.StartBatch("CustomViewClicked");
        const customName = "layout_" + name;
        if (!StrCast(doc.title).endsWith(name)) doc.title = doc.title + "_" + name;
        if (doc[customName] === undefined) {
            const _width = NumCast(doc._width);
            const _height = NumCast(doc._height);
            const options = { title: "data", _width, x: -_width / 2, y: - _height / 2, };

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
            Doc.ApplyTemplateTo(docTemplate, dataDoc || doc, customName, undefined);
        } else {
            doc.layoutKey = customName;
        }
        batch.end();
    }

    @undoBatch
    makeBtnClicked = (): void => {
        if (this.Document.isButton || this.Document.onClick || this.Document.ignoreClick) {
            this.Document.isButton = false;
            this.Document.ignoreClick = false;
            this.Document.onClick = undefined;
        } else {
            this.Document.isButton = true;
        }
    }

    @undoBatch
    makeSelBtnClicked = (): void => {
        if (this.Document.isButton || this.Document.onClick || this.Document.ignoreClick) {
            this.Document.isButton = false;
            this.Document.ignoreClick = false;
            this.Document.onClick = undefined;
        } else {
            this.props.Document.isButton = "Selector";
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
        if (de.complete.docDragData) {
            if (de.complete.docDragData.applyAsTemplate) {
                Doc.ApplyTemplateTo(de.complete.docDragData.draggedDocuments[0], this.props.Document, "layout_custom");
                e.stopPropagation();
            }
            else if (de.complete.docDragData.draggedDocuments[0].type === "text") {
                const text = Cast(de.complete.docDragData.draggedDocuments[0].data, RichTextField)?.Text;
                if (text && text[0] === "{" && text[text.length - 1] === "}" && text.includes(":")) {
                    let loc = text.indexOf(":");
                    let key = text.slice(1, loc);
                    let value = text.slice(loc + 1, text.length - 1);
                    console.log(key);
                    console.log(value);
                    console.log(this.props.Document);
                    this.props.Document[key] = value;
                    console.log(de.complete.docDragData.draggedDocuments[0].x);
                    console.log(de.complete.docDragData.draggedDocuments[0].x);
                    e.preventDefault();
                    e.stopPropagation();
                    de.complete.aborted = true;
                }
            }
        }
        if (de.complete.linkDragData) {
            e.stopPropagation();
            // const docs = await SearchUtil.Search(`data_l:"${destDoc[Id]}"`, true);
            // const views = docs.map(d => DocumentManager.Instance.getDocumentView(d)).filter(d => d).map(d => d as DocumentView);
            de.complete.linkDragData.linkSourceDocument !== this.props.Document &&
                (de.complete.linkDragData.linkDocument = DocUtils.MakeLink({ doc: de.complete.linkDragData.linkSourceDocument }, { doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, "in-text link being created")); // TODODO this is where in text links get passed
        }
    }

    @action
    onDrop = (e: React.DragEvent) => {
        const text = e.dataTransfer.getData("text/plain");
        if (!e.isDefaultPrevented() && text && text.startsWith("<div")) {
            const oldLayout = this.Document.layout || "";
            const layout = text.replace("{layout}", oldLayout);
            this.Document.layout = layout;
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @undoBatch
    @action
    freezeNativeDimensions = (): void => {
        this.layoutDoc._autoHeight = false;
        this.layoutDoc.ignoreAspect = !this.layoutDoc.ignoreAspect;
        if (!this.layoutDoc.ignoreAspect && !this.layoutDoc._nativeWidth) {
            this.layoutDoc._nativeWidth = this.props.PanelWidth();
            this.layoutDoc._nativeHeight = this.props.PanelHeight();
        }
    }

    @undoBatch
    @action
    makeIntoPortal = async () => {
        const anchors = await Promise.all(DocListCast(this.Document.links).map(async (d: Doc) => Cast(d.anchor2, Doc)));
        if (!anchors.find(anchor2 => anchor2 && anchor2.title === this.Document.title + ".portal" ? true : false)) {
            const portalID = (this.Document.title + ".portal").replace(/^-/, "").replace(/\([0-9]*\)$/, "");
            DocServer.GetRefField(portalID).then(existingPortal => {
                const portal = existingPortal instanceof Doc ? existingPortal : Docs.Create.FreeformDocument([], { _width: (this.layoutDoc._width || 0) + 10, _height: this.layoutDoc._height || 0, title: portalID });
                DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: portal }, portalID, "portal link");
                this.Document.isButton = true;
            });
        }
    }

    @undoBatch
    @action
    setCustomView =
        (custom: boolean, layout: string): void => {
            if (this.props.ContainingCollectionView?.props.DataDoc || this.props.ContainingCollectionView?.props.Document.isTemplateDoc) {
                Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.ContainingCollectionView.props.Document);
            } else if (custom) {
                DocumentView.makeNativeViewClicked(this.props.Document, StrCast(this.props.Document.layoutKey).split("_")[1]);

                let foundLayout: Opt<Doc> = undefined;
                DocListCast(Cast(CurrentUserUtils.UserDocument.expandingButtons, Doc, null)?.data)?.map(btnDoc => {
                    if (StrCast(Cast(btnDoc?.dragFactory, Doc, null)?.title) === layout) {
                        foundLayout = btnDoc.dragFactory as Doc;
                    }
                })
                DocumentView.
                    makeCustomViewClicked(this.props.Document, this.props.DataDoc, Docs.Create.StackingDocument, layout, foundLayout);
            } else {
                DocumentView.makeNativeViewClicked(this.props.Document, StrCast(this.props.Document.layoutKey).split("_")[1]);
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
        const subitems: ContextMenuProps[] = [];
        subitems.push({ description: "Open Full Screen", event: () => CollectionDockingView.Instance && CollectionDockingView.Instance.OpenFullScreen(this, this.props.LibraryPath), icon: "desktop" });
        subitems.push({ description: "Open Tab        ", event: () => this.props.addDocTab(this.props.Document, this.props.DataDoc, "inTab", this.props.LibraryPath), icon: "folder" });
        subitems.push({ description: "Open Right      ", event: () => this.props.addDocTab(this.props.Document, this.props.DataDoc, "onRight", this.props.LibraryPath), icon: "caret-square-right" });
        subitems.push({ description: "Open Alias Tab  ", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.props.DataDoc, "inTab"), icon: "folder" });
        subitems.push({ description: "Open Alias Right", event: () => this.props.addDocTab(Doc.MakeAlias(this.props.Document), this.props.DataDoc, "onRight"), icon: "caret-square-right" });
        subitems.push({ description: "Open Fields     ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), undefined, "onRight"), icon: "layer-group" });
        cm.addItem({ description: "Open...", subitems: subitems, icon: "external-link-alt" });


        const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
        const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
        onClicks.push({ description: "Toggle Detail", event: () => this.Document.onClick = ScriptField.MakeScript("toggleDetail(this)"), icon: "window-restore" });
        onClicks.push({ description: this.Document.ignoreClick ? "Select" : "Do Nothing", event: () => this.Document.ignoreClick = !this.Document.ignoreClick, icon: this.Document.ignoreClick ? "unlock" : "lock" });
        onClicks.push({ description: this.Document.isButton || this.Document.onClick ? "Remove Click Behavior" : "Follow Link", event: this.makeBtnClicked, icon: "concierge-bell" });
        onClicks.push({ description: this.props.Document.isButton ? "Remove Select Link Behavior" : "Select Link", event: this.makeSelBtnClicked, icon: "concierge-bell" });
        onClicks.push({ description: "Edit onClick Script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", obj.x, obj.y) });
        !existingOnClick && cm.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });

        const funcs: ContextMenuProps[] = [];
        if (this.Document.onDragStart) {
            funcs.push({ description: "Drag an Alias", icon: "edit", event: () => this.Document.dragFactory && (this.Document.onDragStart = ScriptField.MakeFunction('getAlias(this.dragFactory)')) });
            funcs.push({ description: "Drag a Copy", icon: "edit", event: () => this.Document.dragFactory && (this.Document.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)')) });
            funcs.push({ description: "Drag Document", icon: "edit", event: () => this.Document.onDragStart = undefined });
            ContextMenu.Instance.addItem({ description: "OnDrag...", subitems: funcs, icon: "asterisk" });
        }

        const existing = ContextMenu.Instance.findByDescription("Layout...");
        const layoutItems: ContextMenuProps[] = existing && "subitems" in existing ? existing.subitems : [];
        layoutItems.push({ description: this.Document.isBackground ? "As Foreground" : "As Background", event: this.makeBackground, icon: this.Document.lockedPosition ? "unlock" : "lock" });
        layoutItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });

        layoutItems.push({ description: `${this.Document._chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document._chromeStatus = (this.Document._chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });
        layoutItems.push({ description: `${this.Document._autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc._autoHeight = !this.layoutDoc._autoHeight, icon: "plus" });
        layoutItems.push({ description: this.Document.ignoreAspect || !this.Document._nativeWidth || !this.Document._nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "snowflake" });
        layoutItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
        layoutItems.push({ description: this.Document.lockedTransform ? "Unlock Transform" : "Lock Transform", event: this.toggleLockTransform, icon: BoolCast(this.Document.lockedTransform) ? "unlock" : "lock" });
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        !existing && cm.addItem({ description: "Layout...", subitems: layoutItems, icon: "compass" });

        const more = ContextMenu.Instance.findByDescription("More...");
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
        moreItems.push({ description: "Pin to Presentation", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin" }); //I think this should work... and it does! A miracle!
        moreItems.push({ description: "Add Repl", icon: "laptop-code", event: () => OverlayView.Instance.addWindow(<ScriptingRepl />, { x: 300, y: 100, width: 200, height: 200, title: "Scripting REPL" }) });
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
        let recommender_subitems: ContextMenuProps[] = [];

        recommender_subitems.push({
            description: "Internal recommendations",
            event: () => this.recommender(e),
            icon: "brain"
        });

        let ext_recommender_subitems: ContextMenuProps[] = [];

        ext_recommender_subitems.push({
            description: "arXiv",
            event: () => this.externalRecommendation(e, "arxiv"),
            icon: "brain"
        });
        ext_recommender_subitems.push({
            description: "Bing",
            event: () => this.externalRecommendation(e, "bing"),
            icon: "brain"
        });

        recommender_subitems.push({
            description: "External recommendations",
            subitems: ext_recommender_subitems,
            icon: "brain"
        });

        cm.addItem({ description: "Recommender System", subitems: recommender_subitems, icon: "brain" });


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

    recommender = async (e: React.MouseEvent) => {
        if (!ClientRecommender.Instance) new ClientRecommender({ title: "Client Recommender" });
        const documents: Doc[] = [];
        const allDocs = await SearchUtil.GetAllDocs();
        // allDocs.forEach(doc => console.log(doc.title));
        // clears internal representation of documents as vectors
        ClientRecommender.Instance.reset_docs();
        //ClientRecommender.Instance.arxivrequest("electrons");
        await Promise.all(allDocs.map((doc: Doc) => {
            let isMainDoc: boolean = false;
            const dataDoc = Doc.GetDataDoc(doc);
            if (doc.type === DocumentType.TEXT) {
                if (dataDoc === Doc.GetDataDoc(this.props.Document)) {
                    isMainDoc = true;
                }
                if (!documents.includes(dataDoc)) {
                    documents.push(dataDoc);
                    const extdoc = doc.data_ext as Doc;
                    return ClientRecommender.Instance.extractText(doc, extdoc ? extdoc : doc, true, "", isMainDoc);
                }
            }
            if (doc.type === DocumentType.IMG) {
                if (dataDoc === Doc.GetDataDoc(this.props.Document)) {
                    isMainDoc = true;
                }
                if (!documents.includes(dataDoc)) {
                    documents.push(dataDoc);
                    const extdoc = doc.data_ext as Doc;
                    return ClientRecommender.Instance.extractText(doc, extdoc ? extdoc : doc, true, "", isMainDoc, true);
                }
            }
        }));
        const doclist = ClientRecommender.Instance.computeSimilarities("cosine");
        let recDocs: { preview: Doc, score: number }[] = [];
        // tslint:disable-next-line: prefer-for-of
        for (let i = 0; i < doclist.length; i++) {
            recDocs.push({ preview: doclist[i].actualDoc, score: doclist[i].score });
        }

        const data = recDocs.map(unit => {
            unit.preview.score = unit.score;
            return unit.preview;
        });

        console.log(recDocs.map(doc => doc.score));

        const title = `Showing ${data.length} recommendations for "${StrCast(this.props.Document.title)}"`;
        const recommendations = Docs.Create.RecommendationsDocument(data, { title });
        recommendations.documentIconHeight = 150;
        recommendations.sourceDoc = this.props.Document;
        recommendations.sourceDocContext = this.props.ContainingCollectionView!.props.Document;
        CollectionDockingView.AddRightSplit(recommendations, undefined);

        // RecommendationsBox.Instance.displayRecommendations(e.pageX + 100, e.pageY);
    }

    @action
    externalRecommendation = async (e: React.MouseEvent, api: string) => {
        if (!ClientRecommender.Instance) new ClientRecommender({ title: "Client Recommender" });
        ClientRecommender.Instance.reset_docs();
        const doc = Doc.GetDataDoc(this.props.Document);
        const extdoc = doc.data_ext as Doc;
        const recs_and_kps = await ClientRecommender.Instance.extractText(doc, extdoc ? extdoc : doc, false, api);
        let recs: any;
        let kps: any;
        if (recs_and_kps) {
            recs = recs_and_kps.recs;
            kps = recs_and_kps.keyterms;
        }
        else {
            console.log("recommender system failed :(");
            return;
        }
        console.log("ibm keyterms: ", kps.toString());
        const headers = [new SchemaHeaderField("title"), new SchemaHeaderField("href")];
        const bodies: Doc[] = [];
        const titles = recs.title_vals;
        const urls = recs.url_vals;
        for (let i = 0; i < 5; i++) {
            const body = Docs.Create.FreeformDocument([], { title: titles[i] });
            body.href = urls[i];
            bodies.push(body);
        }
        CollectionDockingView.AddRightSplit(Docs.Create.SchemaDocument(headers, bodies, { title: `Showing External Recommendations for "${StrCast(doc.title)}"` }), undefined);
        this._showKPQuery = true;
        this._queries = kps.toString();
    }

    onPointerEnter = (e: React.PointerEvent): void => { Doc.BrushDoc(this.props.Document); };
    onPointerLeave = (e: React.PointerEvent): void => { Doc.UnBrushDoc(this.props.Document); };

    // the document containing the view layout information - will be the Document itself unless the Document has
    // a layout field.  In that case, all layout information comes from there unless overriden by Document
    get layoutDoc(): Document {
        return Document(Doc.Layout(this.props.Document));
    }

    // does Document set a layout prop
    // does Document set a layout prop 
    setsLayoutProp = (prop: string) => this.props.Document[prop] !== this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)] && this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)];
    // get the a layout prop by first choosing the prop from Document, then falling back to the layout doc otherwise.
    getLayoutPropStr = (prop: string) => StrCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);
    getLayoutPropNum = (prop: string) => NumCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);

    isSelected = (outsideReaction?: boolean) => SelectionManager.IsSelected(this, outsideReaction);
    select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    chromeHeight = () => {
        const showTitle = StrCast(this.layoutDoc.showTitle);
        const showTitleHover = StrCast(this.layoutDoc.showTitleHover);
        return (showTitle && !showTitleHover ? 0 : 0) + 1;
    }

    @computed get finalLayoutKey() {
        const { layoutKey } = this.props;
        if (typeof layoutKey === "string") {
            return layoutKey;
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
            animateBetweenIcon={this.props.animateBetweenIcon}
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

    @computed get innards() {
        TraceMobx();
        const showTitle = StrCast(this.getLayoutPropStr("showTitle"));
        const showTitleHover = StrCast(this.getLayoutPropStr("showTitleHover"));
        const showCaption = this.getLayoutPropStr("showCaption");
        const showTextTitle = showTitle && StrCast(this.layoutDoc.layout).indexOf("FormattedTextBox") !== -1 ? showTitle : undefined;
        const searchHighlight = (!this.Document.searchFields ? (null) :
            <div className="documentView-searchHighlight">
                {this.Document.searchFields}
            </div>);
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper">
                <FormattedTextBox {...this.props}
                    onClick={this.onClickHandler} DataDoc={this.props.DataDoc} active={returnTrue}
                    isSelected={this.isSelected} focus={emptyFunction} select={this.select}
                    hideOnLeave={true} fieldKey={showCaption}
                />
            </div>);
        const titleView = (!showTitle ? (null) :
            <div className={`documentView-titleWrapper${showTitleHover ? "-hover" : ""}`} style={{
                position: showTextTitle ? "relative" : "absolute",
                pointerEvents: SelectionManager.GetIsDragging() ? "none" : "all",
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
                    <DocumentView {...this.props} ContentScaling={returnOne} Document={d} layoutKey={this.linkEndpoint(d)} backgroundColor={returnTransparent} removeDocument={undoBatch(doc => doc.hidden = true)} />
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
                    <div className="documentView-styleContentWrapper" style={{ height: showTextTitle ? "calc(100% - 29px)" : "100%", top: showTextTitle ? "29px" : undefined }}>
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
        return (this.Document.isBackground && !this.isSelected()) || (this.Document.type === DocumentType.INK && InkingControl.Instance.selectedTool !== InkTool.None);
    }

    render() {
        if (!(this.props.Document instanceof Doc)) return (null);
        const colorSet = this.setsLayoutProp("backgroundColor");
        const clusterCol = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.clusterOverridesDefaultBackground;
        const backgroundColor = (clusterCol && !colorSet) ?
            this.props.backgroundColor(this.Document) || StrCast(this.layoutDoc.backgroundColor) :
            StrCast(this.layoutDoc.backgroundColor) || this.props.backgroundColor(this.Document);

        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.getLayoutPropStr("borderRounding");
        const localScale = fullDegree;

        const animDims = this.Document.animateToDimensions ? Array.from(this.Document.animateToDimensions) : undefined;
        const animheight = animDims ? animDims[1] : "100%";
        const animwidth = animDims ? animDims[0] : "100%";

        const highlightColors = ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"];
        const highlightStyles = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"];
        let highlighting = fullDegree && this.layoutDoc.type !== DocumentType.FONTICON && this.layoutDoc._viewType !== CollectionViewType.Linear;
        highlighting = highlighting && this.props.focus !== emptyFunction;  // bcz: hack to turn off highlighting onsidebar panel documents.  need to flag a document as not highlightable in a more direct way
        return <div className={`documentView-node${this.topMost ? "-topmost" : ""}`} ref={this._mainCont} onKeyDown={this.onKeyDown}
            onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
            onPointerEnter={e => Doc.BrushDoc(this.props.Document)} onPointerLeave={e => Doc.UnBrushDoc(this.props.Document)}
            style={{
                transition: this.Document.isAnimating ? ".5s linear" : StrCast(this.Document.transition),
                pointerEvents: this.ignorePointerEvents ? "none" : "all",
                color: StrCast(this.Document.color),
                outline: highlighting && !borderRounding ? `${highlightColors[fullDegree]} ${highlightStyles[fullDegree]} ${localScale}px` : "solid 0px",
                border: highlighting && borderRounding ? `${highlightStyles[fullDegree]} ${highlightColors[fullDegree]} ${localScale}px` : undefined,
                boxShadow: this.props.Document.isTemplateForField ? "black 0.2vw 0.2vw 0.8vw" : undefined,
                background: this.layoutDoc.type === DocumentType.FONTICON || this.layoutDoc._viewType === CollectionViewType.Linear ? undefined : backgroundColor,
                width: animwidth,
                height: animheight,
                opacity: this.Document.opacity
            }}>
            {this.innards}
        </div>;
        { this._showKPQuery ? <KeyphraseQueryView keyphrases={this._queries}></KeyphraseQueryView> : undefined }
    }
}

Scripting.addGlobal(function toggleDetail(doc: any) { doc.layoutKey = StrCast(doc.layoutKey, "layout") === "layout" ? "layout_custom" : "layout"; });