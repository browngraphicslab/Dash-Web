import { library } from '@fortawesome/fontawesome-svg-core';
import { faProjectDiagram, faSignature, faColumns, faSquare, faTh, faImage, faThList, faTree, faEllipsisV } from '@fortawesome/free-solid-svg-icons';
import { observer } from "mobx-react";
import * as React from 'react';
import { Doc, DocListCast, WidthSym, HeightSym } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../ContextMenu";
import { ContextMenuProps } from '../ContextMenuItem';
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionStackingView } from './CollectionStackingView';
import { CollectionTreeView } from "./CollectionTreeView";
import { StrCast, PromiseValue } from '../../../new_fields/Types';
import { DocumentType } from '../../documents/Documents';
import { CollectionStackingViewChrome, CollectionViewBaseChrome } from './CollectionViewChromes';
import { observable } from 'mobx';
export const COLLECTION_BORDER_WIDTH = 2;

library.add(faTh);
library.add(faTree);
library.add(faSquare);
library.add(faProjectDiagram);
library.add(faSignature);
library.add(faThList);
library.add(faColumns);
library.add(faEllipsisV);
library.add(faImage);

@observer
export class CollectionView extends React.Component<FieldViewProps> {
    @observable private _collapsed = false;

    public static LayoutString(fieldStr: string = "data", fieldExt: string = "") { return FieldView.LayoutString(CollectionView, fieldStr, fieldExt); }

    private SubViewHelper = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        switch (this.isAnnotationOverlay ? CollectionViewType.Freeform : type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
            case CollectionViewType.Docking: return (<CollectionDockingView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
            case CollectionViewType.Tree: return (<CollectionTreeView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
            case CollectionViewType.Stacking: { this.props.Document.singleColumn = true; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />); }
            case CollectionViewType.Masonry: { this.props.Document.singleColumn = false; return (<CollectionStackingView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />); }
            case CollectionViewType.Freeform:
            default:
                return (<CollectionFreeFormView chromeCollapsed={this._collapsed} key="collview" {...props} CollectionView={this} />);
        }
        return (null);
    }

    private collapse = (value: boolean) => {
        this._collapsed = value;
    }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        if (this.isAnnotationOverlay || this.props.Document === CurrentUserUtils.UserDocument.sidebar) {
            return [(null), this.SubViewHelper(type, renderProps)];
        }
        else {
            return [
                (<CollectionViewBaseChrome CollectionView={this} type={type} collapse={this.collapse} />),
                this.SubViewHelper(type, renderProps)
            ];
        }
    }

    get isAnnotationOverlay() { return this.props.fieldExt ? true : false; }

    static _applyCount: number = 0;
    onContextMenu = (e: React.MouseEvent): void => {
        if (!this.isAnnotationOverlay && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            let subItems: ContextMenuProps[] = [];
            subItems.push({ description: "Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Freeform), icon: "signature" });
            if (CollectionBaseView.InSafeMode()) {
                ContextMenu.Instance.addItem({ description: "Test Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Invalid), icon: "project-diagram" });
            }
            subItems.push({ description: "Schema", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Schema), icon: "th-list" });
            subItems.push({ description: "Treeview", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Tree), icon: "tree" });
            subItems.push({ description: "Stacking", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Stacking), icon: "ellipsis-v" });
            subItems.push({ description: "Masonry", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Masonry), icon: "columns" });
            ContextMenu.Instance.addItem({ description: "View Modes...", subitems: subItems });
            ContextMenu.Instance.addItem({
                description: "Apply Template", event: undoBatch(() => {
                    let otherdoc = new Doc();
                    otherdoc.width = this.props.Document[WidthSym]();
                    otherdoc.height = this.props.Document[HeightSym]();
                    otherdoc.title = this.props.Document.title + "(..." + CollectionView._applyCount++ + ")"; // previously "applied"
                    otherdoc.layout = Doc.MakeDelegate(this.props.Document);
                    otherdoc.miniLayout = StrCast(this.props.Document.miniLayout);
                    otherdoc.detailedLayout = otherdoc.layout;
                    otherdoc.type = DocumentType.TEMPLATE;
                    this.props.addDocTab && this.props.addDocTab(otherdoc, undefined, "onRight");
                }), icon: "project-diagram"
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