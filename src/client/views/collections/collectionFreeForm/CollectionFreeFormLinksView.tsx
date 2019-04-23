import { computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { KeyStore } from "../../../../fields/KeyStore";
import { ListField } from "../../../../fields/ListField";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");

@observer
export class CollectionFreeFormLinksView extends React.Component<CollectionViewProps> {

    _brushReactionDisposer?: IReactionDisposer;
    componentDidMount() {
        this._brushReactionDisposer = reaction(() => this.props.Document.GetList(this.props.fieldKey, [] as Document[]).map(doc => doc.GetNumber(KeyStore.X, 0)),
            () => {
                let views = this.props.Document.GetList(this.props.fieldKey, [] as Document[]);
                for (let i = 0; i < views.length; i++) {
                    for (let j = 0; j < views.length; j++) {
                        let srcDoc = views[j];
                        let dstDoc = views[i];
                        let x1 = srcDoc.GetNumber(KeyStore.X, 0);
                        let x1w = srcDoc.GetNumber(KeyStore.Width, -1);
                        let x2 = dstDoc.GetNumber(KeyStore.X, 0);
                        let x2w = dstDoc.GetNumber(KeyStore.Width, -1);
                        if (x1w < 0 || x2w < 0 || i === j) {
                            continue;
                        }
                        let dstTarg = dstDoc;
                        let srcTarg = srcDoc;
                        let findBrush = (field: ListField<Document>) => field.Data.findIndex(brush => {
                            let bdocs = brush ? brush.GetList(KeyStore.BrushingDocs, [] as Document[]) : [];
                            return (bdocs.length && ((bdocs[0] === dstTarg && bdocs[1] === srcTarg)) ? true : false);
                        });
                        let brushAction = (field: ListField<Document>) => {
                            let found = findBrush(field);
                            if (found !== -1) {
                                console.log("REMOVE BRUSH " + srcTarg.Title + " " + dstTarg.Title);
                                field.Data.splice(found, 1);
                            }
                        };
                        if (Math.abs(x1 + x1w - x2) < 20) {
                            let linkDoc: Document = new Document();
                            linkDoc.SetText(KeyStore.Title, "Histogram Brush");
                            linkDoc.SetText(KeyStore.LinkDescription, "Brush between " + srcTarg.Title + " and " + dstTarg.Title);
                            linkDoc.SetData(KeyStore.BrushingDocs, [dstTarg, srcTarg], ListField);

                            brushAction = (field: ListField<Document>) => {
                                if (findBrush(field) === -1) {
                                    console.log("ADD BRUSH " + srcTarg.Title + " " + dstTarg.Title);
                                    (findBrush(field) === -1) && field.Data.push(linkDoc);
                                }
                            };
                        }
                        dstTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, brushAction);
                        srcTarg.GetOrCreateAsync(KeyStore.BrushingDocs, ListField, brushAction);

                    }
                }
            });
    }
    componentWillUnmount() {
        if (this._brushReactionDisposer) {
            this._brushReactionDisposer();
        }
    }
    documentAnchors(view: DocumentView) {
        let equalViews = [view];
        let containerDoc = view.props.Document.GetT(KeyStore.AnnotationOn, Document);
        if (containerDoc && containerDoc instanceof Document) {
            equalViews = DocumentManager.Instance.getDocumentViews(containerDoc.GetPrototype()!);
        }
        return equalViews.filter(sv => sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document === this.props.Document);
    }

    @computed
    get uniqueConnections() {
        let connections = DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
            let srcViews = this.documentAnchors(connection.a);
            let targetViews = this.documentAnchors(connection.b);
            let possiblePairs: { a: Document, b: Document, }[] = [];
            srcViews.map(sv => targetViews.map(tv => possiblePairs.push({ a: sv.props.Document, b: tv.props.Document })));
            possiblePairs.map(possiblePair =>
                drawnPairs.reduce((found, drawnPair) => {
                    let match = (possiblePair.a === drawnPair.a && possiblePair.b === drawnPair.b);
                    if (match && !drawnPair.l.reduce((found, link) => found || link.Id === connection.l.Id, false)) {
                        drawnPair.l.push(connection.l);
                    }
                    return match || found;
                }, false)
                ||
                drawnPairs.push({ a: possiblePair.a, b: possiblePair.b, l: [connection.l] })
            );
            return drawnPairs;
        }, [] as { a: Document, b: Document, l: Document[] }[]);
        return connections.map(c => <CollectionFreeFormLinkView key={Utils.GenerateGuid()} A={c.a} B={c.b} LinkDocs={c.l} />);
    }

    render() {
        return (
            <div className="collectionfreeformlinksview-container">
                <svg className="collectionfreeformlinksview-svgCanvas">
                    {this.uniqueConnections}
                </svg>
                {this.props.children}
            </div>
        );
    }
}