import { action, computed, IReactionDisposer, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Field, FieldWaiting, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { TextField } from "../../../fields/TextField";
import { Documents } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { ContextMenu } from "../ContextMenu";
import "./DocumentView.scss";
import React = require("react");
import { props } from "bluebird";
import { DocumentContentsView } from "./DocumentContentsView";
import { Utils } from "../../../Utils";
const JsxParser = require('react-jsx-parser').default; //TODO Why does this need to be imported like this?


export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView>;
    Document: Document;
    AddDocument?: (doc: Document) => void;
    RemoveDocument?: (doc: Document) => boolean;
    ScreenToLocalTransform: () => Transform;
    isTopMost: boolean;
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
    focus: (doc: Document) => void;
    SelectOnLoad: boolean;
}
export interface JsxArgs extends DocumentViewProps {
    Keys: { [name: string]: Key }
    Fields: { [name: string]: Field }
}

/*
This function is pretty much a hack that lets us fill out the fields in JsxArgs with something that
jsx-to-string can recover the jsx from
Example usage of this function:
    public static LayoutString() {
        let args = FakeJsxArgs(["Data"]);
        return jsxToString(
            <CollectionFreeFormView
                doc={args.Document}
                fieldKey={args.Keys.Data}
                DocumentViewForField={args.DocumentView} />,
            { useFunctionCode: true, functionNameOnly: true }
        )
    }
*/
export function FakeJsxArgs(keys: string[], fields: string[] = []): JsxArgs {
    let Keys: { [name: string]: any } = {}
    let Fields: { [name: string]: any } = {}
    for (const key of keys) {
        let fn = () => { }
        Object.defineProperty(fn, "name", { value: key + "Key" })
        Keys[key] = fn;
    }
    for (const field of fields) {
        let fn = () => { }
        Object.defineProperty(fn, "name", { value: field })
        Fields[field] = fn;
    }
    let args: JsxArgs = {
        Document: function Document() { },
        DocumentView: function DocumentView() { },
        Keys,
        Fields
    } as any;
    return args;
}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {
    private _mainCont = React.createRef<HTMLDivElement>();
    private _downX: number = 0;
    private _downY: number = 0;
    private _reactionDisposer: Opt<IReactionDisposer>;
    @computed get active(): boolean { return SelectionManager.IsSelected(this) || !this.props.ContainingCollectionView || this.props.ContainingCollectionView.active(); }
    @computed get topMost(): boolean { return !this.props.ContainingCollectionView || this.props.ContainingCollectionView.collectionViewType == CollectionViewType.Docking; }
    @computed get layout(): string { return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>"); }
    @computed get layoutKeys(): Key[] { return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>()); }
    @computed get layoutFields(): Key[] { return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>()); }
    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();
    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (e.shiftKey && e.buttons === 2) {
            if (this.props.isTopMost) {
                this.startDragging(e.pageX, e.pageY, e.ctrlKey);
            }
            else CollectionDockingView.Instance.StartOtherDrag(this.props.Document, e);
            e.stopPropagation();
        } else {
            if (this.active && !e.isDefaultPrevented()) {
                e.stopPropagation();
                document.removeEventListener("pointermove", this.onPointerMove)
                document.addEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp)
                document.addEventListener("pointerup", this.onPointerUp);
            }
        }
    }

    private dropDisposer?: DragManager.DragDropDisposer;
    protected createDropTarget = (ele: HTMLDivElement) => {

    }

    componentDidMount() {
        if (this._mainCont.current) {
            this.dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, { handlers: { drop: this.drop.bind(this) } });
        }
        runInAction(() => {
            DocumentManager.Instance.DocumentViews.push(this);
        })
        this._reactionDisposer = reaction(
            () => this.props.ContainingCollectionView && this.props.ContainingCollectionView.SelectedDocs.slice(),
            () => {
                if (this.props.ContainingCollectionView && this.props.ContainingCollectionView.SelectedDocs.indexOf(this.props.Document.Id) != -1)
                    SelectionManager.SelectDoc(this, true);
            });
    }

    componentDidUpdate() {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        if (this._mainCont.current) {
            this.dropDisposer = DragManager.MakeDropTarget(this._mainCont.current, { handlers: { drop: this.drop.bind(this) } });
        }
    }

    componentWillUnmount() {
        if (this.dropDisposer) {
            this.dropDisposer();
        }
        runInAction(() => {
            DocumentManager.Instance.DocumentViews.splice(DocumentManager.Instance.DocumentViews.indexOf(this), 1);

        })
        if (this._reactionDisposer) {
            this._reactionDisposer();
        }
    }

    startDragging(x: number, y: number, ctrlPressed: boolean) {
        if (this._mainCont.current) {
            const [left, top] = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
            let dragData: { [id: string]: any } = {};
            dragData["documentView"] = this;
            dragData["document"] = this.props.Document
            dragData["xOffset"] = x - left;
            dragData["yOffset"] = y - top;
            dragData["alias"] = ctrlPressed
            DragManager.StartDrag(this._mainCont.current, dragData, {
                handlers: {
                    dragComplete: action(() => { }),
                },
                hideSource: !ctrlPressed
            })
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble) {
            return;
        }
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            document.removeEventListener("pointermove", this.onPointerMove)
            document.removeEventListener("pointerup", this.onPointerUp);
            if (!this.topMost || e.buttons == 2 || e.altKey) {
                this.startDragging(e.x, e.y, e.ctrlKey);
            }
        }
        e.stopPropagation();
        e.preventDefault();
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove)
        document.removeEventListener("pointerup", this.onPointerUp)
        e.stopPropagation();
        if (Math.abs(e.clientX - this._downX) < 4 && Math.abs(e.clientY - this._downY) < 4) {
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }
    stopPropogation = (e: React.SyntheticEvent) => {
        e.stopPropagation();
    }

    deleteClicked = (): void => {
        if (this.props.RemoveDocument) {
            this.props.RemoveDocument(this.props.Document);
        }
    }

    fieldsClicked = (e: React.MouseEvent): void => {
        if (this.props.AddDocument) {
            this.props.AddDocument(Documents.KVPDocument(this.props.Document, { width: 300, height: 300 }));
        }
    }
    fullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.OpenFullScreen(this.props.Document);
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Close Full Screen", event: this.closeFullScreenClicked });
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
    }

    closeFullScreenClicked = (e: React.MouseEvent): void => {
        CollectionDockingView.Instance.CloseFullScreen();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
    }

    @action
    drop = (e: Event, de: DragManager.DropEvent) => {
        console.log("drop");
        const sourceDocView: DocumentView = de.data["linkSourceDoc"];
        if (!sourceDocView) {
            return;
        }
        let sourceDoc: Document = sourceDocView.props.Document;
        let destDoc: Document = this.props.Document;
        if (this.props.isTopMost) {
            return;
        }
        let linkDoc: Document = new Document();

        linkDoc.Set(KeyStore.Title, new TextField("New Link"));
        linkDoc.Set(KeyStore.LinkDescription, new TextField(""));
        linkDoc.Set(KeyStore.LinkTags, new TextField("Default"));

        sourceDoc.GetOrCreateAsync(KeyStore.LinkedToDocs, ListField, field => { (field as ListField<Document>).Data.push(linkDoc) });
        linkDoc.Set(KeyStore.LinkedToDocs, destDoc);
        destDoc.GetOrCreateAsync(KeyStore.LinkedFromDocs, ListField, field => { (field as ListField<Document>).Data.push(linkDoc) });
        linkDoc.Set(KeyStore.LinkedFromDocs, sourceDoc);

        e.stopPropagation();
    }

    onDrop = (e: React.DragEvent) => {
        if (e.isDefaultPrevented()) {
            return;
        }
        let text = e.dataTransfer.getData("text/plain");
        if (text && text.startsWith("<div")) {
            let oldLayout = this.props.Document.GetText(KeyStore.Layout, "");
            let layout = text.replace("{layout}", oldLayout);
            this.props.Document.SetText(KeyStore.Layout, layout);
            e.stopPropagation();
            e.preventDefault();
        }
    }

    @action
    onContextMenu = (e: React.MouseEvent): void => {
        e.stopPropagation();
        let moved = Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3;
        if (moved || e.isDefaultPrevented()) {
            e.preventDefault()
            return;
        }
        e.preventDefault()

        ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
        ContextMenu.Instance.addItem({ description: "Fields", event: this.fieldsClicked })
        ContextMenu.Instance.addItem({ description: "Center", event: () => this.props.focus(this.props.Document) })
        ContextMenu.Instance.addItem({ description: "Open Right", event: () => CollectionDockingView.Instance.AddRightSplit(this.props.Document) })
        ContextMenu.Instance.addItem({
            description: "Copy ID",
            event: () => {
                Utils.CopyText(this.props.Document.Id);
            }
        });
        //ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
        if (!this.topMost) {
            // DocumentViews should stop propagation of this event
            e.stopPropagation();
        }

        ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked })
        ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
        SelectionManager.SelectDoc(this, e.ctrlKey);
    }


    isSelected = () => {
        return SelectionManager.IsSelected(this);
    }

    select = (ctrlPressed: boolean) => {
        SelectionManager.SelectDoc(this, ctrlPressed)
    }

    @computed
    get getProps() {
        let bindings: any = {
            ...this.props,
            isSelected: this.isSelected,
            select: this.select,
            layout: this.layout
        };
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key; // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        bindings.bindings = bindings;

        return bindings
    }

    render() {
        if (!this.props.Document) {
            return (null);
        }
        let lkeys = this.props.Document.GetT(KeyStore.LayoutKeys, ListField);
        if (!lkeys || lkeys === "<Waiting>") {
            return <p>Error loading layout keys</p>;
        }
        var scaling = this.props.ContentScaling();
        var nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        var nativeHeight = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
        var backgroundcolor = this.props.Document.GetText(KeyStore.BackgroundColor, "");
        return (
            <div className="documentView-node" ref={this._mainCont}
                style={{
                    background: backgroundcolor,
                    width: nativeWidth > 0 ? nativeWidth.toString() + "px" : "100%",
                    height: nativeHeight > 0 ? nativeHeight.toString() + "px" : "100%",
                    transformOrigin: "left top",
                    transform: `scale(${scaling} , ${scaling})`
                }}
                onDrop={this.onDrop}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}
                onPointerUp={this.stopPropogation} >
                <DocumentContentsView {...this.getProps} />
            </div>
        )
    }
}