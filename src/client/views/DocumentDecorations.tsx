import { IconProp, library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faTextHeight, faArrowAltCircleDown, faArrowAltCircleUp, faCheckCircle, faCloudUploadAlt, faLink, faShare, faStopCircle, faSyncAlt, faTag, faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DataSym, Field } from "../../new_fields/Doc";
import { Document } from '../../new_fields/documentSchemas';
import { ScriptField } from '../../new_fields/ScriptField';
import { Cast, StrCast, NumCast } from "../../new_fields/Types";
import { Utils, setupMoveUpEvents, emptyFunction, returnFalse, simulateMouseClick } from "../../Utils";
import { DocUtils } from "../documents/Documents";
import { DocumentType } from '../documents/DocumentTypes';
import { DragManager } from "../util/DragManager";
import { SelectionManager } from "../util/SelectionManager";
import { undoBatch, UndoManager } from "../util/UndoManager";
import { DocumentButtonBar } from './DocumentButtonBar';
import './DocumentDecorations.scss';
import { DocumentView } from "./nodes/DocumentView";
import React = require("react");
import { Id } from '../../new_fields/FieldSymbols';
import e = require('express');
import { CollectionDockingView } from './collections/CollectionDockingView';
import { MainView } from './MainView';

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm, faTextHeight);
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
    private _resizeHdlId = "";
    private _keyinput = React.createRef<HTMLInputElement>();
    private _resizeBorderWidth = 16;
    private _linkBoxHeight = 20 + 3; // link button height + margin
    private _titleHeight = 20;
    private _resizeUndo?: UndoManager.Batch;
    private _offX = 0; _offY = 0;  // offset from click pt to inner edge of resize border
    private _snapX = 0; _snapY = 0; // last snapped location of resize border
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
                Doc.AreProtosEqual(documentView.props.Document, Doc.UserDoc())) {
                return bounds;
            }
            const transform = (documentView.props.ScreenToLocalTransform().scale(documentView.props.ContentScaling())).inverse();
            var [sptX, sptY] = transform.transformPoint(0, 0);
            let [bptX, bptY] = transform.transformPoint(documentView.props.PanelWidth(), documentView.props.PanelHeight());
            if (documentView.props.Document.type === DocumentType.LINK) {
                const docuBox = documentView.ContentDiv!.getElementsByClassName("linkAnchorBox-cont");
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
                selectionTitleFieldKey === "title" && (SelectionManager.SelectedDocuments()[0].props.Document.customTitle = !this._accumulatedTitle.startsWith("-"));
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
                const next = Array.from(child.children).find(c => !c.className.includes("collectionViewChrome"));
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
    onCloseClick = async (e: PointerEvent) => {
        if (e.button === 0) {
            const recent = Cast(Doc.UserDoc().myRecentlyClosed, Doc) as Doc;
            const selected = SelectionManager.SelectedDocuments().slice();
            SelectionManager.DeselectAll();

            selected.map(dv => {
                recent && Doc.AddDocToList(recent, "data", dv.props.Document, undefined, true, true);
                dv.props.removeDocument?.(dv.props.Document);
            });
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

    @action
    onPointerDown = (e: React.PointerEvent): void => {
        setupMoveUpEvents(this, e, this.onPointerMove, this.onPointerUp, (e) => { });
        if (e.button === 0) {
            this._resizeHdlId = e.currentTarget.id;
            const bounds = e.currentTarget.getBoundingClientRect();
            this._offX = this._resizeHdlId.toLowerCase().includes("left") ? bounds.right - e.clientX : bounds.left - e.clientX;
            this._offY = this._resizeHdlId.toLowerCase().includes("top") ? bounds.bottom - e.clientY : bounds.top - e.clientY;
            this.Interacting = true;
            this._resizeUndo = UndoManager.StartBatch("DocDecs resize");
            SelectionManager.SelectedDocuments()[0].props.setupDragLines?.();
        }
        this._snapX = e.pageX;
        this._snapY = e.pageY;
    }

    onPointerMove = (e: PointerEvent, down: number[], move: number[]): boolean => {
        const { thisX, thisY } = DragManager.snapDrag(e, -this._offX, -this._offY, this._offX, this._offY);
        move[0] = thisX - this._snapX;
        move[1] = thisY - this._snapY;
        this._snapX = thisX;
        this._snapY = thisY;

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
                break;
            case "documentDecorations-bottomResizer":
                dH = move[1];
                break;
            case "documentDecorations-leftResizer":
                dX = -1;
                dW = -move[0];
                break;
            case "documentDecorations-rightResizer":
                dW = move[0];
                break;
        }

        SelectionManager.SelectedDocuments().forEach(action((element: DocumentView) => {
            if (dX !== 0 || dY !== 0 || dW !== 0 || dH !== 0) {
                const doc = Document(element.rootDoc);
                let nwidth = doc._nativeWidth || 0;
                let nheight = doc._nativeHeight || 0;
                const width = (doc._width || 0);
                const height = (doc._height || (nheight / nwidth * width));
                const scale = element.props.ScreenToLocalTransform().Scale * element.props.ContentScaling();
                if (nwidth && nheight) {
                    if (Math.abs(dW) > Math.abs(dH)) dH = dW * nheight / nwidth;
                    else dW = dH * nwidth / nheight;
                }
                const actualdW = Math.max(width + (dW * scale), 20);
                const actualdH = Math.max(height + (dH * scale), 20);
                doc.x = (doc.x || 0) + dX * (actualdW - width);
                doc.y = (doc.y || 0) + dY * (actualdH - height);
                const fixedAspect = (nwidth && nheight);
                if (fixedAspect && (!nwidth || !nheight)) {
                    doc._nativeWidth = nwidth = doc._width || 0;
                    doc._nativeHeight = nheight = doc._height || 0;
                }
                const anno = Cast(doc.annotationOn, Doc, null);
                if (e.ctrlKey && anno) {
                    dW !== 0 && runInAction(() => {
                        const dataDoc = anno[DataSym];
                        const fieldKey = Doc.LayoutFieldKey(anno);
                        const nw = NumCast(dataDoc[fieldKey + "-nativeWidth"]);
                        const nh = NumCast(dataDoc[fieldKey + "-nativeHeight"]);
                        dataDoc[fieldKey + "-nativeWidth"] = nw + (dW > 0 ? 10 : -10);
                        dataDoc[fieldKey + "-nativeHeight"] = nh + (dW > 0 ? 10 : -10) * nh / nw;
                    });
                }
                else if (nwidth > 0 && nheight > 0) {
                    if (Math.abs(dW) > Math.abs(dH)) {
                        if (!fixedAspect) {
                            doc._nativeWidth = actualdW / (doc._width || 1) * (doc._nativeWidth || 0);
                        }
                        doc._width = actualdW;
                        if (fixedAspect && !doc._fitWidth) doc._height = nheight / nwidth * doc._width;
                        else doc._height = actualdH;
                    }
                    else {
                        if (!fixedAspect) {
                            doc._nativeHeight = actualdH / (doc._height || 1) * (doc._nativeHeight || 0);
                        }
                        doc._height = actualdH;
                        if (fixedAspect && !doc._fitWidth) doc._width = nwidth / nheight * doc._height;
                        else doc._width = actualdW;
                    }
                } else {
                    dW && (doc._width = actualdW);
                    dH && (doc._height = actualdH);
                    dH && doc._autoHeight && (doc._autoHeight = false);
                }
            }
        }));
        return false;
    }

    @action
    onPointerUp = (e: PointerEvent): void => {
        this._resizeHdlId = "";
        this.Interacting = false;
        (e.button === 0) && this._resizeUndo?.end();
        this._resizeUndo = undefined;
        MainView.Instance._hLines = [];
        MainView.Instance._vLines = [];
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
        const button = layout.indexOf("PDFBox") !== -1 ? faFilePdf :
            layout.indexOf("ImageBox") !== -1 ? faImage :
                layout.indexOf("Formatted") !== -1 ? faStickyNote :
                    layout.indexOf("Video") !== -1 ? faFilm :
                        layout.indexOf("Collection") !== -1 ? faObjectGroup :
                            faCaretUp;
        return <FontAwesomeIcon icon={button} className="documentView-minimizedIcon" />;
    }
    render() {
        const darkScheme = Cast(Doc.UserDoc().activeWorkspace, Doc, null)?.darkScheme ? "dimgray" : undefined;
        const bounds = this.Bounds;
        const seldoc = SelectionManager.SelectedDocuments().length ? SelectionManager.SelectedDocuments()[0] : undefined;
        if (SelectionManager.GetIsDragging() || bounds.r - bounds.x < 2 || bounds.x === Number.MAX_VALUE || !seldoc || this._hidden || isNaN(bounds.r) || isNaN(bounds.b) || isNaN(bounds.x) || isNaN(bounds.y)) {
            return (null);
        }
        const minimal = bounds.r - bounds.x < 100 ? true : false;
        const maximizeIcon = minimal ? (
            <div className="documentDecorations-contextMenu" title="Show context menu" onPointerDown={this.onSettingsDown}>
                <FontAwesomeIcon size="lg" icon="cog" />
            </div>) : (
                <div className="documentDecorations-minimizeButton" title="Iconify" onPointerDown={this.onIconifyDown}>
                    {/* Currently, this is set to be enabled if there is no ink selected. It might be interesting to think about minimizing ink if it's useful? -syip2*/}
                    <FontAwesomeIcon className="documentdecorations-times" icon={faTimes} size="lg" />
                </div>);

        const titleArea = this._edtingTitle ?
            <>
                <input ref={this._keyinput} className="documentDecorations-title" type="text" name="dynbox" autoComplete="on" value={this._accumulatedTitle} style={{ width: minimal ? "100%" : "calc(100% - 20px)" }}
                    onBlur={e => this.titleBlur(true)} onChange={action(e => this._accumulatedTitle = e.target.value)} onKeyPress={this.titleEntered} />
                {minimal ? (null) : <div className="publishBox" title="make document referenceable by its title"
                    onPointerDown={action(e => {
                        if (!seldoc.props.Document.customTitle) {
                            seldoc.props.Document.customTitle = true;
                            StrCast(Doc.GetProto(seldoc.props.Document).title).startsWith("-") && (Doc.GetProto(seldoc.props.Document).title = StrCast(seldoc.props.Document.title).substring(1));
                            this._accumulatedTitle = StrCast(seldoc.props.Document.title);
                        }
                        DocUtils.Publish(seldoc.props.Document, this._accumulatedTitle, seldoc.props.addDocument, seldoc.props.removeDocument);
                    })}>
                    <FontAwesomeIcon size="lg" color={SelectionManager.SelectedDocuments()[0].props.Document.title === SelectionManager.SelectedDocuments()[0].props.Document[Id] ? "green" : undefined} icon="sticky-note"></FontAwesomeIcon>
                </div>}
            </> :
            <div className="documentDecorations-title" onPointerDown={this.onTitleDown} >
                {minimal ? (null) : <div className="documentDecorations-contextMenu" title="Show context menu" onPointerDown={this.onSettingsDown}>
                    <FontAwesomeIcon size="lg" icon="cog" />
                </div>}
                <span style={{ width: "calc(100% - 25px)", display: "inline-block" }}>{`${this.selectionTitle}`}</span>
            </div>;

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
            <div className="documentDecorations-container" ref={this.setTextBar} style={{
                width: (bounds.r - bounds.x + this._resizeBorderWidth) + "px",
                height: (bounds.b - bounds.y + this._resizeBorderWidth + this._titleHeight) + "px",
                left: bounds.x - this._resizeBorderWidth / 2,
                top: bounds.y - this._resizeBorderWidth / 2 - this._titleHeight,
            }}>
                {maximizeIcon}
                {titleArea}
                <div className="documentDecorations-closeButton" title="Open Document in Tab" onPointerDown={this.onMaximizeDown}>
                    {SelectionManager.SelectedDocuments().length === 1 ? DocumentDecorations.DocumentIcon(StrCast(seldoc.props.Document.layout, "...")) : "..."}
                </div>
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
                    <div id="documentDecorations-levelSelector" className="documentDecorations-selector"
                        title="tap to select containing document" onPointerDown={this.onSelectorUp} onContextMenu={e => e.preventDefault()}>
                        <FontAwesomeIcon className="documentdecorations-times" icon={faArrowAltCircleUp} size="lg" />
                    </div>}
                <div id="documentDecorations-borderRadius" className="documentDecorations-radius"
                    onPointerDown={this.onRadiusDown} onContextMenu={(e) => e.preventDefault()}></div>

            </div >
            <div className="link-button-container" style={{ left: bounds.x - this._resizeBorderWidth / 2, top: bounds.b + this._resizeBorderWidth / 2 }}>
                <DocumentButtonBar views={SelectionManager.SelectedDocuments()} />
            </div>
        </div >
        );
    }
}