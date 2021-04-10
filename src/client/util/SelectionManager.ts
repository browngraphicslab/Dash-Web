import { action, observable, ObservableMap } from "mobx";
import { computedFn } from "mobx-utils";
import { Doc, Opt } from "../../fields/Doc";
import { CollectionSchemaView } from "../views/collections/CollectionSchemaView";
import { CollectionViewType } from "../views/collections/CollectionView";
import { DocumentView } from "../views/nodes/DocumentView";

export namespace SelectionManager {

    class Manager {

        @observable IsDragging: boolean = false;
        SelectedViews: ObservableMap<DocumentView, boolean> = new ObservableMap();
        @observable SelectedSchemaDocument: Doc | undefined;
        @observable SelectedSchemaCollection: CollectionSchemaView | undefined;

        @action
        SelectSchemaView(collectionView: Opt<CollectionSchemaView>, doc: Opt<Doc>) {
            manager.SelectedSchemaDocument = doc;
            manager.SelectedSchemaCollection = collectionView;
        }
        @action
        SelectView(docView: DocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (!manager.SelectedViews.get(docView)) {
                if (!ctrlPressed) {
                    this.DeselectAll();
                }

                manager.SelectedViews.set(docView, true);
                docView.props.whenChildContentsActiveChanged(true);
            } else if (!ctrlPressed && Array.from(manager.SelectedViews.entries()).length > 1) {
                Array.from(manager.SelectedViews.keys()).map(dv => dv !== docView && dv.props.whenChildContentsActiveChanged(false));
                manager.SelectedSchemaDocument = undefined;
                manager.SelectedSchemaCollection = undefined;
                manager.SelectedViews.clear();
                manager.SelectedViews.set(docView, true);
            }
        }
        @action
        DeselectView(docView: DocumentView): void {

            if (manager.SelectedViews.get(docView)) {
                manager.SelectedViews.delete(docView);
                docView.props.whenChildContentsActiveChanged(false);
            }
        }
        @action
        DeselectAll(): void {
            manager.SelectedSchemaCollection = undefined;
            manager.SelectedSchemaDocument = undefined;
            Array.from(manager.SelectedViews.keys()).map(dv => dv.props.whenChildContentsActiveChanged(false));
            manager.SelectedViews.clear();
        }
    }

    const manager = new Manager();

    export function DeselectView(docView: DocumentView): void {
        manager.DeselectView(docView);
    }
    export function SelectView(docView: DocumentView, ctrlPressed: boolean): void {
        manager.SelectView(docView, ctrlPressed);
    }
    export function SelectSchemaView(colSchema: Opt<CollectionSchemaView>, document: Opt<Doc>): void {
        manager.SelectSchemaView(colSchema, document);
    }

    const IsSelectedCache = computedFn(function isSelected(doc: DocumentView) {  // wrapping get() in a computedFn only generates mobx() invalidations when the return value of the function for the specific get parameters has changed
        return manager.SelectedViews.get(doc) ? true : false;
    });
    // computed functions, such as used in IsSelected generate errors if they're called outside of a
    // reaction context.  Specifying the context with 'outsideReaction' allows an efficiency feature
    // to avoid unnecessary mobx invalidations when running inside a reaction.
    export function IsSelected(doc: DocumentView | undefined, outsideReaction?: boolean): boolean {
        return !doc ? false : outsideReaction ?
            manager.SelectedViews.get(doc) ? true : false : // get() accesses a hashtable -- setting anything in the hashtable generates a mobx invalidation for every get()
            IsSelectedCache(doc);
    }

    export function DeselectAll(except?: Doc): void {
        let found: DocumentView | undefined = undefined;
        if (except) {
            for (const view of Array.from(manager.SelectedViews.keys())) {
                if (view.props.Document === except) found = view;
            }
        }

        manager.DeselectAll();
        if (found) manager.SelectView(found, false);
    }

    export function Views(): Array<DocumentView> {
        return Array.from(manager.SelectedViews.keys()).filter(dv => dv.props.Document._viewType !== CollectionViewType.Docking);
    }
    export function SelectedSchemaDoc(): Doc | undefined {
        return manager.SelectedSchemaDocument;
    }
    export function SelectedSchemaCollection(): CollectionSchemaView | undefined {
        return manager.SelectedSchemaCollection;
    }
}