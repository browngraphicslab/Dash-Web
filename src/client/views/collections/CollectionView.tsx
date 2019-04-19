import * as React from 'react';
import { FieldViewProps, FieldView } from '../nodes/FieldView';
import { CollectionBaseView, CollectionViewType, CollectionRenderProps } from './CollectionBaseView';
import { CollectionFreeFormView } from './collectionFreeForm/CollectionFreeFormView';
import { CollectionSchemaView } from './CollectionSchemaView';
import { CollectionDockingView } from './CollectionDockingView';
import { CollectionTreeView } from './CollectionTreeView';
import { ContextMenu } from '../ContextMenu';
import { CurrentUserUtils } from '../../../server/authentication/models/current_user_utils';
import { KeyStore } from '../../../fields/KeyStore';
import { observer } from 'mobx-react';
import { undoBatch } from '../../util/UndoManager';
import { trace } from 'mobx';

@observer
export class CollectionView extends React.Component<FieldViewProps> {
    public static LayoutString(fieldStr: string = "DataKey") { return FieldView.LayoutString(CollectionView, fieldStr); }

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

    get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey.Id === KeyStore.Annotations.Id; } // bcz: ? Why do we need to compare Id's?

    onContextMenu = (e: React.MouseEvent): void => {
        if (!this.isAnnotationOverlay && !e.isPropagationStopped() && this.props.Document.Id !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            ContextMenu.Instance.addItem({ description: "Freeform", event: undoBatch(() => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Freeform)) });
            ContextMenu.Instance.addItem({ description: "Schema", event: undoBatch(() => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Schema)) });
            ContextMenu.Instance.addItem({ description: "Treeview", event: undoBatch(() => this.props.Document.SetNumber(KeyStore.ViewType, CollectionViewType.Tree)) });
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