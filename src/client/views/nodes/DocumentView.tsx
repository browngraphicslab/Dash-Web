import { action, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import { ServerUtils } from "../../../server/ServerUtil";
import { emptyFunction, Utils } from "../../../Utils";
import { Documents } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { undoBatch, UndoManager } from "../../util/UndoManager";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionPDFView } from "../collections/CollectionPDFView";
import { CollectionVideoView } from "../collections/CollectionVideoView";
import { CollectionView } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");
import { Field, Opt, Doc, Id } from "../../../new_fields/Doc";
import { DocComponent } from "../DocComponent";
import { createSchema, makeInterface, listSpec } from "../../../new_fields/Schema";
import { FieldValue, Cast, PromiseValue } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";

const linkSchema = createSchema({
    title: "string",
    linkDescription: "string",
    linkTags: "string",
    linkedTo: Doc,
    linkedFrom: Doc
});

type LinkDoc = makeInterface<[typeof linkSchema]>;
const LinkDoc = makeInterface(linkSchema);

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView | CollectionPDFView | CollectionVideoView>;
    Document: Doc;
    addDocument?: (doc: Document, allowDuplicates?: boolean) => boolean;
    removeDocument?: (doc: Document) => boolean;
    moveDocument?: (doc: Document, targetCollection: Document, addDocument: (document: Document) => boolean) => boolean;
    ScreenToLocalTransform: () => Transform;
    isTopMost: boolean;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Document) => void;
    selectOnLoad: boolean;
    parentActive: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
}

const schema = createSchema({
    layout: "string",
    nativeWidth: "number",
    nativeHeight: "number",
    backgroundColor: "string"
});

export const positionSchema = createSchema({
    nativeWidth: "number",
    nativeHeight: "number",
    width: "number",
    height: "number",
    x: "number",
    y: "number",
});

type Document = makeInterface<[typeof schema]>;
const Document = makeInterface(schema);

@observer
export class DocumentView extends DocComponent<DocumentViewProps, Document>(Document) {
    private _downX: number = 0;
    private _downY: number = 0;
    private _mainCont = React.createRef<HTMLDivElement>();
    private _dropDisposer?: DragManager.DragDropDisposer;

    public get ContentDiv() { return this._mainCont.current; }
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || this.props.parentActive(); }
    @computed get topMost(): boolean { return this.props.isTopMost; }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (e.button === 2 && !this.isSelected()) {
            return;
        }
        if (e.shiftKey && e.buttons === 2) {
            if (this.props.isTopMost) {
                this.startDragging(e.pageX, e.pageY, e.altKey || e.ctrlKey);
            } else {
                CollectionDockingView.Instance.StartOtherDrag([this.props.Document], e);
            }
            e.stopPropagation();
        } else {
            if (this.active) {
                e.stopPropagation();
                document.removeEventListener("pointermove", this.onPointerMove);
                document.addEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                document.addEventListener("pointerup", this.onPointerUp);
            }
        }
    }

    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.push(this));
    }

    componentDidUpdate() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
    }

    componentWillUnmount() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        runInAction(() => DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1));
    }

    startDragging(x: number, y: number, dropAliasOfDraggedDoc: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            dragData.aliasOnDrop = dropAliasOfDraggedDoc;
            dragData.xOffset = x - left;
            dragData.yOffset = y - top;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAliasOfDraggedDoc
            });
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble) {
            return;
        }
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            if (!e.altKey && (!this.topMost || e.buttons === 2)) {
                this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey);
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        e.stopPropagation();
        if (!SelectionManager.IsSelected(this) && e.button !== 2) {
            if (Math.abs(e.clientX - this._downX) < 4 && Math.abs(e.clientY - this._downY) < 4) {
                PromiseValue(Cast(this.props.Document.maximizedDoc, Doc)).then(maxdoc => {
                    if (maxdoc instanceof Doc) {
                        this.props.addDocument && this.props.addDocument(maxdoc, false);
                        this.toggleMinimize(maxdoc, this.props.Document);
                    } else {
                        SelectionManager.SelectDoc(this, e.ctrlKey);
                    }
                });
            }
        }
    }
    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    deleteClicked = (): void => {
        this.props.removeDocument && this.props.removeDocument(this.props.Document);
    }

    fieldsClicked = (e: React.MouseEvent): void => {
        if (this.props.addDocument) {
            this.props.addDocument(Documents.KVPDocument(this.props.Document, { width: 300, height: 300 }), false);
        }
    }
    fullScreenClicked = (e: React.MouseEvent): void => {
        const doc = Doc.MakeDelegate(FieldValue(this.Document.proto));
        if (doc) {
            CollectionDockingView.Instance.OpenFullScreen(doc);
        }
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Close Full Screen", event: this.closeFullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    closeFullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.CloseFullScreen();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
    }

    @action createIcon = (layoutString: string): Doc => {
        let iconDoc: Doc = Documents.IconDocument(layoutString);
        iconDoc.isMinimized = false;
        iconDoc.nativeWidth = 0;
        iconDoc.nativeHeight = 0;
        iconDoc.proto = this.props.Document;
        iconDoc.maximizedDoc = this.props.Document;
        this.Document.minimizedDoc = iconDoc;
        this.props.addDocument && this.props.addDocument(iconDoc, false);
        return iconDoc;
    }

    animateTransition(icon: number[], targ: number[], width: number, height: number, stime: number, target: Doc, maximizing: boolean) {
        setTimeout(() => {
            let now = Date.now();
            let progress = Math.min(1, (now - stime) / 200);
            let pval = maximizing ?
                [icon[0] + (targ[0] - icon[0]) * progress, icon[1] + (targ[1] - icon[1]) * progress] :
                [targ[0] + (icon[0] - targ[0]) * progress, targ[1] + (icon[1] - targ[1]) * progress];
            target.width = maximizing ? 25 + (width - 25) * progress : width + (25 - width) * progress;
            target.height = maximizing ? 25 + (height - 25) * progress : height + (25 - height) * progress;
            target.x = pval[0];
            target.y = pval[1];
            if (now < stime + 200) {
                this.animateTransition(icon, targ, width, height, stime, target, maximizing);
            }
            else {
                if (!maximizing) {
                    target.isMinimized = true;
                    target.x = targ[0];
                    target.y = targ[1];
                    target.width = width;
                    target.height = height;
                }
                this._completed = true;
            }
        },
            2);
    }

    _completed = true;

    @action
    public toggleMinimize = (maximized: Doc, minim: Doc): void => {
        SelectionManager.DeselectAll();
        if (this._completed) {
            this._completed = false;
            let minimized = Cast(maximized.isMinimized, "boolean", false);
            maximized.isMinimized = false;
            this.animateTransition(
                [Cast(minim.x, "number", 0), Cast(minim.y, "number", 0)],
                [Cast(maximized.x, "number", 0), Cast(maximized.y, "number", 0)],
                Cast(maximized.width, "number", 0), Cast(maximized.width, "number", 0),
                Date.now(), maximized, minimized);
        }
    }

    @action
    public minimize = async (): Promise<void> => {
        const mindoc = await Cast(this.props.Document.minimizedDoc, Doc);
        if (mindoc === undefined) {
            const background = await Cast(this.props.Document.backgroundLayout, "string");
            if (background === undefined) {
                const layout = await Cast(this.props.Document.layout, "string");
                if (layout) {
                    this.createIcon(layout);
                    this.toggleMinimize(this.props.Document, this.createIcon(layout));
                }
            } else {
                this.toggleMinimize(this.props.Document, this.createIcon(background));
            }
        } else {
            this.props.addDocument && this.props.addDocument(mindoc, false);
            this.toggleMinimize(this.props.Document, mindoc);
        }
    }

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc: Doc = de.data.linkSourceDocument;
            let destDoc: Doc = this.props.Document;
            let linkDoc = LinkDoc();

            const protoDest = await Cast(destDoc.proto, Doc);
            const protoSrc = await Cast(sourceDoc.proto, Doc);
            UndoManager.RunInBatch(() => {
                linkDoc.title = "New Link";
                linkDoc.linkDescription = "";
                linkDoc.linkTags = "Default";

                let dstTarg = protoDest ? protoDest : destDoc;
                let srcTarg = protoSrc ? protoSrc : sourceDoc;
                linkDoc.linkedTo = dstTarg;
                linkDoc.linkedFrom = srcTarg;
                let linkedFrom = Cast(dstTarg.linkedFrom, listSpec(Doc));
                if (!linkedFrom) {
                    dstTarg.linkedFrom = linkedFrom = new List<Doc>();
                }
                linkedFrom.push(linkDoc);

                let linkedTo = Cast(srcTarg.linkedTo, listSpec(Doc));
                if (!linkedTo) {
                    srcTarg.linkedTo = linkedTo = new List<Doc>();
                }
                linkedTo.push(linkDoc);
            }, "document view drop");
            e.stopPropagation();
        }
    }

    onDrop = (e: React.DragEvent) => {
        let text = e.dataTransfer.getData("text/plain");
        if (!e.isDefaultPrevented() && text && text.startsWith("<div")) {
            let oldLayout = FieldValue(this.Document.layout) || "";
            let layout = text.replace("{layout}", oldLayout);
            this.Document.layout = layout;
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
        e.stopPropagation();
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3 ||
            e.isDefaultPrevented()) {
            e.preventDefault();
            return;
        }
        e.preventDefault();

        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked });
        ContextMenu.Instance.addItem({ description: "Fields", event: this.fieldsClicked });
        ContextMenu.Instance.addItem({ description: "Center", event: () => this.props.focus(this.props.Document) });
        ContextMenu.Instance.addItem({ description: "Open Right", event: () => CollectionDockingView.Instance.AddRightSplit(this.props.Document) });
        ContextMenu.Instance.addItem({ description: "Copy URL", event: () => Utils.CopyText(ServerUtils.prepend("/doc/" + this.props.Document.Id)) });
        ContextMenu.Instance.addItem({ description: "Copy ID", event: () => Utils.CopyText(this.props.Document[Id]) });
        //ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
        ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15);
        if (!SelectionManager.IsSelected(this)) {
            SelectionManager.SelectDoc(this, false);
        }
    }

    isSelected = () => SelectionManager.IsSelected(this);
    select = (ctrlPressed: boolean) => SelectionManager.SelectDoc(this, ctrlPressed);

    @computed get nativeWidth() { return FieldValue(this.Document.nativeWidth) || 0; }
    @computed get nativeHeight() { return FieldValue(this.Document.nativeHeight) || 0; }
    @computed get contents() { return (<DocumentContentsView {...this.props} isSelected={this.isSelected} select={this.select} layoutKey={"layout"} />); }


    render() {
        var scaling = this.props.ContentScaling();
        var nativeHeight = this.nativeHeight > 0 ? this.nativeHeight.toString() + "px" : "100%";
        var nativeWidth = this.nativeWidth > 0 ? this.nativeWidth.toString() + "px" : "100%";

        return (
            <div className={`documentView-node${this.props.isTopMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    background: FieldValue(this.Document.backgroundColor) || "",
                    width: nativeWidth, height: nativeHeight,
                    transform: `scale(${scaling}, ${scaling})`
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown}
            >
                {this.contents}
            </div>
        );
    }
}
