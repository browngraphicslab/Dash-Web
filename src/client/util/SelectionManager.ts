import { observable, action, runInAction, ObservableMap } from "mobx";
import { Doc } from "../../fields/Doc";
import { DocumentView } from "../views/nodes/DocumentView";
import { computedFn } from "mobx-utils";
import { List } from "../../fields/List";

export namespace SelectionManager {

    class Manager {

        @observable IsDragging: boolean = false;
        SelectedDocuments: ObservableMap<DocumentView, boolean> = new ObservableMap();


        @action
        SelectDoc(docView: DocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (!manager.SelectedDocuments.get(docView)) {
                if (!ctrlPressed) {
                    this.DeselectAll();
                }

                manager.SelectedDocuments.set(docView, true);
                // console.log(manager.SelectedDocuments);
                docView.props.whenActiveChanged(true);
            } else if (!ctrlPressed && Array.from(manager.SelectedDocuments.entries()).length > 1) {
                Array.from(manager.SelectedDocuments.keys()).map(dv => dv !== docView && dv.props.whenActiveChanged(false));
                manager.SelectedDocuments.clear();
                manager.SelectedDocuments.set(docView, true);
            }
            Doc.UserDoc().activeSelection = new List(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        }
        @action
        DeselectDoc(docView: DocumentView): void {
            if (manager.SelectedDocuments.get(docView)) {
                manager.SelectedDocuments.delete(docView);
                docView.props.whenActiveChanged(false);
                Doc.UserDoc().activeSelection = new List(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
            }
        }
        @action
        DeselectAll(): void {
            Array.from(manager.SelectedDocuments.keys()).map(dv => dv.props.whenActiveChanged(false));
            manager.SelectedDocuments.clear();
            Doc.UserDoc().activeSelection = new List<Doc>([]);
        }
    }

    const manager = new Manager();

    export function DeselectDoc(docView: DocumentView): void {
        manager.DeselectDoc(docView);
    }
    export function SelectDoc(docView: DocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(docView, ctrlPressed);
    }

    // computed functions, such as used in IsSelected generate errors if they're called outside of a
    // reaction context.  Specifying the context with 'outsideReaction' allows an efficiency feature
    // to avoid unnecessary mobx invalidations when running inside a reaction.
    export function IsSelected(doc: DocumentView, outsideReaction?: boolean): boolean {
        return outsideReaction ?
            manager.SelectedDocuments.get(doc) ? true : false : // get() accesses a hashtable -- setting anything in the hashtable generates a mobx invalidation for every get()
            computedFn(function isSelected(doc: DocumentView) {  // wraapping get() in a computedFn only generates mobx() invalidations when the return value of the function for the specific get parameters has changed
                return manager.SelectedDocuments.get(doc) ? true : false;
            })(doc);
    }

    export function DeselectAll(except?: Doc): void {
        let found: DocumentView | undefined = undefined;
        if (except) {
            for (const view of Array.from(manager.SelectedDocuments.keys())) {
                if (view.props.Document === except) found = view;
            }
        }

        manager.DeselectAll();
        if (found) manager.SelectDoc(found, false);
    }

    export function SetIsDragging(dragging: boolean) { runInAction(() => manager.IsDragging = dragging); }
    export function GetIsDragging() { return manager.IsDragging; }

    export function SelectedDocuments(): Array<DocumentView> {
        return Array.from(manager.SelectedDocuments.keys());
    }
}

