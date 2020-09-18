import { action, computed, observable } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import Lightbox from 'react-image-lightbox-with-rotate';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { DateField } from '../../../fields/DateField';
import { AclAddonly, AclAdmin, AclEdit, AclPrivate, AclReadonly, AclSym, DataSym, Doc, DocListCast, Field } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { ObjectField } from '../../../fields/ObjectField';
import { BoolCast, Cast, ScriptCast, StrCast } from '../../../fields/Types';
import { ImageField } from '../../../fields/URLField';
import { distributeAcls, GetEffectiveAcl, SharingPermissions, TraceMobx } from '../../../fields/util';
import { returnFalse, Utils } from '../../../Utils';
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
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
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
    Pile = "pileup"
}
export interface CollectionViewCustomProps {
    filterAddDocument?: (doc: Doc | Doc[]) => boolean;  // allows a document that renders a Collection view to filter or modify any documents added to the collection (see PresBox for an example)
    childOpacity?: () => number;
    hideFilter?: true;
    childIgnoreNativeSize?: boolean;
}

export interface CollectionRenderProps {
    addDocument: (document: Doc | Doc[]) => boolean;
    removeDocument: (document: Doc | Doc[]) => boolean;
    moveDocument: (document: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    PanelWidth: () => number;
    PanelHeight: () => number;
    ChildLayoutTemplate?: () => Doc;// specify a layout Doc template to use for children of the collection
    ChildLayoutString?: string;// specify a layout string to use for children of the collection
}

@observer
export class CollectionView extends Touchable<FieldViewProps & CollectionViewCustomProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    _isChildActive = false;   //TODO should this be observable?
    get _isLightboxOpen() { return BoolCast(this.props.Document._isLightboxOpen); }
    set _isLightboxOpen(value) { this.props.Document._isLightboxOpen = value; }
    @observable private _curLightboxImg = 0;
    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    protected _multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    private AclMap = new Map<symbol, string>([
        [AclPrivate, SharingPermissions.None],
        [AclReadonly, SharingPermissions.View],
        [AclAddonly, SharingPermissions.Add],
        [AclEdit, SharingPermissions.Edit],
        [AclAdmin, SharingPermissions.Admin]
    ]);

    get collectionViewType(): CollectionViewType | undefined {
        const viewField = StrCast(this.props.Document._viewType);
        if (CollectionView._safeMode) {
            if (viewField === CollectionViewType.Freeform || viewField === CollectionViewType.Schema) {
                return CollectionViewType.Tree;
            }
            if (viewField === CollectionViewType.Invalid) {
                return CollectionViewType.Freeform;
            }
        }
        return viewField as any as CollectionViewType;
    }

    active = (outsideReaction?: boolean) => (this.props.isSelected(outsideReaction) || this.props.rootSelected(outsideReaction) || this.props.Document.forceActive || this._isChildActive || this.props.renderDepth === 0) ? true : false;

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
                if (this.props.Document[AclSym]) {
                    added.forEach(d => {
                        for (const [key, value] of Object.entries(this.props.Document[AclSym])) {
                            if (d.author === key.substring(4).replace("_", ".") && !d.aliasOf) distributeAcls(key, SharingPermissions.Admin, d, true);
                            else distributeAcls(key, this.AclMap.get(value) as SharingPermissions, d, true);
                        }
                    });
                }

                if (effectiveAcl === AclAddonly) {
                    added.map(doc => {
                        Doc.AddDocToList(targetDataDoc, this.props.fieldKey, doc);
                        doc.context = this.props.Document;
                    });
                }
                else {
                    added.map(doc => {
                        const context = Cast(doc.context, Doc, null);
                        if (context && (context.type === DocumentType.VID || context.type === DocumentType.WEB || context.type === DocumentType.PDF || context.type === DocumentType.IMG)) {
                            const pushpin = Docs.Create.FontIconDocument({
                                title: "pushpin", label: "",
                                icon: "map-pin", x: Cast(doc.x, "number", null), y: Cast(doc.y, "number", null), _backgroundColor: "#0000003d", color: "#ACCEF7",
                                _width: 15, _height: 15, _xPadding: 0, isLinkButton: true, displayTimecode: Cast(doc.displayTimecode, "number", null)
                            });
                            pushpin.isPushpin = true;
                            Doc.GetProto(pushpin).annotationOn = doc.annotationOn;
                            Doc.SetInPlace(doc, "annotationOn", undefined, true);
                            Doc.AddDocToList(context, Doc.LayoutFieldKey(context) + "-annotations", pushpin);
                            const pushpinLink = DocUtils.MakeLink({ doc: pushpin }, { doc: doc }, "pushpin", "");
                            doc.displayTimecode = undefined;
                        }
                        doc._stayInCollection = undefined;
                        doc.context = this.props.Document;
                    });
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
        if (effectiveAcl === AclEdit || effectiveAcl === AclAdmin) {
            const docs = doc instanceof Doc ? [doc] : doc as Doc[];
            const targetDataDoc = this.props.Document[DataSym];
            const value = DocListCast(targetDataDoc[this.props.fieldKey]);
            const toRemove = value.filter(v => docs.includes(v));
            if (toRemove.length !== 0) {
                const recent = Cast(Doc.UserDoc().myRecentlyClosedDocs, Doc) as Doc;
                toRemove.forEach(doc => {
                    Doc.RemoveDocFromList(targetDataDoc, this.props.fieldKey, doc);
                    recent && Doc.AddDocToList(recent, "data", doc, undefined, true, true);
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
            if (UndoManager.RunInTempBatch(() => this.removeDocument(doc))) {
                const added = addDocument(doc);
                if (!added) UndoManager.UndoTempBatch();
                else UndoManager.ClearTempBatch();

                return added;
            }
            UndoManager.ClearTempBatch();
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
    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        TraceMobx();
        const props: SubCollectionViewProps = { ...this.props, ...renderProps, ScreenToLocalTransform: this.screenToLocalTransform, CollectionView: this, annotationsKey: "" };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView key="collview" {...props} />);
            case CollectionViewType.Docking: return (<CollectionDockingView key="collview" {...props} />);
            case CollectionViewType.Tree: return (<CollectionTreeView key="collview" {...props} />);
            //case CollectionViewType.Staff: return (<CollectionStaffView key="collview" {...props} />);
            case CollectionViewType.Multicolumn: return (<CollectionMulticolumnView key="collview" {...props} />);
            case CollectionViewType.Multirow: return (<CollectionMultirowView key="rpwview" {...props} />);
            case CollectionViewType.Linear: { return (<CollectionLinearView key="collview" {...props} />); }
            case CollectionViewType.Pile: { return (<CollectionPileView key="collview" {...props} />); }
            case CollectionViewType.Carousel: { return (<CollectionCarouselView key="collview" {...props} />); }
            case CollectionViewType.Carousel3D: { return (<CollectionCarousel3DView key="collview" {...props} />); }
            case CollectionViewType.Stacking: { this.props.Document._columnsStack = true; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Masonry: { this.props.Document._columnsStack = false; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Time: { return (<CollectionTimeView key="collview" {...props} />); }
            case CollectionViewType.Map: return (<CollectionMapView key="collview" {...props} />);
            case CollectionViewType.Grid: return (<CollectionGridView key="gridview" {...props} />);
            case CollectionViewType.Freeform:
            default: { this.props.Document._freeformLayoutEngine = undefined; return (<CollectionFreeFormView key="collview" {...props} ChildLayoutString={props.ChildLayoutString} />); }
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
        subItems.push({ description: "lightbox", event: action(() => this._isLightboxOpen = true), icon: "eye" });

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

    lightbox = (images: { image: string, title: string, caption: string }[]) => {
        if (!images.length) return (null);
        const mainPath = path.extname(images[this._curLightboxImg].image);
        const nextPath = path.extname(images[(this._curLightboxImg + 1) % images.length].image);
        const prevPath = path.extname(images[(this._curLightboxImg + images.length - 1) % images.length].image);
        const main = images[this._curLightboxImg].image.replace(mainPath, "_o" + mainPath);
        const title = images[this._curLightboxImg].title;
        const caption = images[this._curLightboxImg].caption;
        const next = images[(this._curLightboxImg + 1) % images.length].image.replace(nextPath, "_o" + nextPath);
        const prev = images[(this._curLightboxImg + images.length - 1) % images.length].image.replace(prevPath, "_o" + prevPath);
        return !this._isLightboxOpen ? (null) : (<Lightbox key="lightbox"
            mainSrc={main}
            nextSrc={next}
            prevSrc={prev}
            imageTitle={title}
            imageCaption={caption}
            onCloseRequest={action(() => this._isLightboxOpen = false)}
            onMovePrevRequest={action(() => this._curLightboxImg = (this._curLightboxImg + images.length - 1) % images.length)}
            onMoveNextRequest={action(() => this._curLightboxImg = (this._curLightboxImg + 1) % images.length)} />);
    }

    bodyPanelWidth = () => this.props.PanelWidth();

    childLayoutTemplate = () => this.props.childLayoutTemplate?.() || Cast(this.props.Document.childLayoutTemplate, Doc, null);
    @computed get childLayoutString() { return StrCast(this.props.Document.childLayoutString); }

    render() {
        TraceMobx();
        const props: CollectionRenderProps = {
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            whenActiveChanged: this.whenActiveChanged,
            PanelWidth: this.bodyPanelWidth,
            PanelHeight: this.props.PanelHeight,
            ChildLayoutTemplate: this.childLayoutTemplate,
            ChildLayoutString: this.childLayoutString,
        };
        const boxShadow = Doc.UserDoc().renderStyle === "comic" || this.props.Document.treeViewOutlineMode || this.props.Document._isBackground || this.collectionViewType === CollectionViewType.Linear ? undefined :
            `${CurrentUserUtils.ActiveDashboard?.darkScheme ? "rgb(30, 32, 31) " : "#9c9396 "} ${StrCast(this.props.Document.boxShadow, "0.2vw 0.2vw 0.8vw")}`;
        return (<div className={"collectionView"} onContextMenu={this.onContextMenu}
            style={{ pointerEvents: this.props.Document._isBackground ? "none" : undefined, boxShadow }}>
            {this.showIsTagged()}
            {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
            {this.lightbox(DocListCast(this.props.Document[this.props.fieldKey]).filter(d => Cast(d.data, ImageField, null)).map(d =>
                ({
                    image: (Cast(d.data, ImageField)!.url.href.indexOf(window.location.origin) === -1) ?
                        Utils.CorsProxy(Cast(d.data, ImageField)!.url.href) : Cast(d.data, ImageField)!.url.href,
                    title: StrCast(d.title),
                    caption: Field.toString(d.caption as Field)
                })))}
        </div>);
    }
}
