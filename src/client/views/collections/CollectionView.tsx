import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faColumns, faCopy, faEllipsisV, faFingerprint, faImage, faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction, runInAction, computed } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import Lightbox from 'react-image-lightbox-with-rotate';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
import { DateField } from '../../../new_fields/DateField';
import { Doc, DocListCast } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { listSpec } from '../../../new_fields/Schema';
import { BoolCast, Cast, StrCast, NumCast } from '../../../new_fields/Types';
import { ImageField } from '../../../new_fields/URLField';
import { TraceMobx } from '../../../new_fields/util';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { Utils } from '../../../Utils';
import { DocumentType } from '../../documents/DocumentTypes';
import { DocumentManager } from '../../util/DocumentManager';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { SelectionManager } from '../../util/SelectionManager';
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { ScriptBox } from '../ScriptBox';
import { Touchable } from '../Touchable';
import { CollectionDockingView } from "./CollectionDockingView";
import { AddCustomFreeFormLayout } from './collectionFreeForm/CollectionFreeFormLayoutEngines';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionLinearView } from './CollectionLinearView';
import { CollectionMulticolumnView } from './collectionMulticolumn/CollectionMulticolumnView';
import { CollectionPivotView } from './CollectionPivotView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionStaffView } from './CollectionStaffView';
import { CollectionTreeView } from "./CollectionTreeView";
import './CollectionView.scss';
import { CollectionViewBaseChrome } from './CollectionViewChromes';
export const COLLECTION_BORDER_WIDTH = 2;
const path = require('path');
library.add(faTh, faTree, faSquare, faProjectDiagram, faSignature, faThList, faFingerprint, faColumns, faEllipsisV, faImage, faEye as any, faCopy);

export enum CollectionViewType {
    Invalid,
    Freeform,
    Schema,
    Docking,
    Tree,
    Stacking,
    Masonry,
    Pivot,
    Linear,
    Staff,
    Multicolumn,
    Timeline
}

export namespace CollectionViewType {
    const stringMapping = new Map<string, CollectionViewType>([
        ["invalid", CollectionViewType.Invalid],
        ["freeform", CollectionViewType.Freeform],
        ["schema", CollectionViewType.Schema],
        ["docking", CollectionViewType.Docking],
        ["tree", CollectionViewType.Tree],
        ["stacking", CollectionViewType.Stacking],
        ["masonry", CollectionViewType.Masonry],
        ["pivot", CollectionViewType.Pivot],
        ["linear", CollectionViewType.Linear],
        ["multicolumn", CollectionViewType.Multicolumn]
    ]);

    export const valueOf = (value: string) => stringMapping.get(value.toLowerCase());
}

export interface CollectionRenderProps {
    addDocument: (document: Doc) => boolean;
    removeDocument: (document: Doc) => boolean;
    moveDocument: (document: Doc, targetCollection: Doc | undefined, addDocument: (document: Doc) => boolean) => boolean;
    active: () => boolean;
    whenActiveChanged: (isActive: boolean) => void;
}

@observer
export class CollectionView extends Touchable<FieldViewProps> {
    public static LayoutString(fieldStr: string) { return FieldView.LayoutString(CollectionView, fieldStr); }

    private _reactionDisposer: IReactionDisposer | undefined;
    private _isChildActive = false;   //TODO should this be observable?
    @observable private _isLightboxOpen = false;
    @observable private _curLightboxImg = 0;
    @observable private _collapsed = true;
    @observable private static _safeMode = false;
    public static SetSafeMode(safeMode: boolean) { this._safeMode = safeMode; }

    @computed get dataDoc() { return this.props.DataDoc && this.props.Document.isTemplateField ? Doc.GetProto(this.props.DataDoc) : Doc.GetProto(this.props.Document); }
    @computed get extensionDoc() { return Doc.fieldExtensionDoc(this.props.Document, this.props.fieldKey); }

    get collectionViewType(): CollectionViewType | undefined {
        if (!this.extensionDoc) return CollectionViewType.Invalid;
        NumCast(this.props.Document.viewType) && setTimeout(() => {
            if (this.props.Document.viewType) {
                this.extensionDoc!.viewType = NumCast(this.props.Document.viewType);
            }
            Doc.GetProto(this.props.Document).viewType = this.props.Document.viewType = undefined;
        });
        const viewField = NumCast(this.extensionDoc.viewType, Cast(this.props.Document.viewType, "number"));
        if (CollectionView._safeMode) {
            if (viewField === CollectionViewType.Freeform) {
                return CollectionViewType.Tree;
            }
            if (viewField === CollectionViewType.Invalid) {
                return CollectionViewType.Freeform;
            }
        }
        return viewField === undefined ? CollectionViewType.Invalid : viewField;
    }

    componentDidMount = () => {
        this._reactionDisposer = reaction(() => StrCast(this.props.Document.chromeStatus),
            () => {
                // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
                // chrome status may also be view-mode, in reference to stacking view's toggle mode. it is essentially disabled mode, but prevents the toggle button from showing up on the left sidebar.
                const chromeStatus = this.props.Document.chromeStatus;
                if (chromeStatus && (chromeStatus === "disabled" || chromeStatus === "collapsed")) {
                    runInAction(() => this._collapsed = true);
                }
            });
    }

    componentWillUnmount = () => this._reactionDisposer && this._reactionDisposer();

    // bcz: Argh?  What's the height of the collection chromes??  
    chromeHeight = () => (this.props.Document.chromeStatus === "enabled" ? -60 : 0);

    active = (outsideReaction?: boolean) => this.props.isSelected(outsideReaction) || BoolCast(this.props.Document.forceActive) || this._isChildActive || this.props.renderDepth === 0;

    whenActiveChanged = (isActive: boolean) => { this.props.whenActiveChanged(this._isChildActive = isActive); };

    @action.bound
    addDocument(doc: Doc): boolean {
        const targetDataDoc = Doc.GetProto(this.props.Document);
        Doc.AddDocToList(targetDataDoc, this.props.fieldKey, doc);
        const extension = Doc.fieldExtensionDoc(targetDataDoc, this.props.fieldKey);  // set metadata about the field being rendered (ie, the set of documents) on an extension field for that field
        extension && (extension.lastModified = new DateField(new Date(Date.now())));
        Doc.GetProto(doc).lastOpened = new DateField;
        return true;
    }

    @action.bound
    removeDocument(doc: Doc): boolean {
        const docView = DocumentManager.Instance.getDocumentView(doc, this.props.ContainingCollectionView);
        docView && SelectionManager.DeselectDoc(docView);
        const value = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), []);
        let index = value.reduce((p, v, i) => (v instanceof Doc && v === doc) ? i : p, -1);
        index = index !== -1 ? index : value.reduce((p, v, i) => (v instanceof Doc && Doc.AreProtosEqual(v, doc)) ? i : p, -1);

        ContextMenu.Instance.clearItems();
        if (index !== -1) {
            value.splice(index, 1);
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
        const props = { ...this.props, ...renderProps, chromeCollapsed: this._collapsed, ChromeHeight: this.chromeHeight, CollectionView: this, annotationsKey: "" };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView key="collview" {...props} />);
            case CollectionViewType.Docking: return (<CollectionDockingView key="collview" {...props} />);
            case CollectionViewType.Tree: return (<CollectionTreeView key="collview" {...props} />);
            case CollectionViewType.Staff: return (<CollectionStaffView chromeCollapsed={true} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
            case CollectionViewType.Multicolumn: return (<CollectionMulticolumnView chromeCollapsed={true} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
            case CollectionViewType.Linear: { return (<CollectionLinearView key="collview" {...props} />); }
            case CollectionViewType.Stacking: { this.props.Document.singleColumn = true; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Masonry: { this.props.Document.singleColumn = false; return (<CollectionStackingView key="collview" {...props} />); }
            case CollectionViewType.Pivot: { return (<CollectionPivotView key="collview" {...props} />); }
            case CollectionViewType.Freeform:
            default: { this.props.Document.freeformLayoutEngine = undefined; return (<CollectionFreeFormView key="collview" {...props} />); }
        }
    }

    @action
    private collapse = (value: boolean) => {
        this._collapsed = value;
        this.props.Document.chromeStatus = value ? "collapsed" : "enabled";
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
        const chrome = this.props.Document.chromeStatus === "disabled" || type === CollectionViewType.Docking ? (null) :
            <CollectionViewBaseChrome CollectionView={this} key="chrome" type={type} collapse={this.collapse} />;
        return [chrome, this.SubViewHelper(type, renderProps)];
    }


    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            const existingVm = ContextMenu.Instance.findByDescription("View Modes...");
            const subItems = existingVm && "subitems" in existingVm ? existingVm.subitems : [];
            subItems.push({ description: "Freeform", event: () => { this.props.Document.viewType = CollectionViewType.Freeform; }, icon: "signature" });
            if (CollectionView._safeMode) {
                ContextMenu.Instance.addItem({ description: "Test Freeform", event: () => this.props.Document.viewType = CollectionViewType.Invalid, icon: "project-diagram" });
            }
            subItems.push({ description: "Schema", event: () => this.props.Document.viewType = CollectionViewType.Schema, icon: "th-list" });
            subItems.push({ description: "Treeview", event: () => this.props.Document.viewType = CollectionViewType.Tree, icon: "tree" });
            subItems.push({ description: "Stacking", event: () => this.props.Document.viewType = CollectionViewType.Stacking, icon: "ellipsis-v" });
            subItems.push({
                description: "Stacking (AutoHeight)", event: () => {
                    this.props.Document.viewType = CollectionViewType.Stacking;
                    this.props.Document.autoHeight = true;
                }, icon: "ellipsis-v"
            });
            subItems.push({ description: "Staff", event: () => this.props.Document.viewType = CollectionViewType.Staff, icon: "music" });
            subItems.push({ description: "Multicolumn", event: () => this.props.Document.viewType = CollectionViewType.Multicolumn, icon: "columns" });
            subItems.push({ description: "Masonry", event: () => this.props.Document.viewType = CollectionViewType.Masonry, icon: "columns" });
            subItems.push({ description: "Pivot", event: () => this.props.Document.viewType = CollectionViewType.Pivot, icon: "columns" });
            switch (this.props.Document.viewType) {
                case CollectionViewType.Freeform: {
                    subItems.push({ description: "Custom", icon: "fingerprint", event: AddCustomFreeFormLayout(this.props.Document, this.props.fieldKey) });
                    break;
                }
            }
            subItems.push({ description: "lightbox", event: action(() => this._isLightboxOpen = true), icon: "eye" });
            !existingVm && ContextMenu.Instance.addItem({ description: "View Modes...", subitems: subItems, icon: "eye" });

            const existing = ContextMenu.Instance.findByDescription("Layout...");
            const layoutItems = existing && "subitems" in existing ? existing.subitems : [];
            layoutItems.push({ description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });
            if (this.props.Document.childLayout instanceof Doc) {
                layoutItems.push({ description: "View Child Layout", event: () => this.props.addDocTab(this.props.Document.childLayout as Doc, undefined, "onRight"), icon: "project-diagram" });
            }
            if (this.props.Document.childDetailed instanceof Doc) {
                layoutItems.push({ description: "View Child Detailed Layout", event: () => this.props.addDocTab(this.props.Document.childDetailed as Doc, undefined, "onRight"), icon: "project-diagram" });
            }
            !existing && ContextMenu.Instance.addItem({ description: "Layout...", subitems: layoutItems, icon: "hand-point-right" });

            const more = ContextMenu.Instance.findByDescription("More...");
            const moreItems = more && "subitems" in more ? more.subitems : [];
            moreItems.push({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.props.Document) });
            !more && ContextMenu.Instance.addItem({ description: "More...", subitems: moreItems, icon: "hand-point-right" });

            const existingOnClick = ContextMenu.Instance.findByDescription("OnClick...");
            const onClicks = existingOnClick && "subitems" in existingOnClick ? existingOnClick.subitems : [];
            onClicks.push({ description: "Edit onChildClick script", icon: "edit", event: (obj: any) => ScriptBox.EditButtonScript("On Child Clicked...", this.props.Document, "onChildClick", obj.x, obj.y) });
            !existingOnClick && ContextMenu.Instance.addItem({ description: "OnClick...", subitems: onClicks, icon: "hand-point-right" });
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
    render() {
        TraceMobx();
        const props: CollectionRenderProps = {
            addDocument: this.addDocument,
            removeDocument: this.removeDocument,
            moveDocument: this.moveDocument,
            active: this.active,
            whenActiveChanged: this.whenActiveChanged,
        };
        return (<div className={"collectionView"}
            style={{
                pointerEvents: this.props.Document.isBackground ? "none" : "all",
                boxShadow: this.props.Document.isBackground || this.collectionViewType === CollectionViewType.Linear ? undefined : `#9c9396 ${StrCast(this.props.Document.boxShadow, "0.2vw 0.2vw 0.8vw")}`
            }}
            onContextMenu={this.onContextMenu}>
            {this.showIsTagged()}
            {this.collectionViewType !== undefined ? this.SubView(this.collectionViewType, props) : (null)}
            {this.lightbox(DocListCast(this.props.Document[this.props.fieldKey]).filter(d => d.type === DocumentType.IMG).map(d =>
                Cast(d.data, ImageField) ?
                    (Cast(d.data, ImageField)!.url.href.indexOf(window.location.origin) === -1) ?
                        Utils.CorsProxy(Cast(d.data, ImageField)!.url.href) : Cast(d.data, ImageField)!.url.href
                    :
                    ""))}
        </div>);
    }
}