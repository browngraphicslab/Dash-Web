import { library } from '@fortawesome/fontawesome-svg-core';
import { faProjectDiagram, faSignature, faSquare, faTh, faThList, faTree } from '@fortawesome/free-solid-svg-icons';
import { observer } from "mobx-react";
import * as React from 'react';
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
import { Doc } from '../../../new_fields/Doc';
import { FormattedTextBox } from '../nodes/FormattedTextBox';
import { Docs } from '../../documents/Documents';
import { List } from '../../../new_fields/List';
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
            case CollectionViewType.Stacking: return (<CollectionStackingView {...props} CollectionView={this} />);
            case CollectionViewType.Freeform:
            default:
                return (<CollectionFreeFormView {...props} CollectionView={this} />);
        }
        return (null);
    }

    get isAnnotationOverlay() { return this.props.fieldKey && this.props.fieldKey === "annotations"; } // bcz: ? Why do we need to compare Id's?

    onContextMenu = (e: React.MouseEvent): void => {
        if (!this.isAnnotationOverlay && !e.isPropagationStopped() && this.props.Document[Id] !== CurrentUserUtils.MainDocId) { // need to test this because GoldenLayout causes a parallel hierarchy in the React DOM for its children and the main document view7
            let subItems: ContextMenuProps[] = [];
            subItems.push({ description: "Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Freeform), icon: "signature" });
            if (CollectionBaseView.InSafeMode()) {
                ContextMenu.Instance.addItem({ description: "Test Freeform", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Invalid), icon: "project-diagram" });
            }
            subItems.push({ description: "Schema", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Schema), icon: "th-list" });
            subItems.push({ description: "Treeview", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Tree), icon: "tree" });
            subItems.push({ description: "Stacking", event: undoBatch(() => this.props.Document.viewType = CollectionViewType.Stacking), icon: "th-list" });
            ContextMenu.Instance.addItem({ description: "View Modes...", subitems: subItems });
            ContextMenu.Instance.addItem({
                description: "Add Description Template", event: undoBatch(() => {
                    let collection = this.props.Document;
                    Doc.GetProto(collection).description = "my first templated box";
                    let template = Doc.MakeAlias(collection);
                    template.layout = FormattedTextBox.LayoutString("description");
                    template.isTemplate = true;
                    template.x = 0;
                    template.y = 0;
                    template.width = 100;
                    template.height = 25;
                    Doc.AddDocToList(this.props.Document, "data", template);
                }), icon: "project-diagram"
            });
            ContextMenu.Instance.addItem({
                description: "Add Summary Template", event: undoBatch(() => {
                    Doc.GetProto(this.props.Document).summary = "my first templated box";
                    let template = Doc.MakeAlias(this.props.Document);
                    template.layout = FormattedTextBox.LayoutString("summary");
                    template.isTemplate = true;
                    template.x = 0;
                    template.y = 0;
                    template.width = 100;
                    template.height = 25;
                    Doc.AddDocToList(this.props.Document, "data", template);
                }), icon: "project-diagram"
            });
            ContextMenu.Instance.addItem({
                description: "Apply Template", event: undoBatch(() => {
                    let otherdoc = Docs.TextDocument({ width: 100, height: 50, title: "applied template" });
                    Doc.GetProto(otherdoc).description = "THIS DESCRIPTION IS REALLY IMPORTANT!";
                    Doc.GetProto(otherdoc).summary = "THIS SUMMARY IS MEANINGFUL!";
                    Doc.GetProto(otherdoc).layout = Doc.MakeDelegate(this.props.Document);
                    this.props.addDocTab && this.props.addDocTab(otherdoc, "onRight");
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