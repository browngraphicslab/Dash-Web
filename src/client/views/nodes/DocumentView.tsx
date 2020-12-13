import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { AclAdmin, AclEdit, AclPrivate, DataSym, Doc, DocListCast, Field, Opt, StrListCast } from "../../../fields/Doc";
import { Document } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { InkTool } from '../../../fields/InkField';
import { RichTextField } from '../../../fields/RichTextField';
import { listSpec } from "../../../fields/Schema";
import { ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from "../../../fields/Types";
import { GetEffectiveAcl, TraceMobx } from '../../../fields/util';
import { MobileInterface } from '../../../mobile/MobileInterface';
import { GestureUtils } from '../../../pen-gestures/GestureUtils';
import { emptyFunction, OmitKeys, returnFalse, returnOne, returnTrue, returnVal, Utils } from "../../../Utils";
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
import { InkStrokeProperties } from '../InkStrokeProperties';
import { DocumentContentsView } from "./DocumentContentsView";
import { DocumentLinksButton } from './DocumentLinksButton';
import "./DocumentView.scss";
import { LinkAnchorBox } from './LinkAnchorBox';
import { LinkDescriptionPopup } from './LinkDescriptionPopup';
import { PresBox } from './PresBox';
import { RadialMenu } from './RadialMenu';
import { TaskCompletionBox } from './TaskCompletedBox';
import React = require("react");
import { CollectionFreeFormDocumentView } from "./CollectionFreeFormDocumentView";
import { StyleProp, StyleLayers, testDocProps } from "../StyleProvider";
import { FieldViewProps } from "./FieldView";

export type DocAfterFocusFunc = (notFocused: boolean) => boolean;
export type DocFocusFunc = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc, dontCenter?: boolean, focused?: boolean) => void;
export type StyleProviderFunc = (doc: Opt<Doc>, props: Opt<DocumentViewProps | FieldViewProps>, property: string) => any;
export interface DocumentViewSharedProps {
    renderDepth: number;
    Document: Doc;
    DataDoc?: Doc;
    ContainingCollectionView: Opt<CollectionView>;
    fitContentsToDoc?: boolean; // used by freeformview to fit its contents to its panel. corresponds to _fitToBox property on a Document
    ContainingCollectionDoc: Opt<Doc>;
    CollectionFreeFormDocumentView?: () => CollectionFreeFormDocumentView;
    PanelWidth: () => number;
    PanelHeight: () => number;
    NativeWidth?: () => number;
    NativeHeight?: () => number;
    layerProvider?: (doc: Doc, assign?: boolean) => boolean;
    styleProvider?: StyleProviderFunc;
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
    onClick?: () => ScriptField;
    dropAction?: dropActionType;
    dontRegisterView?: boolean;
    ignoreAutoHeight?: boolean;
    pointerEvents?: string;
    scriptContext?: any; // can be assigned anything and will be passed as 'scriptContext' to any OnClick script that executes on this document
}
export interface DocumentViewProps extends DocumentViewSharedProps {
    // properties specific to DocumentViews but not to FieldView
    freezeDimensions?: boolean;
    hideTitle?: boolean;  // forces suppression of title. e.g, treeView document labels suppress titles in case they are globally active via settings
    fitDocToPanel?: boolean; // makes the document view fit the panel available to it (if it has native dimensions, then only one dimension will be fit)
    treeViewDoc?: Doc;
    dragDivName?: string;
    contentPointerEvents?: string; // pointer events allowed for content of a document view.  eg. set to "none" in menuSidebar for sharedDocs so that you can select a document, but not interact with its contents
    radialMenu?: String[];
    LayoutTemplateString?: string;
    LayoutTemplate?: () => Opt<Doc>;
    ContentScaling?: () => number; // scaling the DocumentView does to transform its contents into its panel & needed by ScreenToLocal
    contextMenuItems?: () => { script: ScriptField, label: string }[];
    onDoubleClick?: () => ScriptField;
    onPointerDown?: () => ScriptField;
    onPointerUp?: () => ScriptField;
}

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    public static ROOT_DIV = "documentView-effectsWrapper";
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
    private _gestureEventDisposer?: GestureUtils.GestureEventDisposer;
    private _holdDisposer?: InteractionUtils.MultiTouchEventDisposer;
    protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    private get active() { return this.isSelected(true) || this.props.parentActive(true); }
    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    public get LayoutFieldKey() { return Doc.LayoutFieldKey(this.layoutDoc); }
    @computed get ShowTitle() {
        return StrCast(this.layoutDoc._showTitle,
            !Doc.IsSystem(this.layoutDoc) && this.rootDoc.type === DocumentType.RTF && !this.rootDoc.presentationTargetDoc ?
                (this.dataDoc.author === Doc.CurrentUserEmail ? StrCast(Doc.UserDoc().showTitle) : "author;creationDate") :
                undefined);
    }
    @computed get LocalScaling() { return this.props.ContentScaling?.() || 1; }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get nativeWidth() { return returnVal(this.props.NativeWidth?.(), Doc.NativeWidth(this.layoutDoc, this.dataDoc, this.props.freezeDimensions)); }
    @computed get nativeHeight() { return returnVal(this.props.NativeHeight?.(), Doc.NativeHeight(this.layoutDoc, this.dataDoc, this.props.freezeDimensions)); }
    @computed get onClickHandler() { return this.props.onClick?.() ?? Cast(this.Document.onClick, ScriptField, Cast(this.layoutDoc.onClick, ScriptField, null)); }
    @computed get onDoubleClickHandler() { return this.props.onDoubleClick?.() ?? (Cast(this.layoutDoc.onDoubleClick, ScriptField, null) ?? this.Document.onDoubleClick); }
    @computed get onPointerDownHandler() { return this.props.onPointerDown?.() ?? ScriptCast(this.Document.onPointerDown); }
    @computed get onPointerUpHandler() { return this.props.onPointerUp?.() ?? ScriptCast(this.Document.onPointerUp); }
    NativeWidth = () => this.nativeWidth;
    NativeHeight = () => this.nativeHeight;
    onClickFunc = () => this.onClickHandler;
    onDoubleClickFunc = () => this.onDoubleClickHandler;

    constructor(props: any) {
        super(props);
        props.getView?.(this);
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

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this), this.props.Document));
        this._mainCont.current && (this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this)));
        this._mainCont.current && (this._multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this)));
        // this._mainCont.current && (this.holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this)));

        if (!BoolCast(this.rootDoc.dontRegisterView, this.props.dontRegisterView)) {
            DocumentManager.Instance.AddView(this);
        }
    }

    @action
    componentDidUpdate() {
        this._dropDisposer?.();
        this._gestureEventDisposer?.();
        this._multiTouchDisposer?.();
        this._holdDisposer?.();
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this), this.props.Document);
            this._gestureEventDisposer = GestureUtils.MakeGestureTarget(this._mainCont.current, this.onGesture.bind(this));
            this._multiTouchDisposer = InteractionUtils.MakeMultiTouchTarget(this._mainCont.current, this.onTouchStart.bind(this));
            this._holdDisposer = InteractionUtils.MakeHoldTouchTarget(this._mainCont.current, this.handle1PointerHoldStart.bind(this));
        }
    }

    @action
    componentWillUnmount() {
        this._dropDisposer?.();
        this._gestureEventDisposer?.();
        this._multiTouchDisposer?.();
        this._holdDisposer?.();
        Doc.UnBrushDoc(this.props.Document);
        if (!this.props.dontRegisterView) {
            DocumentManager.Instance.RemoveView(this);
        }
    }

    startDragging(x: number, y: number, dropAction: dropActionType) {
        if (this._mainCont.current) {
            const dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.LocalScaling).inverse().transformPoint(0, 0);
            dragData.offset = this.props.ScreenToLocalTransform().scale(this.LocalScaling).transformDirection(x - left, y - top);
            dragData.dropAction = dropAction;
            dragData.removeDocument = this.props.removeDocument;
            dragData.moveDocument = this.props.moveDocument;
            dragData.dragDivName = this.props.dragDivName;
            dragData.treeViewDoc = this.props.treeViewDoc;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, { hideSource: !dropAction && !this.layoutDoc.onDragStart });
        }
    }

    @undoBatch @action
    public static FloatDoc(topDocView: DocumentView, x?: number, y?: number) {
        const topDoc = topDocView.props.Document;
        const container = topDocView.props.ContainingCollectionView;
        if (container) {
            SelectionManager.DeselectAll();
            if (topDoc.z && (x === undefined && y === undefined)) {
                const spt = container.screenToLocalTransform().inverse().transformPoint(NumCast(topDoc.x), NumCast(topDoc.y));
                topDoc.z = 0;
                topDoc.x = spt[0];
                topDoc.y = spt[1];
                topDocView.props.removeDocument?.(topDoc);
                topDocView.props.addDocTab(topDoc, "inParent");
            } else {
                const spt = topDocView.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
                const fpt = container.screenToLocalTransform().transformPoint(x !== undefined ? x : spt[0], y !== undefined ? y : spt[1]);
                topDoc.z = 1;
                topDoc.x = fpt[0];
                topDoc.y = fpt[1];
            }
            setTimeout(() => SelectionManager.SelectDoc(DocumentManager.Instance.getDocumentView(topDoc, container)!, false), 0);
        }
    }

    onKeyDown = (e: React.KeyboardEvent) => {
        if (this.rootDoc._singleLine && ((e.key === "Backspace" && this.dataDoc.text && !(this.dataDoc.text as RichTextField)?.Text) || ["Tab", "Enter"].includes(e.key))) {
            return;
        }
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
                            thisContainer: this.props.ContainingCollectionDoc,
                            shiftKey: e.shiftKey
                        }, console.log);
                        undoBatch(func)();
                    } else if (!Doc.IsSystem(this.props.Document)) {
                        if (this.props.Document.type === DocumentType.INK) {
                            InkStrokeProperties.Instance && (InkStrokeProperties.Instance._controlBtn = true);
                        } else {
                            UndoManager.RunInBatch(() => {
                                const fullScreenDoc = Cast(this.props.Document._fullScreenView, Doc, null) || this.props.Document;
                                this.props.addDocTab(fullScreenDoc, "add");
                            }, "double tap");
                            SelectionManager.DeselectAll();
                        }
                        Doc.UnBrushDoc(this.props.Document);
                    }
                }
            } else if (this.onClickHandler?.script && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) { // bcz: hack? don't execute script if you're clicking on a scripting box itself
                const shiftKey = e.shiftKey;
                const func = () => this.onClickHandler.script.run({
                    this: this.layoutDoc,
                    self: this.rootDoc,
                    scriptContext: this.props.scriptContext,
                    thisContainer: this.props.ContainingCollectionDoc,
                    documentView: this,
                    shiftKey
                }, console.log);
                const clickFunc = () => {
                    if (!Doc.AreProtosEqual(this.props.Document, Doc.UserDoc()["dockedBtn-undo"] as Doc) &&
                        !Doc.AreProtosEqual(this.props.Document, Doc.UserDoc()["dockedBtn-redo"] as Doc) &&
                        !this.onClickHandler.script.originalScript.includes("selectMainMenu")) {
                        UndoManager.RunInBatch(func, "on click");
                    } else func();
                };
                if (this.onDoubleClickHandler) {
                    this._timeout = setTimeout(() => { this._timeout = undefined; clickFunc(); }, 500);
                } else clickFunc();
            } else if (this.Document["onClick-rawScript"] && !StrCast(Doc.LayoutField(this.layoutDoc))?.includes("ScriptingBox")) {// bcz: hack? don't edit a script if you're clicking on a scripting box itself
                this.props.addDocTab(DocUtils.makeCustomViewClicked(Doc.MakeAlias(this.props.Document), undefined, "onClick"), "add:right");
            } else if (this.allLinks && this.Document.isLinkButton && !e.shiftKey && !e.ctrlKey) {
                this.allLinks.length && DocumentView.followLinkClick(undefined, this.props.Document, this.props, e.shiftKey, e.altKey);
            } else {
                if ((this.layoutDoc.onDragStart || this.props.Document.rootDocument) && !(e.ctrlKey || e.button > 0)) {  // onDragStart implies a button doc that we don't want to select when clicking.   RootDocument & isTemplaetForField implies we're clicking on part of a template instance and we want to select the whole template, not the part
                    stopPropagate = false; // don't stop propagation for field templates -- want the selection to propagate up to the root document of the template
                } else {
                    this.select(e.ctrlKey || e.shiftKey);
                    //SelectionManager.SelectDoc(this, e.ctrlKey || e.shiftKey);
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
    public static followLinkClick = async (linkDoc: Opt<Doc>, sourceDoc: Doc, docView: {
        focus: DocFocusFunc,
        addDocTab: (doc: Doc, where: string) => boolean,
        ContainingCollectionDoc?: Doc
    }, shiftKey: boolean, altKey: boolean) => {
        const batch = UndoManager.StartBatch("follow link click");
        // open up target if it's not already in view ...
        const createViewFunc = (doc: Doc, followLoc: string, finished: Opt<() => void>) => {
            const targetFocusAfterDocFocus = () => {
                const where = StrCast(sourceDoc.followLinkLocation) || followLoc;
                const hackToCallFinishAfterFocus = () => {
                    finished && setTimeout(finished, 0); // finished() needs to be called right after hackToCallFinishAfterFocus(), but there's no callback for that so we use the hacky timeout.
                    return false; // we must return false here so that the zoom to the document is not reversed.  If it weren't for needing to call finished(), we wouldn't need this function at all since not having it is equivalent to returning false
                };
                const addTab = docView.addDocTab(doc, where);
                addTab && setTimeout(() => {
                    const targDocView = DocumentManager.Instance.getFirstDocumentView(doc);
                    targDocView?.props.focus(doc, BoolCast(sourceDoc.followLinkZoom, false), undefined, hackToCallFinishAfterFocus);
                }); //  add the target and focus on it.
                return where !== "inPlace" || addTab; // return true to reset the initial focus&zoom (return false for 'inPlace' since resetting the initial focus&zoom will negate the zoom into the target)
            };
            if (!sourceDoc.followLinkZoom) {
                targetFocusAfterDocFocus();
            } else {
                // first focus & zoom onto this (the clicked document).  Then execute the function to focus on the target
                docView.focus(sourceDoc, BoolCast(sourceDoc.followLinkZoom, true), 1, targetFocusAfterDocFocus);
            }
        };
        await DocumentManager.Instance.FollowLink(linkDoc, sourceDoc, createViewFunc, BoolCast(sourceDoc.followLinkZoom, false), docView.ContainingCollectionDoc, batch.end, altKey ? true : undefined);
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
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.layoutDoc.onDragStart || this.onClickHandler) && !this.layoutDoc.lockedPosition && !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {

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
                const scale = this.props.ScreenToLocalTransform().Scale * this.LocalScaling;
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
                !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
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
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.layoutDoc.onDragStart) && !this.layoutDoc.lockedPosition && !CurrentUserUtils.OverlayDocs.includes(this.layoutDoc)) {
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

    onGesture = (e: Event, ge: GestureUtils.GestureEvent) => {
        switch (ge.gesture) {
            case GestureUtils.Gestures.Line:
                ge.callbackFn && ge.callbackFn(this.props.Document);
                e.stopPropagation();
                break;
        }
    }

    @undoBatch @action
    deleteClicked = (): void => {
        if (CurrentUserUtils.ActiveDashboard === this.props.Document) {
            alert("Can't delete the active dashboard");
        } else {
            this.props.removeDocument?.(this.props.Document);
        }
    }

    @undoBatch @action
    toggleRaiseWhenDragged = () => {
        this.rootDoc._raiseWhenDragged = this.rootDoc._raiseWhenDragged === undefined ? false : undefined;
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

    @undoBatch
    toggleDetail = (): void => {
        this.Document.onClick = ScriptField.MakeScript(`toggleDetail(self, "${this.Document.layoutKey}")`);
    }

    @undoBatch @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (this.props.LayoutTemplateString) return;
        if (this.props.Document === CurrentUserUtils.ActiveDashboard) {
            if ((e.target as any)?.closest?.("*.lm_content")) {
                alert("You can't perform this move most likely because you don't have permission to modify the destination.");
            }
            else alert("linking to document tabs not yet supported.  Drop link on document content.");
            return;
        }
        const makeLink = action((linkDoc: Doc) => {
            LinkManager.currentLink = linkDoc;

            TaskCompletionBox.textDisplayed = "Link Created";
            TaskCompletionBox.popupX = de.x;
            TaskCompletionBox.popupY = de.y - 33;
            TaskCompletionBox.taskCompleted = true;

            LinkDescriptionPopup.popupX = de.x;
            LinkDescriptionPopup.popupY = de.y;
            LinkDescriptionPopup.descriptionPopup = true;

            const rect = document.body.getBoundingClientRect();
            if (LinkDescriptionPopup.popupX + 200 > rect.width) {
                LinkDescriptionPopup.popupX -= 190;
                TaskCompletionBox.popupX -= 40;
            }
            if (LinkDescriptionPopup.popupY + 100 > rect.height) {
                LinkDescriptionPopup.popupY -= 40;
                TaskCompletionBox.popupY -= 40;
            }

            setTimeout(action(() => TaskCompletionBox.taskCompleted = false), 2500);
        });
        if (de.complete.annoDragData) {
            /// this whole section for handling PDF annotations looks weird.  Need to rethink this to make it cleaner
            e.stopPropagation();
            de.complete.annoDragData.linkDocument = DocUtils.MakeLink({ doc: de.complete.annoDragData.annotationDocument }, { doc: this.props.Document }, "link");
            de.complete.annoDragData.linkDocument && makeLink(de.complete.annoDragData.linkDocument);
        }
        if (de.complete.linkDragData) {
            e.stopPropagation();
            const linkSource = de.complete.linkDragData.linkSourceDocument;
            if (linkSource !== this.props.Document) {
                const linkDoc = DocUtils.MakeLink({ doc: linkSource }, { doc: this.props.Document }, `link`);
                linkSource !== this.props.Document && (de.complete.linkDragData.linkDocument = linkDoc); // TODODO this is where in text links get passed
                linkDoc && makeLink(linkDoc);
            }

        }
    }

    @undoBatch
    @action
    toggleNativeDimensions = () => {
        Doc.toggleNativeDimensions(this.layoutDoc, this.LocalScaling, this.props.PanelWidth(), this.props.PanelHeight());
    }

    @undoBatch
    @action
    toggleLockPosition = (): void => {
        this.Document.lockedPosition = this.Document.lockedPosition ? undefined : true;
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
    onCopy = () => {
        const alias = Doc.MakeAlias(this.props.Document);
        alias.x = NumCast(this.props.Document.x) + NumCast(this.props.Document._width);
        alias.y = NumCast(this.props.Document.y) + 30;
        this.props.addDocument?.(alias);
    }

    @action
    onContextMenu = (e?: React.MouseEvent, pageX?: number, pageY?: number) => {
        if (e && this.rootDoc._hideContextMenu && Doc.UserDoc().noviceMode) {
            e.preventDefault();
            e.stopPropagation();
            !this.isSelected(true) && SelectionManager.SelectDoc(this, false);
        }
        // the touch onContextMenu is button 0, the pointer onContextMenu is button 2
        if (e) {
            if (e.button === 0 && !e.ctrlKey || e.isDefaultPrevented()) {
                e.preventDefault();
                return;
            }
            e.stopPropagation();
            e.persist();

            if (!navigator.userAgent.includes("Mozilla")) {
                if (Math.abs(this._downX - e?.clientX) > 3 || Math.abs(this._downY - e?.clientY) > 3) {
                    e?.preventDefault();
                    return;
                }
            }
            e.preventDefault();
        }

        const cm = ContextMenu.Instance;
        if (!cm || (e as any)?.nativeEvent?.SchemaHandled) return;

        const customScripts = Cast(this.props.Document.contextMenuScripts, listSpec(ScriptField), []);
        Cast(this.props.Document.contextMenuLabels, listSpec("string"), []).forEach((label, i) =>
            cm.addItem({ description: label, event: () => customScripts[i]?.script.run({ this: this.layoutDoc, self: this.rootDoc }), icon: "sticky-note" }));
        this.props.contextMenuItems?.().forEach(item =>
            item.label && cm.addItem({ description: item.label, event: () => item.script.script.run({ this: this.layoutDoc, self: this.rootDoc }), icon: "sticky-note" }));

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
            zorderItems.push({ description: "Bring to Front", event: () => SelectionManager.SelectedDocuments().forEach(dv => dv.props.bringToFront(dv.rootDoc, false)), icon: "expand-arrows-alt" });
            zorderItems.push({ description: "Send to Back", event: () => SelectionManager.SelectedDocuments().forEach(dv => dv.props.bringToFront(dv.rootDoc, true)), icon: "expand-arrows-alt" });
            zorderItems.push({ description: this.rootDoc._raiseWhenDragged !== false ? "Keep ZIndex when dragged" : "Allow ZIndex to change when dragged", event: this.toggleRaiseWhenDragged, icon: "expand-arrows-alt" });
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
            (this.rootDoc._viewType !== CollectionViewType.Docking || !Doc.UserDoc().noviceMode) && moreItems.push({ description: "Share", event: () => SharingManager.Instance.open(this), icon: "users" });
            //moreItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
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

        const collectionAcl = GetEffectiveAcl(this.props.ContainingCollectionDoc?.[DataSym]);
        if (this.props.removeDocument && !this.props.Document._stayInCollection) { // need option to gray out menu items ... preferably with a '?' that explains why they're grayed out (eg., no permissions)
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

        runInAction(() => {
            if (!this.topMost) {
                e?.stopPropagation(); // DocumentViews should stop propagation of this event
            }
            cm.displayMenu((e?.pageX || pageX || 0) - 15, (e?.pageY || pageY || 0) - 15);
            !this.isSelected(true) && setTimeout(() => SelectionManager.SelectDoc(this, false), 300); // on a mac, the context menu is triggered on mouse down, but a YouTube video becaomes interactive when selected which means that the context menu won't show up.  by delaying the selection until hopefully after the pointer up, the context menu will appear.
        });
    }

    // does Document set a layout prop
    // does Document set a layout prop
    setsLayoutProp = (prop: string) => this.props.Document[prop] !== this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)] && this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)];
    // get the a layout prop by first choosing the prop from Document, then falling back to the layout doc otherwise.
    getLayoutPropStr = (prop: string) => StrCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);
    getLayoutPropNum = (prop: string) => NumCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);

    isSelected = (outsideReaction?: boolean) => SelectionManager.IsSelected(this, outsideReaction);
    select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    @computed get headerMargin() {
        return this.props?.styleProvider?.(this.layoutDoc, this.props, StyleProp.HeaderMargin) || 0;
    }

    @computed get finalLayoutKey() {
        return StrCast(this.props.Document.layoutKey, "layout");
    }
    rootSelected = (outsideReaction?: boolean) => {
        return this.isSelected(outsideReaction) || (this.props.Document.rootDocument && this.props.rootSelected?.(outsideReaction)) || false;
    }
    panelHeight = () => this.props.PanelHeight() - this.headerMargin;
    @computed.struct get linkOffset() { return this.topMost ? [0, undefined, undefined, 10] : [-15, undefined, undefined, -20]; }
    @observable contentsActive: () => boolean = returnFalse;
    @action setContentsActive = (setActive: () => boolean) => this.contentsActive = setActive;
    parentActive = (outsideReaction: boolean) => this.props.layerProvider?.(this.layoutDoc) === false ? this.props.parentActive(outsideReaction) : false;
    screenToLocal = () => this.props.ScreenToLocalTransform().translate(0, -this.headerMargin);
    @computed get contents() {
        TraceMobx();
        return (<div className="documentView-contentsView"
            style={{
                pointerEvents: this.props.contentPointerEvents as any,
                height: this.headerMargin ? `calc(100% - ${this.headerMargin}px)` : undefined,
            }}>
            <DocumentContentsView key={1}
                renderDepth={this.props.renderDepth}
                Document={this.props.Document}
                DataDoc={this.props.DataDoc}
                fitContentsToDoc={this.props.fitContentsToDoc}
                ContainingCollectionView={this.props.ContainingCollectionView}
                ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                NativeWidth={this.NativeWidth}
                NativeHeight={this.NativeHeight}
                PanelWidth={this.props.PanelWidth}
                PanelHeight={this.props.PanelHeight}
                scaling={this.props.ContentScaling || returnOne}
                layerProvider={this.props.layerProvider}
                styleProvider={this.props.styleProvider}
                LayoutTemplateString={this.props.LayoutTemplateString}
                LayoutTemplate={this.props.LayoutTemplate}
                docFilters={this.props.docFilters}
                docRangeFilters={this.props.docRangeFilters}
                searchFilterDocs={this.props.searchFilterDocs}
                contentsActive={this.setContentsActive}
                parentActive={this.parentActive}
                whenActiveChanged={this.props.whenActiveChanged}
                makeLink={this.makeLink}
                focus={this.props.focus}
                dontRegisterView={this.props.dontRegisterView}
                fitDocToPanel={this.props.fitDocToPanel}
                addDocument={this.props.addDocument}
                removeDocument={this.props.removeDocument}
                moveDocument={this.props.moveDocument}
                addDocTab={this.props.addDocTab}
                pinToPres={this.props.pinToPres}
                ScreenToLocalTransform={this.screenToLocal}
                ignoreAutoHeight={this.props.ignoreAutoHeight}
                bringToFront={this.props.bringToFront}
                isSelected={this.isSelected}
                select={this.select}
                rootSelected={this.rootSelected}
                scriptContext={this.props.scriptContext}
                onClick={this.onClickFunc}
                layoutKey={this.finalLayoutKey} />
            {this.layoutDoc.hideAllLinks ? (null) : this.allAnchors}
            {this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.HideLinkButton) || (!this.isSelected() && (this.layoutDoc.isLinkButton || this.layoutDoc.hideLinkButton)) || this.props.dontRegisterView ? (null) :
                <DocumentLinksButton View={this} links={this.allLinks} Offset={this.linkOffset} />}
        </div>
        );
    }

    // used to decide whether a link anchor view should be created or not.
    // if it's a temporal link (currently just for Audio), then the audioBox will display the anchor and we don't want to display it here.
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
    anchorStyleProvider = (doc: Opt<Doc>, props: Opt<DocumentViewProps | FieldViewProps>, property: string): any => {
        if (testDocProps(props)) {
            switch (property.split(":")[0]) {
                case StyleProp.BackgroundColor: return "transparent"; // background of linkanchor documentView is transparent since it covers the whole document
                case StyleProp.HideLinkButton: return true; // don't want linkAnchor documentview to show its own link button
                case StyleProp.PointerEvents: return "none"; // don't want linkAnchor documentView to handle events (since it covers the whole document).  However, the linkAnchorBox itself is set to pointerEvent all
            }
        } else {
            switch (property.split(":")[0]) {
                case StyleProp.LinkSource: return this.props.Document; // pass the LinkSource to the LinkAnchorBox
            }
        }
        return this.props.styleProvider?.(doc, props, property);
    }

    @computed get directLinks() { TraceMobx(); return LinkManager.Instance.getAllDirectLinks(this.rootDoc); }
    @computed get allLinks() { TraceMobx(); return LinkManager.Instance.getAllRelatedLinks(this.rootDoc); }
    @computed get allAnchors() {
        TraceMobx();
        if (this.props.LayoutTemplateString?.includes("LinkAnchorBox")) return null;
        if (this.layoutDoc.presBox ||  // presentationbox nodes
            this.rootDoc.type === DocumentType.LINK ||
            this.props.dontRegisterView) {// view that are not registered
            return (null);
        }
        const filtered = DocUtils.FilterDocs(this.directLinks, this.props.docFilters(), []).filter(d => !d.hidden && this.isNonTemporalLink(d));
        return filtered.map((d, i) =>
            <div className="documentView-anchorCont" key={i + 1}>
                <DocumentView {...this.props}
                    Document={d}
                    PanelWidth={this.anchorPanelWidth}
                    PanelHeight={this.anchorPanelHeight}
                    dontRegisterView={false}
                    styleProvider={this.anchorStyleProvider}
                    removeDocument={this.hideLinkAnchor}
                    LayoutTemplate={undefined}
                    LayoutTemplateString={LinkAnchorBox.LayoutString(`anchor${Doc.LinkEndpoint(d, this.props.Document)}`)} />
            </div >);
    }
    captionStyleProvider = (doc: Doc | undefined, props: Opt<DocumentViewProps>, property: string) => {
        if (property === StyleProp.Color) return "white";
        if (property === StyleProp.BackgroundColor) return "rgba(0,0,0 ,0.4)";
        return this.props?.styleProvider?.(doc, props, property);
    }
    @computed get innards() {
        TraceMobx();
        const showTitleHover = StrCast(this.layoutDoc._showTitleHover);
        const showCaption = StrCast(this.layoutDoc._showCaption);
        const captionView = (!showCaption ? (null) :
            <div className="documentView-captionWrapper" style={{ backgroundColor: StrCast(this.layoutDoc["caption-backgroundColor"]), color: StrCast(this.layoutDoc["caption-color"]) }}>
                <DocumentContentsView {...OmitKeys(this.props, ['children']).omit}
                    yMargin={10}
                    xMargin={10}
                    hideOnLeave={true}
                    styleProvider={this.captionStyleProvider}
                    dontRegisterView={true}
                    LayoutTemplateString={`<FormattedTextBox {...props} fieldKey={'${showCaption}'}/>`}
                    isSelected={this.isSelected}
                    select={this.select}
                    onClick={this.onClickFunc}
                    layoutKey={this.finalLayoutKey} />
            </div>);
        const titleView = (!this.ShowTitle ? (null) :
            <div className={`documentView-titleWrapper${showTitleHover ? "-hover" : ""}`} key="title" style={{
                position: this.headerMargin ? "relative" : "absolute",
                height: this.headerMargin || undefined,
                background: SharingManager.Instance.users.find(users => users.user.email === this.dataDoc.author)?.userColor || (this.rootDoc.type === DocumentType.RTF ? StrCast(Doc.SharingDoc().userColor) : "rgba(0,0,0,0.4)"),
                pointerEvents: this.onClickHandler || this.Document.ignoreClick ? "none" : undefined,
            }}>
                <EditableView ref={this._titleRef}
                    contents={this.ShowTitle === "title" ? StrCast((this.dataDoc || this.props.Document).title) : this.ShowTitle.split(";").map(field => field + ":" + (this.dataDoc || this.props.Document)[field]?.toString()).join(" ")}
                    display={"block"}
                    fontSize={10}
                    GetValue={() => Field.toString((this.dataDoc || this.props.Document)[this.ShowTitle.split(";")[0]] as any as Field)}
                    SetValue={undoBatch((value: string) => {
                        this.ShowTitle.includes("Date") ? true : (Doc.GetProto(this.dataDoc || this.props.Document)[this.ShowTitle] = value) ? true : true;
                    })}
                />
            </div>);
        return this.props.hideTitle || (!this.ShowTitle && !showCaption) ?
            this.contents :
            <div className="documentView-styleWrapper" >
                {!this.headerMargin ? <> {this.contents} {titleView} </> : <> {titleView} {this.contents} </>}
                {captionView}
            </div>;
    }
    @computed get pointerEvents() {
        if (this.props.pointerEvents === "none") return "none";
        return this.props.styleProvider?.(this.Document, this.props, StyleProp.PointerEvents + (this.isSelected() ? ":selected" : ""));
    }
    @undoBatch
    @action
    setCustomView = (custom: boolean, layout: string): void => {
        Doc.setNativeView(this.props.Document);
        if (custom) {
            DocUtils.makeCustomViewClicked(this.props.Document, Docs.Create.StackingDocument, layout, undefined);
        }
    }

    switchViews = action((custom: boolean, view: string) => {
        this._animateScalingTo = 0.1;  // shrink doc
        setTimeout(action(() => {
            this.setCustomView(custom, view);
            this._animateScalingTo = 1; // expand it
            setTimeout(action(() => this._animateScalingTo = 0), 400);
        }), 400);
    });

    @computed get renderDoc() {
        TraceMobx();
        if (!(this.props.Document instanceof Doc)) return (null);
        if (GetEffectiveAcl(this.props.Document[DataSym]) === AclPrivate) return (null);
        if (this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Hidden)) return null;
        return this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.DocContents) ??
            <div className={`documentView-node${this.topMost ? "-topmost" : ""}`}
                id={this.props.Document[Id]}
                style={{
                    background: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BackgroundColor),
                    opacity: this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.Opacity),
                    color: StrCast(this.layoutDoc.color, "inherit"),
                    fontFamily: StrCast(this.Document._fontFamily, "inherit"),
                    fontSize: Cast(this.Document._fontSize, "string", null),
                    transformOrigin: this._animateScalingTo ? "center center" : undefined,
                    transform: this._animateScalingTo ? `scale(${this._animateScalingTo})` : undefined,
                    transition: !this._animateScalingTo ? StrCast(this.Document.dataTransition) : `transform 0.5s ease-${this._animateScalingTo < 1 ? "in" : "out"}`,
                }}>
                {this.innards}
                {this.onClickHandler && this.props.ContainingCollectionView?.props.Document._viewType === CollectionViewType.Time ? <div className="documentView-contentBlocker" /> : (null)}
                {this.props.styleProvider?.(this.rootDoc, this.props, StyleProp.Decorations + (this.isSelected() ? ":selected" : "")) || (null)}
            </div>;
    }
    render() {
        const borderRounding = this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.BoxShadow);
        const highlightIndex = this.props.LayoutTemplateString ? (Doc.IsHighlighted(this.props.Document) ? 6 : 0) : Doc.isBrushedHighlightedDegree(this.props.Document); // bcz: Argh!! need to identify a tree view doc better than a LayoutTemlatString
        const highlightColor = (CurrentUserUtils.ActiveDashboard?.darkScheme ?
            ["transparent", "#65350c", "#65350c", "yellow", "magenta", "cyan", "orange"] :
            ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"])[highlightIndex];
        const highlightStyle = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"][highlightIndex];
        let highlighting = highlightIndex && ![DocumentType.FONTICON, DocumentType.INK].includes(this.layoutDoc.type as any) && this.layoutDoc._viewType !== CollectionViewType.Linear;
        highlighting = highlighting && this.props.focus !== emptyFunction && this.layoutDoc.title !== "[pres element template]";  // bcz: hack to turn off highlighting onsidebar panel documents.  need to flag a document as not highlightable in a more direct way

        return <div className={DocumentView.ROOT_DIV} ref={this._mainCont}
            onContextMenu={this.onContextMenu}
            onKeyDown={this.onKeyDown}
            onPointerDown={this.onPointerDown}
            onClick={this.onClick}
            onPointerEnter={action(e => !SnappingManager.GetIsDragging() && Doc.BrushDoc(this.props.Document))}
            onPointerLeave={action(e => {
                let entered = false;
                for (let child = document.elementFromPoint(e.nativeEvent.x, e.nativeEvent.y); !entered && child; child = child.parentElement) {
                    entered = entered || child === this.ContentDiv;
                }
                !entered && Doc.UnBrushDoc(this.props.Document);
            })}
            style={{
                pointerEvents: this.pointerEvents,
                outline: highlighting && !borderRounding ? `${highlightColor} ${highlightStyle} ${highlightIndex}px` : "solid 0px",
                border: highlighting && borderRounding && highlightStyle === "dashed" ? `${highlightStyle} ${highlightColor} ${highlightIndex}px` : undefined,
                boxShadow: highlighting && borderRounding && highlightStyle !== "dashed" ? `0 0 0 ${highlightIndex}px ${highlightColor}` :
                    this.Document.isLinkButton && !this.props.dontRegisterView && !this.props.styleProvider?.(this.layoutDoc, this.props, StyleProp.HideLinkButton) ?
                        StrCast(this.layoutDoc._linkButtonShadow, "lightblue 0em 0em 1em") :
                        this.props.Document.isTemplateForField ? "black 0.2vw 0.2vw 0.8vw" :
                            undefined,
            }}
        >
            {PresBox.EffectsProvider(this.layoutDoc, this.renderDoc) || this.renderDoc}
        </div>;
    }
}

Scripting.addGlobal(function toggleDetail(doc: any, layoutKey: string, otherKey: string = "layout") {
    const dv = DocumentManager.Instance.getDocumentView(doc);
    if (dv?.props.Document.layoutKey === layoutKey) dv?.switchViews(otherKey !== "layout", otherKey.replace("layout_", ""));
    else dv?.switchViews(true, layoutKey.replace("layout_", ""));
});
