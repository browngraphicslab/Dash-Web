import { computed } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { FieldWaiting } from "../../../../fields/Field";
import { KeyStore } from "../../../../fields/KeyStore";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionViewBase";
import "./CollectionFreeFormLinksView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";

@observer
export class CollectionFreeFormLinksView extends React.Component<CollectionViewProps> {

    documentAnchors(view: DocumentView) {
        let equalViews = [view];
        let containerDoc = view.props.Document.GetT(KeyStore.AnnotationOn, Document);
        if (containerDoc && containerDoc != FieldWaiting && containerDoc instanceof Document) {
            equalViews = DocumentManager.Instance.getDocumentViews(containerDoc.GetPrototype() as Document)
        }
        return equalViews.filter(sv => sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document == this.props.Document);
    }

    @computed
    get uniqueConnections() {
        return DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
            let srcViews = this.documentAnchors(connection.a);
            let targetViews = this.documentAnchors(connection.b);
            let possiblePairs: { a: Document, b: Document, }[] = [];
            srcViews.map(sv => targetViews.map(tv => possiblePairs.push({ a: sv.props.Document, b: tv.props.Document })));
            possiblePairs.map(possiblePair => {
                if (!drawnPairs.reduce((found, drawnPair) => {
                    let match = (possiblePair.a == drawnPair.a && possiblePair.b == drawnPair.b);
                    if (match) {
                        if (!drawnPair.l.reduce((found, link) => found || link.Id == connection.l.Id, false))
                            drawnPair.l.push(connection.l);
                    }
                    return match || found;
                }, false)) {
                    drawnPairs.push({ a: possiblePair.a, b: possiblePair.b, l: [connection.l] as Document[] });
                }
            })
            return drawnPairs
        }, [] as { a: Document, b: Document, l: Document[] }[]);
    }

    render() {
        return (
            <svg className="collectionfreeformlinksview-svgCanvas">
                {this.uniqueConnections.map(c => <CollectionFreeFormLinkView key={Utils.GenerateGuid()} A={c.a} B={c.b} LinkDocs={c.l} />)}
            </svg>);
    }
}