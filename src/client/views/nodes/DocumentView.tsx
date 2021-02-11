import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { AclAdmin, AclEdit, AclPrivate, DataSym, Doc, DocListCast, Field, Opt, StrListCast, HeightSym } from "../../../fields/Doc";
import { Document } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { InkTool } from '../../../fields/InkField';
import { listSpec } from "../../../fields/Schema";
import { ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { GetEffectiveAcl, TraceMobx } from '../../../fields/util';
import { MobileInterface } from '../../../mobile/MobileInterface';
import { emptyFunction, hasDescendantTarget, OmitKeys, returnFalse, returnVal, Utils } from "../../../Utils";
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { Docs, DocUtils } from "../../documents/Documents";
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, dropActionType } from "../../util/DragManager";
import { InteractionUtils } from '../../util/InteractionUtils';
import { LinkManager } from '../../util/LinkManager';
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from "../../util/SelectionManager";
import { SharingManager } from '../../util/SharingManager';
import { SnappingManager } from '../../util/SnappingManager';
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionView, CollectionViewType } from '../collections/CollectionView';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { DocComponent } from "../DocComponent";
import { EditableView } from '../EditableView';
import { InkingStroke } from "../InkingStroke";
import { StyleLayers, StyleProp } from "../StyleProvider";
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { DocumentContentsView } from "./DocumentContentsView";
import { DocumentLinksButton } from './DocumentLinksButton';
import "./DocumentView.scss";
import { FieldViewProps } from "./FieldView";
import { LinkAnchorBox } from './LinkAnchorBox';
import { PresBox } from './PresBox';
import { RadialMenu } from './RadialMenu';
import React = require("react");
import { LinkDocPreview } from "./LinkDocPreview";

export type DocAfterFocusFunc = (notFocused: boolean) => Promise<boolean>;
export type DocFocusFunc = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc) => void;
export type StyleProviderFunc = (doc: Opt<Doc>, props: Opt<DocumentViewProps | FieldViewProps>, property: string) => any;
export interface DocComponentView {
    getAnchor: () => Doc;
    scrollFocus?: (doc: Doc, smooth: boolean, afterFocus?: DocAfterFocusFunc) => void;
    back?: () => boolean;
    forward?: () => boolean;
    url?: () => string;
    submitURL?: (url: string) => boolean;
}
export interface DocumentViewSharedProps {
    renderDepth: number;
    Document: Doc;
    DataDoc?: Doc;
    fitContentsToDoc?: boolean; // used by freeformview to fit its contents to its panel. corresponds to _fitToBox property on a Document
    ContainingCollectionView: Opt<CollectionView>;
    ContainingCollectionDoc: Opt<Doc>;
    setContentView?: (view: DocComponentView) => any;
    CollectionFreeFormDocumentView?: () => CollectionFreeFormDocumentView;
    PanelWidth: () => number;
    PanelHeight: () => number;
    docViewPath: () => DocumentView[];
    layerProvider: undefined | ((doc: Doc, assign?: boolean) => boolean);
    styleProvider: Opt<StyleProviderFunc>;
    focus: DocFocusFunc;
    docFilters: () => string[];
    docRangeFilters: () => string[];
    searchFilterDocs: () => Doc[];
    contentsActive?: (setActive: () => boolean) => void;
    parentActive: (outsideReaction: boolean) => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    rootSelected: (outsideReaction?: boolean) => boolean; // whether the root of a template has been selected
    addDocTab: (doc: Doc, where: string) => boolean;
    addDocument?: (doc: Doc | Doc[]) => boolean;
    removeDocument?: (doc: Doc | Doc[]) => boolean;
    moveDocument?: (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    pinToPres: (document: Doc) => void;
    ScreenToLocalTransform: () => Transform;
    bringToFront: (doc: Doc, sendToBack?: boolean) => void;
    dropAction?: dropActionType;
    dontRegisterView?: boolean;
    ignoreAutoHeight?: boolean;
    cantBrush?: boolean; // whether the document doesn't show brush highlighting
    pointerEvents?: string;
    scriptContext?: any; // can be assigned anything and will be passed as 'scriptContext' to any OnClick script that executes on this document
}
export interface DocumentViewProps extends DocumentViewSharedProps {
    // properties specific to DocumentViews but not to FieldView
    freezeDimensions?: boolean;
    hideResizeHandles?: boolean; // whether to suppress DocumentDecorations when this document is selected 
    hideTitle?: boolean;  // forces suppression of title. e.g, treeView document labels suppress titles in case they are globally active via settings
    treeViewDoc?: Doc;
    contentPointerEvents?: string; // pointer events allowed for content of a document view.  eg. set to "none" in menuSidebar for sharedDocs so that you can select a document, but not interact with its contents
    radialMenu?: String[];
    LayoutTemplateString?: string;
    dontCenter?: "x" | "y" | "xy";
    ContentScaling?: () => number; // scaling the DocumentView does to transform its contents into its panel & needed by ScreenToLocal
    NativeWidth?: () => number;
    NativeHeight?: () => number;
    LayoutTemplate?: () => Opt<Doc>;
    contextMenuItems?: () => { script: ScriptField, label: string }[];
    onClick?: () => ScriptField;
    onDoubleClick?: () => ScriptField;
    onPointerDown?: () => ScriptField;
    onPointerUp?: () => ScriptField;
}

export interface DocumentViewInternalProps extends DocumentViewProps {
    NativeWidth: () => number;
    NativeHeight: () => number;
    isSelected: (outsideReaction?: boolean) => boolean;
    select: (ctrlPressed: boolean) => void;
    DocumentView: () => DocumentView;
    viewPath: () => DocumentView[];
}

@observer
export class DocumentViewInternal extends DocComponent<DocumentViewInternalProps, Document>(Document) {
    @observable _animateScalingTo = 0;
    private _downX: number = 0;
    private _downY: number = 0;
    private _firstX: number = -1;
    private _firstY: number = -1;
    private _lastTap: number = 0;
    private _doubleTap = false;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _titleRef = React.createRef<EditableView>();
    private _timeout: NodeJS.Timeout | undefined;
    private _dropDisposer?: DragManager.DragDropDisposer;
    private _holdDisposer?: InteractionUtils.MultiTouchEventDisposer;
    _componentView: Opt<DocComponentView>;
    protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    private get topMost() { return this.props.renderDepth === 0; }
    private get active() { return this.props.isSelected(true) || this.props.parentActive(true); }
    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    public get LayoutFieldKey() { return Doc.LayoutFieldKey(this.layoutDoc); }
    @computed get ShowTitle() { return this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.ShowTitle) as (Opt<string>); }
    @computed get ContentScale() { return this.props.ContentScaling?.() || 1; }
    @computed get hidden() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Hidden); }
    @computed get opacity() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Opacity); }
    @computed get boxShadow() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BoxShadow); }
    @computed get borderRounding() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BorderRounding); }
    @computed get hideLinkButton() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.HideLinkButton + (this.props.isSelected() ? ":selected" : "")); }
    @computed get widgetDecorations() { return this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.Decorations + (this.props.isSelected() ? ":selected" : "")); }
    @computed get backgroundColor() { return this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor); }
    @computed get docContents() { return this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.DocContents); }
    @computed get headerMargin() { return this.props?.styleProvider?.(this.layoutDoc, this.props, StyleProp.HeaderMargin) || 0; }
    @computed get pointerEvents() { return this.props.styleProvider?.(this.Document, this.props, StyleProp.PointerEvents + (this.props.isSelected() ? ":selected" : "")); }
    @computed get finalLayoutKey() { return StrCast(this.Document.layoutKey, "layout"); }
    @computed get nativeWidth() { return this.props.NativeWidth(); }
    @computed get nativeHeight() { return this.props.NativeHeight(); }
    @computed get onClickHandler() { return this.props.onClick?.() ?? Cast(this.Document.onClick, ScriptField, Cast(this.layoutDoc.onClick, ScriptField, null)); }
    @computed get onDoubleClickHandler() { return this.props.onDoubleClick?.() ?? (Cast(this.layoutDoc.onDoubleClick, ScriptField, null) ?? this.Document.onDoubleClick); }
    @computed get onPointerDownHandler() { return this.props.onPointerDown?.() ?? ScriptCast(this.Document.onPointerDown); }
    @computed get onPointerUpHandler() { return this.props.onPointerUp?.() ?? ScriptCast(this.Document.onPointerUp); }

    componentWillUnmount() { this.cleanupHandlers(true); }
    componentDidMount() { this.setupHandlers(); }
    componentDidUpdate() { this.setupHandlers(); }
    setupHandlers() {
        this.cleanupHandlers(false);
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this), this.props.Document);
            this._multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this));
            this._holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this));
        }
    }
    cleanupHandlers(unbrush: boolean) {
        this._dropDisposer?.();
        this._multiTouchDisposer?.();
        this._holdDisposer?.();
        unbrush && Doc.UnBrushDoc(this.props.Document);
    }

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
            this.onContextMenu(undefined, me.touches[0].pageX, me.touches[0].pageY);
        }
    }

    handle2PointersDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        if (!e.nativeEvent.cancelBubble && !this.props.isSelected()) {
            e.stopPropagation();
            e.preventDefault();

            this.removeMoveListeners();
            this.addMoveListeners();
            this.removeEndListeners();
            this.addEndListeners();
        }
    }

    handle1PointerDown = (e: React.TouchEvent, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>) => {
        SelectionManager.DeselectAll();
        if (this.Document.onPointerDown) return;
        const touch = me.touchEvent.changedTouches.item(0);
        if (touch) {
            this._downX = touch.clientX;
            this._downY = touch.clientY;
            if (!e.nativeEvent.cancelBubble) {
                if ((this.active || this.layoutDoc.onDragStart || this.onClickHandler) && !e.ctrlKey && !this.layoutDoc.lockedPosition && !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) e.stopPropagation();
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
        else if (!e.cancelBubble && (this.props.isSelected(true) || this.props.parentActive(true) || this.layoutDoc.onDragStart || this.onClickHandler) && !this.layoutDoc.lockedPosition && !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
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

    @action
    handle2PointersMove = (e: TouchEvent, me: InteractionUtils.MultiTouchEvent<TouchEvent>) => {
        const myTouches = InteractionUtils.GetMyTargetTouches(me, this.prevPoints, true);
        const pt1 = myTouches[0];
        const pt2 = myTouches[1];
        const oldPoint1 = this.prevPoints.get(pt1.identifier);
        const oldPoint2 = this.prevPoints.get(pt2.identifier);
        const pinching = InteractionUtils.Pinning(pt1, pt2, oldPoint1!, oldPoint2!);
        if (pinching !== 0 && oldPoint1 && oldPoint2) {
            const dW = (Math.abs(pt1.clientX - pt2.clientX) - Math.abs(oldPoint1.clientX - oldPoint2.clientX));
            const dH = (Math.abs(pt1.clientY - pt2.clientY) - Math.abs(oldPoint1.clientY - oldPoint2.clientY));
            const dX = -1 * Math.sign(dW);
            const dY = -1 * Math.sign(dH);

            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = Document(this.props.Document);
                const layoutDoc = Document(Doc.Layout(this.props.Document));
                let nwidth = Doc.NativeWidth(layoutDoc);
                let nheight = Doc.NativeHeight(layoutDoc);
                const width = (layoutDoc._width || 0);
                const height = (layoutDoc._height || (nheight / nwidth * width));
                const scale = this.props.ScreenToLocalTransform().Scale * this.ContentScale;
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = e.ctrlKey || (nwidth && nheight);
                if (fixedAspect && (!nwidth || !nheight)) {
                    Doc.SetNativeWidth(layoutDoc, nwidth = layoutDoc._width || 0);
                    Doc.SetNativeHeight(layoutDoc, nheight = layoutDoc._height || 0);
                }
                if (nwidth > 0 && nheight > 0) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        if (!fixedAspect) {
                            Doc.SetNativeWidth(layoutDoc, actualdW / (layoutDoc._width || 1) * Doc.NativeWidth(layoutDoc));
                        }
                        layoutDoc._width = actualdW;
                        if (fixedAspect && !layoutDoc._fitWidth) layoutDoc._height = nheight / nwidth * layoutDoc._width;
                        else layoutDoc._height = actualdH;
                    }
                    else {
                        if (!fixedAspect) {
                            Doc.SetNativeHeight(layoutDoc, actualdH / (layoutDoc._height || 1) * Doc.NativeHeight(doc));
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

    @action
    onRadialMenu = (e: Event, me: InteractionUtils.MultiTouchEvent<React.TouchEvent>): void => {
        const pt = me.touchEvent.touches[me.touchEvent.touches.length - 1];
        RadialMenu.Instance.openMenu(pt.pageX - 15, pt.pageY - 15);

        // RadialMenu.Instance.addItem({ description: "Open Fields", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), "add:right"), icon: "map-pin", selected: -1 });
        const effectiveAcl = GetEffectiveAcl(this.props.Document[DataSym]);
        (effectiveAcl === AclEdit || effectiveAcl === AclAdmin) && RadialMenu.Instance.addItem({ description: "Delete", event: () => { this.props.ContainingCollectionView?.removeDocument(this.props.Document), RadialMenu.Instance.closeMenu(); }, icon: "external-link-square-alt", selected: -1 });
        // RadialMenu.Instance.addItem({ description: "Open in a new tab", event: () => this.props.addDocTab(this.props.Document, "add:right"), icon: "trash", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Pin", event: () => this.props.pinToPres(this.props.Document), icon: "map-pin", selected: -1 });
        RadialMenu.Instance.addItem({ description: "Open", event: () => MobileInterface.Instance.handleClick(this.props.Document), icon: "trash", selected: -1 });

        SelectionManager.DeselectAll();
    }

    startDragging(x: number, y: number, dropAction: dropActionType) {
        if (this._mainCont.current) {
            const ffview = this.props.CollectionFreeFormDocumentView;
            ffview && runInAction(() => (ffview().props.CollectionFreeFormView.ChildDrag = this.props.DocumentView()));
            const dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.ContentScale).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.ContentScale).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.treeViewDoc = this.props.treeViewDoc;
            dragData.removeDocument = this.props.removeDocument;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, { hideSource: !dropAction && !this.layoutDoc.onDragStart },
                () => setTimeout(action(() => ffview && (ffview().props.CollectionFreeFormView.ChildDrag = undefined)))); // this needs to happen after the drop event is processed.
        }
    }

    onKeyDown = (e: React.KeyboardEvent) => {
        if (e.altKey && !e.nativeEvent.cancelBubble) {
            e.stopPropagation();
            e.preventDefault();
            if (e.key === "†" || e.key === "t") {
                if (!StrCast(this.layoutDoc._showTitle)) this.layoutDoc._showTitle = "title";
                if (!this._titleRef.current) setTimeout(() => this._titleRef.current?.setIsFocused(true), 0);
                else if (!this._titleRef.current.setIsFocused(true)) { // if focus didn't change, focus on interior text...
                    this._titleRef.current?.setIsFocused(false);
                    const any = (this._mainCont.current?.getElementsByClassName("ProseMirror")?.[0] as any);
                    any.keeplocation = true;
                    any?.focus();
                }
            }
        }
    }

    focus = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc) => {
        if (this._componentView?.scrollFocus) {
            return this._componentView?.scrollFocus?.(doc, !LinkDocPreview.LinkInfo, afterFocus); // bcz: smooth parameter should really be passed into focus() instead of inferred here
        }
        return this.props.focus(doc, willZoom, scale, afterFocus);
    }
    onClick = action((e: React.MouseEvent | React.PointerEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick && this.props.renderDepth >= 0 &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            let stopPropagate = true;
            let preventDefault = true;
            !StrListCast(this.props.Document.layers).includes(StyleLayers.Background) && (this.rootDoc._raiseWhenDragged === undefined ? Doc.UserDoc()._raiseWhenDragged : this.rootDoc._raiseWhenDragged) && this.props.bringToFront(this.rootDoc);
            if (this._doubleTap && ((this.props.renderDepth && this.props.Document.type !== DocumentType.FONTICON) || this.onDoubleClickHandler)) {// && !this.onClickHandler?.script) { // disable double-click to show full screen for things that have an on click behavior since clicking them twice can be misinterpreted as a double click
                if (this._timeout) {
                    clearTimeout(this._timeout);
                    this._timeout = undefined;
                }
                if (!(e.nativeEvent as any).formattedHandled) {
                    if (this.onDoubleClickHandler?.script && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) { // bcz: hack? don't execute script if you're clicking on a scripting box itself
                        const func = () => this.onDoubleClickHandler.script.run({
                            this: this.layoutDoc,
                            self: this.rootDoc,
                            scriptContext: this.props.scriptContext,
                            thisContainer: this.props.ContainingCollectionDoc,
                            documentView: this.props.DocumentView(),
                            clientX: e.clientX,
                            clientY: e.clientY,
                            shiftKey: e.shiftKey
                        }, console.log);
                        UndoManager.RunInBatch(() => func().result?.select === true ? this.props.select(false) : "", "on double click");
                    } else if (!Doc.IsSystem(this.props.Document)) {
                        if (this.props.Document.type !== DocumentType.LABEL) {
                            UndoManager.RunInBatch(() => {
                                const fullScreenDoc = Cast(this.props.Document._fullScreenView, Doc, null) || this.props.Document;
                                this.props.addDocTab(fullScreenDoc, "lightbox");
                            }, "double tap");
                            SelectionManager.DeselectAll();
                        }
                        Doc.UnBrushDoc(this.props.Document);
                    }
                }
            } else if (this.onClickHandler?.script && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) { // bcz: hack? don't execute script if you're clicking on a scripting box itself
                const shiftKey = e.shiftKey;
                const clientX = e.clientX;
                const clientY = e.clientY;
                const func = () => this.onClickHandler.script.run({
                    this: this.layoutDoc,
                    self: this.rootDoc,
                    scriptContext: this.props.scriptContext,
                    thisContainer: this.props.ContainingCollectionDoc,
                    documentView: this.props.DocumentView(),
                    clientX: clientX,
                    clientY: clientY,
                    shiftKey
                }, console.log);
                const clickFunc = () => {
                    if (!Doc.AreProtosEqual(this.props.Document, Doc.UserDoc()["dockedBtn-undo"] as Doc) &&
                        !Doc.AreProtosEqual(this.props.Document, Doc.UserDoc()["dockedBtn-redo"] as Doc) &&
                        !this.onClickHandler.script.originalScript.includes("selectMainMenu")) {
                        UndoManager.RunInBatch(() => func().result?.select === true ? this.props.select(false) : "", "on click");
                    } else func();
                };
                if (this.onDoubleClickHandler) {
                    this._timeout = setTimeout(() => { this._timeout = undefined; clickFunc(); }, 350);
                } else clickFunc();
            } else if (this.Document["onClick-rawScript"] && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) {// bcz: hack? don't edit a script if you're clicking on a scripting box itself
                this.props.addDocTab(DocUtils.makeCustomViewClicked(Doc.MakeAlias(this.props.Document), undefined, "onClick"), "add:right");
            } else if (this.allLinks && this.Document.isLinkButton && !e.shiftKey && !e.ctrlKey) {
                this.allLinks.length && LinkManager.FollowLink(undefined, this.props.Document, this.props, e.altKey);
            } else {
                if ((this.layoutDoc.onDragStart || this.props.Document.rootDocument) && !(e.ctrlKey || e.button > 0)) {  // onDragStart implies a button doc that we don't want to select when clicking.   RootDocument & isTemplaetForField implies we're clicking on part of a template instance and we want to select the whole template, not the part
                    stopPropagate = false; // don't stop propagation for field templates -- want the selection to propagate up to the root document of the template
                } else {
                    this.props.select(e.ctrlKey || e.shiftKey);
                }
                preventDefault = false;
            }
            stopPropagate && e.stopPropagation();
            preventDefault && e.preventDefault();
        }
    });

    onPointerDown = (e: React.PointerEvent): void => {
        // continue if the event hasn't been canceled AND we are using a mouse or this has an onClick or onDragStart function (meaning it is a button document)
        if (!(InteractionUtils.IsType(e, InteractionUtils.MOUSETYPE) || Doc.GetSelectedTool() === InkTool.Highlighter || Doc.GetSelectedTool() === InkTool.Pen)) {
            if (!InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
                e.stopPropagation();
                if (SelectionManager.IsSelected(this.props.DocumentView(), true) && this.props.Document._viewType !== CollectionViewType.Docking) e.preventDefault(); // goldenlayout needs to be able to move its tabs, so can't preventDefault for it
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
                !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
                e.stopPropagation();
                if (SelectionManager.IsSelected(this.props.DocumentView(), true) && this.layoutDoc._viewType !== CollectionViewType.Docking) e.preventDefault(); // goldenlayout needs to be able to move its tabs, so can't preventDefault for it
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
        else if (!e.cancelBubble && (this.props.isSelected(true) || this.props.parentActive(true) || this.layoutDoc.onDragStart) && !this.layoutDoc.lockedPosition && !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
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
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);

        if (this.onPointerUpHandler?.script && !InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
            this.onPointerUpHandler.script.run({ self: this.rootDoc, this: this.layoutDoc }, console.log);
        } else {
            this._doubleTap = (Date.now() - this._lastTap < 300 && e.button === 0 && Math.abs(e.clientX - this._downX) < 2 && Math.abs(e.clientY - this._downY) < 2);
            this._lastTap = Date.now();
        }
    }

    @undoBatch @action
    toggleFollowLink = (location: Opt<string>, zoom: boolean, setPushpin: boolean): void => {
        this.Document.ignoreClick = false;
        this.Document.isLinkButton = !this.Document.isLinkButton;
        setPushpin && (this.Document.isPushpin = this.Document.isLinkButton);
        if (this.Document.isLinkButton && !this.onClickHandler) {
            this.Document.followLinkZoom = zoom;
            this.Document.followLinkLocation = location;
        } else {
            this.Document.onClick = this.layoutDoc.onClick = undefined;
        }
    }
    @undoBatch @action
    toggleTargetOnClick = (): void => {
        this.Document.ignoreClick = false;
        this.Document.isLinkButton = true;
        this.Document.isPushpin = true;
    }
    @undoBatch @action
    followLinkOnClick = (location: Opt<string>, zoom: boolean,): void => {
        this.Document.ignoreClick = false;
        this.Document.isLinkButton = true;
        this.Document.isPushpin = false;
        this.Document.followLinkZoom = zoom;
        this.Document.followLinkLocation = location;
    }
    @undoBatch @action
    selectOnClick = (): void => {
        this.Document.ignoreClick = false;
        this.Document.isLinkButton = false;
        this.Document.isPushpin = false;
        this.Document.onClick = this.layoutDoc.onClick = undefined;
    }
    @undoBatch
    noOnClick = (): void => {
        this.Document.ignoreClick = false;
        this.Document.isLinkButton = false;
    }

    @undoBatch deleteClicked = () => this.props.removeDocument?.(this.props.Document);
    @undoBatch toggleDetail = () => this.Document.onClick = ScriptField.MakeScript(`toggleDetail(self, "${this.Document.layoutKey}")`);
    @undoBatch toggleLockPosition = () => this.Document.lockedPosition = this.Document.lockedPosition ? undefined : true;

    @undoBatch @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (this.props.dontRegisterView || this.props.LayoutTemplateString?.includes(LinkAnchorBox.name)) return;
        if (this.props.Document === CurrentUserUtils.ActiveDashboard) {
            alert((e.target as any)?.closest?.("*.lm_content") ?
                "You can't perform this move most likely because you don't have permission to modify the destination." :
                "linking to document tabs not yet supported.  Drop link on document content.");
            return;
        }
        if (de.complete.annoDragData) de.complete.annoDragData.annotationDocument = de.complete.annoDragData.annotationDocCreator();
        const linkSource = de.complete.annoDragData ? de.complete.annoDragData.annotationDocument : de.complete.linkDragData ? de.complete.linkDragData.linkSourceDocument : undefined;
        if (linkSource && linkSource !== this.props.Document) {
            e.stopPropagation();
            const dropDoc = this._componentView?.getAnchor() || this.rootDoc;
            if (de.complete.annoDragData) de.complete.annoDragData.dropDocument = dropDoc;
            de.complete.linkDocument = DocUtils.MakeLink({ doc: linkSource }, { doc: dropDoc }, "link", undefined, undefined, undefined, [de.x, de.y]);
        }
    }

    @undoBatch
    @action
    makeIntoPortal = async () => {
        const portalLink = this.allLinks.find(d => d.anchor1 === this.props.Document);
        if (!portalLink) {
            const portal = Docs.Create.FreeformDocument([], { _width: NumCast(this.layoutDoc._width) + 10, _height: NumCast(this.layoutDoc._height), title: StrCast(this.props.Document.title) + ".portal" });
            DocUtils.MakeLink({ doc: this.props.Document }, { doc: portal }, "portal to");
        }
        this.Document.followLinkLocation = "inPlace";
        this.Document.followLinkZoom = true;
        this.Document.isLinkButton = true;
    }

    @action
    onContextMenu = (e?: React.MouseEvent, pageX?: number, pageY?: number) => {
        if (e && this.rootDoc._hideContextMenu && Doc.UserDoc().noviceMode) {
            e.preventDefault();
            e.stopPropagation();
            !this.props.isSelected(true) && SelectionManager.SelectView(this.props.DocumentView(), false);
        }
        // the touch onContextMenu is button 0, the pointer onContextMenu is button 2
        if (e) {
            if (e.button === 0 && !e.ctrlKey || e.isDefaultPrevented()) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            e.persist();

            if (!navigator.userAgent.includes("Mozilla") && (Math.abs(this._downX - e?.clientX) > 3 || Math.abs(this._downY - e?.clientY) > 3)) {
                return;
            }
        }

        const cm = ContextMenu.Instance;
        if (!cm || (e as any)?.nativeEvent?.SchemaHandled) return;

        const customScripts = Cast(this.props.Document.contextMenuScripts, listSpec(ScriptField), []);
        Cast(this.props.Document.contextMenuLabels, listSpec("string"), []).forEach((label, i) =>
            cm.addItem({ description: label, event: () => customScripts[i]?.script.run({ this: this.layoutDoc, scriptContext: this.props.scriptContext, self: this.rootDoc }), icon: "sticky-note" }));
        this.props.contextMenuItems?.().forEach(item =>
            item.label && cm.addItem({ description: item.label, event: () => item.script.script.run({ this: this.layoutDoc, scriptContext: this.props.scriptContext, self: this.rootDoc }), icon: "sticky-note" }));

        const templateDoc = Cast(this.props.Document[StrCast(this.props.Document.layoutKey)], Doc, null);
        const appearance = cm.findByDescription("UI Controls...");
        const appearanceItems: ContextMenuProps[] = appearance && "subitems" in appearance ? appearance.subitems : [];
        !Doc.UserDoc().noviceMode && templateDoc && appearanceItems.push({ description: "Open Template   ", event: () => this.props.addDocTab(templateDoc, "add:right"), icon: "eye" });
        DocListCast(this.Document.links).length && appearanceItems.splice(0, 0, { description: `${this.layoutDoc.hideLinkButton ? "Show" : "Hide"} Link Button`, event: action(() => this.layoutDoc.hideLinkButton = !this.layoutDoc.hideLinkButton), icon: "eye" });
        !appearance && cm.addItem({ description: "UI Controls...", subitems: appearanceItems, icon: "compass" });

        if (!Doc.IsSystem(this.rootDoc) && this.props.ContainingCollectionDoc?._viewType !== CollectionViewType.Tree) {
            const existingOnClick = cm.findByDescription("OnClick...");
            const onClicks: ContextMenuProps[] = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];

            const zorders = cm.findByDescription("ZOrder...");
            const zorderItems: ContextMenuProps[] = zorders && "subitems" in zorders ? zorders.subitems : [];
            zorderItems.push({ description: "Bring to Front", event: () => SelectionManager.Views().forEach(dv => dv.props.bringToFront(dv.rootDoc, false)), icon: "expand-arrows-alt" });
            zorderItems.push({ description: "Send to Back", event: () => SelectionManager.Views().forEach(dv => dv.props.bringToFront(dv.rootDoc, true)), icon: "expand-arrows-alt" });
            zorderItems.push({ description: this.rootDoc._raiseWhenDragged !== false ? "Keep ZIndex when dragged" : "Allow ZIndex to change when dragged", event: undoBatch(action(() => this.rootDoc._raiseWhenDragged = this.rootDoc._raiseWhenDragged === undefined ? false : undefined)), icon: "expand-arrows-alt" });
            !zorders && cm.addItem({ description: "ZOrder...", subitems: zorderItems, icon: "compass" });

            onClicks.push({ description: "Enter Portal", event: this.makeIntoPortal, icon: "window-restore" });
            onClicks.push({ description: "Toggle Detail", event: () => this.Document.onClick = ScriptField.MakeScript(`toggleDetail(self, "${this.Document.layoutKey}")`), icon: "concierge-bell" });

            if (!this.Document.annotationOn) {
                const options = cm.findByDescription("Options...");
                const optionItems: ContextMenuProps[] = options && "subitems" in options ? options.subitems : [];
                this.props.ContainingCollectionDoc?._viewType === CollectionViewType.Freeform && optionItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
                !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "compass" });

                onClicks.push({ description: this.Document.ignoreClick ? "Select" : "Do Nothing", event: () => this.Document.ignoreClick = !this.Document.ignoreClick, icon: this.Document.ignoreClick ? "unlock" : "lock" });
                onClicks.push({ description: this.Document.isLinkButton ? "Remove Follow Behavior" : "Follow Link in Place", event: () => this.toggleFollowLink("inPlace", true, false), icon: "link" });
                !this.Document.isLinkButton && onClicks.push({ description: "Follow Link on Right", event: () => this.toggleFollowLink("add:right", false, false), icon: "link" });
                onClicks.push({ description: this.Document.isLinkButton || this.onClickHandler ? "Remove Click Behavior" : "Follow Link", event: () => this.toggleFollowLink(undefined, false, false), icon: "link" });
                onClicks.push({ description: (this.Document.isPushpin ? "Remove" : "Make") + " Pushpin", event: () => this.toggleFollowLink(undefined, false, true), icon: "map-pin" });
                onClicks.push({ description: "Edit onClick Script", event: () => UndoManager.RunInBatch(() => DocUtils.makeCustomViewClicked(this.props.Document, undefined, "onClick"), "edit onClick"), icon: "terminal" });
                !existingOnClick && cm.addItem({ description: "OnClick...", addDivider: true, noexpand: true, subitems: onClicks, icon: "mouse-pointer" });
            } else if (DocListCast(this.Document.links).length) {
                onClicks.push({ description: "Select on Click", event: () => this.selectOnClick(), icon: "link" });
                onClicks.push({ description: "Follow Link on Click", event: () => this.followLinkOnClick(undefined, false), icon: "link" });
                onClicks.push({ description: "Toggle Link Target on Click", event: () => this.toggleTargetOnClick(), icon: "map-pin" });
                !existingOnClick && cm.addItem({ description: "OnClick...", addDivider: true, subitems: onClicks, icon: "mouse-pointer" });
            }
        }

        const funcs: ContextMenuProps[] = [];
        if (!Doc.UserDoc().noviceMode && this.layoutDoc.onDragStart) {
            funcs.push({ description: "Drag an Alias", icon: "edit", event: () => this.Document.dragFactory && (this.layoutDoc.onDragStart = ScriptField.MakeFunction('getAlias(this.dragFactory)')) });
            funcs.push({ description: "Drag a Copy", icon: "edit", event: () => this.Document.dragFactory && (this.layoutDoc.onDragStart = ScriptField.MakeFunction('getCopy(this.dragFactory, true)')) });
            funcs.push({ description: "Drag Document", icon: "edit", event: () => this.layoutDoc.onDragStart = undefined });
            cm.addItem({ description: "OnDrag...", noexpand: true, subitems: funcs, icon: "asterisk" });
        }

        const more = cm.findByDescription("More...");
        const moreItems = more && "subitems" in more ? more.subitems : [];
        if (!Doc.IsSystem(this.rootDoc)) {
            (this.rootDoc._viewType !== CollectionViewType.Docking || !Doc.UserDoc().noviceMode) && moreItems.push({ description: "Share", event: () => SharingManager.Instance.open(this.props.DocumentView()), icon: "users" });
            if (!Doc.UserDoc().noviceMode) {
                moreItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });
                moreItems.push({ description: `${this.Document._chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document._chromeStatus = (this.Document._chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });

                if (Cast(Doc.GetProto(this.props.Document).data, listSpec(Doc))) {
                    moreItems.push({ description: "Export to Google Photos Album", event: () => GooglePhotos.Export.CollectionToAlbum({ collection: this.props.Document }).then(console.log), icon: "caret-square-right" });
                    moreItems.push({ description: "Tag Child Images via Google Photos", event: () => GooglePhotos.Query.TagChildImages(this.props.Document), icon: "caret-square-right" });
                    moreItems.push({ description: "Write Back Link to Album", event: () => GooglePhotos.Transactions.AddTextEnrichment(this.props.Document), icon: "caret-square-right" });
                }
                moreItems.push({ description: "Copy ID", event: () => Utils.CopyText(Utils.prepend("/doc/" + this.props.Document[Id])), icon: "fingerprint" });
            }
        }

        if (this.props.removeDocument && !this.props.Document._stayInCollection && CurrentUserUtils.ActiveDashboard !== this.props.Document) { // need option to gray out menu items ... preferably with a '?' that explains why they're grayed out (eg., no permissions)
            moreItems.push({ description: "Close", event: this.deleteClicked, icon: "times" });
        }

        !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
        cm.moveAfter(cm.findByDescription("More...")!, cm.findByDescription("OnClick...")!);

        const help = cm.findByDescription("Help...");
        const helpItems: ContextMenuProps[] = help && "subitems" in help ? help.subitems : [];
        !Doc.UserDoc().novice && helpItems.push({ description: "Show Fields ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { _width: 300, _height: 300 }), "add:right"), icon: "layer-group" });
        helpItems.push({ description: "Text Shortcuts Ctrl+/", event: () => this.props.addDocTab(Docs.Create.PdfDocument(Utils.prepend("/assets/cheat-sheet.pdf"), { _width: 300, _height: 300 }), "add:right"), icon: "keyboard" });
        !Doc.UserDoc().novice && helpItems.push({ description: "Print Document in Console", event: () => console.log(this.props.Document), icon: "hand-point-right" });
        cm.addItem({ description: "Help...", noexpand: true, subitems: helpItems, icon: "question" });

        if (!this.topMost) e?.stopPropagation(); // DocumentViews should stop propagation of this event
        cm.displayMenu((e?.pageX || pageX || 0) - 15, (e?.pageY || pageY || 0) - 15);
        !this.props.isSelected(true) && setTimeout(() => SelectionManager.SelectView(this.props.DocumentView(), false), 300); // on a mac, the context menu is triggered on mouse down, but a YouTube video becaomes interactive when selected which means that the context menu won't show up.  by delaying the selection until hopefully after the pointer up, the context menu will appear.
    }

    rootSelected = (outsideReaction?: boolean) => this.props.isSelected(outsideReaction) || (this.props.Document.rootDocument && this.props.rootSelected?.(outsideReaction)) || false;
    panelHeight = () => this.props.PanelHeight() - this.headerMargin;
    parentActive = (outsideReaction: boolean) => this.props.layerProvider?.(this.layoutDoc) === false ? this.props.parentActive(outsideReaction) : false;
    screenToLocal = () => this.props.ScreenToLocalTransform().translate(0, -this.headerMargin);
    contentScaling = () => this.ContentScale;
    onClickFunc = () => this.onClickHandler;
    setContentView = (view: { getAnchor: () => Doc, forward?: () => boolean, back?: () => boolean }) => this._componentView = view;
    @observable contentsActive: () => boolean = returnFalse;
    @action setContentsActive = (setActive: () => boolean) => this.contentsActive = setActive;
    @computed get contents() {
        TraceMobx();
        return <div className="documentView-contentsView"
            style={{
                pointerEvents: this.props.contentPointerEvents as any,
                height: this.headerMargin ? `calc(100% - ${this.headerMargin}px)` : undefined,
            }}>
            <DocumentContentsView key={1} {...this.props}
                docViewPath={this.props.viewPath}
                setContentView={this.setContentView}
                scaling={this.contentScaling}
                PanelHeight={this.panelHeight}
                contentsActive={this.setContentsActive}
                parentActive={this.parentActive}
                ScreenToLocalTransform={this.screenToLocal}
                rootSelected={this.rootSelected}
                onClick={this.onClickFunc}
                focus={this.focus}
                layoutKey={this.finalLayoutKey} />
            {this.layoutDoc.hideAllLinks ? (null) : this.allAnchors}
            {this.hideLinkButton ? (null) :
                <DocumentLinksButton View={this.props.DocumentView()} links={this.allLinks} Offset={[this.topMost ? 0 : -15, undefined, undefined, this.topMost ? 10 : -20]} />}
        </div>;
    }

    @undoBatch
    hideLinkAnchor = (doc: Doc | Doc[]) => (doc instanceof Doc ? [doc] : doc).reduce((flg, doc) => flg && (doc.hidden = true), true)
    anchorPanelWidth = () => this.props.PanelWidth() || 1;
    anchorPanelHeight = () => this.props.PanelHeight() || 1;
    anchorStyleProvider = (doc: Opt<Doc>, props: Opt<DocumentViewProps | FieldViewProps>, property: string): any => {
        return property !== StyleProp.LinkSource ? this.props.styleProvider?.(doc, props, property + ":anchor") : this.props.Document; // pass the LinkSource to the LinkAnchorBox
    }
    @computed get directLinks() { TraceMobx(); return LinkManager.Instance.getAllDirectLinks(this.rootDoc); }
    @computed get allLinks() { TraceMobx(); return LinkManager.Instance.getAllRelatedLinks(this.rootDoc); }
    @computed get allAnchors() {
        TraceMobx();
        if (this.props.LayoutTemplateString?.includes(LinkAnchorBox.name)) return null;
        if (this.layoutDoc.presBox || this.rootDoc.type === DocumentType.LINK || this.props.dontRegisterView) return (null);

        // need to use allLinks for RTF since embedded linked text anchors are not rendered with DocumentViews.  All other documents render their anchors with nested DocumentViews so we just need to render the directLinks here
        const filtered = DocUtils.FilterDocs(this.rootDoc.type === DocumentType.RTF ? this.allLinks : this.directLinks, this.props.docFilters(), []).filter(d => !d.hidden);
        return filtered.map((link, i) =>
            <div className="documentView-anchorCont" key={i + 1}>
                <DocumentView {...this.props}
                    Document={link}
                    PanelWidth={this.anchorPanelWidth}
                    PanelHeight={this.anchorPanelHeight}
                    dontRegisterView={false}
                    styleProvider={this.anchorStyleProvider}
                    removeDocument={this.hideLinkAnchor}
                    LayoutTemplate={undefined}
                    LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(link, this.rootDoc)}`)} />
            </div >);
    }

    captionStyleProvider = (doc: Opt<Doc>, props: Opt<DocumentViewInternalProps>, property: string) => this.props?.styleProvider?.(doc, props, property + ":caption");
    @computed get innards() {
        TraceMobx();
        const showTitle = this.ShowTitle;
        const showTitleHover = StrCast(this.layoutDoc._showTitleHover);
        const showCaption = StrCast(this.layoutDoc._showCaption);
        const captionView = !showCaption ? (null) :
            <div className="documentView-captionWrapper"
                style={{
                    backgroundColor: StrCast(this.layoutDoc["caption-backgroundColor"]),
                    color: StrCast(this.layoutDoc["caption-color"])
                }}>
                <DocumentContentsView {...OmitKeys(this.props, ['children']).omit}
                    yMargin={10}
                    xMargin={10}
                    hideOnLeave={true}
                    styleProvider={this.captionStyleProvider}
                    dontRegisterView={true}
                    LayoutTemplateString={`<FormattedTextBox {...props} fieldKey={'${showCaption}'}/>`}
                    onClick={this.onClickFunc}
                    layoutKey={this.finalLayoutKey} />
            </div>;
        const titleView = !showTitle ? (null) :
            <div className={`documentView-titleWrapper${showTitleHover ? "-hover" : ""}`} key="title" style={{
                position: this.headerMargin ? "relative" : "absolute",
                height: this.headerMargin,
                background: SharingManager.Instance.users.find(users => users.user.email === this.dataDoc.author)?.userColor || (this.rootDoc.type === DocumentType.RTF ? StrCast(Doc.SharingDoc().userColor) : "rgba(0,0,0,0.4)"),
                pointerEvents: this.onClickHandler || this.Document.ignoreClick ? "none" : undefined,
            }}>
                <EditableView ref={this._titleRef}
                    contents={showTitle === "title" ? StrCast((this.dataDoc || this.props.Document).title) : showTitle.split(";").map(field => field + ":" + (this.dataDoc || this.props.Document)[field]?.toString()).join(" ")}
                    display={"block"}
                    fontSize={10}
                    GetValue={() => Field.toString((this.dataDoc || this.props.Document)[showTitle.split(";")[0]] as any as Field)}
                    SetValue={undoBatch((value) => showTitle.includes("Date") ? true : (Doc.GetProto(this.dataDoc || this.props.Document)[showTitle] = value) ? true : true)}
                />
            </div>;
        return this.props.hideTitle || (!showTitle && !showCaption) ?
            this.contents :
            <div className="documentView-styleWrapper" >
                {!this.headerMargin ? <> {this.contents} {titleView} </> : <> {titleView} {this.contents} </>}
                {captionView}
            </div>;
    }
    @computed get renderDoc() {
        TraceMobx();
        if (!(this.props.Document instanceof Doc) || GetEffectiveAcl(this.props.Document[DataSym]) === AclPrivate || this.hidden) return null;
        return this.docContents ??
            <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
                id={this.props.Document[Id]}
                style={{
                    background: this.backgroundColor,
                    opacity: this.opacity,
                    color: StrCast(this.layoutDoc.color, "inherit"),
                    fontFamily: StrCast(this.Document._fontFamily, "inherit"),
                    fontSize: Cast(this.Document._fontSize, "string", null),
                    transformOrigin: this._animateScalingTo ? "center center" : undefined,
                    transform: this._animateScalingTo ? `scale(${this._animateScalingTo})` : undefined,
                    transition: !this._animateScalingTo ? StrCast(this.Document.dataTransition) : `transform 0.5s ease-${this._animateScalingTo < 1 ? "in" : "out"}`,
                }}>
                {this.innards}
                {this.onClickHandler && this.props.ContainingCollectionView?.props.Document._viewType === CollectionViewType.Time ? <div className="documentView-contentBlocker" /> : (null)}
                {this.widgetDecorations ?? null}
            </div>;
    }
    render() {
        const highlightIndex = this.props.LayoutTemplateString ? (Doc.IsHighlighted(this.props.Document) ? 6 : 0) : Doc.isBrushedHighlightedDegree(this.props.Document); // bcz: Argh!! need to identify a tree view doc better than a LayoutTemlatString
        const highlightColor = (CurrentUserUtils.ActiveDashboard?.darkScheme ?
            ["transparent", "#65350c", "#65350c", "yellow", "magenta", "cyan", "orange"] :
            ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"])[highlightIndex];
        const highlightStyle = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"][highlightIndex];
        let highlighting = !this.props.cantBrush && highlightIndex && ![DocumentType.FONTICON, DocumentType.INK].includes(this.layoutDoc.type as any) && this.layoutDoc._viewType !== CollectionViewType.Linear;
        highlighting = highlighting && this.props.focus !== emptyFunction && this.layoutDoc.title !== "[pres element template]";  // bcz: hack to turn off highlighting onsidebar panel documents.  need to flag a document as not highlightable in a more direct way

        const boxShadow = highlighting && this.borderRounding && highlightStyle !== "dashed" ? `0 0 0 ${highlightIndex}px ${highlightColor}` :
            this.boxShadow || (this.props.Document.isTemplateForField ? "black 0.2vw 0.2vw 0.8vw" : undefined);
        return <div className={DocumentView.ROOT_DIV} ref={this._mainCont}
            onContextMenu={this.onContextMenu}
            onKeyDown={this.onKeyDown}
            onPointerDown={this.onPointerDown}
            onClick={this.onClick}
            onPointerEnter={e => !SnappingManager.GetIsDragging() && Doc.BrushDoc(this.props.Document)}
            onPointerLeave={e => !hasDescendantTarget(e.nativeEvent.x, e.nativeEvent.y, this.ContentDiv) && Doc.UnBrushDoc(this.props.Document)}
            style={{
                borderRadius: this.borderRounding,
                pointerEvents: this.pointerEvents,
                outline: highlighting && !this.borderRounding ? `${highlightColor} ${highlightStyle} ${highlightIndex}px` : "solid 0px",
                border: highlighting && this.borderRounding && highlightStyle === "dashed" ? `${highlightStyle} ${highlightColor} ${highlightIndex}px` : undefined,
                boxShadow,
            }}>
            {PresBox.EffectsProvider(this.layoutDoc, this.renderDoc) || this.renderDoc}
        </div>;
    }
}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {
    public static ROOT_DIV = "documentView-effectsWrapper";
    public get displayName() { return "DocumentView(" + this.props.Document?.title + ")"; } // this makes mobx trace() statements more descriptive
    public ContentRef = React.createRef<HTMLDivElement>();

    @observable public docView: DocumentViewInternal | undefined | null;

    get Document() { return this.props.Document; }
    get topMost() { return this.props.renderDepth === 0; }
    get rootDoc() { return this.docView?.rootDoc || this.Document; }
    get dataDoc() { return this.docView?.dataDoc || this.Document; }
    get finalLayoutKey() { return this.docView?.finalLayoutKey || "layout"; }
    get ContentDiv() { return this.docView?.ContentDiv; }
    get ComponentView() { return this.docView?._componentView; }
    get allLinks() { return this.docView?.allLinks || []; }
    get LayoutFieldKey() { return this.docView?.LayoutFieldKey || "layout"; }

    @computed get docViewPath() { return this.props.docViewPath ? [...this.props.docViewPath(), this] : [this]; }
    @computed get layoutDoc() { return Doc.Layout(this.Document, this.props.LayoutTemplate?.()); }
    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, this.props.DataDoc, this.props.freezeDimensions) || 0); }
    @computed get nativeScaling() {
        if (this.nativeWidth && (this.layoutDoc?._fitWidth || this.props.PanelHeight() / this.nativeHeight > this.props.PanelWidth() / this.nativeWidth)) {
            return this.props.PanelWidth() / this.nativeWidth;  // width-limited or fitWidth
        }
        return this.nativeWidth && this.nativeHeight ? this.props.PanelHeight() / this.nativeHeight : 1; // height-limited or unscaled
    }

    @computed get panelWidth() { return this.nativeWidth ? this.nativeWidth * this.nativeScaling : this.props.PanelWidth(); }
    @computed get panelHeight() {
        if (this.nativeHeight) {
            return Math.min(this.props.PanelHeight(),
                this.props.Document._fitWidth ?
                    Math.max(NumCast(this.props.Document._height), NumCast(((this.props.Document.scrollHeight || 0) as number) * this.props.PanelWidth() / this.nativeWidth, this.props.PanelHeight())) :
                    this.nativeHeight * this.nativeScaling
            );
        }
        return this.props.PanelHeight();
    }
    @computed get Xshift() { return this.nativeWidth ? (this.props.PanelWidth() - this.nativeWidth * this.nativeScaling) / 2 : 0; }
    @computed get YShift() { return this.nativeWidth && this.nativeHeight && Math.abs(this.Xshift) < 0.001 ? (this.props.PanelHeight() - this.nativeHeight * this.nativeScaling) / 2 : 0; }
    @computed get centeringX() { return this.props.dontCenter?.includes("x") ? 0 : this.Xshift; }
    @computed get centeringY() { return this.props.Document._fitWidth || this.props.dontCenter?.includes("y") ? 0 : this.YShift; }

    toggleNativeDimensions = () => this.docView && Doc.toggleNativeDimensions(this.layoutDoc, this.docView.ContentScale, this.props.PanelWidth(), this.props.PanelHeight());
    contentsActive = () => this.docView?.contentsActive();
    focus = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc) => {
        return this.docView?.focus(doc, willZoom, scale, afterFocus);
    }
    getBounds = () => {
        if (!this.docView || !this.docView.ContentDiv || this.docView.props.renderDepth === 0 || this.docView.props.treeViewDoc || Doc.AreProtosEqual(this.props.Document, Doc.UserDoc())) {
            return undefined;
        }
        const xf = (this.docView?.props.ScreenToLocalTransform().scale(this.nativeScaling)).inverse();
        const [[left, top], [right, bottom]] = [xf.transformPoint(0, 0), xf.transformPoint(this.panelWidth, this.panelHeight)];
        if (this.docView.props.LayoutTemplateString?.includes("LinkAnchorBox")) {
            const docuBox = this.docView.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
            if (docuBox.length) return docuBox[0].getBoundingClientRect();
        }
        return { left, top, right, bottom };
    }

    public iconify() {
        const layoutKey = Cast(this.Document.layoutKey, "string", null);
        if (layoutKey !== "layout_icon") {
            this.switchViews(true, "icon");
            if (layoutKey && layoutKey !== "layout" && layoutKey !== "layout_icon") this.Document.deiconifyLayout = layoutKey.replace("layout_", "");
        } else {
            const deiconifyLayout = Cast(this.Document.deiconifyLayout, "string", null);
            this.switchViews(deiconifyLayout ? true : false, deiconifyLayout);
            this.Document.deiconifyLayout = undefined;
        }
    }
    @undoBatch
    @action
    setCustomView = (custom: boolean, layout: string): void => {
        Doc.setNativeView(this.props.Document);
        custom && DocUtils.makeCustomViewClicked(this.props.Document, Docs.Create.StackingDocument, layout, undefined);
    }
    switchViews = action((custom: boolean, view: string) => {
        this.docView && (this.docView._animateScalingTo = 0.1);  // shrink doc
        setTimeout(action(() => {
            this.setCustomView(custom, view);
            this.docView && (this.docView._animateScalingTo = 1); // expand it
            setTimeout(action(() => this.docView && (this.docView._animateScalingTo = 0)), 400);
        }), 400);
    });

    docViewPathFunc = () => this.docViewPath;
    isSelected = (outsideReaction?: boolean) => SelectionManager.IsSelected(this, outsideReaction);
    select = (ctrlPressed: boolean) => SelectionManager.SelectView(this, ctrlPressed);
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    PanelWidth = () => this.panelWidth;
    PanelHeight = () => this.panelHeight;
    ContentScale = () => this.nativeScaling;
    selfView = () => this;
    screenToLocalTransform = () => {
        return this.props.ScreenToLocalTransform().translate(-this.centeringX, -this.centeringY).scale(1 / this.nativeScaling);
    }

    componentDidMount() {
        !BoolCast(this.props.Document.dontRegisterView, this.props.dontRegisterView) && DocumentManager.Instance.AddView(this);
    }
    componentWillUnmount() {
        !this.props.dontRegisterView && DocumentManager.Instance.RemoveView(this);
    }

    render() {
        TraceMobx();
        const internalProps = {
            ...this.props,
            DocumentView: this.selfView,
            viewPath: this.docViewPathFunc,
            PanelWidth: this.PanelWidth,
            PanelHeight: this.PanelHeight,
            NativeWidth: this.NativeWidth,
            NativeHeight: this.NativeHeight,
            isSelected: this.isSelected,
            select: this.select,
            ContentScaling: this.ContentScale,
            ScreenToLocalTransform: this.screenToLocalTransform,
            focus: this.props.focus || emptyFunction,
            bringToFront: emptyFunction,
        };
        return (<div className="contentFittingDocumentView">
            {!this.props.Document || !this.props.PanelWidth() ? (null) : (
                <div className="contentFittingDocumentView-previewDoc" ref={this.ContentRef}
                    style={{
                        position: this.props.Document.isInkMask ? "absolute" : undefined,
                        transform: `translate(${this.centeringX}px, ${this.centeringY}px)`,
                        width: this.props.Document.isInkMask ? InkingStroke.MaskDim : Math.abs(this.Xshift) > 0.001 ? `${100 * (this.props.PanelWidth() - this.Xshift * 2) / this.props.PanelWidth()}%` : this.props.PanelWidth(),
                        height: this.props.Document.isInkMask ? InkingStroke.MaskDim : Math.abs(this.YShift) > 0.001 ? this.props.Document._fitWidth ? `${this.panelHeight}px` : `${100 * this.nativeHeight / this.nativeWidth * this.props.PanelWidth() / this.props.PanelHeight()}%` : this.props.PanelHeight(),
                    }}>
                    <DocumentViewInternal {...this.props} {...internalProps} ref={action((r: DocumentViewInternal | null) => this.docView = r)} />
                </div>)}
        </div>);
    }
}

Scripting.addGlobal(function toggleDetail(doc: any, layoutKey: string, otherKey: string = "layout") {
    const dv = DocumentManager.Instance.getDocumentView(doc);
    if (dv?.props.Document.layoutKey === layoutKey) dv?.switchViews(otherKey !== "layout", otherKey.replace("layout_", ""));
    else dv?.switchViews(true, layoutKey.replace("layout_", ""));
});