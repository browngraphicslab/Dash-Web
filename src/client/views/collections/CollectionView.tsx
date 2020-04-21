import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye, faEdit } from '@fortawesome/free-regular-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faColumns, faCopy, faEllipsisV, faFingerprint, faImage, faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree, faGlobeAmericas } from '@fortawesome/free-solid-svg-icons';
import { action, observable, computed } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import Lightbox from 'react-image-lightbox-with-rotate';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { DateField } from '../../../new_fields/DateField';
import { DataSym, Doc, DocListCast, Field, Opt } from '../../../new_fields/Doc';
import { List } from '../../../new_fields/List';
import { BoolCast, Cast, NumCast, StrCast, ScriptCast } from '../../../new_fields/Types';
import { ImageField } from '../../../new_fields/URLField';
import { TraceMobx } from '../../../new_fields/util';
import { Utils, setupMoveUpEvents, returnFalse, returnZero, emptyPath, emptyFunction, returnOne } from '../../../Utils';
import { DocumentType } from '../../documents/DocumentTypes';
import { DocumentManager } from '../../util/DocumentManager';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { SelectionManager } from '../../util/SelectionManager';
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { ScriptBox } from '../ScriptBox';
import { Touchable } from '../Touchable';
import { CollectionCarouselView } from './CollectionCarouselView';
import { CollectionDockingView } from "./CollectionDockingView";
import { AddCustomFreeFormLayout } from './collectionFreeForm/CollectionFreeFormLayoutEngines';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionLinearView } from './CollectionLinearView';
import { CollectionMulticolumnView } from './collectionMulticolumn/CollectionMulticolumnView';
import { CollectionMultirowView } from './collectionMulticolumn/CollectionMultirowView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionStaffView } from './CollectionStaffView';
import { SubCollectionViewProps } from './CollectionSubView';
import { CollectionTimeView } from './CollectionTimeView';
import { CollectionTreeView } from "./CollectionTreeView";
import './CollectionView.scss';
import { CollectionViewBaseChrome } from './CollectionViewChromes';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { Id } from '../../../new_fields/FieldSymbols';
import { listSpec } from '../../../new_fields/Schema';
import { Docs } from '../../documents/Documents';
import { ScriptField, ComputedField } from '../../../new_fields/ScriptField';
import { InteractionUtils } from '../../util/InteractionUtils';
import { ObjectField } from '../../../new_fields/ObjectField';
import CollectionMapView from './CollectionMapView';
import { Transform } from 'prosemirror-transform';
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
    Linear = "linear",
    Staff = "staff",
    Map = "map"
}

export interface CollectionRenderProps {
    addDocument: (document: Doc) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
    PanelWidth: () => number;
}

@observer
export class CollectionView extends Touchable<FieldViewProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    private _isChildActive = false;   //TODO should this be observable?
    get _isLightboxOpen() { return BoolCast(this.props.Document.isLightboxOpen); }
    set _isLightboxOpen(value) { this.props.Document.isLightboxOpen = value; }
    @observable private _curLightboxImg = 0;
    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    protected multiTouchDisposer?: InteractionUtils.MultiTouchEventDisposer;

    get collectionViewType(): CollectionViewType | undefined {
        const viewField = StrCast(this.props.Document._viewType);
        if (CollectionView._safeMode) {
            if (viewField === CollectionViewType.Freeform) {
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
    addDocument(doc: Doc): boolean {
        const targetDataDoc = this.props.Document[DataSym];
        const docList = DocListCast(targetDataDoc[this.props.fieldKey]);
        !docList.includes(doc) && (targetDataDoc[this.props.fieldKey] = new List<Doc>([...docList, doc]));  // DocAddToList may write to targetdataDoc's parent ... we don't want this. should really change GetProto to GetDataDoc and test for resolvedDataDoc there
        // Doc.AddDocToList(targetDataDoc, this.props.fieldKey, doc);
        doc.context = this.props.Document;
        targetDataDoc[this.props.fieldKey + "-lastModified"] = new DateField(new Date(Date.now()));
        Doc.GetProto(doc).lastOpened = new DateField;
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        const targetDataDoc = this.props.Document[DataSym];
        const docView = DocumentManager.Instance.getDocumentView(doc, this.props.ContainingCollectionView);
        docView && SelectionManager.DeselectDoc(docView);
        const value = DocListCast(targetDataDoc[this.props.fieldKey]);
        let index = value.reduce((p, v, i) => (v instanceof Doc && v === doc) ? i : p, -1);
        index = index !== -1 ? index : value.reduce((p, v, i) => (v instanceof Doc && Doc.AreProtosEqual(v, doc)) ? i : p, -1);

        doc.context = undefined;
        ContextMenu.Instance?.clearItems();
        if (index !== -1) {
            value.splice(index, 1);
            targetDataDoc[this.props.fieldKey] = new List<Doc>(value);
            return true;
        }
        return false;
    }

    // this is called with the document that was dragged and the collection to move it into.
    // if the target collection is the same as this collection, then the move will be allowed.
    // otherwise, the document being moved must be able to be removed from its container before
    // moving it into the target.  
    @action.bound
    moveDocument(doc: Doc, targetCollection: Doc | undefined, addDocument: (doc: Doc) => boolean): boolean {
        if (Doc.AreProtosEqual(this.props.Document, targetCollection)) {
            return true;
        }
        return this.removeDocument(doc) ? addDocument(doc) : false;
    }

    showIsTagged = () => {
        const children = DocListCast(this.props.Document[this.props.fieldKey]);
        const imageProtos = children.filter(doc => Cast(doc.data, ImageField)).map(Doc.GetProto);
        const allTagged = imageProtos.length > 0 && imageProtos.every(image => image.googlePhotosTags);
        return !allTagged ? (null) : <img id={"google-tags"} src={"/assets/google_tags.png"} />;
    }

    private SubViewHelper = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        const props: SubCollectionViewProps = { ...this.props, ...renderProps, CollectionView: this, annotationsKey: "" };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView key="collview" {...props} />);
            case CollectionViewType.Docking: return (<CollectionDockingView key="collview" {...props} />);
            case CollectionViewType.Tree: return (<CollectionTreeView key="collview" {...props} />);
            case CollectionViewType.Staff: return (<CollectionStaffView key="collview" {...props} />);
            case CollectionViewType.Multicolumn: return (<CollectionMulticolumnView key="collview" {...props} />);
            case CollectionViewType.Multirow: return (<CollectionMultirowView key="rpwview" {...props} />);
            case CollectionViewType.Linear: { return (<CollectionLinearView key="collview" {...props} />); }
            case CollectionViewType.Carousel: { return (<CollectionCarouselView key="collview" {...props} />); }
            case CollectionViewType.Stacking: { this.props.Document.singleColumn = true; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Masonry: { this.props.Document.singleColumn = false; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Time: { return (<CollectionTimeView key="collview" {...props} />); }
            case CollectionViewType.Map: return (<CollectionMapView key="collview" {...props} />);
            case CollectionViewType.Freeform:
            default: { this.props.Document._freeformLayoutEngine = undefined; return (<CollectionFreeFormView key="collview" {...props} />); }
        }
    }

    @action
    private collapse = (value: boolean) => {
        this.props.Document._chromeStatus = value ? "collapsed" : "enabled";
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
        const chrome = this.props.Document._chromeStatus === "disabled" || this.props.Document._chromeStatus === "replaced" || type === CollectionViewType.Docking ? (null) :
            <CollectionViewBaseChrome CollectionView={this} key="chrome" PanelWidth={this.bodyPanelWidth} type={type} collapse={this.collapse} />;
        return [chrome, this.SubViewHelper(type, renderProps)];
    }


    setupViewTypes(category: string, func: (viewType: CollectionViewType) => Doc, addExtras: boolean) {
        const existingVm = ContextMenu.Instance.findByDescription(category);
        const subItems = existingVm && "subitems" in existingVm ? existingVm.subitems : [];

        subItems.push({ description: "Freeform", event: () => func(CollectionViewType.Freeform), icon: "signature" });
        if (addExtras && CollectionView._safeMode) {
            ContextMenu.Instance.addItem({ description: "Test Freeform", event: () => func(CollectionViewType.Invalid), icon: "project-diagram" });
        }
        subItems.push({ description: "Schema", event: () => func(CollectionViewType.Schema), icon: "th-list" });
        subItems.push({ description: "Treeview", event: () => func(CollectionViewType.Tree), icon: "tree" });
        subItems.push({ description: "Stacking", event: () => func(CollectionViewType.Stacking), icon: "ellipsis-v" });
        subItems.push({ description: "Stacking (AutoHeight)", event: () => func(CollectionViewType.Stacking)._autoHeight = true, icon: "ellipsis-v" });
        subItems.push({ description: "Staff", event: () => func(CollectionViewType.Staff), icon: "music" });
        subItems.push({ description: "Multicolumn", event: () => func(CollectionViewType.Multicolumn), icon: "columns" });
        subItems.push({ description: "Multirow", event: () => func(CollectionViewType.Multirow), icon: "columns" });
        subItems.push({ description: "Masonry", event: () => func(CollectionViewType.Masonry), icon: "columns" });
        subItems.push({ description: "Carousel", event: () => func(CollectionViewType.Carousel), icon: "columns" });
        subItems.push({ description: "Pivot/Time", event: () => func(CollectionViewType.Time), icon: "columns" });
        subItems.push({ description: "Map", event: () => func(CollectionViewType.Map), icon: "globe-americas" });
        if (addExtras) switch (this.props.Document._viewType) {
            case CollectionViewType.Freeform: {
                subItems.push({ description: "Custom", icon: "fingerprint", event: AddCustomFreeFormLayout(this.props.Document, this.props.fieldKey) });
                break;
            }
        }
        addExtras && subItems.push({ description: "lightbox", event: action(() => this._isLightboxOpen = true), icon: "eye" });
        !existingVm && ContextMenu.Instance.addItem({ description: category, subitems: subItems, icon: "eye" });
    }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7

            this.setupViewTypes("View Modes ...", (vtype => { this.props.Document._viewType = vtype; return this.props.Document; }), true);
            this.setupViewTypes("Additional Rendition ...", vtype => {
                const newRendition = Doc.MakeAlias(this.props.Document);
                newRendition._viewType = vtype;
                this.props.addDocTab(newRendition, "onRight");
                return newRendition;
            }, false);

            const existing = ContextMenu.Instance.findByDescription("Layout...");
            const layoutItems = existing && "subitems" in existing ? existing.subitems : [];
            layoutItems.push({ description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });
            if (this.props.Document.childLayout instanceof Doc) {
                layoutItems.push({ description: "View Child Layout", event: () => this.props.addDocTab(this.props.Document.childLayout as Doc, "onRight"), icon: "project-diagram" });
            }
            if (this.props.Document.childDetailView instanceof Doc) {
                layoutItems.push({ description: "View Child Detailed Layout", event: () => this.props.addDocTab(this.props.Document.childDetailView as Doc, "onRight"), icon: "project-diagram" });
            }
            layoutItems.push({ description: `${this.props.Document.isInPlaceContainer ? "Unset" : "Set"} inPlace Container`, event: () => this.props.Document.isInPlaceContainer = !this.props.Document.isInPlaceContainer, icon: "project-diagram" });

            !existing && ContextMenu.Instance.addItem({ description: "Layout...", subitems: layoutItems, icon: "hand-point-right" });

            const open = ContextMenu.Instance.findByDescription("Open...");
            const openItems = open && "subitems" in open ? open.subitems : [];
            !open && ContextMenu.Instance.addItem({ description: "Open...", subitems: openItems, icon: "hand-point-right" });

            const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
            const onClicks = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
            const funcs = [{ key: "onChildClick", name: "On Child Clicked", script: undefined as any as ScriptField }];
            DocListCast(Cast(Doc.UserDoc().childClickFuncs, Doc, null).data).forEach(childClick =>
                funcs.push({ key: "onChildClick", name: StrCast(childClick.title), script: ScriptCast(childClick.script) }));
            funcs.map(func => onClicks.push({
                description: `Edit ${func.name} script`, icon: "edit", event: (obj: any) => {
                    func.script && (this.props.Document[func.key] = ObjectField.MakeCopy(func.script));
                    ScriptBox.EditButtonScript(func.name + "...", this.props.Document, func.key, obj.x, obj.y, { thisContainer: Doc.name });
                }
            }));
            !existingOnClick && ContextMenu.Instance.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });

            const more = ContextMenu.Instance.findByDescription("More...");
            const moreItems = more && "subitems" in more ? more.subitems : [];
            moreItems.push({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.props.Document) });
            !more && ContextMenu.Instance.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });
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
        const facets = new Set<string>();
        this.childDocs.filter(child => child).forEach(child => Object.keys(Doc.GetProto(child)).forEach(key => facets.add(key)));
        Doc.AreProtosEqual(this.dataDoc, this.props.Document) && this.childDocs.filter(child => child).forEach(child => Object.keys(child).forEach(key => facets.add(key)));
        return Array.from(facets);
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
            const facetValues = Array.from(allCollectionDocs.reduce((set, child) =>
                set.add(Field.toString(child[facetHeader] as Field)), new Set<string>()));

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
            if (nonNumbers / allCollectionDocs.length < .1) {
                newFacet = Docs.Create.SliderDocument({ title: facetHeader });
                const newFacetField = Doc.LayoutFieldKey(newFacet);
                const ranged = Doc.readDocRangeFilter(this.props.Document, facetHeader);
                Doc.GetProto(newFacet).type = DocumentType.COL; // forces item to show an open/close button instead ofa checkbox
                newFacet.treeViewExpandedView = "layout";
                newFacet.treeViewOpen = true;
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
        }), returnFalse, action(() => this._facetWidth = this.facetWidth() < 15 ? Math.min(this.props.PanelWidth() - 25, 200) : 0));
    }
    filterBackground = () => "rgba(105, 105, 105, 0.432)";
    get ignoreFields() { return ["_docFilters", "_docRangeFilters"]; } // this makes the tree view collection ignore these filters (otherwise, the filters would filter themselves)
    @computed get scriptField() {
        const scriptText = "setDocFilter(containingTreeView, heading, this.title, checked)";
        return ScriptField.MakeScript(scriptText, { this: Doc.name, heading: "string", checked: "string", containingTreeView: Doc.name });
    }
    @computed get filterView() {
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
                        onCheckedClick={this.scriptField!}
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

    render() {
        TraceMobx();
        const props: CollectionRenderProps = {
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            whenActiveChanged: this.whenActiveChanged,
            PanelWidth: this.bodyPanelWidth
        };
        return (<div className={"collectionView"}
            style={{
                pointerEvents: this.props.Document.isBackground ? "none" : undefined,
                boxShadow: this.props.Document.isBackground || this.collectionViewType === CollectionViewType.Linear ? undefined :
                    `${Cast(Doc.UserDoc().activeWorkspace, Doc, null)?.darkScheme ? "rgb(30, 32, 31)" : "#9c9396"} ${StrCast(this.props.Document.boxShadow, "0.2vw 0.2vw 0.8vw")}`
            }}
            onContextMenu={this.onContextMenu}>
            {this.showIsTagged()}
            <div style={{ width: `calc(100% - ${this.facetWidth()}px)` }}>
                {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
            </div>
            {this.lightbox(DocListCast(this.props.Document[this.props.fieldKey]).filter(d => d.type === DocumentType.IMG).map(d =>
                Cast(d.data, ImageField) ?
                    (Cast(d.data, ImageField)!.url.href.indexOf(window.location.origin) === -1) ?
                        Utils.CorsProxy(Cast(d.data, ImageField)!.url.href) : Cast(d.data, ImageField)!.url.href
                    :
                    ""))}
            {!this.props.isSelected() || this.props.PanelHeight() < 100 || this.props.Document.hideFilterView ? (null) :
                <div className="collectionTimeView-dragger" title="library View Dragger" onPointerDown={this.onPointerDown} style={{ right: this.facetWidth() - 10 }} />
            }
            {this.filterView}
        </div>);
    }
}