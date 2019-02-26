import { observable, action } from "mobx";
import { DocumentView } from "../views/nodes/DocumentView";

export namespace SelectionManager {
    class Manager {
        @observable
        SelectedDocuments: Array<DocumentView> = [];

        @action
        SelectDoc(doc: DocumentView, ctrlPressed: boolean): void {

            //remove preview cursor from collection
            if (doc.props.ContainingCollectionView != undefined) {
                doc.props.ContainingCollectionView.hidePreviewCursor();
            }

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

    export function SelectDoc(doc: DocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(doc, ctrlPressed)
    }

    export function IsSelected(doc: DocumentView): boolean {
        return manager.SelectedDocuments.indexOf(doc) !== -1;
    }

    export function DeselectAll(): void {
        manager.SelectedDocuments = []
    }

    export function SelectedDocuments(): Array<DocumentView> {
        return manager.SelectedDocuments;
    }
}