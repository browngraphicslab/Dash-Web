import { library } from '@fortawesome/fontawesome-svg-core';
import { faFile } from '@fortawesome/free-solid-svg-icons';
import 'golden-layout/src/css/goldenlayout-base.css';
import 'golden-layout/src/css/goldenlayout-dark-theme.css';
import { action, computed, Lambda, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as ReactDOM from 'react-dom';
import Measure from "react-measure";
import * as GoldenLayout from "../../../client/goldenLayout";
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCast, Field, Opt, DataSym } from "../../../new_fields/Doc";
import { Id } from '../../../new_fields/FieldSymbols';
import { List } from '../../../new_fields/List';
import { FieldId } from "../../../new_fields/RefField";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { TraceMobx } from '../../../new_fields/util';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { emptyFunction, returnOne, returnTrue, Utils } from "../../../Utils";
import { DocServer } from "../../DocServer";
import { Docs } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { DocumentManager } from '../../util/DocumentManager';
import { DragManager } from "../../util/DragManager";
import { Scripting } from '../../util/Scripting';
import { SelectionManager } from '../../util/SelectionManager';
import { Transform } from '../../util/Transform';
import { undoBatch } from "../../util/UndoManager";
import { MainView } from '../MainView';
import { DocumentView } from "../nodes/DocumentView";
import "./CollectionDockingView.scss";
import { SubCollectionViewProps } from "./CollectionSubView";
import { DockingViewButtonSelector } from './ParentDocumentSelector';
import React = require("react");
library.add(faFile);
const _global = (window /* browser */ || global /* node */) as any;

@observer
export class CollectionDockingView extends React.Component<SubCollectionViewProps> {
    @observable public static Instances: CollectionDockingView[] = [];
    @computed public static get Instance() { return CollectionDockingView.Instances[0]; }
    public static makeDocumentConfig(document: Doc, width?: number, libraryPath?: Doc[]) {
        return {
            type: 'react-component',
            component: 'DocumentFrameRenderer',
            title: document.title,
            width: width,
            props: {
                documentId: document[Id],
                libraryPath: libraryPath?.map(d => d[Id])
                //collectionDockingView: CollectionDockingView.Instance
            }
        };
    }

    @computed public get initialized() {
        return this._goldenLayout !== null;
    }

    @observable private _goldenLayout: any = null;
    private _containerRef = React.createRef<HTMLDivElement>();
    private _flush: boolean = false;
    private _ignoreStateChange = "";
    private _isPointerDown = false;
    private _maximizedSrc: Opt<DocumentView>;

    constructor(props: SubCollectionViewProps) {
        super(props);
        runInAction(() => !CollectionDockingView.Instances ? CollectionDockingView.Instances = [this] : CollectionDockingView.Instances.push(this));
        //Why is this here?
        (window as any).React = React;
        (window as any).ReactDOM = ReactDOM;
    }
    hack: boolean = false;
    undohack: any = null;
    public StartOtherDrag(e: any, dragDocs: Doc[]) {
        let config: any;
        if (dragDocs.length === 1) {
            config = CollectionDockingView.makeDocumentConfig(dragDocs[0]);
        } else {
            config = {
                type: 'row',
                content: dragDocs.map((doc, i) => {
                    CollectionDockingView.makeDocumentConfig(doc);
                })
            };
        }
        const div = document.createElement("div");
        const dragSource = this._goldenLayout.createDragSource(div, config);
        dragSource._dragListener.on("dragStop", () => {
            dragSource.destroy();
        });
        dragSource._dragListener.onMouseDown(e);
    }

    @undoBatch
    @action
    public OpenFullScreen(docView: DocumentView, libraryPath?: Doc[]) {
        const document = Doc.MakeAlias(docView.props.Document);
        const newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath)]
        };
        const docconfig = this._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, this._goldenLayout);
        this._goldenLayout.root.contentItems[0].addChild(docconfig);
        docconfig.callDownwards('_$init');
        this._goldenLayout._$maximiseItem(docconfig);
        this._maximizedSrc = docView;
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        this.stateChanged();
        SelectionManager.DeselectAll();
    }

    public CloseFullScreen = () => {
        const target = this._goldenLayout._maximisedItem;
        if (target !== null && this._maximizedSrc) {
            this._goldenLayout._maximisedItem.remove();
            SelectionManager.SelectDoc(this._maximizedSrc, false);
            this._maximizedSrc = undefined;
            this.stateChanged();
        }
    }

    public HasFullScreen = () => {
        return this._goldenLayout._maximisedItem !== null;
    }

    @undoBatch
    @action
    public static CloseRightSplit(document: Opt<Doc>): boolean {
        const instance = CollectionDockingView.Instance;
        const tryClose = (childItem: any) => {
            if (childItem.config?.component === "DocumentFrameRenderer") {
                const docView = DocumentManager.Instance.getDocumentViewById(childItem.config.props.documentId);
                if (docView && ((!document && docView.Document.isDisplayPanel) || (document && Doc.AreProtosEqual(docView.props.Document, document)))) {
                    childItem.remove();
                    instance.layoutChanged(document);
                    return true;
                }
            }
            return false;
        };
        const retVal = !instance?._goldenLayout.root.contentItems[0].isRow ? false :
            Array.from(instance._goldenLayout.root.contentItems[0].contentItems).some((child: any) => Array.from(child.contentItems).some(tryClose));

        retVal && instance.stateChanged();
        return retVal;
    }

    @action
    layoutChanged(removed?: Doc) {
        this._goldenLayout.root.callDownwards('setSize', [this._goldenLayout.width, this._goldenLayout.height]);
        this._goldenLayout.emit('stateChanged');
        this._ignoreStateChange = JSON.stringify(this._goldenLayout.toConfig());
        if (removed) CollectionDockingView.Instance._removedDocs.push(removed);
        this.stateChanged();
    }
    @undoBatch
    @action
    public static ReplaceRightSplit(document: Doc, libraryPath?: Doc[], addToSplit?: boolean): boolean {
        if (!CollectionDockingView.Instance) return false;
        const instance = CollectionDockingView.Instance;
        let retVal = false;
        if (instance._goldenLayout.root.contentItems[0].isRow) {
            retVal = Array.from(instance._goldenLayout.root.contentItems[0].contentItems).some((child: any) => {
                if (child.contentItems.length === 1 && child.contentItems[0].config.component === "DocumentFrameRenderer" &&
                    DocumentManager.Instance.getDocumentViewById(child.contentItems[0].config.props.documentId)?.Document.isDisplayPanel) {
                    const newItemStackConfig = CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath);
                    child.addChild(newItemStackConfig, undefined);
                    !addToSplit && child.contentItems[0].remove();
                    instance.layoutChanged(document);
                    return true;
                }
                return Array.from(child.contentItems).filter((tab: any) => tab.config.component === "DocumentFrameRenderer").some((tab: any, j: number) => {
                    if (DocumentManager.Instance.getDocumentViewById(tab.config.props.documentId)?.Document.isDisplayPanel) {
                        const newItemStackConfig = CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath);
                        child.addChild(newItemStackConfig, undefined);
                        !addToSplit && child.contentItems[j].remove();
                        instance.layoutChanged(document);
                        return true;
                    }
                    return false;
                });
            });
        }
        if (retVal) {
            instance.stateChanged();
        }
        return retVal;
    }


    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to the right of that split
    //
    @undoBatch
    @action
    public static AddRightSplit(document: Doc, libraryPath?: Doc[]) {
        if (!CollectionDockingView.Instance) return false;
        const instance = CollectionDockingView.Instance;
        const newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath)]
        };

        const newContentItem = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);

        if (instance._goldenLayout.root.contentItems.length === 0) {
            instance._goldenLayout.root.addChild(newContentItem);
        } else if (instance._goldenLayout.root.contentItems[0].isRow) {
            instance._goldenLayout.root.contentItems[0].addChild(newContentItem);
        } else {
            const collayout = instance._goldenLayout.root.contentItems[0];
            const newRow = collayout.layoutManager.createContentItem({ type: "row" }, instance._goldenLayout);
            collayout.parent.replaceChild(collayout, newRow);

            newRow.addChild(newContentItem, undefined, true);
            newRow.addChild(collayout, 0, true);

            collayout.config.width = 50;
            newContentItem.config.width = 50;
        }
        newContentItem.callDownwards('_$init');
        instance.layoutChanged();
        return true;
    }


    //
    //  Creates a split on any side of the docking view based on the passed input pullSide and then adds the Document to the requested side
    //
    @undoBatch
    @action
    public static AddSplit(document: Doc, pullSide: string, libraryPath?: Doc[]) {
        if (!CollectionDockingView.Instance) return false;
        const instance = CollectionDockingView.Instance;
        const newItemStackConfig = {
            type: 'stack',
            content: [CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath)]
        };

        const newContentItem = instance._goldenLayout.root.layoutManager.createContentItem(newItemStackConfig, instance._goldenLayout);

        if (instance._goldenLayout.root.contentItems.length === 0) { // if no rows / columns
            instance._goldenLayout.root.addChild(newContentItem);
        } else if (instance._goldenLayout.root.contentItems[0].isRow) { // if row
            if (pullSide === "left") {
                instance._goldenLayout.root.contentItems[0].addChild(newContentItem, 0);
            } else if (pullSide === "right") {
                instance._goldenLayout.root.contentItems[0].addChild(newContentItem);
            } else if (pullSide === "top" || pullSide === "bottom") {
                // if not going in a row layout, must add already existing content into column
                const rowlayout = instance._goldenLayout.root.contentItems[0];
                const newColumn = rowlayout.layoutManager.createContentItem({ type: "column" }, instance._goldenLayout);
                rowlayout.parent.replaceChild(rowlayout, newColumn);
                if (pullSide === "top") {
                    newColumn.addChild(rowlayout, undefined, true);
                    newColumn.addChild(newContentItem, 0, true);
                } else if (pullSide === "bottom") {
                    newColumn.addChild(newContentItem, undefined, true);
                    newColumn.addChild(rowlayout, 0, true);
                }

                rowlayout.config.height = 50;
                newContentItem.config.height = 50;
            }
        } else if (instance._goldenLayout.root.contentItems[0].isColumn) { // if column
            if (pullSide === "top") {
                instance._goldenLayout.root.contentItems[0].addChild(newContentItem, 0);
            } else if (pullSide === "bottom") {
                instance._goldenLayout.root.contentItems[0].addChild(newContentItem);
            } else if (pullSide === "left" || pullSide === "right") {
                // if not going in a row layout, must add already existing content into column
                const collayout = instance._goldenLayout.root.contentItems[0];
                const newRow = collayout.layoutManager.createContentItem({ type: "row" }, instance._goldenLayout);
                collayout.parent.replaceChild(collayout, newRow);

                if (pullSide === "left") {
                    newRow.addChild(collayout, undefined, true);
                    newRow.addChild(newContentItem, 0, true);
                } else if (pullSide === "right") {
                    newRow.addChild(newContentItem, undefined, true);
                    newRow.addChild(collayout, 0, true);
                }

                collayout.config.width = 50;
                newContentItem.config.width = 50;
            }
        }

        newContentItem.callDownwards('_$init');
        instance.layoutChanged();
        return true;
    }


    //
    //  Creates a vertical split on the right side of the docking view, and then adds the Document to that split
    //
    @undoBatch
    @action
    public static UseRightSplit(document: Doc, libraryPath?: Doc[], shiftKey?: boolean) {
        document.isDisplayPanel = true;
        if (shiftKey || !CollectionDockingView.ReplaceRightSplit(document, libraryPath, shiftKey)) {
            CollectionDockingView.AddRightSplit(document, libraryPath);
        }
    }

    @undoBatch
    @action
    public AddTab = (stack: any, document: Doc, libraryPath?: Doc[]) => {
        Doc.GetProto(document).lastOpened = new DateField;
        const docContentConfig = CollectionDockingView.makeDocumentConfig(document, undefined, libraryPath);
        if (stack === undefined) {
            let stack: any = this._goldenLayout.root;
            while (!stack.isStack) {
                if (stack.contentItems.length) {
                    stack = stack.contentItems[0];
                } else {
                    stack.addChild({ type: 'stack', content: [docContentConfig] });
                    stack = undefined;
                    break;
                }
            }
            if (stack) {
                stack.addChild(docContentConfig);
            }
        } else {
            stack.addChild(docContentConfig, undefined);
        }
        this.layoutChanged();
        return true;
    }

    setupGoldenLayout() {
        const config = StrCast(this.props.Document.dockingConfig);
        if (config) {
            if (!this._goldenLayout) {
                runInAction(() => this._goldenLayout = new GoldenLayout(JSON.parse(config)));
            }
            else {
                if (config === JSON.stringify(this._goldenLayout.toConfig())) {
                    return;
                }
                try {
                    this._goldenLayout.unbind('itemDropped', this.itemDropped);
                    this._goldenLayout.unbind('tabCreated', this.tabCreated);
                    this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
                    this._goldenLayout.unbind('stackCreated', this.stackCreated);
                } catch (e) { }
                this._goldenLayout.destroy();
                runInAction(() => this._goldenLayout = new GoldenLayout(JSON.parse(config)));
            }
            this._goldenLayout.on('itemDropped', this.itemDropped);
            this._goldenLayout.on('tabCreated', this.tabCreated);
            this._goldenLayout.on('tabDestroyed', this.tabDestroyed);
            this._goldenLayout.on('stackCreated', this.stackCreated);
            this._goldenLayout.registerComponent('DocumentFrameRenderer', DockedFrameRenderer);
            this._goldenLayout.container = this._containerRef.current;
            if (this._goldenLayout.config.maximisedItemId === '__glMaximised') {
                try {
                    this._goldenLayout.config.root.getItemsById(this._goldenLayout.config.maximisedItemId)[0].toggleMaximise();
                } catch (e) {
                    this._goldenLayout.config.maximisedItemId = null;
                }
            }
            this._goldenLayout.init();
        }
    }
    reactionDisposer?: Lambda;
    componentDidMount: () => void = () => {
        if (this._containerRef.current) {
            this.reactionDisposer = reaction(
                () => this.props.Document.dockingConfig,
                () => {
                    if (!this._goldenLayout || this._ignoreStateChange !== JSON.stringify(this._goldenLayout.toConfig())) {
                        // Because this is in a set timeout, if this component unmounts right after mounting,
                        // we will leak a GoldenLayout, because we try to destroy it before we ever create it
                        setTimeout(() => this.setupGoldenLayout(), 1);
                        const userDoc = CurrentUserUtils.UserDocument;
                        userDoc && DocListCast((userDoc.workspaces as Doc).data).map(d => d.workspaceBrush = false);
                        this.props.Document.workspaceBrush = true;
                    }
                    this._ignoreStateChange = "";
                }, { fireImmediately: true });

            window.addEventListener('resize', this.onResize); // bcz: would rather add this event to the parent node, but resize events only come from Window
        }
    }
    componentWillUnmount: () => void = () => {
        try {
            this.props.Document.workspaceBrush = false;
            this._goldenLayout.unbind('itemDropped', this.itemDropped);
            this._goldenLayout.unbind('tabCreated', this.tabCreated);
            this._goldenLayout.unbind('stackCreated', this.stackCreated);
            this._goldenLayout.unbind('tabDestroyed', this.tabDestroyed);
        } catch (e) {

        }
        this._goldenLayout && this._goldenLayout.destroy();
        runInAction(() => {
            CollectionDockingView.Instances.splice(CollectionDockingView.Instances.indexOf(this), 1);
            this._goldenLayout = null;
        });
        window.removeEventListener('resize', this.onResize);

        this.reactionDisposer && this.reactionDisposer();
    }
    @action
    onResize = (event: any) => {
        const cur = this._containerRef.current;

        // bcz: since GoldenLayout isn't a React component itself, we need to notify it to resize when its document container's size has changed
        this._goldenLayout && this._goldenLayout.updateSize(cur!.getBoundingClientRect().width, cur!.getBoundingClientRect().height);
    }

    @action
    onPointerUp = (e: React.PointerEvent): void => {
        if (this._flush) {
            this._flush = false;
            setTimeout(() => {
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
                this.stateChanged();
            }, 10);
        }
    }
    @action
    onPointerDown = (e: React.PointerEvent): void => {
        this._isPointerDown = true;
        const onPointerUp = action(() => {
            window.removeEventListener("pointerup", onPointerUp);
            this._isPointerDown = false;
        });
        window.addEventListener("pointerup", onPointerUp);
        const className = (e.target as any).className;
        if (className === "lm_drag_handle" || className === "lm_close" || className === "lm_maximise" || className === "lm_minimise" || className === "lm_close_tab") {
            this._flush = true;
        }
    }

    updateDataField = async (json: string) => {
        const matches = json.match(/\"documentId\":\"[a-z0-9-]+\"/g);
        const docids = matches?.map(m => m.replace("\"documentId\":\"", "").replace("\"", ""));

        if (docids) {
            const docs = (await Promise.all(docids.map(id => DocServer.GetRefField(id)))).filter(f => f).map(f => f as Doc);
            Doc.GetProto(this.props.Document)[this.props.fieldKey] = new List<Doc>(docs);
        }
    }

    @undoBatch
    stateChanged = () => {
        const json = JSON.stringify(this._goldenLayout.toConfig());
        this.props.Document.dockingConfig = json;
        this.updateDataField(json);

        if (this.undohack && !this.hack) {
            this.undohack.end();
            this.undohack = undefined;
        }
        this.hack = false;
    }

    itemDropped = () => {
        CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
        this.stateChanged();
    }

    htmlToElement(html: string) {
        const template = document.createElement('template');
        html = html.trim(); // Never return a text node of whitespace as the result
        template.innerHTML = html;
        return template.content.firstChild;
    }

    tabCreated = async (tab: any) => {
        tab.titleElement[0].Tab = tab;
        if (tab.hasOwnProperty("contentItem") && tab.contentItem.config.type !== "stack") {
            if (tab.contentItem.config.fixed) {
                tab.contentItem.parent.config.fixed = true;
            }

            const doc = await DocServer.GetRefField(tab.contentItem.config.props.documentId) as Doc;
            if (doc instanceof Doc) {
                //tab.titleElement[0].outerHTML = `<input class='lm_title' style="background:black" value='${doc.title}' />`;
                tab.titleElement[0].onclick = (e: any) => tab.titleElement[0].focus();
                tab.titleElement[0].onchange = (e: any) => {
                    tab.titleElement[0].size = e.currentTarget.value.length + 1;
                    Doc.GetProto(doc).title = e.currentTarget.value, true;
                };
                tab.titleElement[0].size = StrCast(doc.title).length + 1;
                tab.titleElement[0].value = doc.title;
                const gearSpan = document.createElement("span");
                gearSpan.className = "collectionDockingView-gear";
                gearSpan.style.position = "relative";
                gearSpan.style.paddingLeft = "0px";
                gearSpan.style.paddingRight = "12px";
                const stack = tab.contentItem.parent;
                // shifts the focus to this tab when another tab is dragged over it
                tab.element[0].onmouseenter = (e: any) => {
                    if (!this._isPointerDown || !SelectionManager.GetIsDragging()) return;
                    const activeContentItem = tab.header.parent.getActiveContentItem();
                    if (tab.contentItem !== activeContentItem) {
                        tab.header.parent.setActiveContentItem(tab.contentItem);
                    }
                    tab.setActive(true);
                };
                ReactDOM.render(<span title="Drag as document"
                    className="collectionDockingView-dragAsDocument"
                    onPointerDown={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        const dragData = new DragManager.DocumentDragData([doc]);
                        dragData.dropAction = doc.dropAction === "alias" ? "alias" : doc.dropAction === "copy" ? "copy" : undefined;
                        DragManager.StartDocumentDrag([gearSpan], dragData, e.clientX, e.clientY);
                    }}><DockingViewButtonSelector Document={doc} Stack={stack} /></span>, gearSpan);
                tab.reactComponents = [gearSpan];
                tab.element.append(gearSpan);
                tab.reactionDisposer = reaction(() => ({ title: doc.title, degree: Doc.IsBrushedDegree(doc) }), ({ title, degree }) => {
                    tab.titleElement[0].textContent = title, { fireImmediately: true };
                    tab.titleElement[0].style.padding = degree ? 0 : 2;
                    tab.titleElement[0].style.border = `${["gray", "gray", "gray"][degree]} ${["none", "dashed", "solid"][degree]} 2px`;
                });
                //TODO why can't this just be doc instead of the id?
                tab.titleElement[0].DashDocId = tab.contentItem.config.props.documentId;
            }
        }
        tab.closeElement.off('click') //unbind the current click handler
            .click(async function () {
                tab.reactionDisposer && tab.reactionDisposer();
                const doc = await DocServer.GetRefField(tab.contentItem.config.props.documentId);
                if (doc instanceof Doc) {
                    const theDoc = doc;
                    CollectionDockingView.Instance._removedDocs.push(theDoc);

                    const userDoc = CurrentUserUtils.UserDocument;
                    let recent: Doc | undefined;
                    if (userDoc && (recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc))) {
                        Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                    }
                    SelectionManager.DeselectAll();
                }
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
                tab.contentItem.remove();
                CollectionDockingView.Instance._ignoreStateChange = JSON.stringify(CollectionDockingView.Instance._goldenLayout.toConfig());
            });
    }

    tabDestroyed = (tab: any) => {
        if (tab.reactComponents) {
            for (const ele of tab.reactComponents) {
                ReactDOM.unmountComponentAtNode(ele);
            }
        }
    }
    _removedDocs: Doc[] = [];

    stackCreated = (stack: any) => {
        //stack.header.controlsContainer.find('.lm_popout').hide();
        stack.header.element[0].style.backgroundColor = DocServer.Control.isReadOnly() ? "#228540" : undefined;
        stack.header.element.on('mousedown', (e: any) => {
            if (e.target === stack.header.element[0] && e.button === 1) {
                this.AddTab(stack, Docs.Create.FreeformDocument([], { _width: this.props.PanelWidth(), _height: this.props.PanelHeight(), title: "Untitled Collection" }));
            }
        });

        // starter code for bezel to add new pane
        // stack.element.on("touchstart", (e: TouchEvent) => {
        // if (e.targetTouches.length === 2) {
        //     let pt1 = e.targetTouches.item(0);
        //     let pt2 = e.targetTouches.item(1);
        //     let threshold = 40 * window.devicePixelRatio;
        //     if (pt1 && pt2 && InteractionUtils.TwoPointEuclidist(pt1, pt2) < threshold) {
        //         let edgeThreshold = 30 * window.devicePixelRatio;
        //         let center = InteractionUtils.CenterPoint([pt1, pt2]);
        //         let stackRect: DOMRect = stack.element.getBoundingClientRect();
        //         let nearLeft = center.X - stackRect.x < edgeThreshold;
        //         let nearTop = center.Y - stackRect.y < edgeThreshold;
        //         let nearRight = stackRect.right - center.X < edgeThreshold;
        //         let nearBottom = stackRect.bottom - center.Y < edgeThreshold;
        //         let ns = [nearLeft, nearTop, nearRight, nearBottom].filter(n => n);
        //         if (ns.length === 1) {

        //         }
        //     }
        // }
        // });
        stack.header.controlsContainer.find('.lm_close') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(async function () {
                //if (confirm('really close this?')) {

                stack.remove();
                stack.contentItems.forEach(async (contentItem: any) => {
                    const doc = await DocServer.GetRefField(contentItem.config.props.documentId);
                    if (doc instanceof Doc) {
                        let recent: Doc | undefined;
                        if (CurrentUserUtils.UserDocument && (recent = await Cast(CurrentUserUtils.UserDocument.recentlyClosed, Doc))) {
                            Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                        }
                        const theDoc = doc;
                        CollectionDockingView.Instance._removedDocs.push(theDoc);
                    }
                });
                //}
            }));
        stack.header.controlsContainer.find('.lm_popout') //get the close icon
            .off('click') //unbind the current click handler
            .click(action(function () {
                stack.config.fixed = !stack.config.fixed;
                // const url = Utils.prepend("/doc/" + stack.contentItems[0].tab.contentItem.config.props.documentId);
                // let win = window.open(url, stack.contentItems[0].tab.title, "width=300,height=400");
            }));
    }

    render() {
        if (this.props.renderDepth > 0) {
            return <div style={{ width: "100%", height: "100%" }}>Nested workspaces can't be rendered</div>;
        }
        return (
            <Measure offset onResize={this.onResize}>
                {({ measureRef }) =>
                    <div ref={measureRef}>
                        <div className="collectiondockingview-container" id="menuContainer"
                            onPointerDown={this.onPointerDown} onPointerUp={this.onPointerUp} ref={this._containerRef} />
                    </div>
                }
            </Measure>
        );
    }

}

interface DockedFrameProps {
    documentId: FieldId;
    glContainer: any;
    libraryPath: (FieldId[]);
    backgroundColor?: (doc: Doc) => string | undefined;
    //collectionDockingView: CollectionDockingView
}
@observer
export class DockedFrameRenderer extends React.Component<DockedFrameProps> {
    _mainCont: HTMLDivElement | null = null;
    @observable private _libraryPath: Doc[] = [];
    @observable private _panelWidth = 0;
    @observable private _panelHeight = 0;
    @observable private _document: Opt<Doc>;
    @observable private _isActive: boolean = false;

    get _stack(): any {
        return (this.props as any).glContainer.parent.parent;
    }
    constructor(props: any) {
        super(props);
        DocServer.GetRefField(this.props.documentId).then(action((f: Opt<Field>) => this._document = f as Doc));
        this.props.libraryPath && this.setupLibraryPath();
    }

    async setupLibraryPath() {
        Promise.all(this.props.libraryPath.map(async docid => {
            const d = await DocServer.GetRefField(docid);
            return d instanceof Doc ? d : undefined;
        })).then(action((list: (Doc | undefined)[]) => this._libraryPath = list.filter(d => d).map(d => d as Doc)));
    }

    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public static PinDoc(doc: Doc) {
        //add this new doc to props.Document
        const curPres = Cast(CurrentUserUtils.UserDocument.curPresentation, Doc) as Doc;
        if (curPres) {
            const pinDoc = Doc.MakeAlias(doc);
            pinDoc.presentationTargetDoc = doc;
            Doc.AddDocToList(curPres, "data", pinDoc);
            if (!DocumentManager.Instance.getDocumentView(curPres)) {
                CollectionDockingView.AddRightSplit(curPres);
            }
        }
    }
    /**
     * Adds a document to the presentation view
     **/
    @undoBatch
    @action
    public static UnpinDoc(doc: Doc) {
        //add this new doc to props.Document
        const curPres = Cast(CurrentUserUtils.UserDocument.curPresentation, Doc) as Doc;
        if (curPres) {
            const ind = DocListCast(curPres.data).findIndex((val) => Doc.AreProtosEqual(val, doc));
            ind !== -1 && Doc.RemoveDocFromList(curPres, "data", DocListCast(curPres.data)[ind]);
        }
    }

    componentDidMount() {
        const observer = new _global.ResizeObserver(action((entries: any) => {
            for (const entry of entries) {
                this._panelWidth = entry.contentRect.width;
                this._panelHeight = entry.contentRect.height;
            }
        }));
        observer.observe(this.props.glContainer._element[0]);
        this.props.glContainer.layoutManager.on("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.on("tab", this.onActiveContentItemChanged);
        this.onActiveContentItemChanged();
    }

    componentWillUnmount() {
        this.props.glContainer.layoutManager.off("activeContentItemChanged", this.onActiveContentItemChanged);
        this.props.glContainer.off("tab", this.onActiveContentItemChanged);
    }

    @action.bound
    private onActiveContentItemChanged() {
        if (this.props.glContainer.tab) {
            this._isActive = this.props.glContainer.tab.isActive;
            !this._isActive && this._document && Doc.UnBrushDoc(this._document); // bcz: bad -- trying to simulate a pointer leave event when a new tab is opened up on top of an existing one.
        }
    }

    get layoutDoc() { return this._document && Doc.Layout(this._document); }
    panelWidth = () => this.layoutDoc && this.layoutDoc.maxWidth ? Math.min(Math.max(NumCast(this.layoutDoc._width), NumCast(this.layoutDoc._nativeWidth)), this._panelWidth) : this._panelWidth;
    panelHeight = () => this._panelHeight;

    nativeWidth = () => !this.layoutDoc!._fitWidth ? NumCast(this.layoutDoc!._nativeWidth) || this._panelWidth : 0;
    nativeHeight = () => !this.layoutDoc!._fitWidth ? NumCast(this.layoutDoc!._nativeHeight) || this._panelHeight : 0;

    contentScaling = () => {
        if (this.layoutDoc!.type === DocumentType.PDF) {
            if ((this.layoutDoc && this.layoutDoc._fitWidth) ||
                this._panelHeight / NumCast(this.layoutDoc!._nativeHeight) > this._panelWidth / NumCast(this.layoutDoc!._nativeWidth)) {
                return this._panelWidth / NumCast(this.layoutDoc!._nativeWidth);
            } else {
                return this._panelHeight / NumCast(this.layoutDoc!._nativeHeight);
            }
        }
        const nativeH = this.nativeHeight();
        const nativeW = this.nativeWidth();
        if (!nativeW || !nativeH) return 1;
        const wscale = this.panelWidth() / nativeW;
        return wscale * nativeH > this._panelHeight ? this._panelHeight / nativeH : wscale;
    }

    ScreenToLocalTransform = () => {
        if (this._mainCont && this._mainCont.children) {
            const { translateX, translateY } = Utils.GetScreenTransform(this._mainCont.children[0].firstChild as HTMLElement);
            const scale = Utils.GetScreenTransform(this._mainCont).scale;
            return CollectionDockingView.Instance.props.ScreenToLocalTransform().translate(-translateX, -translateY).scale(1 / this.contentScaling() / scale);
        }
        return Transform.Identity();
    }
    get previewPanelCenteringOffset() { return this.nativeWidth() ? (this._panelWidth - this.nativeWidth() * this.contentScaling()) / 2 : 0; }
    get widthpercent() { return this.nativeWidth() ? `${(this.nativeWidth() * this.contentScaling()) / this.panelWidth() * 100}%` : undefined; }

    addDocTab = (doc: Doc, location: string, libraryPath?: Doc[]) => {
        SelectionManager.DeselectAll();
        if (doc.dockingConfig) {
            return MainView.Instance.openWorkspace(doc);
        } else if (location === "onRight") {
            return CollectionDockingView.AddRightSplit(doc, libraryPath);
        } else if (location === "close") {
            return CollectionDockingView.CloseRightSplit(doc);
        } else {
            return CollectionDockingView.Instance.AddTab(this._stack, doc, libraryPath);
        }
    }

    @computed get docView() {
        TraceMobx();
        if (!this._document) return (null);
        const document = this._document;
        const resolvedDataDoc = !Doc.AreProtosEqual(this._document[DataSym], this._document) ? this._document[DataSym] : undefined;// document.layout instanceof Doc ? document : this._dataDoc;
        return <DocumentView key={document[Id]}
            LibraryPath={this._libraryPath}
            Document={document}
            DataDoc={resolvedDataDoc}
            bringToFront={emptyFunction}
            addDocument={undefined}
            removeDocument={undefined}
            ContentScaling={this.contentScaling}
            PanelWidth={this.panelWidth}
            PanelHeight={this.panelHeight}
            ScreenToLocalTransform={this.ScreenToLocalTransform}
            renderDepth={0}
            parentActive={returnTrue}
            whenActiveChanged={emptyFunction}
            focus={emptyFunction}
            backgroundColor={CollectionDockingView.Instance.props.backgroundColor}
            addDocTab={this.addDocTab}
            pinToPres={DockedFrameRenderer.PinDoc}
            ContainingCollectionView={undefined}
            ContainingCollectionDoc={undefined}
            zoomToScale={emptyFunction}
            getScale={returnOne} />;
    }

    render() {
        return (!this._isActive || !this.layoutDoc) ? (null) :
            (<div className="collectionDockingView-content" ref={ref => this._mainCont = ref}
                style={{
                    transform: `translate(${this.previewPanelCenteringOffset}px, 0px)`,
                    height: this.layoutDoc && this.layoutDoc._fitWidth ? undefined : "100%",
                    width: this.widthpercent
                }}>
                {this.docView}
            </div >);
    }
}
Scripting.addGlobal(function openOnRight(doc: any) { CollectionDockingView.AddRightSplit(doc); });
Scripting.addGlobal(function useRightSplit(doc: any, shiftKey?: boolean) { CollectionDockingView.UseRightSplit(doc, undefined, shiftKey); });
