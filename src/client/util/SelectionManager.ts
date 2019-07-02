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
            FormattedTextBox.InputBoxOverlay = undefined;
        }
    }

    const manager = new Manager();
    reaction(() => manager.SelectedDocuments, sel => {
        let targetColor = "#FFFFFF";
        if (sel.length > 0) {
            let firstView = sel[0];
            let doc = firstView.props.Document;
            let targetDoc = doc.isTemplate ? doc : Doc.GetProto(doc);
            let stored = StrCast(targetDoc.backgroundColor);
            stored.length > 0 && (targetColor = stored);
        }
        InkingControl.Instance.updateSelectedColor(targetColor);
    });

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
    export function ViewsSortedHorizontally(): DocumentView[] {
        let sorted = SelectionManager.SelectedDocuments().slice().sort((doc1, doc2) => {
            if (NumCast(doc1.props.Document.x) > NumCast(doc2.props.Document.x)) return 1;
            if (NumCast(doc1.props.Document.x) < NumCast(doc2.props.Document.x)) return -1;
            return 0;
        });
        return sorted;
    }
    export function ViewsSortedVertically(): DocumentView[] {
        let sorted = SelectionManager.SelectedDocuments().slice().sort((doc1, doc2) => {
            if (NumCast(doc1.props.Document.y) > NumCast(doc2.props.Document.y)) return 1;
            if (NumCast(doc1.props.Document.y) < NumCast(doc2.props.Document.y)) return -1;
            return 0;
        });
        return sorted;
    }
}
