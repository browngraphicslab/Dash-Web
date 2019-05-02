import { action, computed, runInAction } from "mobx";
import { observer } from "mobx-react";
import { emptyFunction, Utils } from "../../../Utils";
import { Docs } from "../../documents/Documents";
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
import { Template, Templates } from "./../Templates";
import { DocumentContentsView } from "./DocumentContentsView";
import "./DocumentView.scss";
import React = require("react");
import { Opt, Doc } from "../../../new_fields/Doc";
import { DocComponent } from "../DocComponent";
import { createSchema, makeInterface } from "../../../new_fields/Schema";
import { FieldValue, StrCast } from "../../../new_fields/Types";
import { List } from "../../../new_fields/List";
import { CollectionFreeFormView } from "../collections/collectionFreeForm/CollectionFreeFormView";
import { CurrentUserUtils } from "../../../server/authentication/models/current_user_utils";
import { DocServer } from "../../DocServer";
import { Id } from "../../../new_fields/RefField";

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
    toggleMinimized: () => void;
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

export type PositionDocument = makeInterface<[typeof positionSchema]>;
export const PositionDocument = makeInterface(positionSchema);

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
    @computed get templates(): List<string> {
        let field = this.props.Document.templates;
        if (field && field instanceof List) {
            return field;
        }
        return new List<string>();
    }
    set templates(templates: List<string>) { this.props.Document.templates = templates; }
    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();

    @action
    componentDidMount() {
        if (this._mainCont.current) {
            this._dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, {
                handlers: { drop: this.drop.bind(this) }
            });
        }
        DocumentManager.Instance.DocumentViews.push(this);
    }
    @action
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
    @action
    componentWillUnmount() {
        if (this._dropDisposer) {
            this._dropDisposer();
        }
        DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);
    }

    stopPropagation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    startDragging(x: number, y: number, dropAliasOfDraggedDoc: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).inverse().transformPoint(0, 0);
            let dragData = new DragManager.DocumentDragData([this.props.Document]);
            const [xoff, yoff] = this.props.ScreenToLocalTransform().scale(this.props.ContentScaling()).transformDirection(x - left, y - top);
            dragData.aliasOnDrop = dropAliasOfDraggedDoc;
            dragData.xOffset = xoff;
            dragData.yOffset = yoff;
            dragData.moveDocument = this.props.moveDocument;
            DragManager.StartDocumentDrag([this._mainCont.current], dragData, x, y, {
                handlers: {
                    dragComplete: action(emptyFunction)
                },
                hideSource: !dropAliasOfDraggedDoc
            });
        }
    }

    onClick = (e: React.MouseEvent): void => {
        if (CurrentUserUtils.MainDocId !== this.props.Document[Id] &&
            (Math.abs(e.clientX - this._downX) < Utils.DRAG_THRESHOLD &&
                Math.abs(e.clientY - this._downY) < Utils.DRAG_THRESHOLD)) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (CollectionFreeFormView.RIGHT_BTN_DRAG && (e.button === 2 || (e.button === 0 && e.altKey)) && !this.isSelected()) {
            return;
        }
        if (e.shiftKey && e.buttons === 1) {
            if (this.props.isTopMost) {
                this.startDragging(e.pageX, e.pageY, e.altKey || e.ctrlKey);
            } else {
                CollectionDockingView.Instance.StartOtherDrag([this.props.Document], e);
            }
            e.stopPropagation();
        } else if (this.active) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.addEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            document.addEventListener("pointerup", this.onPointerUp);
        }
    }
    onPointerMove = (e: PointerEvent): void => {
        if (!e.cancelBubble) {
            if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
                document.removeEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp);
                if (!e.altKey && !this.topMost && (!CollectionFreeFormView.RIGHT_BTN_DRAG && e.buttons === 1) || (CollectionFreeFormView.RIGHT_BTN_DRAG && e.buttons === 2)) {
                    this.startDragging(this._downX, this._downY, e.ctrlKey || e.altKey);
                }
            }
            e.stopPropagation(); // doesn't actually stop propagation since all our listeners are listening to events on 'document'  however it does mark the event as cancelBubble=true which we test for in the move event handlers
            e.preventDefault();
        }
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    deleteClicked = (): void => {
        this.props.removeDocument && this.props.removeDocument(this.props.Document);
    }
    fieldsClicked = (e: React.MouseEvent): void => {
        let kvp = Docs.KVPDocument(this.props.Document, { width: 300, height: 300 });
        CollectionDockingView.Instance.AddRightSplit(kvp);
    }
    fullScreenClicked = (e: React.MouseEvent): void => {
        const doc = Doc.MakeDelegate(FieldValue(this.props.Document.proto));
        // bcz .. should this work?  
        // const doc = Doc.MakeDelegate(FieldValue(this.Document.proto));
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

    @undoBatch
    @action
    drop = async (e: Event, de: DragManager.DropEvent) => {
        if (de.data instanceof DragManager.LinkDragData) {
            let sourceDoc = de.data.linkSourceDocument;
            let destDoc = this.props.Document;

            const protoDest = destDoc.proto;
            const protoSrc = sourceDoc.proto;
            Doc.MakeLink(protoSrc ? protoSrc : sourceDoc, protoDest ? protoDest : destDoc);
            e.stopPropagation();
        }
    }

    @action
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
    addTemplate = (template: Template) => {
        this.templates.push(template.Layout);
        this.templates = this.templates;
    }

    @action
    removeTemplate = (template: Template) => {
        for (let i = 0; i < this.templates.length; i++) {
            if (this.templates[i] === template.Layout) {
                this.templates.splice(i, 1);
                break;
            }
        }
        this.templates = this.templates;
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
        ContextMenu.Instance.addItem({ description: "Copy URL", event: () => Utils.CopyText(DocServer.prepend("/doc/" + this.props.Document[Id])) });
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

    @computed get nativeWidth() { return this.Document.nativeWidth || 0; }
    @computed get nativeHeight() { return this.Document.nativeHeight || 0; }
    @computed get contents() { return (<DocumentContentsView {...this.props} isSelected={this.isSelected} select={this.select} layoutKey={"layout"} />); }

    render() {
        var scaling = this.props.ContentScaling();
        var nativeHeight = this.nativeHeight > 0 ? this.nativeHeight.toString() + "px" : "100%";
        var nativeWidth = this.nativeWidth > 0 ? this.nativeWidth.toString() + "px" : "100%";

        return (
            <div className={`documentView-node${this.props.isTopMost ? "-topmost" : ""}`}
                ref={this._mainCont}
                style={{
                    borderRadius: "inherit",
                    background: this.Document.backgroundColor || "",
                    width: nativeWidth,
                    height: nativeHeight,
                    transform: `scale(${scaling}, ${scaling})`
                }}
                onDrop={this.onDrop} onContextMenu={this.onContextMenu} onPointerDown={this.onPointerDown} onClick={this.onClick}
            >
                {this.contents}
            </div>
        );
    }
}
