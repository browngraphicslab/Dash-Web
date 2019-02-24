import { observer } from "mobx-react";
import { CollectionViewBase } from "./CollectionViewBase";
import { Document } from "../../../fields/Document";
import { KeyStore } from "../../../fields/KeyStore";
import { ListField } from "../../../fields/ListField";

@observer
export class CollectionTreeView extends CollectionViewBase {

    test = () => {
        var children = this.props.Document.GetT<ListField<Document>>(KeyStore.Data, ListField);
        if (children != null) {
            console.log("\nNumber of Children: " + children);
        }
        return "HELLO WORLD";
    }

    render() {
        return { test };
    }
}