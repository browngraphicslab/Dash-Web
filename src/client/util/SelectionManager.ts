import { observable, action, runInAction, IReactionDisposer, reaction, autorun } from "mobx";
import { Doc, Opt } from "../../new_fields/Doc";
import { DocumentView } from "../views/nodes/DocumentView";
import { FormattedTextBox } from "../views/nodes/FormattedTextBox";
import { NumCast, StrCast } from "../../new_fields/Types";
import { InkingControl } from "../views/InkingControl";

export namespace SelectionManager {

    class Manager {

        @observable IsDragging: boolean = false;
        @observable SelectedDocuments: Array<DocumentView> = [];


        @action
        SelectDoc(docView: DocumentView, ctrlPressed: boolean): void {
            // if doc is not in SelectedDocuments, add it
            if (manager.SelectedDocuments.indexOf(docView) === -1) {
                if (!ctrlPressed) {
                    this.DeselectAll();
                }

                manager.SelectedDocuments.push(docView);
                // console.log(manager.SelectedDocuments);
                docView.props.whenActiveChanged(true);
            } else if (!ctrlPressed && manager.SelectedDocuments.length > 1) {
                manager.SelectedDocuments.map(dv => dv !== docView && dv.props.whenActiveChanged(false));
                manager.SelectedDocuments = [docView];
            }
        }
        @action
        DeselectDoc(docView: DocumentView): void {
            let ind = manager.SelectedDocuments.indexOf(docView);
            if (ind !== -1) {
                manager.SelectedDocuments.splice(ind, 1);
                docView.props.whenActiveChanged(false);
            }
        }
        @action
        DeselectAll(): void {
            manager.SelectedDocuments.map(dv => dv.props.whenActiveChanged(false));
            manager.SelectedDocuments = [];
        }
    }

    const manager = new Manager();

    export function DeselectDoc(docView: DocumentView): void {
        manager.DeselectDoc(docView);
    }
    export function SelectDoc(docView: DocumentView, ctrlPressed: boolean): void {
        manager.SelectDoc(docView, ctrlPressed);
    }

    export function IsSelected(doc: DocumentView): boolean {
        return manager.SelectedDocuments.indexOf(doc) !== -1;
    }

    export function DeselectAll(except?: Doc): void {
        let found: DocumentView | undefined = undefined;
        if (except) {
            for (const view of manager.SelectedDocuments) {
                if (view.props.Document === except) found = view;
            }
        }

        manager.DeselectAll();
        if (found) manager.SelectDoc(found, false);
    }

    export function SetIsDragging(dragging: boolean) { runInAction(() => manager.IsDragging = dragging); }
    export function GetIsDragging() { return manager.IsDragging; }

    export function SelectedDocuments(): Array<DocumentView> {
        return manager.SelectedDocuments.slice();
    }
}
