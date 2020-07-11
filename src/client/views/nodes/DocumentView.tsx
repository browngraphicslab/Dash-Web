import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, HeightSym, Opt, WidthSym, DataSym, AclSym, AclReadonly, AclPrivate } from "../../../fields/Doc";
import { Document } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { InkTool } from '../../../fields/InkField';
import { listSpec } from "../../../fields/Schema";
import { SchemaHeaderField } from '../../../fields/SchemaHeaderField';
import { ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from '../../../fields/util';
import { GestureUtils } from '../../../pen-gestures/GestureUtils';
import { emptyFunction, OmitKeys, returnOne, returnTransparent, Utils, emptyPath } from "../../../Utils";
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { ClientRecommender } from '../../ClientRecommender';
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { DocumentManager } from "../../util/DocumentManager";
import { SnappingManager } from '../../util/SnappingManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { InteractionUtils } from '../../util/InteractionUtils';
import { Scripting } from '../../util/Scripting';
import { SearchUtil } from '../../util/SearchUtil';
import { SelectionManager } from "../../util/SelectionManager";
import SharingManager from '../../util/SharingManager';
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { EditableView } from '../EditableView';
import { KeyphraseQueryView } from '../KeyphraseQueryView';
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import { LinkAnchorBox } from './LinkAnchorBox';
import { RadialMenu } from './RadialMenu';
import React = require("react");
import { DocumentLinksButton } from './DocumentLinksButton';
import { MobileInterface } from '../../../mobile/MobileInterface';
import { LinkCreatedBox } from './LinkCreatedBox';
import { LinkDescriptionPopup } from './LinkDescriptionPopup';
import { LinkManager } from '../../util/LinkManager';

library.add(fa.faEdit, fa.faTrash, fa.faShare, fa.faDownload, fa.faExpandArrowsAlt, fa.faCompressArrowsAlt, fa.faLayerGroup, fa.faExternalLinkAlt, fa.faAlignCenter, fa.faCaretSquareRight,
    fa.faSquare, fa.faConciergeBell, fa.faWindowRestore, fa.faFolder, fa.faMapPin, fa.faLink, fa.faFingerprint, fa.faCrosshairs, fa.faDesktop, fa.faUnlock, fa.faLock, fa.faLaptopCode, fa.faMale,
    fa.faCopy, fa.faHandPointRight, fa.faCompass, fa.faSnowflake, fa.faMicrophone, fa.faKeyboard, fa.faQuestion);

export type DocFocusFunc = () => boolean;

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    docFilters: () => string[];
    FreezeDimensions?: boolean;
    NativeWidth: () => number;
    NativeHeight: () => number;
    Document: Doc;
    DataDoc?: Doc;
    LayoutTemplateString?: string;
    LayoutTemplate?: () => Opt<Doc>;
    LibraryPath: Doc[];
    fitToBox?: boolean;
    ignoreAutoHeight?: boolean;
    contextMenuItems?: () => { script: ScriptField, label: string }[];
    rootSelected: (outsideReaction?: boolean) => boolean; // whether the root of a template has been selected
    onClick?: ScriptField;
    onDoubleClick?: ScriptField;
    onPointerDown?: ScriptField;
    onPointerUp?: ScriptField;
    treeViewDoc?: Doc;
    dropAction?: dropActionType;
    dragDivName?: string;
    nudge?: (x: number, y: number) => void;
    addDocument?: (doc: Doc | Doc[]) => boolean;
    removeDocument?: (doc: Doc | Doc[]) => boolean;
    moveDocument?: (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    setupDragLines?: () => void;
    renderDepth: number;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    pointerEvents?: boolean;
    focus: (doc: Doc, willZoom: boolean, scale?: number, afterFocus?: DocFocusFunc) => void;
    parentActive: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    addDocTab: (doc: Doc, where: string, libraryPath?: Doc[]) => boolean;
    pinToPres: (document: Doc) => void;
    backgroundHalo?: () => boolean;
    backgroundColor?: (doc: Doc) => string | undefined;
    forcedBackgroundColor?: (doc: Doc) => string | undefined;
    opacity?: () => number | undefined;
    ChromeHeight?: () => number;
    dontRegisterView?: boolean;
    layoutKey?: string;
    radialMenu?: String[];
    display?: string;
}

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    private _downX: number = 0;
    private _downY: number = 0;
    private _lastTap: number = 0;
    private _doubleTap = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _showKPQuery: boolean = false;
    private _queries: string = "";
    private _gestureEventDisposer?: GestureUtils.GestureEventDisposer;
    private _titleRef = React.createRef<EditableView>();

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;
    private holdDisposer?: InteractionUtils.MultiTouchEventDisposer;

    public get title() { return this.props.Document.title; }
    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    get active() { return SelectionManager.IsSelected(this, true) || this.props.parentActive(true); }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get freezeDimensions() { return this.props.FreezeDimensions; }
    @computed get nativeWidth() { return NumCast(this.layoutDoc._nativeWidth, this.props.NativeWidth() || (this.freezeDimensions ? this.layoutDoc[WidthSym]() : 0)); }
    @computed get nativeHeight() { return NumCast(this.layoutDoc._nativeHeight, this.props.NativeHeight() || (this.freezeDimensions ? this.layoutDoc[HeightSym]() : 0)); }
    @computed get onClickHandler() { return this.props.onClick || Cast(this.Document.onClick, ScriptField, Cast(this.layoutDoc.onClick, ScriptField, null)); }
    @computed get onDoubleClickHandler() { return this.props.onDoubleClick || Cast(this.layoutDoc.onDoubleClick, ScriptField, null) || this.Document.onDoubleClick; }
    @computed get onPointerDownHandler() { return this.props.onPointerDown ? this.props.onPointerDown : this.Document.onPointerDown; }
    @computed get onPointerUpHandler() { return this.props.onPointerUp ? this.props.onPointerUp : this.Document.onPointerUp; }
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;

    private _firstX: number = -1;
    private _firstY: number = -1;

    handle1PointerHoldStart = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): any => {
        this.removeMoveListeners();
        this.removeEndListeners();
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
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
        if (RadialMenu.Instance.used) {
            this.onContextMenu(me.touches[0]);
        }
    }

    @action
    onRadialMenu = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): void => {
        const pt = me.touchEvent.touches[me.touchEvent.touches.length - 1];
        RadialMenu.Instance.openMenu(pt.pageX - 15, pt.pageY - 15);

        // RadialMenu.Instance.addItem({ description: "Open Fields", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), "onRight"), icon: "map-pin", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Delete", event: () => { this.props.ContainingCollectionView?.removeDocument(this.props.Document), RadialMenu.Instance.closeMenu(); }, icon: "external-link-square-alt", selected: -1 });
        // RadialMenu.Instance.addItem({ description: "Open in a new tab", event: () => this.props.addDocTab(this.props.Document, "onRight"), icon: "trash", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Pin", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Open", event: () => MobileInterface.Instance.handleClick(this.props.Document), icon: "trash", selected: -1 });

        SelectionManager.DeselectAll();
    }

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this), this.props.Document));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));
        // this._mainCont.current && (this.holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this)));

        if (!this.props.dontRegisterView) {
            DocumentManager.Instance.DocumentViews.push(this);
        }
    }

    @action
    componentDidUpdate() {
        this._dropDisposer?.();
        this._gestureEventDisposer?.();
        this.multiTouchDisposer?.();
        this.holdDisposer?.();
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this), this.props.Document);
            this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this));
            this.multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this));
            this.holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this));
        }
    }

    @action
    componentWillUnmount() {
        this._dropDisposer?.();
        this._gestureEventDisposer?.();
        this.multiTouchDisposer?.();
        this.holdDisposer?.();
        Doc.UnBrushDoc(this.props.Document);
        if (!this.props.dontRegisterView) {
            const index = DocumentManager.Instance.DocumentViews.indexOf(this);
            index !== -1 && DocumentManager.Instance.DocumentViews.splice(index, 1);
        }
    }

    startDragging(x: number, y: number, dropAction: dropActionType) {
        if (this._mainCont.current) {
            const dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.removeDocument = this.props.removeDocument;
            dragData.moveDocument = this.props.moveDocument;//  this.layoutDoc.onDragStart ? undefined : this.props.moveDocument;
            dragData.dragDivName = this.props.dragDivName;
            dragData.treeViewDoc = this.props.treeViewDoc;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, { hideSource: !dropAction && !this.layoutDoc.onDragStart });
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

    onClick = action((e: React.MouseEvent | React.PointerEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            let stopPropagate = true;
            let preventDefault = true;
            !this.props.Document.isBackground && this.props.bringToFront(this.props.Document);
            if (this._doubleTap && this.props.renderDepth && !this.onClickHandler?.script) { // disable double-click to show full screen for things that have an on click behavior since clicking them twice can be misinterpreted as a double click
                if (!(e.nativeEvent as any).formattedHandled) {
                    if (this.onDoubleClickHandler?.script && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) { // bcz: hack? don't execute script if you're clicking on a scripting box itself
                        const func = () => this.onDoubleClickHandler.script.run({
                            this: this.layoutDoc,
                            self: this.rootDoc,
                            thisContainer: this.props.ContainingCollectionDoc, shiftKey: e.shiftKey
                        }, console.log);
                        func();
                    } else {
                        UndoManager.RunInBatch(() => {
                            if (StrCast(this.props.Document.layoutKey) !== "layout_fullScreen" && this.props.Document.layout_fullScreen) {
                                const fullScreenAlias = Doc.MakeAlias(this.props.Document);
                                fullScreenAlias.layoutKey = "layout_fullScreen";
                                this.props.addDocTab(fullScreenAlias, "inTab");
                            } else {
                                this.props.addDocTab(this.props.Document, "inTab");
                            }
                        }, "double tap");
                        SelectionManager.DeselectAll();
                        Doc.UnBrushDoc(this.props.Document);
                    }
                }
            } else if (this.onClickHandler?.script && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) { // bcz: hack? don't execute script if you're clicking on a scripting box itself
                //SelectionManager.DeselectAll();
                const func = () => this.onClickHandler.script.run({
                    this: this.layoutDoc,
                    self: this.rootDoc,
                    thisContainer: this.props.ContainingCollectionDoc, shiftKey: e.shiftKey
                }, console.log);
                if (this.props.Document !== Doc.UserDoc()["dockedBtn-undo"] && this.props.Document !== Doc.UserDoc()["dockedBtn-redo"]) {
                    UndoManager.RunInBatch(func, "on click");
                } else func();
            } else if (this.Document["onClick-rawScript"] && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) {// bcz: hack? don't edit a script if you're clicking on a scripting box itself
                const alias = Doc.MakeAlias(this.props.Document);
                DocUtils.makeCustomViewClicked(alias, undefined, "onClick");
                this.props.addDocTab(alias, "onRight");
            } else if (this.props.Document.links && this.Document.isLinkButton && !e.shiftKey && !e.ctrlKey) {
                DocListCast(this.props.Document.links).length && this.followLinkClick(e.altKey, e.ctrlKey, e.shiftKey);
            } else {
                if ((this.layoutDoc.onDragStart || (this.props.Document.rootDocument)) && !(e.ctrlKey || e.button > 0)) {  // onDragStart implies a button doc that we don't want to select when clicking.   RootDocument & isTEmplaetForField implies we're clicking on part of a template instance and we want to select the whole template, not the part
                    stopPropagate = false; // don't stop propagation for field templates -- want the selection to propagate up to the root document of the template
                } else {
                    SelectionManager.SelectDoc(this, e.ctrlKey || e.shiftKey);
                }
                preventDefault = false;
            }
            stopPropagate && e.stopPropagation();
            preventDefault && e.preventDefault();
        }
    });

    // follows a link - if the target is on screen, it highlights/pans to it.
    // if the target isn't onscreen, then it will open up the target in a tab, on the right, or in place
    // depending on the followLinkLocation property of the source (or the link itself as a fallback);
    followLinkClick = async (altKey: boolean, ctrlKey: boolean, shiftKey: boolean) => {
        const batch = UndoManager.StartBatch("follow link click");
        // open up target if it's not already in view ...
        const createViewFunc = (doc: Doc, followLoc: string, finished: Opt<() => void>) => {
            const targetFocusAfterDocFocus = () => {
                const where = StrCast(this.Document.followLinkLocation) || followLoc;
                const hackToCallFinishAfterFocus = () => {
                    finished && setTimeout(finished, 0); // finished() needs to be called right after hackToCallFinishAfterFocus(), but there's no callback for that so we use the hacky timeout.
                    return false; // we must return false here so that the zoom to the document is not reversed.  If it weren't for needing to call finished(), we wouldn't need this function at all since not having it is equivalent to returning false
                };
                this.props.addDocTab(doc, where) && this.props.focus(doc, BoolCast(this.Document.followLinkZoom, true), undefined, hackToCallFinishAfterFocus); //  add the target and focus on it.
                return where !== "inPlace"; // return true to reset the initial focus&zoom (return false for 'inPlace' since resetting the initial focus&zoom will negate the zoom into the target)
            };
            if (!this.Document.followLinkZoom) {
                targetFocusAfterDocFocus();
            } else {
                // first focus & zoom onto this (the clicked document).  Then execute the function to focus on the target
                this.props.focus(this.props.Document, BoolCast(this.Document.followLinkZoom, true), 1, targetFocusAfterDocFocus);
            }
        };
        await DocumentManager.Instance.FollowLink(undefined, this.props.Document, createViewFunc, shiftKey, this.props.ContainingCollectionDoc, batch.end, altKey ? true : undefined);
    }

    handle1PointerDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        SelectionManager.DeselectAll();
        if (this.Document.onPointerDown) return;
        const touch = me.touchEvent.changedTouches.item(0);
        if (touch) {
            this._downX = touch.clientX;
            this._downY = touch.clientY;
            if (!e.nativeEvent.cancelBubble) {
                if ((this.active || this.layoutDoc.onDragStart || this.onClickHandler) && !e.ctrlKey && !this.layoutDoc.lockedPosition && !this.layoutDoc.inOverlay) e.stopPropagation();
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
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.layoutDoc.onDragStart || this.onClickHandler) && !this.layoutDoc.lockedPosition && !this.layoutDoc.inOverlay) {

            const touch = me.touchEvent.changedTouches.item(0);
            if (touch && (Math.abs(this._downX - touch.clientX) > 3 || Math.abs(this._downY - touch.clientY) > 3)) {
                if (!e.altKey && (!this.topMost || this.layoutDoc.onDragStart || this.onClickHandler)) {
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

    public iconify() {
        const layoutKey = Cast(this.props.Document.layoutKey, "string", null);
        const collapse = layoutKey !== "layout_icon";
        if (collapse) {
            this.switchViews(collapse, "icon");
            if (layoutKey && layoutKey !== "layout" && layoutKey !== "layout_icon") this.props.Document.deiconifyLayout = layoutKey.replace("layout_", "");
        } else {
            const deiconifyLayout = Cast(this.props.Document.deiconifyLayout, "string", null);
            this.switchViews(deiconifyLayout ? true : false, deiconifyLayout);
            this.props.Document.deiconifyLayout = undefined;
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
                const doc = Document(this.props.Document);
                const layoutDoc = Document(Doc.Layout(this.props.Document));
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
        // continue if the event hasn't been canceled AND we are using a moues or this is has an onClick or onDragStart function (meaning it is a button document)
        if (!(InteractionUtils.IsType(e, InteractionUtils.MOUSETYPE) || Doc.GetSelectedTool() === InkTool.Highlighter || Doc.GetSelectedTool() === InkTool.Pen)) {
            if (!InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
                e.stopPropagation();
                if (SelectionManager.IsSelected(this, true) && this.props.Document._viewType !== CollectionViewType.Docking) e.preventDefault(); // goldenlayout needs to be able to move its tabs, so can't preventDefault for it
                // TODO: check here for panning/inking
            }
            return;
        }
        this._downX = e.clientX;
        this._downY = e.clientY;
        if ((!e.nativeEvent.cancelBubble || this.onClickHandler || this.layoutDoc.onDragStart) &&
            // if this is part of a template, let the event go up to the tempalte root unless right/ctrl clicking
            !((this.props.Document.rootDocument) && !(e.ctrlKey || e.button > 0))) {
            if ((this.active || this.layoutDoc.onDragStart) &&
                !e.ctrlKey &&
                (e.button === 0 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)) &&
                !this.layoutDoc.inOverlay) {
                e.stopPropagation();
                if (SelectionManager.IsSelected(this, true) && this.layoutDoc._viewType !== CollectionViewType.Docking) e.preventDefault(); // goldenlayout needs to be able to move its tabs, so can't preventDefault for it
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
        if ((InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || Doc.GetSelectedTool() === InkTool.Highlighter || Doc.GetSelectedTool() === InkTool.Pen)) return;
        if (e.cancelBubble && this.active) {
            document.removeEventListener("pointermove", this.onPointerMove); // stop listening to pointerMove if something else has stopPropagated it (e.g., the MarqueeView)
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.layoutDoc.onDragStart) && !this.layoutDoc.lockedPosition && !this.layoutDoc.inOverlay) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.layoutDoc.onDragStart || this.onClickHandler) && (e.buttons === 1 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE))) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, ((e.ctrlKey || e.altKey) && "alias") || (this.props.dropAction || this.Document.dropAction || undefined) as dropActionType);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }

    onPointerUp = (e: PointerEvent): void => {
        this.cleanUpInteractions();

        if (this.onPointerUpHandler?.script && !InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
            this.onPointerUpHandler.script.run({ self: this.rootDoc, this: this.layoutDoc }, console.log);
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
    deleteClicked = (): void => {
        if (Doc.UserDoc().activeWorkspace === this.props.Document) {
            alert("Can't delete the active workspace");
        } else {
            SelectionManager.DeselectAll();
            this.props.removeDocument?.(this.props.Document);
        }
    }


    @undoBatch
    toggleLinkButtonBehavior = (): void => {
        if (this.Document.isLinkButton || this.onClickHandler || this.Document.ignoreClick) {
            this.Document.isLinkButton = false;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = false);
            this.Document.ignoreClick = false;
            this.Document.onClick = this.layoutDoc.onClick = undefined;
        } else {
            this.Document.isLinkButton = true;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = true);
            this.Document.followLinkZoom = false;
            this.Document.followLinkLocation = undefined;
        }
    }

    @undoBatch
    toggleFollowInPlace = (): void => {
        if (this.Document.isLinkButton) {
            this.Document.isLinkButton = false;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = false);
        } else {
            this.Document.isLinkButton = true;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = true);
            this.Document.followLinkZoom = true;
            this.Document.followLinkLocation = "inPlace";
        }
    }

    @undoBatch
    toggleFollowOnRight = (): void => {
        if (this.Document.isLinkButton) {
            this.Document.isLinkButton = false;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = false);
        } else {
            this.Document.isLinkButton = true;
            this.Document.followLinkZoom = false;
            const first = DocListCast(this.Document.links).find(d => d instanceof Doc);
            first && (first.hidden = true);
            this.Document.followLinkLocation = "onRight";
        }
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (this.props.Document === Doc.UserDoc().activeWorkspace) {
            alert("linking to document tabs not yet supported.  Drop link on document content.");
            return;
        }
        if (de.complete.annoDragData) {
            /// this whole section for handling PDF annotations looks weird.  Need to rethink this to make it cleaner
            e.stopPropagation();
            de.complete.annoDragData.linkedToDoc = true;

            const linkDoc = DocUtils.MakeLink({ doc: de.complete.annoDragData.annotationDocument }, { doc: this.props.Document }, "link");
            LinkManager.currentLink = linkDoc;

            runInAction(() => {
                LinkCreatedBox.popupX = de.x;
                LinkCreatedBox.popupY = de.y - 33;
                LinkCreatedBox.linkCreated = true;

                LinkDescriptionPopup.popupX = de.x;
                LinkDescriptionPopup.popupY = de.y;
                LinkDescriptionPopup.descriptionPopup = true;

                setTimeout(action(() => { LinkCreatedBox.linkCreated = false; }), 2500);
            });
        }
        if (de.complete.linkDragData) {
            e.stopPropagation();
            // const docs = await SearchUtil.Search(`data_l:"${destDoc[Id]}"`, true);
            // const views = docs.map(d => DocumentManager.Instance.getDocumentView(d)).filter(d => d).map(d => d as DocumentView);

            if (de.complete.linkDragData.linkSourceDocument !== this.props.Document) {
                const linkDoc = DocUtils.MakeLink({ doc: de.complete.linkDragData.linkSourceDocument },
                    { doc: this.props.Document }, `link`);
                LinkManager.currentLink = linkDoc;

                de.complete.linkDragData.linkSourceDocument !== this.props.Document &&
                    (de.complete.linkDragData.linkDocument = linkDoc); // TODODO this is where in text links get passed
                runInAction(() => {
                    LinkCreatedBox.popupX = de.x;
                    LinkCreatedBox.popupY = de.y - 33;
                    LinkCreatedBox.linkCreated = true;

                    LinkDescriptionPopup.popupX = de.x;
                    LinkDescriptionPopup.popupY = de.y;
                    LinkDescriptionPopup.descriptionPopup = true;

                    setTimeout(action(() => { LinkCreatedBox.linkCreated = false; }), 2500);
                });
            }

        }
    }

    @undoBatch
    @action
    toggleNativeDimensions = () => {
        Doc.toggleNativeDimensions(this.layoutDoc, this.props.ContentScaling(), this.props.PanelWidth(), this.props.PanelHeight());
    }

    @undoBatch
    @action
    makeIntoPortal = async () => {
        const portalLink = DocListCast(this.Document.links).find(d => d.anchor1 === this.props.Document);
        if (!portalLink) {
            const portal = Docs.Create.FreeformDocument([], { _width: NumCast(this.layoutDoc._width) + 10, _height: NumCast(this.layoutDoc._height), title: StrCast(this.props.Document.title) + ".portal" });
            DocUtils.MakeLink({ doc: this.props.Document }, { doc: portal }, "portal to");
        }
        this.Document.followLinkZoom = true;
        this.Document.isLinkButton = true;
    }

    @undoBatch
    @action
    toggleBackground = (temporary: boolean): void => {
        this.Document._overflow = temporary ? "visible" : "hidden";
        this.Document.isBackground = !temporary ? !this.Document.isBackground : (this.Document.isBackground ? undefined : true);
        if (this.Document.isBackground) {
            this.props.bringToFront(this.props.Document, true);
            this.props.Document[DataSym][Doc.LayoutFieldKey(this.Document) + "-nativeWidth"] = this.Document[WidthSym]();
            this.props.Document[DataSym][Doc.LayoutFieldKey(this.Document) + "-nativeHeight"] = this.Document[HeightSym]();
        }
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.Document.lockedPosition = this.Document.lockedPosition ? undefined : true;
    }

    @undoBatch
    @action
    setAcl = (acl: "readOnly" | "addOnly" | "ownerOnly" | "write") => {
        this.dataDoc.ACL = this.props.Document.ACL = acl;
        DocListCast(this.dataDoc[Doc.LayoutFieldKey(this.dataDoc)]).map(d => {
            if (d.author === Doc.CurrentUserEmail) d.ACL = acl;
            const data = d[DataSym];
            if (data && data.author === Doc.CurrentUserEmail) data.ACL = acl;
        });
    }
    @undoBatch
    @action
    testAcl = (acl: "readOnly" | "addOnly" | "ownerOnly" | "write") => {
        this.dataDoc.author = this.props.Document.author = "ADMIN";
        this.dataDoc.ACL = this.props.Document.ACL = acl;
        DocListCast(this.dataDoc[Doc.LayoutFieldKey(this.dataDoc)]).map(d => {
            if (d.author === Doc.CurrentUserEmail) {
                d.author = "ADMIN";
                d.ACL = acl;
            }
            const data = d[DataSym];
            if (data && data.author === Doc.CurrentUserEmail) {
                data.author = "ADMIN";
                data.ACL = acl;
            }
        });
    }

    @action
    onContextMenu = async (e: React.MouseEvent | Touch): Promise<void> => {
        // the touch onContextMenu is button 0, the pointer onContextMenu is button 2
        if (!(e instanceof Touch)) {
            if (e.button === 0 && !e.ctrlKey) {
                e.preventDefault();
                return;
            }
            e.persist();
            e.stopPropagation();

            if (Math.abs(this._downX - e?.clientX) > 3 || Math.abs(this._downY - e?.clientY) > 3 ||
                e?.isDefaultPrevented()) {
                e?.preventDefault();
                return;
            }
            e.preventDefault();
        }

        const cm = ContextMenu.Instance;
        if (!cm) return;

        const customScripts = Cast(this.props.Document.contextMenuScripts, listSpec(ScriptField), []);
        Cast(this.props.Document.contextMenuLabels, listSpec("string"), []).forEach((label, i) =>
            cm.addItem({ description: label, event: () => customScripts[i]?.script.run({ this: this.layoutDoc, self: this.rootDoc }), icon: "sticky-note" }));
        this.props.contextMenuItems?.().forEach(item =>
            cm.addItem({ description: item.label, event: () => item.script.script.run({ this: this.layoutDoc, self: this.rootDoc }), icon: "sticky-note" }));

        const options = cm.findByDescription("Options...");
        const optionItems: ContextMenuProps[] = options && "subitems" in options ? options.subitems : [];
        const templateDoc = Cast(this.props.Document[StrCast(this.props.Document.layoutKey)], Doc, null);
        templateDoc && optionItems.push({ description: "Open Template   ", event: () => this.props.addDocTab(templateDoc, "onRight"), icon: "eye" });
        optionItems.push({ description: "Toggle Show Each Link Dot", event: () => this.layoutDoc.showLinks = !this.layoutDoc.showLinks, icon: "eye" });
        !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "compass" });

        const existingOnClick = cm.findByDescription("OnClick...");
        const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
        onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
        onClicks.push({ description: "Toggle Detail", event: () => this.Document.onClick = ScriptField.MakeScript(`toggleDetail(self, "${this.Document.layoutKey}")`), icon: "window-restore" });
        onClicks.push({ description: this.Document.ignoreClick ? "Select" : "Do Nothing", event: () => this.Document.ignoreClick = !this.Document.ignoreClick, icon: this.Document.ignoreClick ? "unlock" : "lock" });
        onClicks.push({ description: this.Document.isLinkButton ? "Remove Follow Behavior" : "Follow Link in Place", event: this.toggleFollowInPlace, icon: "concierge-bell" });
        onClicks.push({ description: this.Document.isLinkButton ? "Remove Follow Behavior" : "Follow Link on Right", event: this.toggleFollowOnRight, icon: "concierge-bell" });
        onClicks.push({ description: this.Document.isLinkButton || this.onClickHandler ? "Remove Click Behavior" : "Follow Link", event: this.toggleLinkButtonBehavior, icon: "concierge-bell" });
        onClicks.push({ description: "Edit onClick Script", event: () => UndoManager.RunInBatch(() => DocUtils.makeCustomViewClicked(this.props.Document, undefined, "onClick"), "edit onClick"), icon: "edit" });
        !existingOnClick && cm.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });

        const funcs: ContextMenuProps[] = [];
        if (this.layoutDoc.onDragStart) {
            funcs.push({ description: "Drag an Alias", icon: "edit", event: () => this.Document.dragFactory && (this.layoutDoc.onDragStart = ScriptField.MakeFunction('getAlias(this.dragFactory)')) });
            funcs.push({ description: "Drag a Copy", icon: "edit", event: () => this.Document.dragFactory && (this.layoutDoc.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)')) });
            funcs.push({ description: "Drag Document", icon: "edit", event: () => this.layoutDoc.onDragStart = undefined });
            cm.addItem({ description: "OnDrag...", subitems: funcs, icon: "asterisk" });
        }

        const more = cm.findByDescription("More...");
        const moreItems = more && "subitems" in more ? more.subitems : [];
        if (!Doc.UserDoc().noviceMode) {
            moreItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });
            moreItems.push({ description: `${this.Document._chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document._chromeStatus = (this.Document._chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });

            if (Cast(Doc.GetProto(this.props.Document).data, listSpec(Doc))) {
                moreItems.push({ description: "Export to Google Photos Album", event: () => GooglePhotos.Export.CollectionToAlbum({ collection: this.props.Document }).then(console.log), icon: "caret-square-right" });
                moreItems.push({ description: "Tag Child Images via Google Photos", event: () => GooglePhotos.Query.TagChildImages(this.props.Document), icon: "caret-square-right" });
                moreItems.push({ description: "Write Back Link to Album", event: () => GooglePhotos.Transactions.AddTextEnrichment(this.props.Document), icon: "caret-square-right" });
            }
            moreItems.push({
                description: "Download document", icon: "download", event: async () => {
                    const response = await rp.get(Utils.CorsProxy("http://localhost:8983/solr/dash/select"), {
                        qs: { q: 'world', fq: 'NOT baseProto_b:true AND NOT deleted:true', start: '0', rows: '100', hl: true, 'hl.fl': '*' }
                    });
                    console.log(response ? JSON.parse(response) : undefined);
                }
                // const a = document.createElement("a");
                // const url = Utils.prepend(`/downloadId/${this.props.Document[Id]}`);
                // a.href = url;
                // a.download = `DocExport-${this.props.Document[Id]}.zip`;
                // a.click();
            });
        }
        moreItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
        moreItems.push({ description: "Copy ID", event: () => Utils.CopyText(Utils.prepend("/doc/" + this.props.Document[Id])), icon: "fingerprint" });
        moreItems.push({ description: "Delete", event: this.deleteClicked, icon: "trash" });
        moreItems.push({ description: "Share", event: () => SharingManager.Instance.open(this), icon: "external-link-alt" });
        !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
        cm.moveAfter(cm.findByDescription("More...")!, cm.findByDescription("OnClick...")!);

        const help = cm.findByDescription("Help...");
        const helpItems: ContextMenuProps[] = help && "subitems" in help ? help.subitems : [];
        helpItems.push({ description: "Text Shortcuts Ctrl+/", event: () => this.props.addDocTab(Docs.Create.PdfDocument("http://localhost:1050/assets/cheat-sheet.pdf", { _width: 300, _height: 300 }), "onRight"), icon: "keyboard" });
        helpItems.push({ description: "Show Fields ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), "onRight"), icon: "layer-group" });
        cm.addItem({ description: "Help...", subitems: helpItems, icon: "question" });

        const existingAcls = cm.findByDescription("Privacy...");
        const aclItems: ContextMenuProps[] = existingAcls && "subitems" in existingAcls ? existingAcls.subitems : [];
        aclItems.push({ description: "Make Add Only", event: () => this.setAcl("addOnly"), icon: "concierge-bell" });
        aclItems.push({ description: "Make Read Only", event: () => this.setAcl("readOnly"), icon: "concierge-bell" });
        aclItems.push({ description: "Make Private", event: () => this.setAcl("ownerOnly"), icon: "concierge-bell" });
        aclItems.push({ description: "Make Editable", event: () => this.setAcl("write"), icon: "concierge-bell" });
        aclItems.push({ description: "Test Private", event: () => this.testAcl("ownerOnly"), icon: "concierge-bell" });
        aclItems.push({ description: "Test Readonly", event: () => this.testAcl("readOnly"), icon: "concierge-bell" });
        !existingAcls && cm.addItem({ description: "Privacy...", subitems: aclItems, icon: "question" });

        // const recommender_subitems: ContextMenuProps[] = [];

        // recommender_subitems.push({
        //     description: "Internal recommendations",
        //     event: () => this.recommender(),
        //     icon: "brain"
        // });

        // const ext_recommender_subitems: ContextMenuProps[] = [];

        // ext_recommender_subitems.push({
        //     description: "arXiv",
        //     event: () => this.externalRecommendation("arxiv"),
        //     icon: "brain"
        // });
        // ext_recommender_subitems.push({
        //     description: "Bing",
        //     event: () => this.externalRecommendation("bing"),
        //     icon: "brain"
        // });

        // recommender_subitems.push({
        //     description: "External recommendations",
        //     subitems: ext_recommender_subitems,
        //     icon: "brain"
        // });


        //moreItems.push({ description: "Recommender System", subitems: recommender_subitems, icon: "brain" });
        //moreItems.push({ description: "Publish", event: () => DocUtils.Publish(this.props.Document, this.Document.title || "", this.props.addDocument, this.props.removeDocument), icon: "file" });
        //moreItems.push({ description: "Undo Debug Test", event: () => UndoManager.TraceOpenBatches(), icon: "exclamation" });

        // runInAction(() => {
        //     const setWriteMode = (mode: DocServer.WriteMode) => {
        //         DocServer.AclsMode = mode;
        //         const mode1 = mode;
        //         const mode2 = mode === DocServer.WriteMode.Default ? mode : DocServer.WriteMode.Playground;
        //         DocServer.setFieldWriteMode("x", mode1);
        //         DocServer.setFieldWriteMode("y", mode1);
        //         DocServer.setFieldWriteMode("_width", mode1);
        //         DocServer.setFieldWriteMode("_height", mode1);

        //         DocServer.setFieldWriteMode("_panX", mode2);
        //         DocServer.setFieldWriteMode("_panY", mode2);
        //         DocServer.setFieldWriteMode("scale", mode2);
        //         DocServer.setFieldWriteMode("_viewType", mode2);
        //     };
        //     const aclsMenu: ContextMenuProps[] = [];
        //     aclsMenu.push({ description: "Default (write/read all)", event: () => setWriteMode(DocServer.WriteMode.Default), icon: DocServer.AclsMode === DocServer.WriteMode.Default ? "check" : "exclamation" });
        //     aclsMenu.push({ description: "Playground (write own/no read)", event: () => setWriteMode(DocServer.WriteMode.Playground), icon: DocServer.AclsMode === DocServer.WriteMode.Playground ? "check" : "exclamation" });
        //     aclsMenu.push({ description: "Live Playground (write own/read others)", event: () => setWriteMode(DocServer.WriteMode.LivePlayground), icon: DocServer.AclsMode === DocServer.WriteMode.LivePlayground ? "check" : "exclamation" });
        //     aclsMenu.push({ description: "Live Readonly (no write/read others)", event: () => setWriteMode(DocServer.WriteMode.LiveReadonly), icon: DocServer.AclsMode === DocServer.WriteMode.LiveReadonly ? "check" : "exclamation" });
        //     cm.addItem({ description: "Collaboration ...", subitems: aclsMenu, icon: "share" });
        // });
        runInAction(() => {
            if (!this.topMost && !(e instanceof Touch)) {
                // DocumentViews should stop propagation of this event
                e.stopPropagation();
            }
            cm.displayMenu(e.pageX - 15, e.pageY - 15);
            !SelectionManager.IsSelected(this, true) && SelectionManager.SelectDoc(this, false);
        });
        const path = this.props.LibraryPath.reduce((p: string, d: Doc) => p + "/" + (Doc.AreProtosEqual(d, (Doc.UserDoc()["tabs-button-library"] as Doc).sourcePanel as Doc) ? "" : d.title), "");
        const item = ({
            description: `path: ${path}`, event: () => {
                if (this.props.LibraryPath !== emptyPath) {
                    this.props.LibraryPath.map(lp => Doc.GetProto(lp).treeViewOpen = lp.treeViewOpen = true);
                    Doc.linkFollowHighlight(this.props.Document);
                } else {
                    Doc.AddDocToList(Doc.GetProto(Doc.UserDoc().myCatalog as Doc), "data", this.props.Document[DataSym]);
                }
            }, icon: "check"
        });
        //cm.addItem(item);
    }

    recommender = async () => {
        if (!ClientRecommender.Instance) new ClientRecommender({ title: "Client Recommender" });
        const documents: Doc[] = [];
        const allDocs = await SearchUtil.GetAllDocs();
        // allDocs.forEach(doc => console.log(doc.title));
        // clears internal representation of documents as vectors
        ClientRecommender.Instance.reset_docs();
        //ClientRecommender.Instance.arxivrequest("electrons");
        await Promise.all(allDocs.map((doc: Doc) => {
            let isMainDoc: boolean = false;
            const dataDoc = Doc.GetProto(doc);
            if (doc.type === DocumentType.RTF) {
                if (dataDoc === Doc.GetProto(this.props.Document)) {
                    isMainDoc = true;
                }
                if (!documents.includes(dataDoc)) {
                    documents.push(dataDoc);
                    const extdoc = doc.data_ext as Doc;
                    return ClientRecommender.Instance.extractText(doc, extdoc ? extdoc : doc, true, "", isMainDoc);
                }
            }
            if (doc.type === DocumentType.IMG) {
                if (dataDoc === Doc.GetProto(this.props.Document)) {
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
        const recDocs: { preview: Doc, score: number }[] = [];
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
        this.props.addDocTab(recommendations, "onRight");

        // RecommendationsBox.Instance.displayRecommendations(e.pageX + 100, e.pageY);
    }

    @action
    externalRecommendation = async (api: string) => {
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
        this.props.addDocTab(Docs.Create.SchemaDocument(headers, bodies, { title: `Showing External Recommendations for "${StrCast(doc.title)}"` }), "onRight");
        this._showKPQuery = true;
        this._queries = kps.toString();
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
    rootSelected = (outsideReaction?: boolean) => {
        return this.isSelected(outsideReaction) || (this.props.Document.rootDocument && this.props.rootSelected?.(outsideReaction)) || false;
    }
    childScaling = () => (this.layoutDoc._fitWidth ? this.props.PanelWidth() / this.nativeWidth : this.props.ContentScaling());
    @computed get contents() {
        TraceMobx();
        return (<div style={{ position: "absolute", width: "100%", height: "100%" }}>
            <DocumentContentsView key={1}
                docFilters={this.props.docFilters}
                ContainingCollectionView={this.props.ContainingCollectionView}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                NativeWidth={this.NativeWidth}
                NativeHeight={this.NativeHeight}
                Document={this.props.Document}
                DataDoc={this.props.DataDoc}
                LayoutTemplateString={this.props.LayoutTemplateString}
                LayoutTemplate={this.props.LayoutTemplate}
                makeLink={this.makeLink}
                rootSelected={this.rootSelected}
                backgroundHalo={this.props.backgroundHalo}
                dontRegisterView={this.props.dontRegisterView}
                fitToBox={this.props.fitToBox}
                LibraryPath={this.props.LibraryPath}
                addDocument={this.props.addDocument}
                removeDocument={this.props.removeDocument}
                moveDocument={this.props.moveDocument}
                ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                renderDepth={this.props.renderDepth}
                PanelWidth={this.props.PanelWidth}
                PanelHeight={this.props.PanelHeight}
                ignoreAutoHeight={this.props.ignoreAutoHeight}
                focus={this.props.focus}
                parentActive={this.props.parentActive}
                whenActiveChanged={this.props.whenActiveChanged}
                bringToFront={this.props.bringToFront}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                backgroundColor={this.props.backgroundColor}
                ContentScaling={this.childScaling}
                ChromeHeight={this.chromeHeight}
                isSelected={this.isSelected}
                select={this.select}
                onClick={this.onClickHandler}
                layoutKey={this.finalLayoutKey} />
            {this.layoutDoc.showLinks ? this.anchors : (null)}
            {this.props.forcedBackgroundColor?.(this.Document) === "transparent" || this.props.dontRegisterView ? (null) : <DocumentLinksButton View={this} Offset={[-15, 0]} />}
        </div>
        );
    }

    // used to decide whether a link anchor view should be created or not.
    // if it's a tempoarl link (currently just for Audio), then the audioBox will display the anchor and we don't want to display it here.
    // would be good to generalize this some way.
    isNonTemporalLink = (linkDoc: Doc) => {
        const anchor = Cast(Doc.AreProtosEqual(this.props.Document, Cast(linkDoc.anchor1, Doc) as Doc) ? linkDoc.anchor1 : linkDoc.anchor2, Doc) as Doc;
        const ept = Doc.AreProtosEqual(this.props.Document, Cast(linkDoc.anchor1, Doc) as Doc) ? linkDoc.anchor1_timecode : linkDoc.anchor2_timecode;
        return anchor.type === DocumentType.AUDIO && NumCast(ept) ? false : true;
    }


    @observable _link: Opt<Doc>;  // see DocumentButtonBar for explanation of how this works
    makeLink = () => this._link; // pass the link placeholde to child views so they can react to make a specialized anchor.  This is essentially a function call to the descendants since the value of the _link variable will immediately get set back to undefined.

    @undoBatch
    hideLinkAnchor = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg: boolean, doc) => flg && (doc.hidden = true), true)
    anchorPanelWidth = () => this.props.PanelWidth() || 1;
    anchorPanelHeight = () => this.props.PanelHeight() || 1;
    @computed get anchors() {
        TraceMobx();
        return (this.props.treeViewDoc && this.props.LayoutTemplateString) || // render nothing for: tree view anchor dots
            this.layoutDoc.presBox ||  // presentationbox nodes
            this.props.dontRegisterView ? (null) : // view that are not registered
            DocUtils.FilterDocs(DocListCast(this.Document.links), this.props.docFilters(), []).filter(d => !d.hidden && this.isNonTemporalLink).map((d, i) =>
                <DocumentView {...this.props} key={i + 1}
                    Document={d}
                    ContainingCollectionView={this.props.ContainingCollectionView}
                    ContainingCollectionDoc={this.props.Document} // bcz: hack this.props.Document is not a collection  Need a better prop for passing the containing document to the LinkAnchorBox
                    PanelWidth={this.anchorPanelWidth}
                    PanelHeight={this.anchorPanelHeight}
                    ContentScaling={returnOne}
                    dontRegisterView={false}
                    forcedBackgroundColor={returnTransparent}
                    removeDocument={this.hideLinkAnchor}
                    pointerEvents={false}
                    LayoutTemplate={undefined}
                    LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(d, this.props.Document)}`)}
                />);
    }
    @computed get innards() {
        TraceMobx();
        if (this.props.treeViewDoc && !this.props.LayoutTemplateString) {  // this happens when the document is a tree view label (but not an anchor dot)
            return <div className="documentView-treeView" style={{ maxWidth: this.props.PanelWidth() || undefined }}>
                {StrCast(this.props.Document.title)}
                {this.anchors}
            </div>;
        }

        const showTitle = StrCast(this.layoutDoc._showTitle);
        const showTitleHover = StrCast(this.layoutDoc._showTitleHover);
        const showCaption = StrCast(this.layoutDoc._showCaption);
        const showTextTitle = showTitle && (StrCast(this.layoutDoc.layout).indexOf("PresBox") !== -1 || StrCast(this.layoutDoc.layout).indexOf("FormattedTextBox") !== -1) ? showTitle : undefined;
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper" style={{ backgroundColor: StrCast(this.layoutDoc["caption-backgroundColor"]), color: StrCast(this.layoutDoc["caption-color"]) }}>
                <DocumentContentsView {...OmitKeys(this.props, ['children']).omit}
                    hideOnLeave={true}
                    LayoutTemplateString={`<FormattedTextBox {...props} fieldKey={'${showCaption}'}/>`}
                    ContentScaling={returnOne}
                    ChromeHeight={this.chromeHeight}
                    isSelected={this.isSelected}
                    select={this.select}
                    onClick={this.onClickHandler}
                    layoutKey={this.finalLayoutKey} />
            </div>);
        const titleView = (!showTitle ? (null) :
            <div className={`documentView-titleWrapper${showTitleHover ? "-hover" : ""}`} key="title" style={{
                position: showTextTitle ? "relative" : "absolute",
                pointerEvents: this.onClickHandler || this.Document.ignoreClick ? "none" : undefined,
            }}>
                <EditableView ref={this._titleRef}
                    contents={(this.props.DataDoc || this.props.Document)[showTitle]?.toString()}
                    display={"block"} height={72} fontSize={12}
                    GetValue={() => (this.props.DataDoc || this.props.Document)[showTitle]?.toString()}
                    SetValue={undoBatch((value: string) => (Doc.GetProto(this.props.DataDoc || this.props.Document)[showTitle] = value) ? true : true)}
                />
            </div>);
        return !showTitle && !showCaption ?
            this.contents :
            <div className="documentView-styleWrapper" >
                {this.Document.type !== DocumentType.RTF ? <> {this.contents} {titleView} </> : <> {titleView} {this.contents} </>}
                {captionView}
            </div>;
    }
    @computed get ignorePointerEvents() {
        return this.props.pointerEvents === false ||
            (this.Document.isBackground && !this.isSelected() && !SnappingManager.GetIsDragging()) ||
            (this.Document.type === DocumentType.INK && Doc.GetSelectedTool() !== InkTool.None);
    }
    @undoBatch
    @action
    setCustomView = (custom: boolean, layout: string): void => {
        Doc.setNativeView(this.props.Document);
        if (custom) {
            DocUtils.makeCustomViewClicked(this.props.Document, Docs.Create.StackingDocument, layout, undefined);
        }
    }
    @observable _animateScalingTo = 0;
    switchViews = action((custom: boolean, view: string) => {
        this._animateScalingTo = 0.1;  // shrink doc
        setTimeout(action(() => {
            this.setCustomView(custom, view);
            this._animateScalingTo = 1; // expand it
            setTimeout(action(() => this._animateScalingTo = 0), 400);
        }), 400);
    });

    renderLock() {
        return (this.Document.isBackground !== undefined || this.isSelected(false)) &&
            ((this.Document.type === DocumentType.COL && this.Document._viewType !== CollectionViewType.Pile) || this.Document.type === DocumentType.IMG) &&
            this.props.renderDepth > 0 && !this.props.treeViewDoc ?
            <div className="documentView-lock" onClick={() => this.toggleBackground(true)}>
                <FontAwesomeIcon icon={this.Document.isBackground ? "unlock" : "lock"} style={{ color: this.Document.isBackground ? "red" : undefined }} size="lg" />
            </div>
            : (null);
    }

    render() {
        if (!(this.props.Document instanceof Doc)) return (null);
        if (this.props.Document[AclSym] && this.props.Document[AclSym] === AclPrivate) return (null);
        if (this.props.Document.hidden) return (null);
        const backgroundColor = Doc.UserDoc().renderStyle === "comic" ? undefined : this.props.forcedBackgroundColor?.(this.Document) || StrCast(this.layoutDoc._backgroundColor) || StrCast(this.layoutDoc.backgroundColor) || StrCast(this.Document.backgroundColor) || this.props.backgroundColor?.(this.Document);
        const opacity = Cast(this.layoutDoc._opacity, "number", Cast(this.layoutDoc.opacity, "number", Cast(this.Document.opacity, "number", null)));
        const finalOpacity = this.props.opacity ? this.props.opacity() : opacity;
        const finalColor = this.layoutDoc.type === DocumentType.FONTICON || this.layoutDoc._viewType === CollectionViewType.Linear ? undefined : backgroundColor;
        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.layoutDoc.borderRounding;
        const localScale = fullDegree;

        const highlightColors = Cast(Doc.UserDoc().activeWorkspace, Doc, null)?.darkScheme ?
            ["transparent", "#65350c", "#65350c", "yellow", "magenta", "cyan", "orange"] :
            ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"];
        const highlightStyles = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"];
        let highlighting = fullDegree && this.layoutDoc.type !== DocumentType.FONTICON && this.layoutDoc._viewType !== CollectionViewType.Linear && this.props.Document.type !== DocumentType.INK;
        highlighting = highlighting && this.props.focus !== emptyFunction;  // bcz: hack to turn off highlighting onsidebar panel documents.  need to flag a document as not highlightable in a more direct way
        return <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
            id={this.props.Document[Id]}
            ref={this._mainCont} onKeyDown={this.onKeyDown}
            onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
            onPointerEnter={action(() => { Doc.BrushDoc(this.props.Document); })}
            onPointerLeave={action((e: React.PointerEvent<HTMLDivElement>) => {
                let entered = false;
                const target = document.elementFromPoint(e.nativeEvent.x, e.nativeEvent.y);
                for (let child: any = target; child; child = child?.parentElement) {
                    if (child === this.ContentDiv) {
                        entered = true;
                    }
                }
                // if (this.props.Document !== DocumentLinksButton.StartLink?.Document) {
                !entered && Doc.UnBrushDoc(this.props.Document);
                //}

            })}
            style={{
                transformOrigin: this._animateScalingTo ? "center center" : undefined,
                transform: this._animateScalingTo ? `scale(${this._animateScalingTo})` : undefined,
                transition: !this._animateScalingTo ? StrCast(this.Document.dataTransition) : this._animateScalingTo < 1 ? "transform 0.5s ease-in" : "transform 0.5s ease-out",
                pointerEvents: this.ignorePointerEvents ? "none" : undefined,
                color: StrCast(this.layoutDoc.color, "inherit"),
                outline: highlighting && !borderRounding ? `${highlightColors[fullDegree]} ${highlightStyles[fullDegree]} ${localScale}px` : "solid 0px",
                border: highlighting && borderRounding ? `${highlightStyles[fullDegree]} ${highlightColors[fullDegree]} ${localScale}px` : undefined,
                boxShadow: this.Document.isLinkButton && !this.props.dontRegisterView && this.props.forcedBackgroundColor?.(this.Document) !== "transparent" ?
                    StrCast(this.props.Document._linkButtonShadow, "lightblue 0em 0em 1em") :
                    this.props.Document.isTemplateForField ? "black 0.2vw 0.2vw 0.8vw" :
                        undefined,
                background: finalColor,
                opacity: finalOpacity,
                fontFamily: StrCast(this.Document._fontFamily, "inherit"),
                fontSize: Cast(this.Document._fontSize, "number", null)
            }}>
            {this.onClickHandler && this.props.ContainingCollectionView?.props.Document._viewType === CollectionViewType.Time ? <>
                {this.innards}
                <div className="documentView-contentBlocker" />
            </> :
                this.innards}
            {this.renderLock()}
        </div>;
        { this._showKPQuery ? <KeyphraseQueryView keyphrases={this._queries}></KeyphraseQueryView> : undefined; }
    }
}

Scripting.addGlobal(function toggleDetail(doc: any, layoutKey: string, otherKey: string = "layout") {
    const dv = DocumentManager.Instance.getDocumentView(doc);
    if (dv?.props.Document.layoutKey === layoutKey) dv?.switchViews(otherKey !== "layout", otherKey.replace("layout_", ""));
    else dv?.switchViews(true, layoutKey.replace("layout_", ""));
});
