import { observable, action, runInAction, ObservableMap } from "mobx";
import { Doc } from "../../new_fields/Doc";
import { DocumentView } from "../views/nodes/DocumentView";
import { computedFn } from "mobx-utils";
import { List } from "../../new_fields/List";

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
            Doc.UserDoc().SelectedDocs = new List(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
        }
        @action
        DeselectDoc(docView: DocumentView): void {
            if (manager.SelectedDocuments.get(docView)) {
                manager.SelectedDocuments.delete(docView);
                docView.props.whenActiveChanged(false);
                Doc.UserDoc().SelectedDocs = new List(SelectionManager.SelectedDocuments().map(dv => dv.props.Document));
            }
        }
        @action
        DeselectAll(): void {
            Array.from(manager.SelectedDocuments.keys()).map(dv => dv.props.whenActiveChanged(false));
            manager.SelectedDocuments.clear();
            Doc.UserDoc().SelectedDocs = new List<Doc>([]);
        }
    }

    const manager = new Manager();

    export function DeselectDoc(docView: DocumentView): void {
        manager.DeselectDoc(docView);
    }
    export function SelectDoc(docView: DocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(docView, ctrlPressed);
    }

    export function IsSelected(doc: DocumentView, outsideReaction?: boolean): boolean {
        return outsideReaction ?
            manager.SelectedDocuments.get(doc) ? true : false :
            computedFn(function isSelected(doc: DocumentView) {
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

