import { action, observable } from "mobx";
import { Document } from "../../fields/Document";
import { MainOverlayTextBox } from "../views/MainOverlayTextBox";
import { DocumentView } from "../views/nodes/DocumentView";

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
                doc.props.whenActiveChanged(true);
            }
        }

        @action
        DeselectAll(): void {
            manager.SelectedDocuments.map(dv => dv.props.whenActiveChanged(false));
            manager.SelectedDocuments = [];
            MainOverlayTextBox.Instance.SetTextDoc();
        }
        @action
        ReselectAll() {
            let sdocs = manager.SelectedDocuments.map(d => d);
            manager.SelectedDocuments = [];
            return sdocs;
        }
        @action
        ReselectAll2(sdocs: DocumentView[]) {
            sdocs.map(s => SelectionManager.SelectDoc(s, true));
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
    }

    export function ReselectAll() {
        let sdocs = manager.ReselectAll();
        setTimeout(() => manager.ReselectAll2(sdocs), 0);
    }
    export function SelectedDocuments(): Array<DocumentView> {
        return manager.SelectedDocuments;
    }
}
