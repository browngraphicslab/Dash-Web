import { computed, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { FieldWaiting } from "../../../../fields/Field";
import { KeyStore } from "../../../../fields/KeyStore";
import { ListField } from "../../../../fields/ListField";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionViewBase";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import v5 = require("uuid/v5");

@observer
export class CollectionFreeFormLinksView extends React.Component<CollectionViewProps> {

    componentDidMount() {
        reaction(() => {
            return DocumentManager.Instance.getAllDocumentViews(this.props.Document).map(dv => dv.props.Document.GetNumber(KeyStore.X, 0))
        }, () => {
            let views = DocumentManager.Instance.getAllDocumentViews(this.props.Document);
            for (let i = 0; i < views.length; i++) {
                for (let j = i + 1; j < views.length; j++) {
                    let srcDoc = views[j].props.Document;
                    let dstDoc = views[i].props.Document;
                    let x1 = srcDoc.GetNumber(KeyStore.X, 0);
                    let x1w = srcDoc.GetNumber(KeyStore.Width, -1);
                    let x2 = dstDoc.GetNumber(KeyStore.X, 0);
                    let x2w = dstDoc.GetNumber(KeyStore.Width, -1);
                    if (x1w < 0 || x2w < 0)
                        continue;
                    dstDoc.GetTAsync(KeyStore.Prototype, Document).then((protoDest) =>
                        srcDoc.GetTAsync(KeyStore.Prototype, Document).then((protoSrc) => runInAction(() => {
                            let dstTarg = (protoDest ? protoDest : dstDoc);
                            let srcTarg = (protoSrc ? protoSrc : srcDoc);
                            let findBrush = (field: ListField<Document>) => field.Data.findIndex(brush => {
                                let bdocs = brush.GetList(KeyStore.BrushingDocs, [] as Document[]);
                                return (bdocs.length == 0 || (bdocs[0] == dstTarg && bdocs[1] == srcTarg) || (bdocs[0] == srcTarg && bdocs[1] == dstTarg))
                            });
                            let brushAction = (field: ListField<Document>) => {
                                let found = findBrush(field);
                                if (found != -1)
                                    field.Data.splice(found, 1);
                            };
                            if (Math.abs(x1 + x1w - x2) < 20 || Math.abs(x2 + x2w - x1) < 20) {
                                let linkDoc: Document = new Document();
                                linkDoc.SetText(KeyStore.Title, "Histogram Brush");
                                linkDoc.SetText(KeyStore.LinkDescription, "Brush between " + srcTarg.Title + " and " + dstTarg.Title);
                                linkDoc.SetData(KeyStore.BrushingDocs, [dstTarg, srcTarg], ListField);

                                brushAction = brushAction = (field: ListField<Document>) => (findBrush(field) == -1) && field.Data.push(linkDoc);
                            }
                            dstTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, brushAction);
                            srcTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, brushAction);
                        }
                        )))
                }
            }
        })
    }
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