import { IconProp } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Tooltip } from '@material-ui/core';
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { AclAdmin, AclEdit, DataSym, Doc, Field } from "../../fields/Doc";
import { Document } from '../../fields/documentSchemas';
import { HtmlField } from '../../fields/HtmlField';
import { InkField } from "../../fields/InkField";
import { ScriptField } from '../../fields/ScriptField';
import { Cast, NumCast } from "../../fields/Types";
import { GetEffectiveAcl } from '../../fields/util';
import { emptyFunction, returnFalse, setupMoveUpEvents, simulateMouseClick } from "../../Utils";
import { DocUtils } from "../documents/Documents";
import { DocumentType } from '../documents/DocumentTypes';
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { SnappingManager } from '../util/SnappingManager';
import { undoBatch, UndoManager } from "../util/UndoManager";
import { CollectionDockingView } from './collections/CollectionDockingView';
import { FormatShapePane } from './collections/collectionFreeForm/FormatShapePane';
import { DocumentButtonBar } from './DocumentButtonBar';
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import React = require("react");
import e = require('express');

@observer
export class DocumentDecorations extends React.Component<{}, { value: string }> {
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
    private _prevX = 0;
    private _prevY = 0;
    private _centerPoints: { X: number, Y: number }[] = [];
    private _inkDocs: { x: number, y: number, width: number, height: number }[] = [];

    @observable private _accumulatedTitle = "";
    @observable private _titleControlString: string = "#title";
    @observable private _edtingTitle = false;
    @observable private _hidden = false;

    @observable public Interacting = false;
    @observable public pushIcon: IconProp = "arrow-alt-circle-up";
    @observable public pullIcon: IconProp = "arrow-alt-circle-down";
    @observable public pullColor: string = "white";

    constructor(props: Readonly<{}>) {
        super(props);
        DocumentDecorations.Instance = this;
        reaction(() => SelectionManager.SelectedDocuments().slice(), docs => this.titleBlur(false));
    }

    @computed
    get Bounds(): { x: number, y: number, b: number, r: number } {
        return SelectionManager.SelectedDocuments().reduce((bounds, documentView) => {
            if (documentView.props.renderDepth === 0 ||
                documentView.props.treeViewDoc ||
                !documentView.ContentDiv ||
                Doc.AreProtosEqual(documentView.props.Document, Doc.UserDoc())) {
                return bounds;
            }
            const transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            if (documentView.props.LayoutTemplateString?.includes("LinkAnchorBox")) {
                const docuBox = documentView.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
                if (docuBox.length) {
                    const rect = docuBox[0].getBoundingClientRect();
                    sptX = rect.left;
                    sptY = rect.top;
                    bptX = rect.right;
                    bptY = rect.bottom;
                }
            }
            return {
                x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
            };
        }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
    }

    titleBlur = action((commit: boolean) => {
        this._edtingTitle = false;
        if (commit) {
            if (this._accumulatedTitle.startsWith("#") || this._accumulatedTitle.startsWith("=")) {
                this._titleControlString = this._accumulatedTitle;
            } else if (this._titleControlString.startsWith("#")) {
                const selectionTitleFieldKey = this._titleControlString.substring(1);
                selectionTitleFieldKey === "title" && (SelectionManager.SelectedDocuments()[0].dataDoc["title-custom"] = !this._accumulatedTitle.startsWith("-"));
                UndoManager.RunInBatch(() => selectionTitleFieldKey && SelectionManager.SelectedDocuments().forEach(d => {
                    const value = typeof d.props.Document[selectionTitleFieldKey] === "number" ? +this._accumulatedTitle : this._accumulatedTitle;
                    Doc.SetInPlace(d.props.Document, selectionTitleFieldKey, value, true);
                }), "title blur");
            }
        }
    });

    @action titleEntered = (e: any) => {
        const key = e.keyCode || e.which;
        // enter pressed
        if (key === 13) {
            const text = e.target.value;
            if (text.startsWith("::")) {
                this._accumulatedTitle = text.slice(2, text.length);
                const promoteDoc = SelectionManager.SelectedDocuments()[0];
                Doc.SetInPlace(promoteDoc.props.Document, "title", this._accumulatedTitle, true);
                DocUtils.Publish(promoteDoc.props.Document, this._accumulatedTitle, promoteDoc.props.addDocument, promoteDoc.props.removeDocument);
            }
            e.target.blur();
        }
    }
    @action onTitleDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onBackgroundMove, (e) => { }, this.onTitleClick);
    }
    @action onTitleClick = (e: PointerEvent): void => {
        !this._edtingTitle && (this._accumulatedTitle = this._titleControlString.startsWith("#") ? this.selectionTitle : this._titleControlString);
        this._edtingTitle = true;
        setTimeout(() => this._keyinput.current!.focus(), 0);
    }

    @action onSettingsDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, () => false, (e) => { }, this.onSettingsClick);
    }
    @action onSettingsClick = (e: PointerEvent): void => {
        if (e.button === 0 && !e.altKey && !e.ctrlKey) {
            let child = SelectionManager.SelectedDocuments()[0].ContentDiv!.children[0];
            while (child.children.length) {
                const next = Array.from(child.children).find(c => typeof (c.className) === "string");
                if (next?.className.includes("documentView-node")) break;
                if (next) child = next;
                else break;
            }
            simulateMouseClick(child, e.clientX, e.clientY + 30, e.screenX, e.screenY + 30);
        }
    }

    onBackgroundDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onBackgroundMove, (e) => { }, (e) => { });
    }

    @action
    onBackgroundMove = (e: PointerEvent, down: number[]): boolean => {
        const dragDocView = SelectionManager.SelectedDocuments()[0];
        const dragData = new DragManager.DocumentDragData(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        const [left, top] = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).inverse().transformPoint(0, 0);
        dragData.offset = dragDocView.props.ScreenToLocalTransform().scale(dragDocView.props.ContentScaling()).transformDirection(e.x - left, e.y - top);
        dragData.moveDocument = SelectionManager.SelectedDocuments()[0].props.moveDocument;
        dragData.isSelectionMove = true;
        this.Interacting = true;
        this._hidden = true;
        DragManager.StartDocumentDrag(SelectionManager.SelectedDocuments().map(dv => dv.ContentDiv!), dragData, e.x, e.y, {
            dragComplete: action(e => this._hidden = this.Interacting = false),
            hideSource: true
        });
        return true;
    }

    onIconifyDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, (e, d) => false, (e) => { }, this.onIconifyClick);
    }
    @undoBatch
    @action
    onCloseClick = async (e: React.MouseEvent | undefined) => {
        if (!e?.button) {
            const selected = SelectionManager.SelectedDocuments().slice();
            SelectionManager.DeselectAll();
            selected.map(dv => dv.props.removeDocument?.(dv.props.Document));
        }
    }
    @action
    onMaximizeDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, (e, d) => false, (e) => { }, this.onMaximizeClick);
    }
    @undoBatch
    @action
    onMaximizeClick = (e: PointerEvent): void => {
        if (e.button === 0) {
            const selectedDocs = SelectionManager.SelectedDocuments();
            if (selectedDocs.length) {
                //CollectionDockingView.Instance?.OpenFullScreen(selectedDocs[0], selectedDocs[0].props.LibraryPath);
                CollectionDockingView.AddRightSplit(Doc.MakeAlias(selectedDocs[0].props.Document), selectedDocs[0].props.LibraryPath);
            }
        }
        SelectionManager.DeselectAll();
    }
    @undoBatch
    @action
    onIconifyClick = (e: PointerEvent): void => {
        if (e.button === 0) {
            SelectionManager.SelectedDocuments().forEach(dv => dv?.iconify());
        }
        SelectionManager.DeselectAll();
    }

    @action
    onSelectorUp = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, returnFalse, emptyFunction, action((e) => {
            const selDoc = SelectionManager.SelectedDocuments()?.[0];
            if (selDoc) {
                selDoc.props.ContainingCollectionView?.props.select(false);
            }
        }));
    }

    @action
    onRadiusDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onRadiusMove, (e) => this._resizeUndo?.end(), (e) => { });
        if (e.button === 0) {
            this._resizeUndo = UndoManager.StartBatch("DocDecs set radius");
        }
    }

    onRadiusMove = (e: PointerEvent, down: number[]): boolean => {
        let dist = Math.sqrt((e.clientX - down[0]) * (e.clientX - down[0]) + (e.clientY - down[1]) * (e.clientY - down[1]));
        dist = dist < 3 ? 0 : dist;
        SelectionManager.SelectedDocuments().map(dv => dv.props.Document).map(doc => doc.layout instanceof Doc ? doc.layout : doc.isTemplateForField ? doc : Doc.GetProto(doc)).
            map(d => d.borderRounding = `${Math.max(0, dist)}px`);
        return false;
    }

    @undoBatch
    @action
    onRotateDown = (e: React.PointerEvent): void => {
        this._rotateUndo = UndoManager.StartBatch("rotatedown");

        setupMoveUpEvents(this, e, this.onRotateMove, this.onRotateUp, (e) => { });
        this._prevX = e.clientX;
        this._prevY = e.clientY;
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {
                    const xs = ink.map(p => p.X);
                    const ys = ink.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);
                    // this._centerPoints.push({ X: ((right - left) / 2) + left, Y: ((bottom - top) / 2) + bottom });
                    this._centerPoints.push({ X: left, Y: top });
                }
            }
        }));

    }

    @undoBatch
    @action
    onRotateMove = (e: PointerEvent, down: number[]): boolean => {

        // const distance = Math.sqrt((this._prevY - e.clientY) * (this._prevY - e.clientY) + (this._prevX - e.clientX) * (this._prevX - e.clientX));
        const distance = Math.abs(this._prevY - e.clientY);
        var angle = 0;
        //think of a better condition later...
        // if ((down[0] < e.clientX && this._prevY < e.clientY) || (down[0] > e.clientX && this._prevY > e.clientY)) {
        if (e.clientY > this._prevY) {
            angle = distance * (Math.PI / 180);
            // } else if ((down[0] < e.clientX && this._prevY > e.clientY) || (down[0] > e.clientX && this._prevY <= e.clientY)) {
        } else if (e.clientY < this._prevY) {
            angle = - distance * (Math.PI / 180);
        }
        this._prevX = e.clientX;
        this._prevY = e.clientY;
        var index = 0;
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height && doc.data) {
                doc.rotation = Number(doc.rotation) + Number(angle);
                const inks = Cast(doc.data, InkField)?.inkData;
                if (inks) {
                    const newPoints: { X: number, Y: number }[] = [];
                    for (const ink of inks) {
                        const newX = Math.cos(angle) * (ink.X - this._centerPoints[index].X) - Math.sin(angle) * (ink.Y - this._centerPoints[index].Y) + this._centerPoints[index].X;
                        const newY = Math.sin(angle) * (ink.X - this._centerPoints[index].X) + Math.cos(angle) * (ink.Y - this._centerPoints[index].Y) + this._centerPoints[index].Y;
                        newPoints.push({ X: newX, Y: newY });
                    }
                    doc.data = new InkField(newPoints);
                    const xs = newPoints.map(p => p.X);
                    const ys = newPoints.map(p => p.Y);
                    const left = Math.min(...xs);
                    const top = Math.min(...ys);
                    const right = Math.max(...xs);
                    const bottom = Math.max(...ys);

                    // doc._height = (bottom - top) * element.props.ScreenToLocalTransform().Scale;
                    // doc._width = (right - left) * element.props.ScreenToLocalTransform().Scale;
                    doc._height = (bottom - top);
                    doc._width = (right - left);

                }
                index++;
            }
        }));
        return false;
    }

    onRotateUp = (e: PointerEvent) => {
        this._centerPoints = [];
        this._rotateUndo?.end();
        this._rotateUndo = undefined;
    }



    _initialAutoHeight = false;
    _dragHeights = new Map<Doc, number>();

    @action
    onPointerDown = (e: React.PointerEvent): void => {

        this._inkDocs = [];
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._width && doc._height) {
                this._inkDocs.push({ x: doc.x, y: doc.y, width: doc._width, height: doc._height });
                if (FormatShapePane.Instance._lock) {
                    doc._nativeHeight = doc._height;
                    doc._nativeWidth = doc._width;
                }
            }
        }));

        setupMoveUpEvents(this, e, this.onPointerMove, this.onPointerUp, (e) => { });
        if (e.button === 0) {
            this._resizeHdlId = e.currentTarget.id;
            const bounds = e.currentTarget.getBoundingClientRect();
            this._offX = this._resizeHdlId.toLowerCase().includes("left") ? bounds.right - e.clientX : bounds.left - e.clientX;
            this._offY = this._resizeHdlId.toLowerCase().includes("top") ? bounds.bottom - e.clientY : bounds.top - e.clientY;
            this.Interacting = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs resize");
            SelectionManager.SelectedDocuments()[0].props.setupDragLines?.(e.ctrlKey || e.shiftKey);
        }
        this._snapX = e.pageX;
        this._snapY = e.pageY;
        this._initialAutoHeight = true;
        DragManager.docsBeingDragged = SelectionManager.SelectedDocuments().map(dv => dv.rootDoc);
        SelectionManager.SelectedDocuments().map(dv => {
            this._dragHeights.set(dv.layoutDoc, NumCast(dv.layoutDoc._height));
            dv.layoutDoc._delayAutoHeight = dv.layoutDoc._height;
        });
    }

    onPointerMove = (e: PointerEvent, down: number[], move: number[]): boolean => {
        const first = SelectionManager.SelectedDocuments()[0];
        let thisPt = { thisX: e.clientX - this._offX, thisY: e.clientY - this._offY };
        var fixedAspect = first.layoutDoc._nativeWidth ? NumCast(first.layoutDoc._nativeWidth) / NumCast(first.layoutDoc._nativeHeight) : 0;
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc._width && doc._height && FormatShapePane.Instance._lock) {
                fixedAspect = NumCast(doc._nativeWidth) / NumCast(doc._nativeHeight);
            }
        }));


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
        let dragBottom = false;
        let dragRight = false;
        let dX = 0, dY = 0, dW = 0, dH = 0;
        const unfreeze = () =>
            SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) =>
                ((element.rootDoc.type === DocumentType.RTF ||
                    element.rootDoc.type === DocumentType.COMPARISON ||
                    (element.rootDoc.type === DocumentType.WEB && Doc.LayoutField(element.rootDoc) instanceof HtmlField))
                    && element.layoutDoc._nativeHeight) && element.toggleNativeDimensions()));
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
                unfreeze();
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
                break;
            case "documentDecorations-bottomResizer":
                unfreeze();
                dH = move[1];
                dragBottom = true;
                break;
            case "documentDecorations-leftResizer":
                unfreeze();
                dX = -1;
                dW = -move[0];
                break;
            case "documentDecorations-rightResizer":
                unfreeze();
                dW = move[0];
                dragRight = true;
                break;
        }

        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            if (e.ctrlKey && !element.props.Document._nativeHeight) element.toggleNativeDimensions();
            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = Document(element.rootDoc);
                let nwidth = doc._nativeWidth || 0;
                let nheight = doc._nativeHeight || 0;
                const width = (doc._width || 0);
                let height = (doc._height || (nheight / nwidth * width));
                height = !height || isNaN(height) ? 20 : height;
                const scale = element.props.ScreenToLocalTransform().Scale * element.props.ContentScaling();
                if (nwidth && nheight) {
                    if (nwidth / nheight !== width / height) {
                        height = nheight / nwidth * width;
                    }
                    if (e.ctrlKey || (!dragBottom || !element.layoutDoc._fitWidth)) { // ctrl key enables modification of the nativeWidth or nativeHeight durin the interaction
                        if (Math.abs(dW) > Math.abs(dH)) dH = dW * nheight / nwidth;
                        else dW = dH * nwidth / nheight;
                    }
                }
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = (nwidth && nheight);
                const fieldKey = Doc.LayoutFieldKey(doc);
                if (fixedAspect && (!nwidth || !nheight)) {
                    doc[DataSym][fieldKey + "-nativeWidth"] = doc._nativeWidth = nwidth = doc._width || 0;
                    doc[DataSym][fieldKey + "-nativeHeight"] = doc._nativeHeight = nheight = doc._height || 0;
                }
                const anno = Cast(doc.annotationOn, Doc, null);
                if (e.ctrlKey && anno) {
                    dW !== 0 && runInAction(() => {
                        const dataDoc = anno[DataSym];
                        const annoFieldKey = Doc.LayoutFieldKey(anno);
                        const nw = NumCast(dataDoc[annoFieldKey + "-nativeWidth"]);
                        const nh = NumCast(dataDoc[annoFieldKey + "-nativeHeight"]);
                        dataDoc[annoFieldKey + "-nativeWidth"] = nw + (dW > 0 ? 10 : -10);
                        dataDoc[annoFieldKey + "-nativeHeight"] = nh + (dW > 0 ? 10 : -10) * nh / nw;
                    });
                }
                else if (nwidth > 0 && nheight > 0) {
                    if (Math.abs(dW) > Math.abs(dH) || dragRight) {
                        if (!fixedAspect || (dragRight && e.ctrlKey)) {
                            doc[DataSym][fieldKey + "-nativeWidth"] = doc._nativeWidth = actualdW / (doc._width || 1) * (doc._nativeWidth || 0);
                        }
                        doc._width = actualdW;
                        if (fixedAspect && !doc._fitWidth) doc._height = nheight / nwidth * doc._width;
                        else if (!fixedAspect || !e.ctrlKey) doc._height = actualdH;
                    }
                    else {
                        if (!fixedAspect || (dragBottom && (e.ctrlKey || element.layoutDoc._fitWidth))) {
                            doc[DataSym][fieldKey + "-nativeHeight"] = doc._nativeHeight = actualdH / (doc._height || 1) * (doc._nativeHeight || 0);
                        }
                        doc._height = actualdH;
                        if (fixedAspect && !doc._fitWidth) doc._width = nwidth / nheight * doc._height;
                        else if (!fixedAspect || !e.ctrlKey) doc._width = actualdW;
                    }
                } else {
                    dW && (doc._width = actualdW);
                    dH && (doc._height = actualdH);
                    dH && this._initialAutoHeight && (doc._autoHeight = this._initialAutoHeight = false);
                }
            }
        }));
        return false;
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        SelectionManager.SelectedDocuments().map(dv => {
            if (NumCast(dv.layoutDoc._delayAutoHeight) < this._dragHeights.get(dv.layoutDoc)!) {
                dv.nativeWidth > 0 && Doc.toggleNativeDimensions(dv.layoutDoc, dv.props.ContentScaling(), dv.props.PanelWidth(), dv.props.PanelHeight());
                dv.layoutDoc._autoHeight = true;
            }
            dv.layoutDoc._delayAutoHeight = undefined;
        });
        this._resizeHdlId = "";
        this.Interacting = false;
        (e.button === 0) && this._resizeUndo?.end();
        this._resizeUndo = undefined;
        SnappingManager.clearSnapLines();


        //need to change points for resize, or else rotation/control points will fail.
        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView, index) => {
            const doc = Document(element.rootDoc);
            if (doc.type === DocumentType.INK && doc.x && doc.y && doc._height && doc._width) {
                const ink = Cast(doc.data, InkField)?.inkData;
                if (ink) {
                    const newPoints: { X: number, Y: number }[] = [];
                    ink.forEach(i => {
                        // (new x — oldx) + (oldxpoint * newWidt)/oldWidth 
                        const newX = ((doc.x || 0) - this._inkDocs[index].x) + (i.X * (doc._width || 0)) / this._inkDocs[index].width;
                        const newY = ((doc.y || 0) - this._inkDocs[index].y) + (i.Y * (doc._height || 0)) / this._inkDocs[index].height;
                        newPoints.push({ X: newX, Y: newY });
                    });
                    doc.data = new InkField(newPoints);

                }
                doc._nativeWidth = 0;
                doc._nativeHeight = 0;
            }
        }));
    }

    @computed
    get selectionTitle(): string {
        if (SelectionManager.SelectedDocuments().length === 1) {
            const selected = SelectionManager.SelectedDocuments()[0];
            if (this._titleControlString.startsWith("=")) {
                return ScriptField.MakeFunction(this._titleControlString.substring(1), { doc: Doc.name })!.script.run({ self: selected.rootDoc, this: selected.layoutDoc }, console.log).result?.toString() || "";
            }
            if (this._titleControlString.startsWith("#")) {
                return Field.toString(selected.props.Document[this._titleControlString.substring(1)] as Field) || "-unset-";
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
    public static DocumentIcon(layout: string) {
        const button = layout.indexOf("PDFBox") !== -1 ? "file-pdf" :
            layout.indexOf("ImageBox") !== -1 ? "image" :
                layout.indexOf("Formatted") !== -1 ? "sticky-note" :
                    layout.indexOf("Video") !== -1 ? "film" :
                        layout.indexOf("Collection") !== -1 ? "object-group" :
                            "caret-up";
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />;
    }
    render() {
        const darkScheme = Cast(Doc.UserDoc().activeDashboard, Doc, null)?.darkScheme ? "dimgray" : undefined;
        const bounds = this.Bounds;
        const seldoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
        if (SnappingManager.GetIsDragging() || bounds.r - bounds.x < 1 || bounds.x === Number.MAX_VALUE || !seldoc || this._hidden || isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            return (null);
        }
        const canDelete = SelectionManager.SelectedDocuments().some(docView => {
            const collectionAcl = GetEffectiveAcl(docView.props.ContainingCollectionDoc?.[DataSym]);
            return collectionAcl === AclAdmin || collectionAcl === AclEdit;
        });
        const minimal = bounds.r - bounds.x < 100 ? true : false;
        const maximizeIcon = minimal ? (
            <Tooltip title={<><div className="dash-tooltip">Show context menu</div></>} placement="top">
                <div className="documentDecorations-contextMenu" onPointerDown={this.onSettingsDown}>
                    <FontAwesomeIcon size="lg" icon="cog" />
                </div></Tooltip>) : canDelete ? (
                    <Tooltip title={<><div className="dash-tooltip">Close</div></>} placement="top">
                        <div className="documentDecorations-closeButton" onClick={this.onCloseClick}>
                            {/* Currently, this is set to be enabled if there is no ink selected. It might be interesting to think about minimizing ink if it's useful? -syip2*/}
                            <FontAwesomeIcon className="documentdecorations-times" icon={"times"} size="lg" />
                        </div></Tooltip>) : (null);

        const titleArea = this._edtingTitle ?
            <>
                <input ref={this._keyinput} className="documentDecorations-title" type="text" name="dynbox" autoComplete="on" value={this._accumulatedTitle}
                    onBlur={e => this.titleBlur(true)} onChange={action(e => this._accumulatedTitle = e.target.value)} onKeyPress={this.titleEntered} />
                {minimal ? (null) : <div className="publishBox" // title="make document referenceable by its title"
                // onPointerDown={action(e => {
                //     if (!seldoc.props.Document["title-custom"]) {
                //         seldoc.props.Document["title-custom"] = true;
                //         StrCast(Doc.GetProto(seldoc.props.Document).title).startsWith("-") && (Doc.GetProto(seldoc.props.Document).title = StrCast(seldoc.props.Document.title).substring(1));
                //         this._accumulatedTitle = StrCast(seldoc.props.Document.title);
                //     }
                //     DocUtils.Publish(seldoc.props.Document, this._accumulatedTitle, seldoc.props.addDocument, seldoc.props.removeDocument);
                // })}
                >
                    {/* <FontAwesomeIcon size="lg" color={SelectionManager.SelectedDocuments()[0].props.Document.title === SelectionManager.SelectedDocuments()[0].props.Document[Id] ? "green" : undefined} icon="sticky-note"></FontAwesomeIcon> */}
                </div>}
            </> :
            <>
                {minimal ? (null) : <Tooltip title={<><div className="dash-tooltip">Show context menu</div></>} placement="top"><div className="documentDecorations-contextMenu" key="menu" onPointerDown={this.onSettingsDown}>
                    <FontAwesomeIcon size="lg" icon="cog" />
                </div></Tooltip>}
                <div className="documentDecorations-title" key="title" onPointerDown={this.onTitleDown} >
                    <span style={{ width: "100%", display: "inline-block", cursor: "move" }}>{`${this.selectionTitle}`}</span>
                </div>
            </>;

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
        const useRotation = seldoc.rootDoc.type === DocumentType.INK;

        return (<div className="documentDecorations" style={{ background: darkScheme }} >
            <div className="documentDecorations-background" style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2,
                pointerEvents: this.Interacting ? "none" : "all",
                zIndex: SelectionManager.SelectedDocuments().length > 1 ? 900 : 0,
            }} onPointerDown={this.onBackgroundDown} onContextMenu={e => { e.preventDefault(); e.stopPropagation(); }} >
            </div>
            {bounds.r - bounds.x < 15 && bounds.b - bounds.y < 15 ? (null) : <>
                <div className="documentDecorations-container" key="container" ref={this.setTextBar} style={{
                    width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                    height: (bounds.b - bounds.y + this._resizeBorderWidth + this._titleHeight) + "px",
                    left: bounds.x - this._resizeBorderWidth / 2,
                    top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
                }}>
                    {maximizeIcon}
                    {titleArea}
                    {SelectionManager.SelectedDocuments().length !== 1 || seldoc.Document.type === DocumentType.INK ? (null) :
                        <Tooltip title={<><div className="dash-tooltip">{`${seldoc.finalLayoutKey.includes("icon") ? "De" : ""}Iconify Document`}</div></>} placement="top">
                            <div className="documentDecorations-iconifyButton" onPointerDown={this.onIconifyDown}>
                                <FontAwesomeIcon icon={seldoc.finalLayoutKey.includes("icon") ? "window-restore" : "window-minimize"} className="documentView-minimizedIcon" />
                            </div></Tooltip>}
                    <Tooltip title={<><div className="dash-tooltip">Open In a New Pane</div></>} placement="top"><div className="documentDecorations-openInTab" onPointerDown={this.onMaximizeDown}>
                        {SelectionManager.SelectedDocuments().length === 1 ? <FontAwesomeIcon icon="external-link-alt" className="documentView-minimizedIcon" /> : "..."}
                    </div></Tooltip>
                    <div id="documentDecorations-topLeftResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-topResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-topRightResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-leftResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-centerCont"></div>
                    <div id="documentDecorations-rightResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-bottomLeftResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-bottomResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    <div id="documentDecorations-bottomRightResizer" className="documentDecorations-resizer"
                        onPointerDown={this.onPointerDown} onContextMenu={(e) => e.preventDefault()}></div>
                    {seldoc.props.renderDepth <= 1 || !seldoc.props.ContainingCollectionView ? (null) :
                        <Tooltip title={<><div className="dash-tooltip">tap to select containing document</div></>} placement="top">
                            <div id="documentDecorations-levelSelector" className="documentDecorations-selector"
                                onPointerDown={this.onSelectorUp} onContextMenu={e => e.preventDefault()}>
                                <FontAwesomeIcon className="documentdecorations-times" icon={"arrow-alt-circle-up"} size="lg" />
                            </div></Tooltip>}
                    <div id={`documentDecorations-${useRotation ? "rotation" : "borderRadius"}`}
                        onPointerDown={useRotation ? this.onRotateDown : this.onRadiusDown} onContextMenu={(e) => e.preventDefault()}>{useRotation && "⟲"}</div>

                </div >
                <div className="link-button-container" key="links" style={{ left: bounds.x - this._resizeBorderWidth / 2 + 10, top: bounds.b + this._resizeBorderWidth / 2 }}>
                    <DocumentButtonBar views={SelectionManager.SelectedDocuments} />
                </div>
            </>}
        </div >
        );
    }
}