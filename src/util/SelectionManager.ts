import { CollectionFreeFormDocumentView } from "../views/nodes/CollectionFreeFormDocumentView";
import { observable, action } from "mobx";

export namespace SelectionManager {
    class Manager {
        @observable
        SelectedDocuments: Array<CollectionFreeFormDocumentView> = [];

        @action
        SelectDoc(doc: CollectionFreeFormDocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (!ctrlPressed) {
                manager.SelectedDocuments = [];
            }

            if (manager.SelectedDocuments.indexOf(doc) === -1) {
                manager.SelectedDocuments.push(doc)
            }
        }
    }

    const manager = new Manager;

    export function SelectDoc(doc: CollectionFreeFormDocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(doc, ctrlPressed)
    }

    export function IsSelected(doc: CollectionFreeFormDocumentView): boolean {
        return manager.SelectedDocuments.indexOf(doc) !== -1;
    }

    export function DeselectAll(): void {
        manager.SelectedDocuments = []
    }

    export function SelectedDocuments(): Array<CollectionFreeFormDocumentView> {
        return manager.SelectedDocuments;
    }
}