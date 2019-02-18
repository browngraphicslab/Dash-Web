import { action, computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../fields/Document";
import { Opt, FieldWaiting } from "../../../fields/Field";
import { Key, KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";
import { Utils } from "../../../Utils";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionFreeFormView } from "../collections/CollectionFreeFormView";
import { CollectionSchemaView } from "../collections/CollectionSchemaView";
import { CollectionViewBase, COLLECTION_BORDER_WIDTH } from "../collections/CollectionViewBase";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { ImageBox } from "../nodes/ImageBox";
import { WebBox } from "../nodes/WebBox";
import "./DocumentView.scss";
import React = require("react");
import { Transform } from "../../util/Transform";
const JsxParser = require('react-jsx-parser').default;//TODO Why does this need to be imported like this?

export interface DocumentViewProps {
    DocumentView: Opt<DocumentView>  // needed only to set ContainingDocumentView on CollectionViewProps when invoked from JsxParser -- is there a better way?
    ContainingCollectionView: Opt<CollectionViewBase>;

    Document: Document;
    AddDocument?: (doc: Document) => void;
    RemoveDocument?: (doc: Document) => boolean;
    GetTransform: () => Transform;
    ParentScaling: number;
}

@observer
export class DocumentView extends React.Component<DocumentViewProps> {

    protected _renderDoc = React.createRef<any>();
    protected _mainCont = React.createRef<any>();
    get MainContent() {
        return this._mainCont;
    }

    @computed
    get parentScaling(): number {
        return this._renderDoc.current ? this._renderDoc.current.props.ParentScaling : this.props.ParentScaling > 0 ? this.props.ParentScaling : 1;
    }

    @computed
    get layout(): string {
        return this.props.Document.GetText(KeyStore.Layout, "<p>Error loading layout data</p>");
    }

    @computed
    get backgroundLayout(): string {
        return this.props.Document.GetText(KeyStore.BackgroundLayout, "");
    }

    @computed
    get layoutKeys(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutKeys, ListField, new Array<Key>());
    }

    @computed
    get layoutFields(): Key[] {
        return this.props.Document.GetData(KeyStore.LayoutFields, ListField, new Array<Key>());
    }

    // 
    // returns the cumulative scaling between the document and the screen
    //
    @computed
    public get ScalingToScreenSpace(): number {
        if (this.props.ContainingCollectionView != undefined &&
            this.props.ContainingCollectionView.props.ContainingDocumentView != undefined) {
            let ss = this.props.ContainingCollectionView.props.DocumentForCollection.GetNumber(KeyStore.Scale, 1);
            return this.props.ContainingCollectionView.props.ContainingDocumentView.ScalingToScreenSpace * ss;
        }
        return 1;
    }


    public LeftCorner(): number {
        if (this.props.ContainingCollectionView) {
            if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
                // this is a hacky way to account for the titles/pane placement/etc of a CollectionDockingView 
                // this only works if the collectionDockingView is the root collection, too.
                // need to find a better way.
                var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
                return rx + COLLECTION_BORDER_WIDTH;
            }
            return COLLECTION_BORDER_WIDTH; // assumes all collections have the same border
        }
        return 0;
    }

    public TopCorner(): number {
        if (this.props.ContainingCollectionView) {
            if (this.props.ContainingCollectionView instanceof CollectionDockingView) {
                // this is a hacky way to account for the titles/pane placement/etc of a CollectionDockingView 
                // this only works if the collectionDockingView is the root collection, too.
                // need to find a better way.
                var { translateX: rx, translateY: ry } = Utils.GetScreenTransform(this.MainContent.current!);
                return ry + COLLECTION_BORDER_WIDTH;
            }
            return COLLECTION_BORDER_WIDTH;  // assumes all collections have the same border
        }
        return 0;
    }
    //
    // Converts a coordinate in the screen space of the app to a local point in the space of the DocumentView.
    // This also returns the point in the coordinate space of this document's containing CollectionView
    //
    public TransformToLocalPoint(screenX: number, screenY: number) {
        // if this collection view is nested within another collection view, then 
        // first transform the screen point into the parent collection's coordinate space.
        let containingCollectionViewDoc = this.props.ContainingCollectionView ? this.props.ContainingCollectionView.props.ContainingDocumentView : undefined;
        let { LocalX: parentX, LocalY: parentY } = !containingCollectionViewDoc ? { LocalX: screenX, LocalY: screenY } :
            containingCollectionViewDoc.TransformToLocalPoint(screenX, screenY);
        let ContainerX: number = parentX - COLLECTION_BORDER_WIDTH;
        let ContainerY: number = parentY - COLLECTION_BORDER_WIDTH;

        let Ss = this.props.Document.GetNumber(KeyStore.Scale, 1);
        let Panxx = this.props.Document.GetNumber(KeyStore.PanX, 0);
        let Panyy = this.props.Document.GetNumber(KeyStore.PanY, 0);
        let LocalX = (ContainerX - (this.LeftCorner() + Panxx)) / Ss;
        let LocalY = (ContainerY - (this.TopCorner() + Panyy)) / Ss;

        return { LocalX, LocalY, ContainerX, ContainerY };
    }

    //
    // Converts a point in the coordinate space of the document to coordinate in app screen coordinates
    //
    public TransformToScreenPoint(localX: number, localY: number, applyViewXf: boolean = false): { ScreenX: number, ScreenY: number } {
        var parentScaling = applyViewXf ? this.parentScaling : 1;
        let Panxx = applyViewXf ? this.props.Document.GetNumber(KeyStore.PanX, 0) : 0;
        let Panyy = applyViewXf ? this.props.Document.GetNumber(KeyStore.PanY, 0) : 0;
        var Zoom = applyViewXf ? this.props.Document.GetNumber(KeyStore.Scale, 1) : 1;

        let parentX = this.LeftCorner() + (Panxx + (localX - COLLECTION_BORDER_WIDTH) * Zoom) * parentScaling;
        let parentY = this.TopCorner() + (Panyy + (localY - COLLECTION_BORDER_WIDTH) * Zoom) * parentScaling;
        // if this collection view is nested within another collection view, then 
        // first transform the local point into the parent collection's coordinate space.
        let containingDocView = this.props.ContainingCollectionView ? this.props.ContainingCollectionView.props.ContainingDocumentView : undefined;
        if (containingDocView) {
            let { ScreenX, ScreenY } = containingDocView.TransformToScreenPoint(parentX + COLLECTION_BORDER_WIDTH * parentScaling, parentY + COLLECTION_BORDER_WIDTH * parentScaling, true);
            parentX = ScreenX;
            parentY = ScreenY;
        }
        return { ScreenX: parentX, ScreenY: parentY };
    }

    render() {
        let bindings = { ...this.props } as any;
        for (const key of this.layoutKeys) {
            bindings[key.Name + "Key"] = key;  // this maps string values of the form <keyname>Key to an actual key Kestore.keyname  e.g,   "DataKey" => KeyStore.Data
        }
        for (const key of this.layoutFields) {
            let field = this.props.Document.Get(key);
            bindings[key.Name] = field && field != FieldWaiting ? field.GetValue() : field;
        }
        if (bindings.DocumentView === undefined) {
            bindings.DocumentView = this; // set the DocumentView to this if it hasn't already been set by a sub-class during its render method.
        }
        if (this.backgroundLayout) {
            var backgroundview = <JsxParser
                components={{ FormattedTextBox: FormattedTextBox, ImageBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                bindings={bindings}
                jsx={this.backgroundLayout}
                showWarnings={true}
                onError={(test: any) => { console.log(test) }}
            />;
            bindings["BackgroundView"] = backgroundview;
        }
        var nativewidth = this.props.Document.GetNumber(KeyStore.NativeWidth, 0);
        var nativeheight = this.props.Document.GetNumber(KeyStore.NativeHeight, 0);
        var width = nativewidth > 0 ? nativewidth + "px" : "100%";
        var height = nativeheight > 0 ? nativeheight + "px" : "100%";
        return (
            <div className="documentView-node" ref={this._mainCont}
                style={{
                    width: width,
                    height: height,
                    transformOrigin: "top left",
                    transform: `scale(${this.props.ParentScaling},${this.props.ParentScaling})`
                }}>
                <JsxParser
                    components={{ FormattedTextBox: FormattedTextBox, ImageBox, WebBox, CollectionFreeFormView, CollectionDockingView, CollectionSchemaView }}
                    bindings={bindings}
                    jsx={this.layout}
                    showWarnings={true}
                    onError={(test: any) => { console.log(test) }}
                />
            </div>
        )
    }
}
