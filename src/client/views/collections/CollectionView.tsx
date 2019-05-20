import { library } from '@fortawesome/fontawesome-svg-core';
import { faProjectDiagram, faSquare, faTh, faTree, faSignature, faThList } from '@fortawesome/free-solid-svg-icons';
import { observer } from "mobx-react";
import * as React from 'react';
import { Id } from '../../../new_fields/FieldSymbols';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { undoBatch } from '../../util/UndoManager';
import { ContextMenu } from "../ContextMenu";
import { FieldView, FieldViewProps } from '../nodes/FieldView';
import { CollectionBaseView, CollectionRenderProps, CollectionViewType } from './CollectionBaseView';
import { CollectionDockingView } from "./CollectionDockingView";
import { CollectionSchemaView } from "./CollectionSchemaView";
import { CollectionTreeView } from "./CollectionTreeView";
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
export const COLLECTION_BORDER_WIDTH = 2;

library.add(faTh);
library.add(faTree);
library.add(faSquare);
library.add(faProjectDiagram);
library.add(faSignature);
library.add(faThList);

@observer
export class CollectionView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "data") { return FieldView.LayoutString(CollectionView, fieldStr); }

    private SubView = (type: CollectionViewType, renderProps: CollectionRenderProps) => {
        let props = { ...this.props, ...renderProps };
        switch (type) {
            case CollectionViewType.Schema: return (<CollectionSchemaView {...props} CollectionView={this} />);
            case CollectionViewType.Docking: return (<CollectionDockingView {...props} CollectionView={this} />);
            case CollectionViewType.Tree: return (<CollectionTreeView {...props} CollectionView={this} />);
            case CollectionViewType.Freeform:
            default:
                return (<CollectionFreeFormView {...props} CollectionView={this} />);
        }
        return (null);
    }

    get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey === "annotations"; } // bcz: ? Why do we need to compare Id's?

    onContextMenu = (e: React.MouseEvent): void => {
        if (!this.isAnnotationOverlay && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Freeform), icon: "signature" });
            if (CollectionBaseView.InSafeMode()) {
                ContextMenu.Instance.addItem({ description: "Test Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Invalid), icon: "project-diagram" });
            }
            ContextMenu.Instance.addItem({ description: "Schema", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Schema), icon: "th-list" });
            ContextMenu.Instance.addItem({ description: "Treeview", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Tree), icon: "tree" });
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