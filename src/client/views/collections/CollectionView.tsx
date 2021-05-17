import { computed, observable, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { Doc, DocListCast, StrListCast } from '../../../fields/Doc';
import { documentSchema } from '../../../fields/documentSchemas';
import { Id } from '../../../fields/FieldSymbols';
import { ObjectField } from '../../../fields/ObjectField';
import { makeInterface } from '../../../fields/Schema';
import { ScriptField } from '../../../fields/ScriptField';
import { Cast, ScriptCast, StrCast } from '../../../fields/Types';
import { TraceMobx } from '../../../fields/util';
import { DocUtils } from '../../documents/Documents';
import { BranchCreate, BranchTask } from '../../documents/Gitlike';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { InteractionUtils } from '../../util/InteractionUtils';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { ViewBoxAnnotatableComponent, ViewBoxAnnotatableProps } from '../DocComponent';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { CollectionCarousel3DView } from './CollectionCarousel3DView';
import { CollectionCarouselView } from './CollectionCarouselView';
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionGridView } from './collectionGrid/CollectionGridView';
import { CollectionLinearView } from './CollectionLinearView';
import CollectionMapView from './CollectionMapView';
import { CollectionMulticolumnView } from './collectionMulticolumn/CollectionMulticolumnView';
import { CollectionMultirowView } from './collectionMulticolumn/CollectionMultirowView';
import { CollectionPileView } from './CollectionPileView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { SubCollectionViewProps } from './CollectionSubView';
import { CollectionTimeView } from './CollectionTimeView';
import { CollectionTreeView } from "./CollectionTreeView";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import './CollectionView.scss';
export const COLLECTION_BORDER_WIDTH = 2;
const path = require('path');

export enum CollectionViewType {
    Invalid = "invalid",
    Freeform = "freeform",
    Schema = "schema",
    Docking = "docking",
    Tree = 'tree',
    Stacking = "stacking",
    Masonry = "masonry",
    Multicolumn = "multicolumn",
    Multirow = "multirow",
    Time = "time",
    Carousel = "carousel",
    Carousel3D = "3D Carousel",
    Linear = "linear",
    //Staff = "staff",
    Map = "map",
    Grid = "grid",
    Pile = "pileup",
    StackedTimeline = "stacked timeline"
}
export interface CollectionViewProps extends FieldViewProps {
    isAnnotationOverlay?: boolean;  // is the collection an annotation overlay (eg an overlay on an image/video/etc)
    layoutEngine?: () => string;
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;

    // property overrides for child documents
    children?: never | (() => JSX.Element[]) | React.ReactNode;
    childDocuments?: Doc[]; // used to override the documents shown by the sub collection to an explicit list (see LinkBox)
    childDocumentsActive?: () => boolean;// whether child documents can be dragged if collection can be dragged (eg., in a when a Pile document is in startburst mode)
    childFitWidth?: () => boolean;
    childOpacity?: () => number;
    childHideTitle?: () => boolean; // whether to hide the documentdecorations title for children
    childHideDecorationTitle?: () => boolean;
    childLayoutTemplate?: () => (Doc | undefined);// specify a layout Doc template to use for children of the collection
    childLayoutString?: string;
    childFreezeDimensions?: boolean; // used by TimeView to coerce documents to treat their width height as their native width/height
    childIgnoreNativeSize?: boolean;
    childClickScript?: ScriptField;
    childDoubleClickScript?: ScriptField;
}

type CollectionDocument = makeInterface<[typeof documentSchema]>;
const CollectionDocument = makeInterface(documentSchema);
@observer
export class CollectionView extends ViewBoxAnnotatableComponent<ViewBoxAnnotatableProps & CollectionViewProps, CollectionDocument>(CollectionDocument, "") {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    get collectionViewType(): CollectionViewType | undefined {
        const viewField = StrCast(this.layoutDoc._viewType);
        if (CollectionView._safeMode) {
            switch (viewField) {
                case CollectionViewType.Freeform:
                case CollectionViewType.Schema: return CollectionViewType.Tree;
                case CollectionViewType.Invalid: return CollectionViewType.Freeform;
            }
        }
        return viewField as any as CollectionViewType;
    }

    showIsTagged = () => {
        return (null);
        // this section would display an icon in the bototm right of a collection to indicate that all
        // photos had been processed through Google's content analysis API and Google's tags had been
        // assigned to the documents googlePhotosTags field.
        // const children = DocListCast(this.rootDoc[this.props.fieldKey]);
        // const imageProtos = children.filter(doc => Cast(doc.data, ImageField)).map(Doc.GetProto);
        // const allTagged = imageProtos.length > 0 && imageProtos.every(image => image.googlePhotosTags);
        // return !allTagged ? (null) : <img id={"google-tags"} src={"/assets/google_tags.png"} />;
        this.isContentActive();
    }

    screenToLocalTransform = () => this.props.renderDepth ? this.props.ScreenToLocalTransform() : this.props.ScreenToLocalTransform().scale(this.props.PanelWidth() / this.bodyPanelWidth());
    private SubView = (type: CollectionViewType, props: SubCollectionViewProps) => {
        TraceMobx();
        switch (type) {
            default:
            case CollectionViewType.Freeform: return <CollectionFreeFormView key="collview" {...props} />;
            case CollectionViewType.Schema: return <CollectionSchemaView key="collview" {...props} />;
            case CollectionViewType.Docking: return <CollectionDockingView key="collview" {...props} />;
            case CollectionViewType.Tree: return <CollectionTreeView key="collview" {...props} />;
            case CollectionViewType.Multicolumn: return <CollectionMulticolumnView key="collview" {...props} />;
            case CollectionViewType.Multirow: return <CollectionMultirowView key="collview" {...props} />;
            case CollectionViewType.Linear: return <CollectionLinearView key="collview" {...props} />;
            case CollectionViewType.Pile: return <CollectionPileView key="collview" {...props} />;
            case CollectionViewType.Carousel: return <CollectionCarouselView key="collview" {...props} />;
            case CollectionViewType.Carousel3D: return <CollectionCarousel3DView key="collview" {...props} />;
            case CollectionViewType.Stacking: return <CollectionStackingView key="collview" {...props} />;
            case CollectionViewType.Masonry: return <CollectionStackingView key="collview" {...props} />;
            case CollectionViewType.Time: return <CollectionTimeView key="collview" {...props} />;
            case CollectionViewType.Map: return <CollectionMapView key="collview" {...props} />;
            case CollectionViewType.Grid: return <CollectionGridView key="collview" {...props} />;
            //case CollectionViewType.Staff: return <CollectionStaffView key="collview" {...props} />;
        }
    }

    setupViewTypes(category: string, func: (viewType: CollectionViewType) => Doc, addExtras: boolean) {
        const subItems: ContextMenuProps[] = [];
        subItems.push({ description: "Freeform", event: () => func(CollectionViewType.Freeform), icon: "signature" });
        if (addExtras && CollectionView._safeMode) {
            ContextMenu.Instance.addItem({ description: "Test Freeform", event: () => func(CollectionViewType.Invalid), icon: "project-diagram" });
        }
        subItems.push({ description: "Schema", event: () => func(CollectionViewType.Schema), icon: "th-list" });
        subItems.push({ description: "Tree", event: () => func(CollectionViewType.Tree), icon: "tree" });
        subItems.push({ description: "Stacking", event: () => func(CollectionViewType.Stacking)._autoHeight = true, icon: "ellipsis-v" });
        subItems.push({ description: "Multicolumn", event: () => func(CollectionViewType.Multicolumn), icon: "columns" });
        subItems.push({ description: "Multirow", event: () => func(CollectionViewType.Multirow), icon: "columns" });
        subItems.push({ description: "Masonry", event: () => func(CollectionViewType.Masonry), icon: "columns" });
        subItems.push({ description: "Carousel", event: () => func(CollectionViewType.Carousel), icon: "columns" });
        subItems.push({ description: "3D Carousel", event: () => func(CollectionViewType.Carousel3D), icon: "columns" });
        !Doc.UserDoc().noviceMode && subItems.push({ description: "Pivot/Time", event: () => func(CollectionViewType.Time), icon: "columns" });
        !Doc.UserDoc().noviceMode && subItems.push({ description: "Map", event: () => func(CollectionViewType.Map), icon: "globe-americas" });
        subItems.push({ description: "Grid", event: () => func(CollectionViewType.Grid), icon: "th-list" });

        if (!Doc.IsSystem(this.rootDoc) && !this.rootDoc.annotationOn) {
            const existingVm = ContextMenu.Instance.findByDescription(category);
            const catItems = existingVm && "subitems" in existingVm ? existingVm.subitems : [];
            catItems.push({ description: "Add a Perspective...", addDivider: true, noexpand: true, subitems: subItems, icon: "eye" });
            !existingVm && ContextMenu.Instance.addItem({ description: category, subitems: catItems, icon: "eye" });
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        if (cm && !e.isPropagationStopped() && this.rootDoc[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            this.setupViewTypes("UI Controls...", vtype => {
                const newRendition = Doc.MakeAlias(this.rootDoc);
                newRendition._viewType = vtype;
                this.props.addDocTab(newRendition, "add:right");
                return newRendition;
            }, false);

            const options = cm.findByDescription("Options...");
            const optionItems = options && "subitems" in options ? options.subitems : [];
            !Doc.UserDoc().noviceMode ? optionItems.splice(0, 0, { description: `${this.rootDoc.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.rootDoc.forceActive = !this.rootDoc.forceActive, icon: "project-diagram" }) : null;
            if (this.rootDoc.childLayout instanceof Doc) {
                optionItems.push({ description: "View Child Layout", event: () => this.props.addDocTab(this.rootDoc.childLayout as Doc, "add:right"), icon: "project-diagram" });
            }
            if (this.rootDoc.childClickedOpenTemplateView instanceof Doc) {
                optionItems.push({ description: "View Child Detailed Layout", event: () => this.props.addDocTab(this.rootDoc.childClickedOpenTemplateView as Doc, "add:right"), icon: "project-diagram" });
            }
            !Doc.UserDoc().noviceMode && optionItems.push({ description: `${this.rootDoc.isInPlaceContainer ? "Unset" : "Set"} inPlace Container`, event: () => this.rootDoc.isInPlaceContainer = !this.rootDoc.isInPlaceContainer, icon: "project-diagram" });

            optionItems.push({
                description: "Create Branch", event: async () => this.props.addDocTab(await BranchCreate(this.rootDoc), "add:right"), icon: "project-diagram"
            });
            optionItems.push({
                description: "Pull Master", event: () => BranchTask(this.rootDoc, "pull"), icon: "project-diagram"
            });
            optionItems.push({
                description: "Merge Branches", event: () => BranchTask(this.rootDoc, "merge"), icon: "project-diagram"
            });

            !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "hand-point-right" });

            if (!Doc.UserDoc().noviceMode && !this.rootDoc.annotationOn) {
                const existingOnClick = cm.findByDescription("OnClick...");
                const onClicks = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
                const funcs = [{ key: "onChildClick", name: "On Child Clicked" }, { key: "onChildDoubleClick", name: "On Child Double Clicked" }];
                funcs.map(func => onClicks.push({
                    description: `Edit ${func.name} script`, icon: "edit", event: (obj: any) => {
                        const alias = Doc.MakeAlias(this.rootDoc);
                        DocUtils.makeCustomViewClicked(alias, undefined, func.key);
                        this.props.addDocTab(alias, "add:right");
                    }
                }));
                DocListCast(Cast(Doc.UserDoc()["clickFuncs-child"], Doc, null).data).forEach(childClick =>
                    onClicks.push({
                        description: `Set child ${childClick.title}`,
                        icon: "edit",
                        event: () => Doc.GetProto(this.rootDoc)[StrCast(childClick.targetScriptKey)] = ObjectField.MakeCopy(ScriptCast(childClick.data)),
                    }));
                !Doc.IsSystem(this.rootDoc) && !existingOnClick && cm.addItem({ description: "OnClick...", noexpand: true, subitems: onClicks, icon: "mouse-pointer" });
            }

            if (!Doc.UserDoc().noviceMode) {
                const more = cm.findByDescription("More...");
                const moreItems = more && "subitems" in more ? more.subitems : [];
                moreItems.push({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.rootDoc) });
                !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
            }
        }
    }

    bodyPanelWidth = () => this.props.PanelWidth();

    childLayoutTemplate = () => this.props.childLayoutTemplate?.() || Cast(this.rootDoc.childLayoutTemplate, Doc, null);
    @computed get childLayoutString() { return StrCast(this.rootDoc.childLayoutString); }

    /**
    * Shows the filter icon if it's a user-created collection which isn't a dashboard and has some docFilters applied on it or on the current dashboard.
    */
    @computed get showFilterIcon() {
        return this.props.Document.viewType !== CollectionViewType.Docking && !Doc.IsSystem(this.props.Document) && ((StrListCast(this.props.Document._docFilters).length || StrListCast(this.props.Document._docRangeFilters).length || StrListCast(CurrentUserUtils.ActiveDashboard._docFilters).length || StrListCast(CurrentUserUtils.ActiveDashboard._docRangeFilters).length));
    }

    render() {
        TraceMobx();
        const props: SubCollectionViewProps = {
            ...this.props,
            addDocument: this.addDocument,
            moveDocument: this.moveDocument,
            removeDocument: this.removeDocument,
            isContentActive: this.isContentActive,
            PanelWidth: this.bodyPanelWidth,
            PanelHeight: this.props.PanelHeight,
            ScreenToLocalTransform: this.screenToLocalTransform,
            childLayoutTemplate: this.childLayoutTemplate,
            childLayoutString: this.childLayoutString,
            CollectionView: this,
        };
        return (<div className={"collectionView"} onContextMenu={this.onContextMenu}
            style={{ pointerEvents: this.props.layerProvider?.(this.rootDoc) === false ? "none" : undefined }}>
            {this.showIsTagged()}
            {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
            {this.showFilterIcon ?
                <FontAwesomeIcon icon={"filter"} size="lg"
                    style={{ position: 'absolute', top: '1%', right: '1%', cursor: "pointer", padding: 1, color: '#18c718bd', zIndex: 1 }}
                    onPointerDown={e => { runInAction(() => CurrentUserUtils.propertiesWidth = 250); e.stopPropagation(); }}
                />
                : (null)}
        </div>);
    }
}
