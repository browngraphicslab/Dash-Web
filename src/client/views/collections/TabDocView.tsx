import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { clamp } from 'lodash';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import { DataSym, Doc, DocListCast, Opt, DocListCastAsync, StrListCast, WidthSym, HeightSym } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { FieldId } from "../../../fields/RefField";
import { listSpec } from '../../../fields/Schema';
import { Cast, NumCast, StrCast, BoolCast } from "../../../fields/Types";
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, emptyPath, returnFalse, returnOne, returnTrue, setupMoveUpEvents, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { SnappingManager } from '../../util/SnappingManager';
import { Transform } from '../../util/Transform';
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { DocumentView, DocAfterFocusFunc } from "../nodes/DocumentView";
import { PresBox, PresMovement } from '../nodes/PresBox';
import { CollectionDockingView } from './CollectionDockingView';
import { CollectionDockingViewMenu } from './CollectionDockingViewMenu';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionViewType } from './CollectionView';
import "./TabDocView.scss";
import React = require("react");
import { List } from '../../../fields/List';
import { DocumentType } from '../../documents/DocumentTypes';
import Color = require('color');
import { InkTool } from '../../../fields/InkField';
const _global = (window /* browser */ || global /* node */) as any;

interface TabDocViewProps {
    documentId: FieldId;
    glContainer: any;
}
@observer
export class TabDocView extends React.Component<TabDocViewProps> {
    _mainCont: HTMLDivElement | null = null;
    _tabReaction: IReactionDisposer | undefined;
    @observable _activated: boolean = false;

    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _isActive: boolean = false;
    @observable private _document: Doc | undefined;
    @observable private _view: DocumentView | undefined;

    get stack() { return (this.props as any).glContainer.parent.parent; }
    get tab() { return (this.props as any).glContainer.tab; }
    get view() { return this._view; }

    @action
    init = (tab: any, doc: Opt<Doc>) => {
        if (tab.contentItem === tab.header.parent.getActiveContentItem()) this._activated = true;
        if (tab.DashDoc !== doc && doc && tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            tab._disposers = {} as { [name: string]: IReactionDisposer };
            tab.contentItem.config.fixed && (tab.contentItem.parent.config.fixed = true);
            tab.DashDoc = doc;
            CollectionDockingView.Instance.tabMap.add(tab);

            // setup the title element and set its size according to the # of chars in the title.  Show the full title when clicked.
            const titleEle = tab.titleElement[0];
            titleEle.size = StrCast(doc.title).length + 3;
            titleEle.value = doc.title;
            titleEle.onchange = undoBatch(action((e: any) => {
                titleEle.size = e.currentTarget.value.length + 3;
                Doc.GetProto(doc).title = e.currentTarget.value;
            }));
            if (tab.element[0].children[1].children.length === 1) {
                const toggle = document.createElement("div");
                toggle.style.width = "10px";
                toggle.style.height = "calc(100% - 2px)";
                toggle.style.left = "-2px";
                toggle.style.bottom = "1px";
                toggle.style.borderTopRightRadius = "7px";
                toggle.style.position = "relative";
                toggle.style.display = "inline-block";
                toggle.style.background = "gray";
                toggle.style.borderLeft = "solid 1px black";
                toggle.onclick = (e: MouseEvent) => {
                    if (tab.contentItem === tab.header.parent.getActiveContentItem()) {
                        tab.DashDoc.activeLayer = tab.DashDoc.activeLayer ? undefined : "background";
                    }
                };
                tab.element[0].style.borderTopRightRadius = "8px";
                tab.element[0].children[1].appendChild(toggle);
                tab._disposers.layerDisposer = reaction(() => ({ layer: tab.DashDoc.activeLayer, color: this.tabColor }),
                    ({ layer, color }) => toggle.style.background = !layer ? color : "dimgrey", { fireImmediately: true });
            }
            // shifts the focus to this tab when another tab is dragged over it
            tab.element[0].onmouseenter = (e: MouseEvent) => {
                if (SnappingManager.GetIsDragging() && tab.contentItem !== tab.header.parent.getActiveContentItem()) {
                    tab.header.parent.setActiveContentItem(tab.contentItem);
                    tab.setActive(true);
                }
            };
            const dragBtnDown = (e: React.PointerEvent) => {
                setupMoveUpEvents(this, e, e => !e.defaultPrevented && DragManager.StartDocumentDrag([dragHdl], new DragManager.DocumentDragData([doc], doc.dropAction as dropActionType), e.clientX, e.clientY), returnFalse, emptyFunction);
            };

            // select the tab document when the tab is directly clicked and activate the tab whenver the tab document is selected
            titleEle.onpointerdown = (e: any) => {
                if (e.target.className !== "lm_close_tab" && this.view) {
                    SelectionManager.SelectDoc(this.view, false);
                    if (Date.now() - titleEle.lastClick < 1000) titleEle.select();
                    titleEle.lastClick = Date.now();
                    (document.activeElement !== titleEle) && titleEle.focus();
                }
            };
            tab._disposers.selectionDisposer = reaction(() => SelectionManager.SelectedDocuments().some(v => (v.topMost || v.props.treeViewDoc) && v.props.Document === doc),
                action((selected) => {
                    if (selected) this._activated = true;
                    const toggle = tab.element[0].children[1].children[0] as HTMLInputElement;
                    selected && tab.contentItem !== tab.header.parent.getActiveContentItem() &&
                        UndoManager.RunInBatch(() => tab.header.parent.setActiveContentItem(tab.contentItem), "tab switch");
                    toggle.style.fontWeight = selected ? "bold" : "";
                    toggle.style.textTransform = selected ? "uppercase" : "";
                }));

            //attach the selection doc buttons menu to the drag handle
            const stack = tab.contentItem.parent;
            const dragHdl = document.createElement("div");
            dragHdl.className = "lm_drag_tab";
            tab._disposers.buttonDisposer = reaction(() => this.view, view =>
                view && [ReactDOM.render(<span className="tabDocView-drag" onPointerDown={dragBtnDown}><CollectionDockingViewMenu views={() => [view]} Stack={stack} /></span>, dragHdl), tab._disposers.buttonDisposer?.()],
                { fireImmediately: true });
            tab.reactComponents = [dragHdl];
            tab.closeElement.before(dragHdl);

            // highlight the tab when the tab document is brushed in any part of the UI
            tab._disposers.reactionDisposer = reaction(() => ({ title: doc.title, degree: Doc.IsBrushedDegree(doc) }), ({ title, degree }) => {
                titleEle.value = title;
                titleEle.style.padding = degree ? 0 : 2;
                titleEle.style.border = `${["gray", "gray", "gray"][degree]} ${["none", "dashed", "solid"][degree]} 2px`;
            }, { fireImmediately: true });

            // clean up the tab when it is closed
            tab.closeElement.off('click') //unbind the current click handler
                .click(function () {
                    Object.values(tab._disposers).forEach((disposer: any) => disposer?.());
                    Doc.AddDocToList(CurrentUserUtils.MyRecentlyClosed, "data", doc, undefined, true, true);
                    SelectionManager.DeselectAll();
                    tab.contentItem.remove();
                });
        }
    }

    /**
     * Adds a document to the presentation view
     **/
    @action
    public static async PinDoc(doc: Doc, unpin = false, audioRange?: boolean) {
        if (unpin) console.log('TODO: Remove UNPIN from this location');
        //add this new doc to props.Document
        const curPres = CurrentUserUtils.ActivePresentation;
        if (curPres) {
            if (doc === curPres) { alert("Cannot pin presentation document to itself"); return; }
            const batch = UndoManager.StartBatch("pinning doc");
            const pinDoc = Doc.MakeAlias(doc);
            pinDoc.presentationTargetDoc = doc;
            pinDoc.title = doc.title + " - Slide";
            pinDoc.presMovement = PresMovement.Zoom;
            pinDoc.groupWithUp = false;
            pinDoc.context = curPres;
            const presArray: Doc[] = PresBox.Instance?.sortArray();
            const size: number = PresBox.Instance?._selectedArray.size;
            const presSelected: Doc | undefined = presArray && size ? presArray[size - 1] : undefined;
            Doc.AddDocToList(curPres, "data", pinDoc, presSelected);
            if (!audioRange && (pinDoc.type === DocumentType.AUDIO || pinDoc.type === DocumentType.VID)) {
                pinDoc.mediaStart = "manual";
                pinDoc.mediaStop = "manual";
                pinDoc.presStartTime = 0;
                pinDoc.presEndTime = pinDoc.type === DocumentType.AUDIO ? doc.duration : NumCast(doc["data-duration"]);
            }
            if (curPres.expandBoolean) pinDoc.presExpandInlineButton = true;
            const dview = CollectionDockingView.Instance.props.Document;
            const fieldKey = CollectionDockingView.Instance.props.fieldKey;
            const sublists = DocListCast(dview[fieldKey]);
            const tabs = Cast(sublists[0], Doc, null);
            const tabdocs = await DocListCastAsync(tabs.data);
            runInAction(() => {
                if (!tabdocs?.includes(curPres)) {
                    tabdocs?.push(curPres);  // bcz: Argh! this is annoying.  if multiple documents are pinned, this will get called multiple times before the presentation view is drawn.  Thus it won't be in the tabdocs list and it will get created multple times.  so need to explicilty add the presbox to the list of open tabs
                    CollectionDockingView.AddSplit(curPres, "right");
                }
                PresBox.Instance?._selectedArray.clear();
                pinDoc && PresBox.Instance?._selectedArray.set(pinDoc, undefined); //Update selected array
                DocumentManager.Instance.jumpToDocument(doc, false, undefined);
                batch.end();
            });
        }
    }

    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public static UnpinDoc(doc: Doc) {
        const curPres = CurrentUserUtils.ActivePresentation;
        if (curPres) {
            const ind = DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc));
            ind !== -1 && Doc.RemoveDocFromList(curPres, "data", DocListCast(curPres.data)[ind]);
        }
    }

    componentDidMount() {
        const selected = () => SelectionManager.SelectedDocuments().some(v => v.props.Document === this._document);
        new _global.ResizeObserver(action((entries: any) => {
            for (const entry of entries) {
                this._panelWidth = entry.contentRect.width;
                this._panelHeight = entry.contentRect.height;
            }
        })).observe(this.props.glContainer._element[0]);
        this.props.glContainer.layoutManager.on("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.tab?.isActive && this.onActiveContentItemChanged();
        this._tabReaction = reaction(() => ({ selected: this.active(), title: this.tab?.titleElement[0] }),
            ({ selected, title }) => title && (title.style.backgroundColor = selected ? "white" : ""),
            { fireImmediately: true });
    }

    componentWillUnmount() {
        this._tabReaction?.();
        this.props.glContainer.layoutManager.off("activeContentItemChanged", this.onActiveContentItemChanged);
    }

    @action.bound
    private onActiveContentItemChanged() {
        if (this.props.glContainer.tab && this._isActive !== this.props.glContainer.tab.isActive) {
            this._isActive = this.props.glContainer.tab.isActive;
            (CollectionDockingView.Instance as any)._goldenLayout?.isInitialised && CollectionDockingView.Instance.stateChanged();
            !this._isActive && this._document && Doc.UnBrushDoc(this._document); // bcz: bad -- trying to simulate a pointer leave event when a new tab is opened up on top of an existing one.
        }
    }

    NativeAspect = () => this.nativeAspect;
    PanelWidth = () => this.panelWidth;
    PanelHeight = () => this.panelHeight;
    nativeWidth = () => this._nativeWidth;
    nativeHeight = () => this._nativeHeight;
    ContentScaling = () => this.contentScaling;

    ScreenToLocalTransform = () => {
        if (this._mainCont?.children) {
            const { translateX, translateY } = Utils.GetScreenTransform(this._mainCont.children[0]?.firstChild as HTMLElement);
            const scale = Utils.GetScreenTransform(this._mainCont).scale;
            return CollectionDockingView.Instance?.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.ContentScaling() / scale);
        }
        return Transform.Identity();
    }
    @computed get nativeAspect() {
        return this.nativeWidth() ? this.nativeWidth() / this.nativeHeight() : 0;
    }
    @computed get panelHeight() {
        return this.NativeAspect() && this.NativeAspect() > this._panelWidth / this._panelHeight ? this._panelWidth / this.NativeAspect() : this._panelHeight;
    }
    @computed get panelWidth() {
        return this.layoutDoc?.maxWidth ? Math.min(Math.max(NumCast(this.layoutDoc._width), Doc.NativeWidth(this.layoutDoc)), this._panelWidth) :
            (this.NativeAspect() && this.NativeAspect() < this._panelWidth / this._panelHeight ? this._panelHeight * this.NativeAspect() : this._panelWidth);
    }
    @computed get _nativeWidth() { return !this.layoutDoc?._fitWidth ? Doc.NativeWidth(this.layoutDoc) || this._panelWidth : 0; }
    @computed get _nativeHeight() { return !this.layoutDoc?._fitWidth ? Doc.NativeHeight(this.layoutDoc) || this._panelHeight : 0; }
    @computed get contentScaling() {
        const nativeW = Doc.NativeWidth(this.layoutDoc);
        const nativeH = Doc.NativeHeight(this.layoutDoc);
        let scaling = 1;
        if (nativeW && (this.layoutDoc?._fitWidth || this._panelHeight / nativeH > this._panelWidth / nativeW)) {
            scaling = this._panelWidth / nativeW;  // width-limited or fitWidth
        } else if (nativeW && nativeH) {
            scaling = this._panelHeight / nativeH; // height-limited
        }
        return scaling;
    }
    @computed get previewPanelCenteringOffset() { return this.nativeWidth() ? (this._panelWidth - this.nativeWidth() * this.ContentScaling()) / 2 : 0; }
    @computed get widthpercent() { return this.nativeWidth() ? `${(this.nativeWidth() * this.ContentScaling()) / this._panelWidth * 100}% ` : undefined; }
    @computed get layoutDoc() { return this._document && Doc.Layout(this._document); }
    @computed static get darkScheme() { return BoolCast(CurrentUserUtils.ActiveDashboard?.darkScheme); }

    // adds a tab to the layout based on the locaiton parameter which can be:
    //  close[:{left,right,top,bottom}]  - e.g., "close" will close the tab, "close:left" will close the left tab, 
    //  add[:{left,right,top,bottom}] - e.g., "add" will add a tab to the current stack, "add:right" will add a tab on the right
    //  replace[:{left,right,top,bottom,<any string>}] - e.g., "replace" will replace the current stack contents, 
    //                                  "replace:right" - will replace the stack on the right named "right" if it exists, or create a stack on the right with that name, 
    //                                   "replace:monkeys" - will replace any tab that has the label 'monkeys', or a tab with that label will be created by default on the right
    //  inPlace - will add the document to any collection along the path from the document to the docking view that has a field isInPlaceContainer. if none is found, inPlace adds a tab to current stack
    addDocTab = (doc: Doc, location: string, libraryPath?: Doc[]) => {
        SelectionManager.DeselectAll();
        const locationFields = doc._viewType === CollectionViewType.Docking ? ["dashboard"] : location.split(":");
        const locationParams = locationFields.length > 1 ? locationFields[1] : "";
        switch (locationFields[0]) {
            case "dashboard": return CurrentUserUtils.openDashboard(Doc.UserDoc(), doc);
            case "close": return CollectionDockingView.CloseSplit(doc, locationParams);
            case "fullScreen": return CollectionDockingView.OpenFullScreen(doc);
            case "replace": return CollectionDockingView.ReplaceTab(doc, locationParams, this.stack);
            case "inPlace":
            case "add":
            default: return CollectionDockingView.AddSplit(doc, locationParams, this.stack);
        }
    }

    @computed get tabColor() { return StrCast(this._document?._backgroundColor, StrCast(this._document?.backgroundColor, TabDocView.styleProvider(this._document, 0, "backgroundColor"))); }
    @computed get renderBounds() {
        const bounds = this._document ? Cast(this._document._renderContentBounds, listSpec("number"), [0, 0, this.returnMiniSize(), this.returnMiniSize()]) : [0, 0, 0, 0];
        const xbounds = bounds[2] - bounds[0];
        const ybounds = bounds[3] - bounds[1];
        const dim = Math.max(xbounds, ybounds);
        return { l: bounds[0] + xbounds / 2 - dim / 2, t: bounds[1] + ybounds / 2 - dim / 2, cx: bounds[0] + xbounds / 2, cy: bounds[1] + ybounds / 2, dim };
    }
    childLayoutTemplate = () => Cast(this._document?.childLayoutTemplate, Doc, null);
    returnMiniSize = () => NumCast(this._document?._miniMapSize, 150);
    miniDown = (e: React.PointerEvent) => {
        const doc = this._document;
        const miniSize = this.returnMiniSize();
        doc && setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            doc._panX = clamp(NumCast(doc._panX) + delta[0] / miniSize * this.renderBounds.dim, this.renderBounds.l, this.renderBounds.l + this.renderBounds.dim);
            doc._panY = clamp(NumCast(doc._panY) + delta[1] / miniSize * this.renderBounds.dim, this.renderBounds.t, this.renderBounds.t + this.renderBounds.dim);
            return false;
        }), emptyFunction, emptyFunction);
    }
    getCurrentFrame = () => {
        return NumCast(Cast(PresBox.Instance.childDocs[PresBox.Instance.itemIndex].presentationTargetDoc, Doc, null)._currentFrame);
    }
    renderMiniMap() {
        const miniWidth = this.PanelWidth() / NumCast(this._document?._viewScale, 1) / this.renderBounds.dim * 100;
        const miniHeight = this.PanelHeight() / NumCast(this._document?._viewScale, 1) / this.renderBounds.dim * 100;
        const miniLeft = 50 + (NumCast(this._document?._panX) - this.renderBounds.cx) / this.renderBounds.dim * 100 - miniWidth / 2;
        const miniTop = 50 + (NumCast(this._document?._panY) - this.renderBounds.cy) / this.renderBounds.dim * 100 - miniHeight / 2;
        const miniSize = this.returnMiniSize();
        return <>
            <div className="miniMap" style={{ width: miniSize, height: miniSize, background: this.tabColor }}>
                <CollectionFreeFormView
                    Document={this._document!}
                    LibraryPath={emptyPath}
                    CollectionView={undefined}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    parentActive={returnFalse}
                    ChildLayoutTemplate={this.childLayoutTemplate} // bcz: Ugh .. should probably be rendering a CollectionView or the minimap should be part of the collectionFreeFormView to avoid having to set stuff like this.
                    noOverlay={true} // don't render overlay Docs since they won't scale
                    active={returnTrue}
                    select={emptyFunction}
                    dropAction={undefined}
                    isSelected={returnFalse}
                    dontRegisterView={true}
                    annotationsKey={""}
                    fieldKey={Doc.LayoutFieldKey(this._document!)}
                    bringToFront={emptyFunction}
                    rootSelected={returnTrue}
                    addDocument={returnFalse}
                    moveDocument={returnFalse}
                    removeDocument={returnFalse}
                    ContentScaling={returnOne}
                    PanelWidth={this.returnMiniSize}
                    PanelHeight={this.returnMiniSize}
                    ScreenToLocalTransform={this.ScreenToLocalTransform}
                    renderDepth={0}
                    whenActiveChanged={emptyFunction}
                    focus={emptyFunction}
                    styleProvider={TabDocView.miniStyleProvider}
                    addDocTab={this.addDocTab}
                    pinToPres={TabDocView.PinDoc}
                    docFilters={CollectionDockingView.Instance.docFilters}
                    docRangeFilters={CollectionDockingView.Instance.docRangeFilters}
                    searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                    fitToBox={true}
                />
                <div className="miniOverlay" onPointerDown={this.miniDown} >
                    <div className="miniThumb" style={{ width: `${miniWidth}% `, height: `${miniHeight}% `, left: `${miniLeft}% `, top: `${miniTop}% `, }} />
                </div>
            </div>

            <Tooltip title={<div className="dash-tooltip">{"toggle minimap"}</div>}>
                <div className="miniMap-hidden" onPointerDown={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this._document!.hideMinimap = !this._document!.hideMinimap; })}
                    style={{ background: TabDocView.styleProvider(this._document, 0, "backgroundColor") }} >
                    <FontAwesomeIcon icon={"globe-asia"} size="lg" />
                </div>
            </Tooltip>
        </>;
    }
    focusFunc = (doc: Doc, willZoom?: boolean, scale?: number, afterFocus?: DocAfterFocusFunc, dontCenter?: boolean, notFocused?: boolean) => {
        if (!this.tab.header.parent._activeContentItem || this.tab.header.parent._activeContentItem !== this.tab.contentItem) {
            this.tab.header.parent.setActiveContentItem(this.tab.contentItem); // glr: Panning does not work when this is set - (this line is for trying to make a tab that is not topmost become topmost)
        }
        afterFocus?.(false);
    }
    setView = action((view: DocumentView) => this._view = view);
    active = () => this._isActive;

    //
    // a preliminary semantic-"layering/grouping" mechanism for determining interactive properties of documents
    //  currently, the provider tests whether the docuemnt's layer field matches the activeLayer field of the tab.
    //     if it matches, then the document gets pointer events, otherwise it does not.
    //
    layerProvider = (doc: Doc, assign?: boolean) => {
        if (doc.z) return true;
        if (assign) {
            const activeLayer = StrCast(this._document?.activeLayer);
            if (activeLayer) {
                const layers = Cast(doc.layers, listSpec("string"), []);
                if (layers.length && !layers.includes(activeLayer)) layers.push(activeLayer);
                else if (!layers.length) doc.layers = new List<string>([activeLayer]);
                if (activeLayer === "red" || activeLayer === "green" || activeLayer === "blue") doc._backgroundColor = activeLayer;
            }
            return true;
        } else {
            if (Doc.AreProtosEqual(doc, this._document)) return true;
            const layers = Cast(doc.layers, listSpec("string"), []);
            if (!layers.length && !this._document?.activeLayer) return true;
            if (layers.includes(StrCast(this._document?.activeLayer))) return true;
            return false;
        }
    }

    @undoBatch
    @action
    static toggleBackground = (doc: Doc) => {
        const layers = StrListCast(doc.layers);
        if (!layers.includes("background")) {
            if (!layers.length) doc.layers = new List<string>(["background"]);
            else layers.push("background");
        }
        else layers.splice(layers.indexOf("background"), 1);
        doc._overflow = !layers.includes("background") ? "visible" : undefined;
        if (!layers.includes("background")) {
            //this.props.bringToFront(doc, true);
            // const wid = this.Document[WidthSym]();    // change the nativewidth and height if the background is to be a collection that aggregates stuff that is added to it.
            // const hgt = this.Document[HeightSym]();
            // Doc.SetNativeWidth(this.props.Document[DataSym], wid);
            // Doc.SetNativeHeight(this.props.Document[DataSym], hgt);
        }
    }
    //
    // a preliminary implementation of a dash style sheet for setting rendering properties of documents nested within a Tab
    // 
    public static styleProvider = (doc: Opt<Doc>, renderDepth: number, property: string, layerProvider?: (doc: Doc, assign?: boolean) => boolean): any => {
        switch (property) {
            case "backgroundColor": {
                if (Doc.UserDoc().renderStyle === "comic") return undefined;
                let docColor = StrCast(doc?._backgroundColor, StrCast(doc?.backgroundColor));
                if (!docColor) {
                    switch (doc?.type) {
                        case DocumentType.PRESELEMENT: docColor = TabDocView.darkScheme ? "" : ""; break;
                        case DocumentType.PRES: docColor = TabDocView.darkScheme ? "#3e3e3e" : "white"; break;
                        case DocumentType.FONTICON: docColor = "black"; break;
                        case DocumentType.RTF: docColor = TabDocView.darkScheme ? "#2d2d2d" : "#f1efeb"; break;
                        case DocumentType.LABEL:
                        case DocumentType.BUTTON: docColor = TabDocView.darkScheme ? "#2d2d2d" : "lightgray"; break;
                        case DocumentType.LINK:
                        case DocumentType.COL:
                            docColor = Doc.IsSystem(doc) ? (TabDocView.darkScheme ? "rgb(62,62,62)" : "lightgrey") :
                                StrCast(renderDepth > 0 ? Doc.UserDoc().activeCollectionNestedBackground : Doc.UserDoc().activeCollectionBackground);
                            break;
                        //if (doc._viewType !== CollectionViewType.Freeform && doc._viewType !== CollectionViewType.Time) return "rgb(62,62,62)";
                        default: docColor = TabDocView.darkScheme ? "black" : "white"; break;
                    }
                }
                if (docColor && (!doc || layerProvider?.(doc) === false)) docColor = Color(docColor).fade(0.5).toString();
                return docColor;
            }
            case "widgetColor": return TabDocView.darkScheme ? "lightgrey" : "dimgrey";
            case "hidden": return (BoolCast(doc?.hidden) /* || layerProvider?.(doc) === false*/);
            case "boxShadow": {
                switch (doc?.type) {
                    case DocumentType.COL: return StrListCast(doc.layers).includes("background") ? undefined :
                        `${TabDocView.darkScheme ? "rgb(30, 32, 31) " : "#9c9396 "} ${StrCast(doc.boxShadow, "0.2vw 0.2vw 0.8vw")}`;
                    default: return undefined;
                }
            }
            case "docContents": return undefined;
            default:
                if (property.startsWith("pointerEvents")) {
                    const layer = doc && layerProvider?.(doc);
                    if (doc?.Opacity === 0 || doc?.type === DocumentType.INK || doc?.isInkMask) return "none";
                    if (layer === false && !property.includes(":selected") && !SnappingManager.GetIsDragging()) return "none";
                    if (doc?.type !== DocumentType.INK && layer === true) return "all";
                    return undefined;
                }
                if (property.startsWith("decorations")) {
                    const isBackground = StrListCast(doc?.layers).includes("background");
                    return doc && (isBackground || property.includes(":selected")) && renderDepth > 0 &&
                        ((doc.type === DocumentType.COL && doc._viewType !== CollectionViewType.Pile) || [DocumentType.RTF, DocumentType.IMG, DocumentType.INK].includes(doc.type as DocumentType)) ?
                        <div className="documentView-lock" onClick={() => TabDocView.toggleBackground(doc)}>
                            <FontAwesomeIcon icon={isBackground ? "unlock" : "lock"} style={{ color: isBackground ? "red" : undefined }} size="lg" />
                        </div>
                        : (null);
                }
        }
    }
    public static miniStyleProvider = (doc: Opt<Doc>, renderDepth: number, property: string, layerProvider?: (doc: Doc, assign?: boolean) => boolean): any => {
        if (doc) {
            switch (property) {
                case "docContents":
                    if (doc.type === DocumentType.COL) return null;
                    const background = doc.type === DocumentType.PDF ? "red" : doc.type === DocumentType.IMG ? "blue" : doc.type === DocumentType.RTF ? "orange" :
                        doc.type === DocumentType.VID ? "purple" : doc.type === DocumentType.WEB ? "yellow" : "gray";
                    return <div style={{ width: doc[WidthSym](), height: doc[HeightSym](), position: "absolute", display: "block", background }} />;
                default:
                    if (property.startsWith("pointerEvents")) return "none";
                    return TabDocView.styleProvider(doc, renderDepth, property, layerProvider);
            }
        }
    }
    @computed get docView() {
        TraceMobx();
        return !this._activated || !this._document || this._document._viewType === CollectionViewType.Docking ? (null) :
            <><DocumentView key={this._document[Id]}
                LibraryPath={emptyPath}
                Document={this._document}
                getView={this.setView}
                DataDoc={!Doc.AreProtosEqual(this._document[DataSym], this._document) ? this._document[DataSym] : undefined}
                bringToFront={emptyFunction}
                rootSelected={returnTrue}
                layerProvider={this.layerProvider}
                addDocument={undefined}
                removeDocument={undefined}
                ContentScaling={this.ContentScaling}
                PanelWidth={this.PanelWidth}
                PanelHeight={this.PanelHeight}
                NativeHeight={this.nativeHeight() ? this.nativeHeight : undefined}
                NativeWidth={this.nativeWidth() ? this.nativeWidth : undefined}
                ScreenToLocalTransform={this.ScreenToLocalTransform}
                renderDepth={0}
                parentActive={this.active}
                whenActiveChanged={emptyFunction}
                focus={this.focusFunc}
                styleProvider={TabDocView.styleProvider}
                addDocTab={this.addDocTab}
                pinToPres={TabDocView.PinDoc}
                docFilters={CollectionDockingView.Instance.docFilters}
                docRangeFilters={CollectionDockingView.Instance.docRangeFilters}
                searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined} />
                {this._document._viewType !== CollectionViewType.Freeform ? (null) :
                    <>{this._document.hideMinimap ? (null) : this.renderMiniMap()}
                        <Tooltip key="ttip" title={<div className="dash-tooltip">{"toggle minimap"}</div>}>
                            <div className="miniMap-hidden" onPointerDown={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this._document!.hideMinimap = !this._document!.hideMinimap; })} >
                                <FontAwesomeIcon icon={"globe-asia"} size="lg" />
                            </div>
                        </Tooltip>
                    </>}
            </>;
    }

    render() {
        return (<div className="collectionDockingView-content" ref={ref => {
            if (this._mainCont = ref) {
                (this._mainCont as any).InitTab = (tab: any) => this.init(tab, this._document);
                DocServer.GetRefField(this.props.documentId).then(action(doc => doc instanceof Doc && (this._document = doc) && this.tab && this.init(this.tab, this._document)));
            }
        }}
            style={{
                transform: `translate(${this.previewPanelCenteringOffset}px, 0px)`,
                height: this.layoutDoc?._fitWidth ? undefined : "100%",
                width: this.widthpercent
            }}>
            {this.docView}
        </div >);
    }
}