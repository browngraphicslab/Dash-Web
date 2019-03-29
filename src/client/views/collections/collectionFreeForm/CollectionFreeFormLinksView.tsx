import { computed, reaction, runInAction } from "mobx";
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
import { ListField } from "../../../../fields/ListField";
import { TextField } from "../../../../fields/TextField";
import { StyleConstants } from "../../../northstar/utils/StyleContants";

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
                    let x1w = srcDoc.GetNumber(KeyStore.Width, 0);
                    let x2 = dstDoc.GetNumber(KeyStore.X, 0);
                    let x2w = dstDoc.GetNumber(KeyStore.Width, 0);
                    if (Math.abs(x1 + x1w - x2) < 20 || Math.abs(x2 + x2w - x1) < 20) {
                        let linkDoc: Document = new Document();
                        dstDoc.GetTAsync(KeyStore.Prototype, Document).then((protoDest) =>
                            srcDoc.GetTAsync(KeyStore.Prototype, Document).then((protoSrc) => runInAction(() => {
                                linkDoc.Set(KeyStore.Title, new TextField("New Brush"));
                                linkDoc.Set(KeyStore.LinkDescription, new TextField(""));
                                linkDoc.Set(KeyStore.LinkTags, new TextField("Default"));
                                linkDoc.SetNumber(KeyStore.BackgroundColor, StyleConstants.BRUSH_COLORS[0]);

                                let dstTarg = (protoDest ? protoDest : dstDoc);
                                let srcTarg = (protoSrc ? protoSrc : srcDoc);
                                linkDoc.SetData(KeyStore.BrushingDocs, [dstTarg, srcTarg], ListField);
                                dstTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, field => { (field as ListField<Document>).Data.push(linkDoc) })
                                srcTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, field => { (field as ListField<Document>).Data.push(linkDoc) })
                            }))
                        )
                    } else {
                        dstDoc.GetTAsync(KeyStore.Prototype, Document).then((protoDest) =>
                            srcDoc.GetTAsync(KeyStore.Prototype, Document).then((protoSrc) => runInAction(() => {

                                let dstTarg = (protoDest ? protoDest : dstDoc);
                                let srcTarg = (protoSrc ? protoSrc : srcDoc);
                                dstTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, field => { (field as ListField<Document>).Data.length = 0 })
                                srcTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, field => { (field as ListField<Document>).Data.length = 0 })
                            }))
                        )
                    }
                }
            }
        });
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