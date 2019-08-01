import { library } from '@fortawesome/fontawesome-svg-core';
import { faEye } from '@fortawesome/free-regular-svg-icons';
import { faColumns, faEllipsisV, faFingerprint, faImage, faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree } from '@fortawesome/free-solid-svg-icons';
import { action, IReactionDisposer, observable, reaction, runInAction } from 'mobx';
import { observer } from "mobx-react";
import * as React from 'react';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { StrCast } from '../../../new_fields/Types';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionTreeView } from "./CollectionTreeView";
import { CollectionViewBaseChrome } from './CollectionViewChromes';
export const COLLECTION_BORDER_WIDTH = 2;

library.add(faTh);
library.add(faTree);
library.add(faSquare);
library.add(faProjectDiagram);
library.add(faSignature);
library.add(faThList);
library.add(faFingerprint);
library.add(faColumns);
library.add(faEllipsisV);
library.add(faImage, faEye);

@observer
export class CollectionView extends React.Component<FieldViewProps> {
    @observable private _collapsed = true;

    private _reactionDisposer: IReactionDisposer | undefined;

    public static LayoutString(fieldStr: string = "data", fieldExt: string = "") { return FieldView.LayoutString(CollectionView, fieldStr, fieldExt); }

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

    private SubViewHelper = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        switch (this.isAnnotationOverlay ? CollectionViewType.Freeform : type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
            // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
            case CollectionViewType.Docking: return (<CollectionDockingView chromeCollapsed={true} key="collview" {...props} CollectionView={this} />);
            case CollectionViewType.Tree: return (<CollectionTreeView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
            case CollectionViewType.Stacking: { this.props.Document.singleColumn = true; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />); }
            case CollectionViewType.Masonry: { this.props.Document.singleColumn = false; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />); }
            case CollectionViewType.Freeform:
            default:
                return (<CollectionFreeFormView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
        }
        return (null);
    }

    @action
    private collapse = (value: boolean) => {
        this._collapsed = value;
        this.props.Document.chromeStatus = value ? "collapsed" : "visible";
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        // currently cant think of a reason for collection docking view to have a chrome. mind may change if we ever have nested docking views -syip
        if (this.isAnnotationOverlay || this.props.Document.chromeStatus === "disabled" || type === CollectionViewType.Docking) {
            return [(null), this.SubViewHelper(type, renderProps)];
        }
        else {
            return [
                (<CollectionViewBaseChrome CollectionView={this} key="chrome" type={type} collapse={this.collapse} />),
                this.SubViewHelper(type, renderProps)
            ];
        }
    }

    get isAnnotationOverlay() { return this.props.fieldExt ? true : false; }

    onContextMenu = (e: React.MouseEvent): void => {
        if (!this.isAnnotationOverlay && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            let subItems: ContextMenuProps[] = [];
            subItems.push({ description: "Freeform", event: () => this.props.Document.viewType = CollectionViewType.Freeform, icon: "signature" });
            if (CollectionBaseView.InSafeMode()) {
                ContextMenu.Instance.addItem({ description: "Test Freeform", event: () => this.props.Document.viewType = CollectionViewType.Invalid, icon: "project-diagram" });
            }
            subItems.push({ description: "Schema", event: () => this.props.Document.viewType = CollectionViewType.Schema, icon: "th-list" });
            subItems.push({ description: "Treeview", event: () => this.props.Document.viewType = CollectionViewType.Tree, icon: "tree" });
            subItems.push({ description: "Stacking", event: () => this.props.Document.viewType = CollectionViewType.Stacking, icon: "ellipsis-v" });
            subItems.push({ description: "Masonry", event: () => this.props.Document.viewType = CollectionViewType.Masonry, icon: "columns" });
            switch (this.props.Document.viewType) {
                case CollectionViewType.Freeform: {
                    subItems.push({ description: "Custom", icon: "fingerprint", event: CollectionFreeFormView.AddCustomLayout(this.props.Document, this.props.fieldKey) });
                    break;
                }
            }
            ContextMenu.Instance.addItem({ description: "View Modes...", subitems: subItems, icon: "eye" });
            ContextMenu.Instance.addItem({ description: "Apply Template", event: () => this.props.addDocTab && this.props.addDocTab(Doc.ApplyTemplate(this.props.Document)!, undefined, "onRight"), icon: "project-diagram" });
            ContextMenu.Instance.addItem({
                description: this.props.Document.chromeStatus !== "disabled" ? "Hide Chrome" : "Show Chrome", event: () => this.props.Document.chromeStatus = (this.props.Document.chromeStatus !== "disabled" ? "disabled" : "enabled"), icon: "project-diagram"
            });
        }
    }

    render() {
        return (
            <CollectionBaseView {...this.props} onContextMenu={this.onContextMenu}>
                {this.SubView}
            </CollectionBaseView>
        );
    }
}