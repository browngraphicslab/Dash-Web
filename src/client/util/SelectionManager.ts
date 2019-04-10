import { observable, action } from "mobx";
import { DocumentView } from "../views/nodes/DocumentView";
import { Document } from "../../fields/Document";
import { Main } from "../views/Main";

export namespace SelectionManager {
    class Manager {
        @observable
        SelectedDocuments: Array<DocumentView> = [];

        @action
        SelectDoc(doc: DocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (!ctrlPressed) {
                this.DeselectAll();
            }

            if (manager.SelectedDocuments.indexOf(doc) === -1) {
                manager.SelectedDocuments.push(doc);
                doc.props.onActiveChanged(true);
            }
        }

        @action
        DeselectAll(): void {
            manager.SelectedDocuments.map(dv => dv.props.onActiveChanged(false));
            manager.SelectedDocuments = [];
        }
    }

    const manager = new Manager();

    export function SelectDoc(doc: DocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(doc, ctrlPressed);
    }

    export function IsSelected(doc: DocumentView): boolean {
        return manager.SelectedDocuments.indexOf(doc) !== -1;
    }

    export function DeselectAll(except?: Document): void {
        let found: DocumentView | undefined = undefined;
        if (except) {
            for (const view of manager.SelectedDocuments) {
                if (view.props.Document === except) found = view;
            }
        }

        manager.DeselectAll();
        if (found) manager.SelectDoc(found, false);
        Main.Instance.SetTextDoc(undefined, undefined, undefined);
    }

    export function SelectedDocuments(): Array<DocumentView> {
        return manager.SelectedDocuments;
    }
}
