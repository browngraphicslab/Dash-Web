import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faColumns, faCopy, faEllipsisV, faFingerprint, faImage, faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import { Id } from '../../../new_fields/FieldSymbols';
import { StrCast, Cast } from '../../../new_fields/Types';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from "./CollectionDockingView";
import { AddCustomFreeFormLayout } from './collectionFreeForm/CollectionFreeFormLayoutEngines';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionTreeView } from "./CollectionTreeView";
import { CollectionViewBaseChrome } from './CollectionViewChromes';
import { ImageUtils } from '../../util/Import & Export/ImageUtils';
import { CollectionLinearView } from '../CollectionLinearView';
import { DocumentType } from '../../documents/DocumentTypes';
import { ImageField } from '../../../new_fields/URLField';
import { DocListCast } from '../../../new_fields/Doc';
import Lightbox from 'react-image-lightbox-with-rotate';
import 'react-image-lightbox-with-rotate/style.css'; // This only needs to be imported once in your app
export const COLLECTION_BORDER_WIDTH = 2;

library.add(faTh, faTree, faSquare, faProjectDiagram, faSignature, faThList, faFingerprint, faColumns, faEllipsisV, faImage, faEye as any, faCopy);

@observer
export class CollectionView extends React.Component<FieldViewProps> {

    public static LayoutString(fieldStr: string = "data") { return FieldView.LayoutString(CollectionView, fieldStr); }

    private _reactionDisposer: IReactionDisposer | undefined;
    @observable private _isLightboxOpen = false;
    @observable private _curLightboxImg = 0;
    @observable private _collapsed = true;

    componentDidMount = () => {
        this._reactionDisposer = reaction(() => StrCast(this.props.Document.chromeStatus),
            () => {
                // chrome status is one of disabled, collapsed, or visible. this determines initial state from document
                // chrome status may also be view-mode, in reference to stacking view's toggle mode. it is essentially disabled mode, but prevents the toggle button from showing up on the left sidebar.
                let chromeStatus = this.props.Document.chromeStatus;
                if (chromeStatus && (chromeStatus === "disabled" || chromeStatus === "collapsed")) {
                    runInAction(() => this._collapsed = true);
                }
            });
    }

    componentWillUnmount = () => {
        this._reactionDisposer && this._reactionDisposer();
    }

    // bcz: Argh?  What's the height of the collection chomes??  
    chromeHeight = () => {
        return (this.props.ChromeHeight ? this.props.ChromeHeight() : 0) + (this.props.Document.chromeStatus === "enabled" ? -60 : 0);
    }

    private SubViewHelper = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
            // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
            case CollectionViewType.Docking: return (<CollectionDockingView chromeCollapsed={true} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
            case CollectionViewType.Tree: return (<CollectionTreeView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
            case CollectionViewType.Stacking: { this.props.Document.singleColumn = true; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />); }
            case CollectionViewType.Masonry: { this.props.Document.singleColumn = false; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />); }
            case CollectionViewType.Pivot: { this.props.Document.freeformLayoutEngine = "pivot"; return (<CollectionFreeFormView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />); }
            case CollectionViewType.Linear: { return (<CollectionLinearView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />); }
            case CollectionViewType.Freeform:
            default:
                this.props.Document.freeformLayoutEngine = undefined;
                return (<CollectionFreeFormView chromeCollapsed={this._collapsed} key="collview" {...props} ChromeHeight={this.chromeHeight} CollectionView={this} />);
        }
        return (null);
    }

    @action
    private collapse = (value: boolean) => {
        this._collapsed = value;
        this.props.Document.chromeStatus = value ? "collapsed" : "enabled";
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
        if (this.props.Document.chromeStatus === "disabled" || type === CollectionViewType.Docking) {
            return [(null), this.SubViewHelper(type, renderProps)];
        }
        return [
            <CollectionViewBaseChrome CollectionView={this} key="chrome" type={type} collapse={this.collapse} />,
            this.SubViewHelper(type, renderProps)
        ];
    }


    onContextMenu = (e: React.MouseEvent): void => {
        if (!e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            let existingVm = ContextMenu.Instance.findByDescription("View Modes...");
            let subItems: ContextMenuProps[] = existingVm && "subitems" in existingVm ? existingVm.subitems : [];
            subItems.push({ description: "Freeform", event: () => { this.props.Document.viewType = CollectionViewType.Freeform; }, icon: "signature" });
            if (CollectionBaseView.InSafeMode()) {
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

            let existing = ContextMenu.Instance.findByDescription("Layout...");
            let layoutItems: ContextMenuProps[] = existing && "subitems" in existing ? existing.subitems : [];
            layoutItems.push({ description: `${this.props.Document.forceActive ? "Select" : "Force"} Contents Active`, event: () => this.props.Document.forceActive = !this.props.Document.forceActive, icon: "project-diagram" });
            !existing && ContextMenu.Instance.addItem({ description: "Layout...", subitems: layoutItems, icon: "hand-point-right" });
            ContextMenu.Instance.addItem({ description: "Export Image Hierarchy", icon: "columns", event: () => ImageUtils.ExportHierarchyToFileSystem(this.props.Document) });
        }
    }

    lightbox = (images: string[]) => {
        return !this._isLightboxOpen ? (null) : (<Lightbox key="lightbox"
            mainSrc={images[this._curLightboxImg]}
            nextSrc={images[(this._curLightboxImg + 1) % images.length]}
            prevSrc={images[(this._curLightboxImg + images.length - 1) % images.length]}
            onCloseRequest={action(() => this._isLightboxOpen = false)}
            onMovePrevRequest={action(() => this._curLightboxImg = (this._curLightboxImg + images.length - 1) % images.length)}
            onMoveNextRequest={action(() => this._curLightboxImg = (this._curLightboxImg + 1) % images.length)} />);
    }

    render() {
        return (<>
            <CollectionBaseView key="baseView" {...this.props} onContextMenu={this.onContextMenu}>
                {this.SubView}
            </CollectionBaseView>

            {this.lightbox(DocListCast(this.props.Document[this.props.fieldKey]).filter(d => d.type === DocumentType.IMG).map(d => Cast(d.data, ImageField)!.url.href))}
        </>
        );
    }
}