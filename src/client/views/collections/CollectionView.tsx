import { library } from '@fortawesome/fontawesome-svg-core';
import { faEdit, faEye } from '@fortawesome/free-regular-svg-icons';
import { faColumns, faCopy, faEllipsisV, faFingerprint, faGlobeAmericas, faImage, faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import Lightbox from 'react-image-lightbox-with-rotate';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { DateField } from '../../../fields/DateField';
import { AclAddonly, AclReadonly, DataSym, Doc, DocListCast, Field, Opt, AclEdit, AclSym, AclPrivate } from '../../../fields/Doc';
import { Id } from '../../../fields/FieldSymbols';
import { List } from '../../../fields/List';
import { ObjectField } from '../../../fields/ObjectField';
import { RichTextField } from '../../../fields/RichTextField';
import { listSpec } from '../../../fields/Schema';
import { ComputedField, ScriptField } from '../../../fields/ScriptField';
import { BoolCast, Cast, NumCast, ScriptCast, StrCast } from '../../../fields/Types';
import { ImageField } from '../../../fields/URLField';
import { TraceMobx, GetEffectiveAcl, getPlaygroundMode, distributeAcls } from '../../../fields/util';
import { emptyFunction, emptyPath, returnEmptyFilter, returnFalse, returnOne, returnZero, setupMoveUpEvents, Utils } from '../../../Utils';
import { Docs, DocUtils } from '../../documents/Documents';
import { DocumentType } from '../../documents/DocumentTypes';
import { CurrentUserUtils } from '../../util/CurrentUserUtils';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { InteractionUtils } from '../../util/InteractionUtils';
import { UndoManager } from '../../util/UndoManager';
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { ScriptBox } from '../ScriptBox';
import { Touchable } from '../Touchable';
import { CollectionCarousel3DView } from './CollectionCarousel3DView';
import { CollectionCarouselView } from './CollectionCarouselView';
import { CollectionDockingView } from "./CollectionDockingView";
import { AddCustomFreeFormLayout } from './collectionFreeForm/CollectionFreeFormLayoutEngines';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionGridView } from './collectionGrid/CollectionGridView';
import { CollectionLinearView } from './CollectionLinearView';
import CollectionMapView from './CollectionMapView';
import { CollectionMulticolumnView } from './collectionMulticolumn/CollectionMulticolumnView';
import { CollectionMultirowView } from './collectionMulticolumn/CollectionMultirowView';
import { CollectionPileView } from './CollectionPileView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionStaffView } from './CollectionStaffView';
import { SubCollectionViewProps } from './CollectionSubView';
import { CollectionTimeView } from './CollectionTimeView';
import { CollectionTreeView } from "./CollectionTreeView";
import './CollectionView.scss';
import CollectionMenu from './CollectionMenu';
import { SharingPermissions } from '../../util/SharingManager';
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;
export const COLLECTION_BORDER_WIDTH = 2;
const path = require('path');

library.add(faTh, faTree, faSquare, faProjectDiagram, faSignature, faThList, faFingerprint, faColumns, faGlobeAmericas, faEllipsisV, faImage, faEye as any, faCopy);

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
    Staff = "staff",
    Map = "map",
    Grid = "grid",
    Pile = "pileup"
}
export interface CollectionViewCustomProps {
    filterAddDocument: (doc: Doc | Doc[]) => boolean;  // allows a document that renders a Collection view to filter or modify any documents added to the collection (see PresBox for an example)
    childLayoutTemplate?: () => Opt<Doc>;  // specify a layout Doc template to use for children of the collection
    childLayoutString?: string;  // specify a layout string to use for children of the collection
    childOpacity?: () => number;
}

export interface CollectionRenderProps {
    addDocument: (document: Doc | Doc[]) => boolean;
    removeDocument: (document: Doc | Doc[]) => boolean;
    moveDocument: (document: Doc | Doc[], targetCollection: Doc | undefined, addDocument: (document: Doc | Doc[]) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    PanelWidth: () => number;
    ChildLayoutTemplate?: () => Doc;
    ChildLayoutString?: string;
}

@observer
export class CollectionView extends Touchable<FieldViewProps & CollectionViewCustomProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    _isChildActive = false;   //TODO should this be observable?
    get _isLightboxOpen() { return BoolCast(this.props.Document.isLightboxOpen); }
    set _isLightboxOpen(value) { this.props.Document.isLightboxOpen = value; }
    @observable private _curLightboxImg = 0;
    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    private AclMap = new Map<symbol, string>([
        [AclPrivate, SharingPermissions.None],
        [AclReadonly, SharingPermissions.View],
        [AclAddonly, SharingPermissions.Add],
        [AclEdit, SharingPermissions.Edit]
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
        const targetDataDoc = this.props.Document[DataSym];
        const docList = DocListCast(targetDataDoc[this.props.fieldKey]);
        const added = docs.filter(d => !docList.includes(d));
        const effectiveAcl = GetEffectiveAcl(this.props.Document);

        if (added.length) {
            if (effectiveAcl === AclReadonly && !getPlaygroundMode()) {
                return false;
            }
            else {
                if (this.props.Document[AclSym]) {
                    // change so it only adds if more restrictive
                    added.forEach(d => {
                        // const dataDoc = d[DataSym];
                        for (const [key, value] of Object.entries(this.props.Document[AclSym])) {
                            distributeAcls(key, this.AclMap.get(value) as SharingPermissions, d, true);
                        }
                        // dataDoc[AclSym] = d[AclSym] = this.props.Document[AclSym];
                    });
                }

                if (effectiveAcl === AclAddonly) {
                    added.map(doc => Doc.AddDocToList(targetDataDoc, this.props.fieldKey, doc));
                }
                else {
                    added.map(doc => {
                        const context = Cast(doc.context, Doc, null);
                        if (context && (context.type === DocumentType.VID || context.type === DocumentType.WEB || context.type === DocumentType.PDF || context.type === DocumentType.IMG)) {
                            const pushpin = Docs.Create.FontIconDocument({
                                title: "pushpin",
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
                        doc.context = this.props.Document;
                    });
                    added.map(add => Doc.AddDocToList(Cast(Doc.UserDoc().myCatalog, Doc, null), "data", add));
                    targetDataDoc[this.props.fieldKey] = new List<Doc>([...docList, ...added]);
                    targetDataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now()));
                }
            }
        }
        return true;
    }

    @action.bound
    removeDocument = (doc: any): boolean => {
        if (GetEffectiveAcl(this.props.Document) === AclEdit || getPlaygroundMode()) {
            const docs = doc instanceof Doc ? [doc] : doc as Doc[];
            const targetDataDoc = this.props.Document[DataSym];
            const value = DocListCast(targetDataDoc[this.props.fieldKey]);
            const result = value.filter(v => !docs.includes(v));
            if (result.length !== value.length) {
                targetDataDoc[this.props.fieldKey] = new List<Doc>(result);
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
        if (!first?.stayInCollection && addDocument !== returnFalse) {
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
    private SubViewHelper = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        const props: SubCollectionViewProps = { ...this.props, ...renderProps, ScreenToLocalTransform: this.screenToLocalTransform, CollectionView: this, annotationsKey: "" };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView key="collview" {...props} />);
            case CollectionViewType.Docking: return (<CollectionDockingView key="collview" {...props} />);
            case CollectionViewType.Tree: return (<CollectionTreeView key="collview" {...props} />);
            case CollectionViewType.Staff: return (<CollectionStaffView key="collview" {...props} />);
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
            default: { this.props.Document._freeformLayoutEngine = undefined; return (<CollectionFreeFormView key="collview" {...props} />); }
        }
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        return this.SubViewHelper(type, renderProps);
    }


    setupViewTypes(category: string, func: (viewType: CollectionViewType) => Doc, addExtras: boolean) {
        const existingVm = ContextMenu.Instance.findByDescription(category);
        const subItems = existingVm && "subitems" in existingVm ? existingVm.subitems : [];

        subItems.push({ description: "Freeform", event: () => func(CollectionViewType.Freeform), icon: "signature" });
        if (addExtras && CollectionView._safeMode) {
            ContextMenu.Instance.addItem({ description: "Test Freeform", event: () => func(CollectionViewType.Invalid), icon: "project-diagram" });
        }
        subItems.push({ description: "Schema", event: () => func(CollectionViewType.Schema), icon: "th-list" });
        subItems.push({ description: "Tree", event: () => func(CollectionViewType.Tree), icon: "tree" });
        subItems.push({ description: "Stacking", event: () => func(CollectionViewType.Stacking), icon: "ellipsis-v" });
        subItems.push({ description: "Stacking (AutoHeight)", event: () => func(CollectionViewType.Stacking)._autoHeight = true, icon: "ellipsis-v" });
        subItems.push({ description: "Staff", event: () => func(CollectionViewType.Staff), icon: "music" });
        subItems.push({ description: "Multicolumn", event: () => func(CollectionViewType.Multicolumn), icon: "columns" });
        subItems.push({ description: "Multirow", event: () => func(CollectionViewType.Multirow), icon: "columns" });
        subItems.push({ description: "Masonry", event: () => func(CollectionViewType.Masonry), icon: "columns" });
        subItems.push({ description: "Carousel", event: () => func(CollectionViewType.Carousel), icon: "columns" });
        subItems.push({ description: "3D Carousel", event: () => func(CollectionViewType.Carousel3D), icon: "columns" });
        subItems.push({ description: "Pivot/Time", event: () => func(CollectionViewType.Time), icon: "columns" });
        subItems.push({ description: "Map", event: () => func(CollectionViewType.Map), icon: "globe-americas" });
        subItems.push({ description: "Grid", event: () => func(CollectionViewType.Grid), icon: "th-list" });
        if (addExtras && this.props.Document._viewType === CollectionViewType.Freeform) {
            subItems.push({ description: "Custom", icon: "fingerprint", event: AddCustomFreeFormLayout(this.props.Document, this.props.fieldKey) });
        }
        addExtras && subItems.push({ description: "lightbox", event: action(() => this._isLightboxOpen = true), icon: "eye" });
        !existingVm && ContextMenu.Instance.addItem({ description: category, noexpand: true, subitems: subItems, icon: "eye" });
    }

    onContextMenu = (e: React.MouseEvent): void => {
        const cm = ContextMenu.Instance;
        if (cm && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            this.setupViewTypes("Add a Perspective...", vtype => {
                const newRendition = Doc.MakeAlias(this.props.Document);
                newRendition._viewType = vtype;
                this.props.addDocTab(newRendition, "onRight");
                return newRendition;
            }, false);

            const options = cm.findByDescription("Options...");
            const optionItems = options && "subitems" in options ? options.subitems : [];
            optionItems.splice(0, 0, { description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });
            if (this.props.Document.childLayout instanceof Doc) {
                optionItems.push({ description: "View Child Layout", event: () => this.props.addDocTab(this.props.Document.childLayout as Doc, "onRight"), icon: "project-diagram" });
            }
            if (this.props.Document.childClickedOpenTemplateView instanceof Doc) {
                optionItems.push({ description: "View Child Detailed Layout", event: () => this.props.addDocTab(this.props.Document.childClickedOpenTemplateView as Doc, "onRight"), icon: "project-diagram" });
            }
            !Doc.UserDoc().noviceMode && optionItems.push({ description: `${this.props.Document.isInPlaceContainer ? "Unset" : "Set"} inPlace Container`, event: () => this.props.Document.isInPlaceContainer = !this.props.Document.isInPlaceContainer, icon: "project-diagram" });

            !options && cm.addItem({ description: "Options...", subitems: optionItems, icon: "hand-point-right" });

            const existingOnClick = cm.findByDescription("OnClick...");
            const onClicks = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
            const funcs = [
                { key: "onChildClick", name: "On Child Clicked" },
                { key: "onChildDoubleClick", name: "On Child Double Clicked" }];
            funcs.map(func => onClicks.push({
                description: `Edit ${func.name} script`, icon: "edit", event: (obj: any) => {
                    const alias = Doc.MakeAlias(this.props.Document);
                    DocUtils.makeCustomViewClicked(alias, undefined, func.key);
                    this.props.addDocTab(alias, "onRight");
                }
            }));
            DocListCast(Cast(Doc.UserDoc()["clickFuncs-child"], Doc, null).data).forEach(childClick =>
                onClicks.push({
                    description: `Set child ${childClick.title}`,
                    icon: "edit",
                    event: () => Doc.GetProto(this.props.Document)[StrCast(childClick.targetScriptKey)] = ObjectField.MakeCopy(ScriptCast(childClick.data)),
                }));
            !existingOnClick && cm.addItem({ description: "OnClick...", noexpand: true, subitems: onClicks, icon: "hand-point-right" });

            if (!Doc.UserDoc().noviceMode) {
                const more = cm.findByDescription("More...");
                const moreItems = more && "subitems" in more ? more.subitems : [];
                moreItems.push({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.props.Document) });
                !more && cm.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
            }
        }
    }

    lightbox = (images: string[]) => {
        if (!images.length) return (null);
        const mainPath = path.extname(images[this._curLightboxImg]);
        const nextPath = path.extname(images[(this._curLightboxImg + 1) % images.length]);
        const prevPath = path.extname(images[(this._curLightboxImg + images.length - 1) % images.length]);
        const main = images[this._curLightboxImg].replace(mainPath, "_o" + mainPath);
        const next = images[(this._curLightboxImg + 1) % images.length].replace(nextPath, "_o" + nextPath);
        const prev = images[(this._curLightboxImg + images.length - 1) % images.length].replace(prevPath, "_o" + prevPath);
        return !this._isLightboxOpen ? (null) : (<Lightbox key="lightbox"
            mainSrc={main}
            nextSrc={next}
            prevSrc={prev}
            onCloseRequest={action(() => this._isLightboxOpen = false)}
            onMovePrevRequest={action(() => this._curLightboxImg = (this._curLightboxImg + images.length - 1) % images.length)}
            onMoveNextRequest={action(() => this._curLightboxImg = (this._curLightboxImg + 1) % images.length)} />);
    }
    get _facetWidth() { return NumCast(this.props.Document._facetWidth); }
    set _facetWidth(value) { this.props.Document._facetWidth = value; }

    bodyPanelWidth = () => this.props.PanelWidth() - this.facetWidth();
    facetWidth = () => Math.max(0, Math.min(this.props.PanelWidth() - 25, this._facetWidth));

    @computed get dataDoc() {
        return (this.props.DataDoc && this.props.Document.isTemplateForField ? Doc.GetProto(this.props.DataDoc) :
            this.props.Document.resolvedDataDoc ? this.props.Document : Doc.GetProto(this.props.Document)); // if the layout document has a resolvedDataDoc, then we don't want to get its parent which would be the unexpanded template
    }
    // The data field for rendering this collection will be on the this.props.Document unless we're rendering a template in which case we try to use props.DataDoc.
    // When a document has a DataDoc but it's not a template, then it contains its own rendering data, but needs to pass the DataDoc through
    // to its children which may be templates.
    // If 'annotationField' is specified, then all children exist on that field of the extension document, otherwise, they exist directly on the data document under 'fieldKey'
    @computed get dataField() {
        return this.dataDoc[this.props.fieldKey];
    }

    get childLayoutPairs(): { layout: Doc; data: Doc; }[] {
        const { Document, DataDoc } = this.props;
        const validPairs = this.childDocs.map(doc => Doc.GetLayoutDataDocPair(Document, DataDoc, doc)).filter(pair => pair.layout);
        return validPairs.map(({ data, layout }) => ({ data: data as Doc, layout: layout! })); // this mapping is a bit of a hack to coerce types
    }
    get childDocList() {
        return Cast(this.dataField, listSpec(Doc));
    }
    get childDocs() {
        const dfield = this.dataField;
        const rawdocs = (dfield instanceof Doc) ? [dfield] : Cast(dfield, listSpec(Doc), Cast(this.props.Document.rootDocument, Doc, null) ? [Cast(this.props.Document.rootDocument, Doc, null)] : []);
        const docs = rawdocs.filter(d => d && !(d instanceof Promise)).map(d => d as Doc);
        const viewSpecScript = ScriptCast(this.props.Document.viewSpecScript);
        return viewSpecScript ? docs.filter(d => viewSpecScript.script.run({ doc: d }, console.log).result) : docs;
    }
    @computed get _allFacets() {
        TraceMobx();
        const facets = new Set<string>(["type", "text", "data", "author", "ACL"]);
        this.childDocs.filter(child => child).forEach(child => child && Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        Doc.AreProtosEqual(this.dataDoc, this.props.Document) && this.childDocs.filter(child => child).forEach(child => Object.keys(child).forEach(key => facets.add(key)));
        return Array.from(facets).filter(f => !f.startsWith("_") && !["proto", "zIndex", "isPrototype", "context", "text-noTemplate"].includes(f)).sort();
    }

    /**
     * Responds to clicking the check box in the flyout menu
     */
    facetClick = (facetHeader: string) => {
        const facetCollection = this.props.Document;
        const found = DocListCast(facetCollection[this.props.fieldKey + "-filter"]).findIndex(doc => doc.title === facetHeader);
        if (found !== -1) {
            (facetCollection[this.props.fieldKey + "-filter"] as List<Doc>).splice(found, 1);
            const docFilter = Cast(this.props.Document._docFilters, listSpec("string"));
            if (docFilter) {
                let index: number;
                while ((index = docFilter.findIndex(item => item === facetHeader)) !== -1) {
                    docFilter.splice(index, 3);
                }
            }
            const docRangeFilters = Cast(this.props.Document._docRangeFilters, listSpec("string"));
            if (docRangeFilters) {
                let index: number;
                while ((index = docRangeFilters.findIndex(item => item === facetHeader)) !== -1) {
                    docRangeFilters.splice(index, 3);
                }
            }
        } else {
            const allCollectionDocs = DocListCast(this.dataDoc[this.props.fieldKey]);
            var rtfields = 0;
            const facetValues = Array.from(allCollectionDocs.reduce((set, child) => {
                const field = child[facetHeader] as Field;
                const fieldStr = Field.toString(field);
                if (field instanceof RichTextField || (typeof (field) === "string" && fieldStr.split(" ").length > 2)) rtfields++;
                return set.add(fieldStr);
            }, new Set<string>()));

            let nonNumbers = 0;
            let minVal = Number.MAX_VALUE, maxVal = -Number.MAX_VALUE;
            facetValues.map(val => {
                const num = Number(val);
                if (Number.isNaN(num)) {
                    nonNumbers++;
                } else {
                    minVal = Math.min(num, minVal);
                    maxVal = Math.max(num, maxVal);
                }
            });
            let newFacet: Opt<Doc>;
            if (facetHeader === "text" || rtfields / allCollectionDocs.length > 0.1) {
                newFacet = Docs.Create.TextDocument("", { _width: 100, _height: 25, treeViewExpandedView: "layout", title: facetHeader, treeViewOpen: true, forceActive: true, ignoreClick: true });
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet.target = this.props.Document;
                newFacet._textBoxPadding = 4;
                const scriptText = `setDocFilter(this.target, "${facetHeader}", text, "match")`;
                newFacet.onTextChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, text: "string" });
            } else if (nonNumbers / facetValues.length < .1) {
                newFacet = Docs.Create.SliderDocument({ title: facetHeader, treeViewExpandedView: "layout", treeViewOpen: true });
                const newFacetField = Doc.LayoutFieldKey(newFacet);
                const ranged = Doc.readDocRangeFilter(this.props.Document, facetHeader);
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                const extendedMinVal = minVal - Math.min(1, Math.abs(maxVal - minVal) * .05);
                const extendedMaxVal = maxVal + Math.min(1, Math.abs(maxVal - minVal) * .05);
                newFacet[newFacetField + "-min"] = ranged === undefined ? extendedMinVal : ranged[0];
                newFacet[newFacetField + "-max"] = ranged === undefined ? extendedMaxVal : ranged[1];
                Doc.GetProto(newFacet)[newFacetField + "-minThumb"] = extendedMinVal;
                Doc.GetProto(newFacet)[newFacetField + "-maxThumb"] = extendedMaxVal;
                newFacet.target = this.props.Document;
                const scriptText = `setDocFilterRange(this.target, "${facetHeader}", range)`;
                newFacet.onThumbChanged = ScriptField.MakeScript(scriptText, { this: Doc.name, range: "number" });
                Doc.AddDocToList(facetCollection, this.props.fieldKey + "-filter", newFacet);
            } else {
                newFacet = new Doc();
                newFacet.title = facetHeader;
                newFacet.treeViewOpen = true;
                newFacet.type = DocumentType.COL;
                const capturedVariables = { layoutDoc: this.props.Document, dataDoc: this.dataDoc };
                newFacet.data = ComputedField.MakeFunction(`readFacetData(layoutDoc, dataDoc, "${this.props.fieldKey}", "${facetHeader}")`, {}, capturedVariables);
            }
            newFacet && Doc.AddDocToList(facetCollection, this.props.fieldKey + "-filter", newFacet);
        }
    }

    onPointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, action((e: PointerEvent, down: number[], delta: number[]) => {
            this._facetWidth = this.props.PanelWidth() - Math.max(this.props.ScreenToLocalTransform().transformPoint(e.clientX, 0)[0], 0);
            return false;
        }), returnFalse, action(() => this._facetWidth = this.facetWidth() < 15 ? Math.min(this.props.PanelWidth() - 25, 200) : 0), false);
    }
    filterBackground = () => "rgba(105, 105, 105, 0.432)";
    get ignoreFields() { return ["_docFilters", "_docRangeFilters"]; } // this makes the tree view collection ignore these filters (otherwise, the filters would filter themselves)
    @computed get scriptField() {
        const scriptText = "setDocFilter(containingTreeView, heading, this.title, checked)";
        const script = ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
        return script ? () => script : undefined;
    }
    @computed get filterView() {
        TraceMobx();
        const facetCollection = this.props.Document;
        const flyout = (
            <div className="collectionTimeView-flyout" style={{ width: `${this.facetWidth()}`, height: this.props.PanelHeight() - 30 }} onWheel={e => e.stopPropagation()}>
                {this._allFacets.map(facet => <label className="collectionTimeView-flyout-item" key={`${facet}`} onClick={e => this.facetClick(facet)}>
                    <input type="checkbox" onChange={e => { }} checked={DocListCast(this.props.Document[this.props.fieldKey + "-filter"]).some(d => d.title === facet)} />
                    <span className="checkmark" />
                    {facet}
                </label>)}
            </div>
        );
        return !this._facetWidth || this.props.dontRegisterView ? (null) :
            <div className="collectionTimeView-treeView" style={{ width: `${this.facetWidth()}px`, overflow: this.facetWidth() < 15 ? "hidden" : undefined }}>
                <div className="collectionTimeView-addFacet" style={{ width: `${this.facetWidth()}px` }} onPointerDown={e => e.stopPropagation()}>
                    <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                        <div className="collectionTimeView-button">
                            <FontAwesomeIcon icon={faEdit} size={"lg"} />
                            <span className="collectionTimeView-span">Facet Filters</span>
                        </div>
                    </Flyout>
                </div>
                <div className="collectionTimeView-tree" key="tree">
                    <CollectionTreeView
                        Document={facetCollection}
                        DataDoc={facetCollection}
                        fieldKey={`${this.props.fieldKey}-filter`}
                        CollectionView={this}
                        docFilters={returnEmptyFilter}
                        ContainingCollectionDoc={this.props.ContainingCollectionDoc}
                        ContainingCollectionView={this.props.ContainingCollectionView}
                        PanelWidth={this.facetWidth}
                        PanelHeight={this.props.PanelHeight}
                        NativeHeight={returnZero}
                        NativeWidth={returnZero}
                        LibraryPath={emptyPath}
                        rootSelected={this.props.rootSelected}
                        renderDepth={1}
                        dropAction={this.props.dropAction}
                        ScreenToLocalTransform={this.props.ScreenToLocalTransform}
                        addDocTab={returnFalse}
                        pinToPres={returnFalse}
                        isSelected={returnFalse}
                        select={returnFalse}
                        bringToFront={emptyFunction}
                        active={this.props.active}
                        whenActiveChanged={returnFalse}
                        treeViewHideTitle={true}
                        ContentScaling={returnOne}
                        focus={returnFalse}
                        treeViewHideHeaderFields={true}
                        onCheckedClick={this.scriptField}
                        ignoreFields={this.ignoreFields}
                        annotationsKey={""}
                        dontRegisterView={true}
                        backgroundColor={this.filterBackground}
                        moveDocument={returnFalse}
                        removeDocument={returnFalse}
                        addDocument={returnFalse} />
                </div>
            </div>;
    }
    childLayoutTemplate = () => this.props.childLayoutTemplate?.() || Cast(this.props.Document.childLayoutTemplate, Doc, null);
    childLayoutString = this.props.childLayoutString || StrCast(this.props.Document.childLayoutString);

    render() {
        TraceMobx();
        const props: CollectionRenderProps = {
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            whenActiveChanged: this.whenActiveChanged,
            PanelWidth: this.bodyPanelWidth,
            ChildLayoutTemplate: this.childLayoutTemplate,
            ChildLayoutString: this.childLayoutString,
        };
        setTimeout(action(() => this.props.isSelected(true) && (CollectionMenu.Instance.SelectedCollection = this)), 0);
        const boxShadow = Doc.UserDoc().renderStyle === "comic" || this.props.Document.isBackground || this.collectionViewType === CollectionViewType.Linear ? undefined :
            `${Cast(Doc.UserDoc().activeWorkspace, Doc, null)?.darkScheme ? "rgb(30, 32, 31) " : "#9c9396 "} ${StrCast(this.props.Document.boxShadow, "0.2vw 0.2vw 0.8vw")}`;
        return (<div className={"collectionView"} onContextMenu={this.onContextMenu}
            style={{ pointerEvents: this.props.Document.isBackground ? "none" : undefined, boxShadow }}>
            {this.showIsTagged()}
            <div className="collectionView-facetCont" style={{ width: `calc(100% - ${this.facetWidth()}px)` }}>
                {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
            </div>
            {this.lightbox(DocListCast(this.props.Document[this.props.fieldKey]).filter(d => d.type === DocumentType.IMG).map(d =>
                Cast(d.data, ImageField) ?
                    (Cast(d.data, ImageField)!.url.href.indexOf(window.location.origin) === -1) ?
                        Utils.CorsProxy(Cast(d.data, ImageField)!.url.href) : Cast(d.data, ImageField)!.url.href
                    :
                    ""))}
            {(!this.props.isSelected() || this.props.Document.hideFilterView) && !this.props.Document.forceActive ? (null) :
                <div className="collectionView-filterDragger" title="library View Dragger" onPointerDown={this.onPointerDown}
                    style={{ right: this.facetWidth() - 1, top: this.props.Document._viewType === CollectionViewType.Docking ? "25%" : "55%" }} />
            }
            {this.facetWidth() < 10 ? (null) : this.filterView}
        </div>);
    }
}
