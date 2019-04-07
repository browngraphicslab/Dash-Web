import { observable, action } from "mobx";
import { DocumentView } from "../views/nodes/DocumentView";
import { Document } from "../../fields/Document";

export namespace SelectionManager {
    class Manager {
        @observable
        SelectedDocuments: Array<DocumentView> = [];

        @action
        SelectDoc(doc: DocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (!ctrlPressed) {
                manager.SelectedDocuments = [];
            }

            if (manager.SelectedDocuments.indexOf(doc) === -1) {
                manager.SelectedDocuments.push(doc);
            }
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
            for (let i = 0; i < manager.SelectedDocuments.length; i++) {
                let view = manager.SelectedDocuments[i];
                if (view.props.Document == except) found = view;
            }
        }
        manager.SelectedDocuments.length = 0;
        if (found) manager.SelectedDocuments.push(found);
    }

    export function SelectedDocuments(): Array<DocumentView> {
        return manager.SelectedDocuments;
    }
}
