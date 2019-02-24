import { observer } from "mobx-react";
import { CollectionViewBase } from "./CollectionViewBase";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/Key";
import { ListField } from "../../../fields/ListField";

@observer
export class CollectionTreeView extends CollectionViewBase {

    public static makeTreeView(document: Document) {
        var children = document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children != null) {
            console.log("\nNumber of Children: " + children);
        }
    }

    render() {
        return "HELLO WORLD";
    }
}