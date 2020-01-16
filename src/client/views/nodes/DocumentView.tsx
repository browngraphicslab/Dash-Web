import { library } from '@fortawesome/fontawesome-svg-core';
import * as fa from '@fortawesome/free-solid-svg-icons';
import { action, computed, runInAction, trace } from "mobx";
import { observer } from "mobx-react";
import * as rp from "request-promise";
import { Doc, DocListCast, DocListCastAsync, Opt } from "../../../new_fields/Doc";
import { Document, PositionDocument } from '../../../new_fields/documentSchemas';
import { Id } from '../../../new_fields/FieldSymbols';
import { listSpec } from "../../../new_fields/Schema";
import { ScriptField } from '../../../new_fields/ScriptField';
import { BoolCast, Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { ImageField } from '../../../new_fields/URLField';
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { emptyFunction, returnTransparent, returnTrue, Utils, returnOne } from "../../../Utils";
import { GooglePhotos } from '../../apis/google_docs/GooglePhotosClientUtils';
import { DocServer } from "../../DocServer";
import { Docs, DocUtils } from "../../documents/Documents";
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
    dragDivName?: string;
    addDocument?: (doc: Doc) => boolean;
    removeDocument?: (doc: Doc) => boolean;
    moveDocument?: (doc: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    renderDepth: number;
    showOverlays?: (doc: Doc) => { title?: string, titleHover?: string, caption?: string };
    ContentScaling: () => number;
    ruleProvider: Doc | undefined;
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
    private _titleRef = React.createRef<EditableView>();

    public get displayName() { return "DocumentView(" + this.props.Document.title + ")"; } // this makes mobx trace() statements more descriptive
    public get ContentDiv() { return this._mainCont.current; }
    @computed get active() { return SelectionManager.IsSelected(this, true) || this.props.parentActive(true); }
    @computed get topMost() { return this.props.renderDepth === 0; }
    @computed get nativeWidth() { return this.layoutDoc.nativeWidth || 0; }
    @computed get nativeHeight() { return this.layoutDoc.nativeHeight || 0; }
    @computed get onClickHandler() { return this.props.onClick ? this.props.onClick : this.Document.onClick; }

    @action
    componentDidMount() {
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));

        !this.props.dontRegisterView && DocumentManager.Instance.DocumentViews.push(this);
    }

    @action
    componentDidUpdate() {
        this._dropDisposer && this._dropDisposer();
        this._mainCont.current && (this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, this.drop.bind(this)));
    }

    @action
    componentWillUnmount() {
        this._dropDisposer && this._dropDisposer();
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

    onClick = async (e: React.MouseEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.Document.ignoreClick && CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD && Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            e.stopPropagation();
            let preventDefault = true;
            if (this._doubleTap && this.props.renderDepth && !this.onClickHandler?.script) { // disable double-click to show full screen for things that have an on click behavior since clicking them twice can be misinterpreted as a double click
                const fullScreenAlias = Doc.MakeAlias(this.props.Document);
                if (StrCast(fullScreenAlias.layoutKey) !== "layoutCustom" && fullScreenAlias.layoutCustom !== undefined) {
                    fullScreenAlias.layoutKey = "layoutCustom";
                }
                this.props.addDocTab(fullScreenAlias, undefined, "inTab");
                SelectionManager.DeselectAll();
                Doc.UnBrushDoc(this.props.Document);
            } else if (this.onClickHandler && this.onClickHandler.script) {
                this.onClickHandler.script.run({ this: this.Document.isTemplateField && this.props.DataDoc ? this.props.DataDoc : this.props.Document }, console.log);
            } else if (this.Document.type === DocumentType.BUTTON) {
                ScriptBox.EditButtonScript("On Button Clicked ...", this.props.Document, "onClick", e.clientX, e.clientY);
            } else if (this.props.Document.isButton === "Selector") {  // this should be moved to an OnClick script
                FormattedTextBoxComment.Hide();
                this.Document.links?.[0] instanceof Doc && (Doc.UserDoc().SelectedDocs = new List([Doc.LinkOtherAnchor(this.Document.links[0], this.props.Document)]));
            } else if (this.Document.isButton) {
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

    handle1PointerDown = (e: React.TouchEvent) => {
        if (!e.nativeEvent.cancelBubble) {
            const touch = InteractionUtils.GetMyTargetTouches(e, this.prevPoints)[0];
            this._downX = touch.clientX;
            this._downY = touch.clientY;
            this._hitTemplateDrag = false;
            for (let element = (e.target as any); element && !this._hitTemplateDrag; element = element.parentElement) {
                if (element.className && element.className.toString() === "collectionViewBaseChrome-collapse") {
                    this._hitTemplateDrag = true;
                }
            }
            if ((this.active || this.Document.onDragStart || this.Document.onClick) && !e.ctrlKey && !this.Document.lockedPosition && !this.Document.inOverlay) e.stopPropagation();
            document.removeEventListener("touchmove", this.onTouch);
            document.addEventListener("touchmove", this.onTouch);
            document.removeEventListener("touchend", this.onTouchEnd);
            document.addEventListener("touchend", this.onTouchEnd);
            if ((e.nativeEvent as any).formattedHandled) e.stopPropagation();
        }
    }

    handle1PointerMove = (e: TouchEvent) => {
        if ((e as any).formattedHandled) { e.stopPropagation; return; }
        if (e.cancelBubble && this.active) {
            document.removeEventListener("touchmove", this.onTouch);
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.Document.onDragStart || this.Document.onClick) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            const touch = InteractionUtils.GetMyTargetTouches(e, this.prevPoints)[0];
            if (Math.abs(this._downX - touch.clientX) > 3 || Math.abs(this._downY - touch.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.Document.onClick)) {
                    document.removeEventListener("touchmove", this.onTouch);
                    document.removeEventListener("touchend", this.onTouchEnd);
                    this.startDragging(this._downX, this._downY, this.Document.dropAction ? this.Document.dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined, this._hitTemplateDrag);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();

        }
    }

    handle2PointersDown = (e: React.TouchEvent) => {
        if (!e.nativeEvent.cancelBubble && !this.isSelected()) {
            e.stopPropagation();
            e.preventDefault();

            document.removeEventListener("touchmove", this.onTouch);
            document.addEventListener("touchmove", this.onTouch);
            document.removeEventListener("touchend", this.onTouchEnd);
            document.addEventListener("touchend", this.onTouchEnd);
        }
    }

    @action
    handle2PointersMove = (e: TouchEvent) => {
        const myTouches = InteractionUtils.GetMyTargetTouches(e, this.prevPoints);
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
                let nwidth = layoutDoc.nativeWidth || 0;
                let nheight = layoutDoc.nativeHeight || 0;
                const width = (layoutDoc.width || 0);
                const height = (layoutDoc.height || (nheight / nwidth * width));
                const scale = this.props.ScreenToLocalTransform().Scale * this.props.ContentScaling();
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = e.ctrlKey || (!layoutDoc.ignoreAspect && nwidth && nheight);
                if (fixedAspect && e.ctrlKey && layoutDoc.ignoreAspect) {
                    layoutDoc.ignoreAspect = false;
                    layoutDoc.nativeWidth = nwidth = layoutDoc.width || 0;
                    layoutDoc.nativeHeight = nheight = layoutDoc.height || 0;
                }
                if (fixedAspect && (!nwidth || !nheight)) {
                    layoutDoc.nativeWidth = nwidth = layoutDoc.width || 0;
                    layoutDoc.nativeHeight = nheight = layoutDoc.height || 0;
                }
                if (nwidth > 0 && nheight > 0 && !layoutDoc.ignoreAspect) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        if (!fixedAspect) {
                            layoutDoc.nativeWidth = actualdW / (layoutDoc.width || 1) * (layoutDoc.nativeWidth || 0);
                        }
                        layoutDoc.width = actualdW;
                        if (fixedAspect && !layoutDoc.fitWidth) layoutDoc.height = nheight / nwidth * layoutDoc.width;
                        else layoutDoc.height = actualdH;
                    }
                    else {
                        if (!fixedAspect) {
                            layoutDoc.nativeHeight = actualdH / (layoutDoc.height || 1) * (doc.nativeHeight || 0);
                        }
                        layoutDoc.height = actualdH;
                        if (fixedAspect && !layoutDoc.fitWidth) layoutDoc.width = nwidth / nheight * layoutDoc.height;
                        else layoutDoc.width = actualdW;
                    }
                } else {
                    dW && (layoutDoc.width = actualdW);
                    dH && (layoutDoc.height = actualdH);
                    dH && layoutDoc.autoHeight && (layoutDoc.autoHeight = false);
                }
            }
            // let newWidth = Math.max(Math.abs(oldPoint1!.clientX - oldPoint2!.clientX), Math.abs(pt1.clientX - pt2.clientX))
            // this.props.Document.width = newWidth;
            e.stopPropagation();
            e.preventDefault();
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        // console.log(e.button)
        // console.log(e.nativeEvent)
        // continue if the event hasn't been canceled AND we are using a moues or this is has an onClick or onDragStart function (meaning it is a button document)
        if (!InteractionUtils.IsType(e, InteractionUtils.MOUSETYPE)) {
            if (!InteractionUtils.IsType(e, InteractionUtils.PENTYPE)) {
                e.stopPropagation();
            }
            return;
        }
        if ((!e.nativeEvent.cancelBubble || this.Document.onClick || this.Document.onDragStart)) {
            // if ((e.nativeEvent.cancelBubble && (e.button === 0 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE)))
            //     // return if we're inking, and not selecting a button document
            //     || (InkingControl.Instance.selectedTool !== InkTool.None && !this.Document.onClick)
            //     // return if using pen or eraser
            //     || InteractionUtils.IsType(e, InteractionUtils.PENTYPE) || InteractionUtils.IsType(e, InteractionUtils.ERASERTYPE)) {
            //     return;
            // }

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
        if (e.cancelBubble && this.active) {
            document.removeEventListener("pointermove", this.onPointerMove); // stop listening to pointerMove if something else has stopPropagated it (e.g., the MarqueeView)
        }
        else if (!e.cancelBubble && (SelectionManager.IsSelected(this, true) || this.props.parentActive(true) || this.Document.onDragStart || this.Document.onClick) && !this.Document.lockedPosition && !this.Document.inOverlay) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                if (!e.altKey && (!this.topMost || this.Document.onDragStart || this.Document.onClick) && (e.buttons === 1 || InteractionUtils.IsType(e, InteractionUtils.TOUCHTYPE))) {
                    document.removeEventListener("pointermove", this.onPointerMove);
                    document.removeEventListener("pointerup", this.onPointerUp);
                    this.startDragging(this._downX, this._downY, this.Document.dropAction ? this.Document.dropAction as any : e.ctrlKey || e.altKey ? "alias" : undefined, this._hitTemplateDrag);
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

    @undoBatch
    deleteClicked = (): void => { SelectionManager.DeselectAll(); this.props.removeDocument && this.props.removeDocument(this.props.Document); }

    static makeNativeViewClicked = (doc: Doc) => {
        undoBatch(() => doc.layoutKey = "layout")();
    }

    static makeCustomViewClicked = (doc: Doc, dataDoc: Opt<Doc>) => {
        const batch = UndoManager.StartBatch("CustomViewClicked");
        if (doc.layoutCustom === undefined) {
            const width = NumCast(doc.width);
            const height = NumCast(doc.height);
            const options = { title: "data", width, x: -width / 2, y: - height / 2, };

            let fieldTemplate: Doc;
            switch (doc.type) {
                case DocumentType.TEXT:
                    fieldTemplate = Docs.Create.TextDocument(options);
                    break;
                case DocumentType.PDF:
                    fieldTemplate = Docs.Create.PdfDocument("http://www.msn.com", options);
                    break;
                case DocumentType.VID:
                    fieldTemplate = Docs.Create.VideoDocument("http://www.cs.brown.edu", options);
                    break;
                case DocumentType.AUDIO:
                    fieldTemplate = Docs.Create.AudioDocument("http://www.cs.brown.edu", options);
                    break;
                default:
                    fieldTemplate = Docs.Create.ImageDocument("http://www.cs.brown.edu", options);
            }

            fieldTemplate.backgroundColor = doc.backgroundColor;
            fieldTemplate.heading = 1;
            fieldTemplate.autoHeight = true;

            const docTemplate = Docs.Create.FreeformDocument([fieldTemplate], { title: doc.title + "_layout", width: width + 20, height: Math.max(100, height + 45) });

            Doc.MakeMetadataFieldTemplate(fieldTemplate, Doc.GetProto(docTemplate), true);
            Doc.ApplyTemplateTo(docTemplate, dataDoc || doc, "layoutCustom", undefined);
        } else {
            doc.layoutKey = "layoutCustom";
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
        if (de.complete.docDragData && de.complete.docDragData.applyAsTemplate) {
            Doc.ApplyTemplateTo(de.complete.docDragData.draggedDocuments[0], this.props.Document, "layoutCustom");
            e.stopPropagation();
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
        this.layoutDoc.autoHeight = this.layoutDoc.autoHeight = false;
        this.layoutDoc.ignoreAspect = !this.layoutDoc.ignoreAspect;
        if (!this.layoutDoc.ignoreAspect && !this.layoutDoc.nativeWidth) {
            this.layoutDoc.nativeWidth = this.props.PanelWidth();
            this.layoutDoc.nativeHeight = this.props.PanelHeight();
        }
    }

    @undoBatch
    @action
    makeIntoPortal = async () => {
        const anchors = await Promise.all(DocListCast(this.Document.links).map(async (d: Doc) => Cast(d.anchor2, Doc)));
        if (!anchors.find(anchor2 => anchor2 && anchor2.title === this.Document.title + ".portal" ? true : false)) {
            const portalID = (this.Document.title + ".portal").replace(/^-/, "").replace(/\([0-9]*\)$/, "");
            DocServer.GetRefField(portalID).then(existingPortal => {
                const portal = existingPortal instanceof Doc ? existingPortal : Docs.Create.FreeformDocument([], { width: (this.layoutDoc.width || 0) + 10, height: this.layoutDoc.height || 0, title: portalID });
                DocUtils.MakeLink({ doc: this.props.Document, ctx: this.props.ContainingCollectionDoc }, { doc: portal }, portalID, "portal link");
                this.Document.isButton = true;
            });
        }
    }

    @undoBatch
    @action
    setCustomView = (custom: boolean): void => {
        if (this.props.ContainingCollectionView?.props.DataDoc || this.props.ContainingCollectionView?.props.Document.isTemplateDoc) {
            Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.ContainingCollectionView.props.Document);
        } else {
            custom ? DocumentView.makeCustomViewClicked(this.props.Document, this.props.DataDoc) : DocumentView.makeNativeViewClicked(this.props.Document);
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
        if (e.button === 0) {
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
        subitems.push({ description: "Open Fields     ", event: () => this.props.addDocTab(Docs.Create.KVPDocument(this.props.Document, { width: 300, height: 300 }), undefined, "onRight"), icon: "layer-group" });
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
        if (this.props.DataDoc) {
            layoutItems.push({ description: "Make View of Metadata Field", event: () => Doc.MakeMetadataFieldTemplate(this.props.Document, this.props.DataDoc!), icon: "concierge-bell" });
        }
        layoutItems.push({ description: `${this.Document.chromeStatus !== "disabled" ? "Hide" : "Show"} Chrome`, event: () => this.Document.chromeStatus = (this.Document.chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram" });
        layoutItems.push({ description: `${this.Document.autoHeight ? "Variable Height" : "Auto Height"}`, event: () => this.layoutDoc.autoHeight = !this.layoutDoc.autoHeight, icon: "plus" });
        layoutItems.push({ description: this.Document.ignoreAspect || !this.Document.nativeWidth || !this.Document.nativeHeight ? "Freeze" : "Unfreeze", event: this.freezeNativeDimensions, icon: "snowflake" });
        layoutItems.push({ description: this.Document.lockedPosition ? "Unlock Position" : "Lock Position", event: this.toggleLockPosition, icon: BoolCast(this.Document.lockedPosition) ? "unlock" : "lock" });
        layoutItems.push({ description: this.Document.lockedTransform ? "Unlock Transform" : "Lock Transform", event: this.toggleLockTransform, icon: BoolCast(this.Document.lockedTransform) ? "unlock" : "lock" });
        layoutItems.push({ description: "Center View", event: () => this.props.focus(this.props.Document, false), icon: "crosshairs" });
        layoutItems.push({ description: "Zoom to Document", event: () => this.props.focus(this.props.Document, true), icon: "search" });
        if (this.Document.type !== DocumentType.COL && this.Document.type !== DocumentType.TEMPLATE) {
            layoutItems.push({ description: "Use Custom Layout", event: () => DocumentView.makeCustomViewClicked(this.props.Document, this.props.DataDoc), icon: "concierge-bell" });
        } else {
            layoutItems.push({ description: "Use Native Layout", event: () => DocumentView.makeNativeViewClicked(this.props.Document), icon: "concierge-bell" });
        }
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
                    DocServer.setFieldWriteMode("width", mode1);
                    DocServer.setFieldWriteMode("height", mode1);

                    DocServer.setFieldWriteMode("panX", mode2);
                    DocServer.setFieldWriteMode("panY", mode2);
                    DocServer.setFieldWriteMode("scale", mode2);
                    DocServer.setFieldWriteMode("viewType", mode2);
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

    // does Document set a layout prop 
    setsLayoutProp = (prop: string) => this.props.Document[prop] !== this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)] && this.props.Document["default" + prop[0].toUpperCase() + prop.slice(1)];
    // get the a layout prop by first choosing the prop from Document, then falling back to the layout doc otherwise.
    getLayoutPropStr = (prop: string) => StrCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);
    getLayoutPropNum = (prop: string) => NumCast(this.setsLayoutProp(prop) ? this.props.Document[prop] : this.layoutDoc[prop]);

    isSelected = (outsideReaction?: boolean) => SelectionManager.IsSelected(this, outsideReaction);
    select = (ctrlPressed: boolean) => { SelectionManager.SelectDoc(this, ctrlPressed); };

    chromeHeight = () => {
        const showOverlays = this.props.showOverlays ? this.props.showOverlays(this.Document) : undefined;
        const showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.layoutDoc.showTitle);
        const showTitleHover = showOverlays && "titleHover" in showOverlays ? showOverlays.titleHover : StrCast(this.layoutDoc.showTitleHover);
        return (showTitle && !showTitleHover ? 0 : 0) + 1;
    }

    @computed get finalLayoutKey() { return this.props.layoutKey || "layout"; }
    childScaling = () => (this.layoutDoc.fitWidth ? this.props.PanelWidth() / this.nativeWidth : this.props.ContentScaling());
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
            showOverlays={this.props.showOverlays}
            ContentScaling={this.childScaling}
            ruleProvider={this.props.ruleProvider}
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
        const showOverlays = this.props.showOverlays ? this.props.showOverlays(this.Document) : undefined;
        const showTitle = showOverlays && "title" in showOverlays ? showOverlays.title : StrCast(this.getLayoutPropStr("showTitle"));
        const showTitleHover = showOverlays && "titleHover" in showOverlays ? showOverlays.titleHover : StrCast(this.getLayoutPropStr("showTitleHover"));
        const showCaption = showOverlays && "caption" in showOverlays ? showOverlays.caption : this.getLayoutPropStr("showCaption");
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
                    contents={(this.props.DataDoc || this.props.Document)[showTitle]}
                    display={"block"} height={72} fontSize={12}
                    GetValue={() => StrCast((this.props.DataDoc || this.props.Document)[showTitle])}
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
        const ruleColor = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleColor_" + this.Document.heading]) : undefined;
        const ruleRounding = this.props.ruleProvider ? StrCast(this.props.ruleProvider["ruleRounding_" + this.Document.heading]) : undefined;
        const colorSet = this.setsLayoutProp("backgroundColor");
        const clusterCol = this.props.ContainingCollectionDoc && this.props.ContainingCollectionDoc.clusterOverridesDefaultBackground;
        const backgroundColor = (clusterCol && !colorSet) ?
            this.props.backgroundColor(this.Document) || StrCast(this.layoutDoc.backgroundColor) :
            ruleColor && !colorSet ? ruleColor : StrCast(this.layoutDoc.backgroundColor) || this.props.backgroundColor(this.Document);

        const fullDegree = Doc.isBrushedHighlightedDegree(this.props.Document);
        const borderRounding = this.getLayoutPropStr("borderRounding") || ruleRounding;
        const localScale = fullDegree;

        const animDims = this.Document.animateToDimensions ? Array.from(this.Document.animateToDimensions) : undefined;
        const animheight = animDims ? animDims[1] : "100%";
        const animwidth = animDims ? animDims[0] : "100%";

        const highlightColors = ["transparent", "maroon", "maroon", "yellow", "magenta", "cyan", "orange"];
        const highlightStyles = ["solid", "dashed", "solid", "solid", "solid", "solid", "solid"];
        let highlighting = fullDegree && this.layoutDoc.type !== DocumentType.FONTICON && this.layoutDoc.viewType !== CollectionViewType.Linear;
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
                background: this.layoutDoc.type === DocumentType.FONTICON || this.layoutDoc.viewType === CollectionViewType.Linear ? undefined : backgroundColor,
                width: animwidth,
                height: animheight,
                opacity: this.Document.opacity
            }} onTouchStart={this.onTouchStart}>
            {this.innards}
        </div>;
    }
}

Scripting.addGlobal(function toggleDetail(doc: any) { doc.layoutKey = StrCast(doc.layoutKey, "layout") === "layout" ? "layoutCustom" : "layout"; });