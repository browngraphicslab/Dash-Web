import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Tooltip } from '@material-ui/core';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { clamp } from 'lodash';
import { action, computed, IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import { DataSym, Doc, DocListCast, DocListCastAsync, HeightSym, Opt, WidthSym } from "../../../fields/Doc";
import { Id } from '../../../fields/FieldSymbols';
import { FieldId } from "../../../fields/RefField";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { TraceMobx } from '../../../fields/util';
import { emptyFunction, returnEmptyDoclist, returnFalse, returnTrue, setupMoveUpEvents, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { DocUtils } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager, dropActionType } from "../../util/DragManager";
import { SelectionManager } from '../../util/SelectionManager';
import { SnappingManager } from '../../util/SnappingManager';
import { Transform } from '../../util/Transform';
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { LightboxView } from '../LightboxView';
import { DocFocusOptions, DocumentView, DocumentViewProps } from "../nodes/DocumentView";
import { FieldViewProps } from '../nodes/FieldView';
import { PinProps, PresBox, PresMovement } from '../nodes/PresBox';
import { DefaultLayerProvider, DefaultStyleProvider, StyleLayers, StyleProp } from '../StyleProvider';
import { CollectionDockingView } from './CollectionDockingView';
import { CollectionDockingViewMenu } from './CollectionDockingViewMenu';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionViewType } from './CollectionView';
import "./TabDocView.scss";
import React = require("react");
import Color = require('color');
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

    @computed get layoutDoc() { return this._document && Doc.Layout(this._document); }
    @computed get tabColor() { return StrCast(this._document?._backgroundColor, StrCast(this._document?.backgroundColor, DefaultStyleProvider(this._document, undefined, StyleProp.BackgroundColor))); }


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
                        tab.DashDoc.activeLayer = tab.DashDoc.activeLayer ? undefined : StyleLayers.Background;
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
            titleEle.onpointerdown = action((e: any) => {
                if (e.target.className !== "lm_close_tab") {
                    if (this.view) SelectionManager.SelectView(this.view, false);
                    else this._activated = true;
                    if (Date.now() - titleEle.lastClick < 1000) titleEle.select();
                    titleEle.lastClick = Date.now();
                    (document.activeElement !== titleEle) && titleEle.focus();
                }
            });
            tab._disposers.selectionDisposer = reaction(() => SelectionManager.Views().some(v => v.topMost && v.props.Document === doc),
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
    public static async PinDoc(doc: Doc, pinProps?: PinProps) {
        if (pinProps?.unpin) console.log('TODO: Remove UNPIN from this location');
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
            const duration = NumCast(doc[`${Doc.LayoutFieldKey(pinDoc)}-duration`], null);
            Doc.AddDocToList(curPres, "data", pinDoc, presSelected);
            if (!pinProps?.audioRange && duration !== undefined) {
                pinDoc.mediaStart = "manual";
                pinDoc.mediaStop = "manual";
                pinDoc.presStartTime = 0;
                pinDoc.presEndTime = duration;
            }
            //save position
            if (pinProps?.setPosition || pinDoc.isInkMask) {
                pinDoc.setPosition = true;
                pinDoc.y = doc.y;
                pinDoc.x = doc.x;
                pinDoc.presHideAfter = true;
                pinDoc.presHideBefore = true;
                pinDoc.title = doc.title + " (move)";
                pinDoc.presMovement = PresMovement.None;
            }
            if (curPres.expandBoolean) pinDoc.presExpandInlineButton = true;
            const dview = CollectionDockingView.Instance.props.Document;
            const fieldKey = CollectionDockingView.Instance.props.fieldKey;
            const sublists = DocListCast(dview[fieldKey]);
            const tabs = Cast(sublists[0], Doc, null);
            const tabdocs = await DocListCastAsync(tabs?.data);
            runInAction(() => {
                if (!pinProps?.hidePresBox && !tabdocs?.includes(curPres)) {
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
        const selected = () => SelectionManager.Views().some(v => v.props.Document === this._document);
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

    // adds a tab to the layout based on the locaiton parameter which can be:
    //  close[:{left,right,top,bottom}]  - e.g., "close" will close the tab, "close:left" will close the left tab, 
    //  add[:{left,right,top,bottom}] - e.g., "add" will add a tab to the current stack, "add:right" will add a tab on the right
    //  replace[:{left,right,top,bottom,<any string>}] - e.g., "replace" will replace the current stack contents, 
    //                                  "replace:right" - will replace the stack on the right named "right" if it exists, or create a stack on the right with that name, 
    //                                   "replace:monkeys" - will replace any tab that has the label 'monkeys', or a tab with that label will be created by default on the right
    //  inPlace - will add the document to any collection along the path from the document to the docking view that has a field isInPlaceContainer. if none is found, inPlace adds a tab to current stack
    addDocTab = (doc: Doc, location: string) => {
        SelectionManager.DeselectAll();
        const locationFields = doc._viewType === CollectionViewType.Docking ? ["dashboard"] : location.split(":");
        const locationParams = locationFields.length > 1 ? locationFields[1] : "";
        switch (locationFields[0]) {
            case "dashboard": return CurrentUserUtils.openDashboard(Doc.UserDoc(), doc);
            case "close": return CollectionDockingView.CloseSplit(doc, locationParams);
            case "fullScreen": return CollectionDockingView.OpenFullScreen(doc);
            case "replace": return CollectionDockingView.ReplaceTab(doc, locationParams, this.stack);
            case "lightbox": {
                // TabDocView.PinDoc(doc, { hidePresBox: true });
                return LightboxView.AddDocTab(doc, location);
            }
            case "inPlace":
            case "add":
            default:
                return CollectionDockingView.AddSplit(doc, locationParams, this.stack);
        }
    }

    getCurrentFrame = () => {
        return NumCast(Cast(PresBox.Instance.childDocs[PresBox.Instance.itemIndex].presentationTargetDoc, Doc, null)._currentFrame);
    }
    @action
    focusFunc = (doc: Doc, options?: DocFocusOptions) => {
        const vals = (!options?.originalTarget || options?.originalTarget === this._document) && this.view?.ComponentView?.freeformData?.(true);
        if (vals && this._document) {
            const focusSpeed = 1000;
            this._document._panX = vals.panX;
            this._document._panY = vals.panY;
            this._document._viewScale = vals.scale;
            this._document._viewTransition = `transform ${focusSpeed}ms`;
            setTimeout(action(() => {
                this._document!._viewTransition = undefined;
                options?.afterFocus?.(false);
            }), focusSpeed);
        } else {
            options?.afterFocus?.(false);
        }
        if (!this.tab.header.parent._activeContentItem || this.tab.header.parent._activeContentItem !== this.tab.contentItem) {
            this.tab.header.parent.setActiveContentItem(this.tab.contentItem); // glr: Panning does not work when this is set - (this line is for trying to make a tab that is not topmost become topmost)
        }
    }
    active = () => this._isActive;
    ScreenToLocalTransform = () => {
        const { translateX, translateY } = Utils.GetScreenTransform(this._mainCont?.children?.[0] as HTMLElement);
        return CollectionDockingView.Instance?.props.ScreenToLocalTransform().translate(-translateX, -translateY);
    }
    PanelWidth = () => this._panelWidth;
    PanelHeight = () => this._panelHeight;

    static miniStyleProvider = (doc: Opt<Doc>, props: Opt<DocumentViewProps | FieldViewProps>, property: string): any => {
        if (doc) {
            switch (property.split(":")[0]) {
                default: return DefaultStyleProvider(doc, props, property);
                case StyleProp.PointerEvents: return "none";
                case StyleProp.DocContents:
                    const background = doc.type === DocumentType.PDF ? "red" : doc.type === DocumentType.IMG ? "blue" : doc.type === DocumentType.RTF ? "orange" :
                        doc.type === DocumentType.VID ? "purple" : doc.type === DocumentType.WEB ? "yellow" : "gray";
                    return doc.type === DocumentType.COL ?
                        undefined :
                        <div style={{ width: doc[WidthSym](), height: doc[HeightSym](), position: "absolute", display: "block", background }} />;
            }
        }
    }
    miniMapColor = () => this.tabColor;
    miniPanelWidth = () => this.PanelWidth();
    miniPanelHeight = () => this.PanelHeight();
    tabView = () => this._view;
    @computed get layerProvider() { return this._document && DefaultLayerProvider(this._document); }
    @computed get docView() {
        TraceMobx();
        return !this._activated || !this._document || this._document._viewType === CollectionViewType.Docking ? (null) :
            <><DocumentView key={this._document[Id]} ref={action((r: DocumentView) => this._view = r)}
                renderDepth={0}
                Document={this._document}
                DataDoc={!Doc.AreProtosEqual(this._document[DataSym], this._document) ? this._document[DataSym] : undefined}
                ContainingCollectionView={undefined}
                ContainingCollectionDoc={undefined}
                PanelWidth={this.PanelWidth}
                PanelHeight={this.PanelHeight}
                layerProvider={this.layerProvider}
                styleProvider={DefaultStyleProvider}
                docFilters={CollectionDockingView.Instance.docFilters}
                docRangeFilters={CollectionDockingView.Instance.docRangeFilters}
                searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                addDocument={undefined}
                removeDocument={undefined}
                addDocTab={this.addDocTab}
                ScreenToLocalTransform={this.ScreenToLocalTransform}
                dontCenter={"y"}
                rootSelected={returnTrue}
                parentActive={this.active}
                whenActiveChanged={emptyFunction}
                focus={this.focusFunc}
                docViewPath={returnEmptyDoclist}
                bringToFront={emptyFunction}
                pinToPres={TabDocView.PinDoc} />
                <TabMinimapView key="minimap"
                    addDocTab={this.addDocTab}
                    PanelHeight={this.miniPanelHeight}
                    PanelWidth={this.miniPanelWidth}
                    background={this.miniMapColor}
                    document={this._document}
                    tabView={this.tabView} />
                <Tooltip key="ttip" title={<div className="dash-tooltip">{"toggle minimap"}</div>}>
                    <div className="miniMap-hidden" onPointerDown={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this._document!.hideMinimap = !this._document!.hideMinimap; })} >
                        <FontAwesomeIcon icon={"globe-asia"} size="lg" />
                    </div>
                </Tooltip>
            </>;
    }

    render() {
        return (
            <div className="collectionDockingView-content" style={{ height: "100%", width: "100%" }} ref={ref => {
                if (this._mainCont = ref) {
                    (this._mainCont as any).InitTab = (tab: any) => this.init(tab, this._document);
                    DocServer.GetRefField(this.props.documentId).then(action(doc => doc instanceof Doc && (this._document = doc) && this.tab && this.init(this.tab, this._document)));
                }
            }} >
                {this.docView}
            </div >
        );
    }
}

interface TabMinimapViewProps {
    document: Doc;
    tabView: () => DocumentView | undefined;
    addDocTab: (doc: Doc, where: string) => boolean;
    PanelWidth: () => number;
    PanelHeight: () => number;
    background: () => string;
}
@observer
export class TabMinimapView extends React.Component<TabMinimapViewProps> {
    @computed get renderBounds() {
        const bounds = this.props.tabView()?.ComponentView?.freeformData?.()?.bounds ?? { x: 0, y: 0, r: this.returnMiniSize(), b: this.returnMiniSize() };
        const xbounds = bounds.r - bounds.x;
        const ybounds = bounds.b - bounds.y;
        const dim = Math.max(xbounds, ybounds);
        return { l: bounds.x + xbounds / 2 - dim / 2, t: bounds.y + ybounds / 2 - dim / 2, cx: bounds.x + xbounds / 2, cy: bounds.y + ybounds / 2, dim };
    }
    childLayoutTemplate = () => Cast(this.props.document.childLayoutTemplate, Doc, null);
    returnMiniSize = () => NumCast(this.props.document._miniMapSize, 150);
    miniDown = (e: React.PointerEvent) => {
        const doc = this.props.document;
        const miniSize = this.returnMiniSize();
        doc && setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            doc._panX = clamp(NumCast(doc._panX) + delta[0] / miniSize * this.renderBounds.dim, this.renderBounds.l, this.renderBounds.l + this.renderBounds.dim);
            doc._panY = clamp(NumCast(doc._panY) + delta[1] / miniSize * this.renderBounds.dim, this.renderBounds.t, this.renderBounds.t + this.renderBounds.dim);
            return false;
        }), emptyFunction, emptyFunction);
    }
    render() {
        const miniWidth = this.props.PanelWidth() / NumCast(this.props.document._viewScale, 1) / this.renderBounds.dim * 100;
        const miniHeight = this.props.PanelHeight() / NumCast(this.props.document._viewScale, 1) / this.renderBounds.dim * 100;
        const miniLeft = 50 + (NumCast(this.props.document._panX) - this.renderBounds.cx) / this.renderBounds.dim * 100 - miniWidth / 2;
        const miniTop = 50 + (NumCast(this.props.document._panY) - this.renderBounds.cy) / this.renderBounds.dim * 100 - miniHeight / 2;
        const miniSize = this.returnMiniSize();
        return this.props.document._viewType !== CollectionViewType.Freeform || this.props.document.hideMinimap ? (null) : <>
            <div className="miniMap" style={{ width: miniSize, height: miniSize, background: this.props.background() }}>
                <CollectionFreeFormView
                    Document={this.props.document}
                    CollectionView={undefined}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    parentActive={returnFalse}
                    docViewPath={returnEmptyDoclist}
                    childLayoutTemplate={this.childLayoutTemplate} // bcz: Ugh .. should probably be rendering a CollectionView or the minimap should be part of the collectionFreeFormView to avoid having to set stuff like this.
                    noOverlay={true} // don't render overlay Docs since they won't scale
                    active={returnTrue}
                    select={emptyFunction}
                    dropAction={undefined}
                    isSelected={returnFalse}
                    dontRegisterView={true}
                    fieldKey={Doc.LayoutFieldKey(this.props.document)}
                    bringToFront={emptyFunction}
                    rootSelected={returnTrue}
                    addDocument={returnFalse}
                    moveDocument={returnFalse}
                    removeDocument={returnFalse}
                    PanelWidth={this.returnMiniSize}
                    PanelHeight={this.returnMiniSize}
                    ScreenToLocalTransform={Transform.Identity}
                    renderDepth={0}
                    whenActiveChanged={emptyFunction}
                    focus={DocUtils.DefaultFocus}
                    styleProvider={TabDocView.miniStyleProvider}
                    layerProvider={undefined}
                    addDocTab={this.props.addDocTab}
                    pinToPres={TabDocView.PinDoc}
                    docFilters={CollectionDockingView.Instance.docFilters}
                    docRangeFilters={CollectionDockingView.Instance.docRangeFilters}
                    searchFilterDocs={CollectionDockingView.Instance.searchFilterDocs}
                    fitContentsToDoc={returnTrue}
                />
                <div className="miniOverlay" onPointerDown={this.miniDown} >
                    <div className="miniThumb" style={{ width: `${miniWidth}% `, height: `${miniHeight}% `, left: `${miniLeft}% `, top: `${miniTop}% `, }} />
                </div>
            </div>

            <Tooltip title={<div className="dash-tooltip">{"toggle minimap"}</div>}>
                <div className="miniMap-hidden" onPointerDown={e => e.stopPropagation()} onClick={action(e => { e.stopPropagation(); this.props.document.hideMinimap = !this.props.document.hideMinimap; })}
                    style={{ background: DefaultStyleProvider(this.props.document, undefined, StyleProp.BackgroundColor) }} >
                    <FontAwesomeIcon icon={"globe-asia"} size="lg" />
                </div>
            </Tooltip>
        </>;
    }
}