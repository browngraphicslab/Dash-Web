import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Field, FieldWaiting, Opt } from "../../../fields/Field";
import { Key } from "../../../fields/Key";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";
import { DragManager } from "../../util/DragManager";
import { SelectionManager } from "../../util/SelectionManager";
import { Transform } from "../../util/Transform";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionView, CollectionViewType } from "../collections/CollectionView";
import { WebView } from "./WebView";
import { ContextMenu } from "../ContextMenu";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import "./DocumentView.scss";
import React = require("react");
import { PresentationView } from "../PresentationView";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

export interface DocumentViewProps {
    ContainingCollectionView: Opt<CollectionView>;

    Document: Document;
    AddDocument?: (doc: Document) => void;
    RemoveDocument?: (doc: Document) => boolean;
    ScreenToLocalTransform: () => Transform;
    isTopMost: boolean;
    //tfs: This shouldn't be necessary I don't think
    ContentScaling: () => number;
    PanelWidth: () => number;
    PanelHeight: () => number;
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
    private _documentBindings: any = null;
    private _contextMenuCanOpen = false;
    private _downX: number = 0;
    private _downY: number = 0;

    @computed get active(): boolean { return SelectionManager.IsSelected(this) || !this.props.ContainingCollectionView || this.props.ContainingCollectionView.active(); }
    @computed get topMost(): boolean { return !this.props.ContainingCollectionView || this.props.ContainingCollectionView.collectionViewType == CollectionViewType.Docking; }
    @computed get layout(): string { return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>"); }
    @computed get layoutKeys(): Key[] { return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>()); }
    @computed get layoutFields(): Key[] { return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>()); }

    screenRect = (): ClientRect | DOMRect => this._mainCont.current ? this._mainCont.current.getBoundingClientRect() : new DOMRect();

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        if (e.shiftKey && e.buttons === 1) {
            CollectionDockingView.Instance.StartOtherDrag(this._mainCont.current!, this.props.Document);
            e.stopPropagation();
        } else {
            this._contextMenuCanOpen = true;
            if (this.active && !e.isDefaultPrevented()) {
                e.stopPropagation();
                if (e.buttons === 2) {
                    e.preventDefault();
                }
                document.removeEventListener("pointermove", this.onPointerMove)
                document.addEventListener("pointermove", this.onPointerMove);
                document.removeEventListener("pointerup", this.onPointerUp)
                document.addEventListener("pointerup", this.onPointerUp);
            }
        }
    }

    onPointerMove = (e: PointerEvent): void => {
        if (e.cancelBubble) {
            this._contextMenuCanOpen = false;
            return;
        }
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            this._contextMenuCanOpen = false;
            if (this._mainCont.current != null && !this.topMost) {
                this._contextMenuCanOpen = false;
                const [left, top] = this.props.ScreenToLocalTransform().inverse().transformPoint(0, 0);
                let dragData: { [id: string]: any } = {};
                dragData["documentView"] = this;
                dragData["xOffset"] = e.x - left;
                dragData["yOffset"] = e.y - top;
                DragManager.StartDrag(this._mainCont.current, dragData, {
                    handlers: {
                        dragComplete: action((e: DragManager.DragCompleteEvent) => { }),
                    },
                    hideSource: true
                })
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

    deleteClicked = (e: React.MouseEvent): void => {
        if (this.props.RemoveDocument) {
            this.props.RemoveDocument(this.props.Document);
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
    onContextMenu = (e: React.MouseEvent): void => {
        e.preventDefault()
        e.stopPropagation();
        if (!SelectionManager.IsSelected(this) || !this._contextMenuCanOpen) {
            return;
        }

        if (this.topMost) {
            ContextMenu.Instance.clearItems()
            ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
        }
        else {
            // DocumentViews should stop propagation of this event
            e.stopPropagation();

            ContextMenu.Instance.clearItems();
            ContextMenu.Instance.addItem({ description: "Full Screen", event: this.fullScreenClicked })
            ContextMenu.Instance.addItem({ description: "Open Right", event: () => CollectionDockingView.Instance.AddRightSplit(this.props.Document) })
            ContextMenu.Instance.addItem({ description: "Delete", event: this.deleteClicked })
            ContextMenu.Instance.addItem({ description: "Pin to Presentation", event: () => PresentationView.Instance.PinDoc(this.props.Document) })
            ContextMenu.Instance.addItem({ description: "Freeform", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Freeform) })
            ContextMenu.Instance.addItem({ description: "Schema", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Schema) })
            ContextMenu.Instance.addItem({ description: "Treeview", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Tree) })
            ContextMenu.Instance.addItem({ description: "Docking", event: () => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Docking) })
            ContextMenu.Instance.displayMenu(e.pageX - 15, e.pageY - 15)
            SelectionManager.SelectDoc(this, e.ctrlKey);
        }
    }

    @computed get mainContent() {
        var val = this.props.Document.Id;
        return <JsxParser
            components={{ FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView, CollectionView, WebView }}
            bindings={this._documentBindings}
            jsx={this.layout}
            showWarnings={true}
            onError={(test: any) => { console.log(test) }}
        />
    }
    render() {
        if (!this.props.Document)
            return <div></div>
        let lkeys = this.props.Document.GetT(KeyStore.LayoutKeys, ListField);
        if (!lkeys || lkeys === "<Waiting>") {
            return <p>Error loading layout keys</p>;
        }
        this._documentBindings = {
            ...this.props,
            isSelected: () => SelectionManager.IsSelected(this),
            select: (ctrlPressed: boolean) => SelectionManager.SelectDoc(this, ctrlPressed)
        };
        for (const key of this.layoutKeys) {
            this._documentBindings[key.Name + "Key"] = key;  // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            this._documentBindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        this._documentBindings.bindings = this._documentBindings;

        var scaling = this.props.ContentScaling();
        var nativeWidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        var nativeHeight = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
        return (
            <div className="documentView-node" ref={this._mainCont}
                style={{
                    width: nativeWidth > 0 ? nativeWidth.toString() + "px" : "100%",
                    height: nativeHeight > 0 ? nativeHeight.toString() + "px" : "100%",
                    transformOrigin: "left top",
                    transform: `scale(${scaling},${scaling})`
                }}
                onContextMenu={this.onContextMenu}
                onPointerDown={this.onPointerDown}
            >
                {this.mainContent}
            </div>
        )
    }
}
