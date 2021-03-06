import { action, computed, observable } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { DateField } from '../../../fields/DateField';
import { AclAddonly, AclAdmin, AclEdit, AclPrivate, AclReadonly, AclSym, DataSym, Doc, DocListCast } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { ObjectField } from '../../../fields/ObjectField';
import { ScriptField } from '../../../fields/ScriptField';
import { Cast, ScriptCast, StrCast } from '../../../fields/Types';
import { denormalizeEmail, distributeAcls, GetEffectiveAcl, SharingPermissions, TraceMobx } from '../../../fields/util';
import { returnFalse } from '../../../Utils';
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { InteractionUtils } from '../../util/InteractionUtils';
import { UndoManager } from '../../util/UndoManager';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { Touchable } from '../Touchable';
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
    parentActive: (outsideReaction: boolean) => boolean;
    filterAddDocument?: (doc: Doc | Doc[]) => boolean;  // allows a document that renders a Collection view to filter or modify any documents added to the collection (see PresBox for an example)
    setPreviewCursor?: (func: (x: number, y: number, drag: boolean) => void) => void;

    // property overrides for child documents
    children?: never | (() => JSX.Element[]) | React.ReactNode;
    childDocuments?: Doc[]; // used to override the documents shown by the sub collection to an explicit list (see LinkBox)
    childOpacity?: () => number;
    childLayoutTemplate?: () => (Doc | undefined);// specify a layout Doc template to use for children of the collection
    childLayoutString?: string;
    childFreezeDimensions?: boolean; // used by TimeView to coerce documents to treat their width height as their native width/height
    childIgnoreNativeSize?: boolean;
    childClickScript?: ScriptField;
    childDoubleClickScript?: ScriptField;
}
@observer
export class CollectionView extends Touchable<CollectionViewProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    _isChildActive = false;   //TODO should this be observable?
    @observable private _curLightboxImg = 0;
    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    get collectionViewType(): CollectionViewType | undefined {
        const viewField = StrCast(this.props.Document._viewType);
        if (CollectionView._safeMode) {
            switch (viewField) {
                case CollectionViewType.Freeform:
                case CollectionViewType.Schema: return CollectionViewType.Tree;
                case CollectionViewType.Invalid: return CollectionViewType.Freeform;
            }
        }
        return viewField as any as CollectionViewType;
    }

    active = (outsideReaction?: boolean) => (this.props.isSelected(outsideReaction) ||
        this.props.rootSelected(outsideReaction) ||
        (this.props.layerProvider?.(this.props.Document) !== false && (this.props.Document.forceActive || this.props.Document._isGroup)) ||
        this._isChildActive ||
        this.props.renderDepth === 0) ?
        true :
        false

    whenActiveChanged = (isActive: boolean) => this.props.whenActiveChanged(this._isChildActive = isActive);

    @action.bound
    addDocument = (doc: Doc | Doc[]): boolean => {
        if (this.props.filterAddDocument?.(doc) === false) {
            return false;
        }

        const docs = doc instanceof Doc ? [doc] : doc;

        if (docs.find(doc => Doc.AreProtosEqual(doc, this.props.Document))) return false;
        const targetDataDoc = this.props.Document[DataSym];
        const docList = DocListCast(targetDataDoc[this.props.fieldKey]);
        const added = docs.filter(d => !docList.includes(d));
        const effectiveAcl = GetEffectiveAcl(this.props.Document[DataSym]);

        if (added.length) {
            if (effectiveAcl === AclPrivate || effectiveAcl === AclReadonly) {
                return false;
            }
            else {
                if (this.props.Document[AclSym] && Object.keys(this.props.Document[AclSym])) {
                    added.forEach(d => {
                        for (const [key, value] of Object.entries(this.props.Document[AclSym])) {
                            if (d.author === denormalizeEmail(key.substring(4)) && !d.aliasOf) distributeAcls(key, SharingPermissions.Admin, d, true);
                            //else if (this.props.Document[key] === SharingPermissions.Admin) distributeAcls(key, SharingPermissions.Add, d, true);
                            //else distributeAcls(key, this.AclMap.get(value) as SharingPermissions, d, true);
                        }
                    });
                }

                if (effectiveAcl === AclAddonly) {
                    added.map(doc => {
                        this.props.layerProvider?.(doc, true);// assigns layer values to the newly added document... testing the utility of this
                        Doc.AddDocToList(targetDataDoc, this.props.fieldKey, doc);
                        doc.context = this.props.Document;
                    });
                }
                else {
                    added.filter(doc => [AclAdmin, AclEdit].includes(GetEffectiveAcl(doc))).map(doc => {  // only make a pushpin if we have acl's to edit the document
                        const context = Cast(doc.context, Doc, null);
                        const hasContextAnchor = DocListCast(doc.links).some(l => (l.anchor2 === doc && Cast(l.anchor1, Doc, null)?.annotationOn === context) || (l.anchor1 === doc && Cast(l.anchor2, Doc, null)?.annotationOn === context));
                        if (context && !hasContextAnchor && (context.type === DocumentType.VID || context.type === DocumentType.WEB || context.type === DocumentType.PDF || context.type === DocumentType.IMG)) {
                            const pushpin = Docs.Create.FontIconDocument({
                                title: "pushpin", label: "", annotationOn: Cast(doc.annotationOn, Doc, null), isPushpin: true,
                                icon: "map-pin", x: Cast(doc.x, "number", null), y: Cast(doc.y, "number", null), backgroundColor: "#0000003d", color: "#ACCEF7",
                                _width: 15, _height: 15, _xPadding: 0, isLinkButton: true, _timecodeToShow: Cast(doc._timecodeToShow, "number", null)
                            });
                            Doc.SetInPlace(doc, "annotationOn", undefined, true);
                            Doc.AddDocToList(context, Doc.LayoutFieldKey(context) + "-annotations", pushpin);
                            const pushpinLink = DocUtils.MakeLink({ doc: pushpin }, { doc: doc }, "pushpin", "");
                            doc._timecodeToShow = undefined;
                        }
                        doc._stayInCollection = undefined;
                        doc.context = this.props.Document;
                    });
                    added.map(doc => this.props.layerProvider?.(doc, true));// assigns layer values to the newly added document... testing the utility of this
                    (targetDataDoc[this.props.fieldKey] as List<Doc>).push(...added);
                    targetDataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now()));
                }
            }
        }
        return true;
    }

    @action.bound
    removeDocument = (doc: any): boolean => {
        const effectiveAcl = GetEffectiveAcl(this.props.Document[DataSym]);
        const indocs = doc instanceof Doc ? [doc] : doc as Doc[];
        const docs = indocs.filter(doc => effectiveAcl === AclEdit || effectiveAcl === AclAdmin || GetEffectiveAcl(doc) === AclAdmin);
        if (docs.length) {
            const targetDataDoc = this.props.Document[DataSym];
            const value = DocListCast(targetDataDoc[this.props.fieldKey]);
            const toRemove = value.filter(v => docs.includes(v));
            if (toRemove.length !== 0) {
                const recent = Cast(Doc.UserDoc().myRecentlyClosedDocs, Doc) as Doc;
                toRemove.forEach(doc => {
                    const ind = (targetDataDoc[this.props.fieldKey] as List<Doc>).indexOf(doc);
                    if (ind !== -1) {
                        Doc.RemoveDocFromList(targetDataDoc, this.props.fieldKey, doc);
                        doc.context = undefined;
                        recent && Doc.AddDocToList(recent, "data", doc, undefined, true, true);
                    }
                });
                return true;
            }
        }
        return false;
    }

    // this is called with the document that was dragged and the collection to move it into.
    // if the target collection is the same as this collection, then the move will be allowed.
    // otherwise, the document being moved must be able to be removed from its container before
    // moving it into the target.
    @action.bound
    moveDocument = (doc: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (doc: Doc | Doc[]) => boolean): boolean => {
        if (Doc.AreProtosEqual(this.props.Document, targetCollection)) {
            return true;
        }
        const first = doc instanceof Doc ? doc : doc[0];
        if (!first?._stayInCollection && addDocument !== returnFalse) {
            return UndoManager.RunInTempBatch(() => this.removeDocument(doc) && addDocument(doc));
        }
        return false;
    }

    showIsTagged = () => {
        return (null);
        // this section would display an icon in the bototm right of a collection to indicate that all
        // photos had been processed through Google's content analysis API and Google's tags had been
        // assigned to the documents googlePhotosTags field.
        // const children = DocListCast(this.props.Document[this.props.fieldKey]);
        // const imageProtos = children.filter(doc => Cast(doc.data, ImageField)).map(Doc.GetProto);
        // const allTagged = imageProtos.length > 0 && imageProtos.every(image => image.googlePhotosTags);
        // return !allTagged ? (null) : <img id={"google-tags"} src={"/assets/google_tags.png"} />;
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
        !Doc.UserDoc().noviceMode && subItems.push({ description: "Stacking", event: () => func(CollectionViewType.Stacking), icon: "ellipsis-v" });
        subItems.push({ description: "Stacking", event: () => func(CollectionViewType.Stacking)._autoHeight = true, icon: "ellipsis-v" });
        subItems.push({ description: "Multicolumn", event: () => func(CollectionViewType.Multicolumn), icon: "columns" });
        subItems.push({ description: "Multirow", event: () => func(CollectionViewType.Multirow), icon: "columns" });
        subItems.push({ description: "Masonry", event: () => func(CollectionViewType.Masonry), icon: "columns" });
        subItems.push({ description: "Carousel", event: () => func(CollectionViewType.Carousel), icon: "columns" });
        subItems.push({ description: "3D Carousel", event: () => func(CollectionViewType.Carousel3D), icon: "columns" });
        !Doc.UserDoc().noviceMode && subItems.push({ description: "Pivot/Time", event: () => func(CollectionViewType.Time), icon: "columns" });
        !Doc.UserDoc().noviceMode && subItems.push({ description: "Map", event: () => func(CollectionViewType.Map), icon: "globe-americas" });
        subItems.push({ description: "Grid", event: () => func(CollectionViewType.Grid), icon: "th-list" });

        if (!Doc.IsSystem(this.props.Document) && !this.props.Document.annotationOn) {
            const existingVm = ContextMenu.Instance.findByDescription(category);
            const catItems = existingVm && "subitems" in existingVm ? existingVm.subitems : [];
            catItems.push({ description: "Add a Perspective...", addDivider: true, noexpand: true, subitems: subItems, icon: "eye" });
            !existingVm && ContextMenu.Instance.addItem({ description: category, subitems: catItems, icon: "eye" });
        }
    }

    onContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        if (cm && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            this.setupViewTypes("UI Controls...", vtype => {
                const newRendition = Doc.MakeAlias(this.props.Document);
                newRendition._viewType = vtype;
                this.props.addDocTab(newRendition, "add:right");
                return newRendition;
            }, false);

            const options = cm.findByDescription("Options...");
            const optionItems = options && "subitems" in options ? options.subitems : [];
            !Doc.UserDoc().noviceMode ? optionItems.splice(0, 0, { description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" }) : null;
            if (this.props.Document.childLayout instanceof Doc) {
                optionItems.push({ description: "View Child Layout", event: () => this.props.addDocTab(this.props.Document.childLayout as Doc, "add:right"), icon: "project-diagram" });
            }
            if (this.props.Document.childClickedOpenTemplateView instanceof Doc) {
                optionItems.push({ description: "View Child Detailed Layout", event: () => this.props.addDocTab(this.props.Document.childClickedOpenTemplateView as Doc, "add:right"), icon: "project-diagram" });
            }
            !Doc.UserDoc().noviceMode && optionItems.push({ description: `${this.props.Document.isInPlaceContainer ? "Unset" : "Set"} inPlace Container`, event: () => this.props.Document.isInPlaceContainer = !this.props.Document.isInPlaceContainer, icon: "project-diagram" });

            !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "hand-point-right" });

            if (!Doc.UserDoc().noviceMode && !this.props.Document.annotationOn) {
                const existingOnClick = cm.findByDescription("OnClick...");
                const onClicks = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
                const funcs = [{ key: "onChildClick", name: "On Child Clicked" }, { key: "onChildDoubleClick", name: "On Child Double Clicked" }];
                funcs.map(func => onClicks.push({
                    description: `Edit ${func.name} script`, icon: "edit", event: (obj: any) => {
                        const alias = Doc.MakeAlias(this.props.Document);
                        DocUtils.makeCustomViewClicked(alias, undefined, func.key);
                        this.props.addDocTab(alias, "add:right");
                    }
                }));
                DocListCast(Cast(Doc.UserDoc()["clickFuncs-child"], Doc, null).data).forEach(childClick =>
                    onClicks.push({
                        description: `Set child ${childClick.title}`,
                        icon: "edit",
                        event: () => Doc.GetProto(this.props.Document)[StrCast(childClick.targetScriptKey)] = ObjectField.MakeCopy(ScriptCast(childClick.data)),
                    }));
                !Doc.IsSystem(this.props.Document) && !existingOnClick && cm.addItem({ description: "OnClick...", noexpand: true, subitems: onClicks, icon: "mouse-pointer" });
            }

            if (!Doc.UserDoc().noviceMode) {
                const more = cm.findByDescription("More...");
                const moreItems = more && "subitems" in more ? more.subitems : [];
                moreItems.push({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.props.Document) });
                !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
            }
        }
    }

    bodyPanelWidth = () => this.props.PanelWidth();

    childLayoutTemplate = () => this.props.childLayoutTemplate?.() || Cast(this.props.Document.childLayoutTemplate, Doc, null);
    @computed get childLayoutString() { return StrCast(this.props.Document.childLayoutString); }

    render() {
        TraceMobx();
        const props: SubCollectionViewProps = {
            ...this.props,
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            whenActiveChanged: this.whenActiveChanged,
            parentActive: this.props.parentActive,
            PanelWidth: this.bodyPanelWidth,
            PanelHeight: this.props.PanelHeight,
            childLayoutTemplate: this.childLayoutTemplate,
            childLayoutString: this.childLayoutString,
            ScreenToLocalTransform: this.screenToLocalTransform,
            CollectionView: this,
        };
        return (<div className={"collectionView"} onContextMenu={this.onContextMenu}
            style={{ pointerEvents: this.props.layerProvider?.(this.props.Document) === false ? "none" : undefined }}>
            {this.showIsTagged()}
            {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
        </div>);
    }
}
