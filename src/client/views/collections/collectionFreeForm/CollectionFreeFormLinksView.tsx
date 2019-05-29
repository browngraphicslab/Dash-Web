import { computed, IReactionDisposer, reaction, trace } from "mobx";
import { observer } from "mobx-react";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { Doc, DocListCastAsync, DocListCast } from "../../../../new_fields/Doc";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../new_fields/Types";
import { listSpec } from "../../../../new_fields/Schema";
import { List } from "../../../../new_fields/List";
import { Id } from "../../../../new_fields/FieldSymbols";

@observer
export class CollectionFreeFormLinksView extends React.Component<CollectionViewProps> {

    _brushReactionDisposer?: IReactionDisposer;
    componentDidMount() {
        this._brushReactionDisposer = reaction(
            () => {
                let doclist = DocListCast(this.props.Document[this.props.fieldKey]);
                return { doclist: doclist ? doclist : [], xs: doclist.map(d => d.x) };
            },
            () => {
                let doclist = DocListCast(this.props.Document[this.props.fieldKey]);
                let views = doclist ? doclist.filter(doc => StrCast(doc.backgroundLayout).indexOf("istogram") !== -1) : [];
                views.forEach((dstDoc, i) => {
                    views.forEach((srcDoc, j) => {
                        let dstTarg = dstDoc;
                        let srcTarg = srcDoc;
                        let x1 = NumCast(srcDoc.x);
                        let x2 = NumCast(dstDoc.x);
                        let x1w = NumCast(srcDoc.width, -1) / NumCast(srcDoc.zoomBasis, 1);
                        let x2w = NumCast(dstDoc.width, -1) / NumCast(srcDoc.zoomBasis, 1);
                        if (x1w < 0 || x2w < 0 || i === j) { }
                        else {
                            let findBrush = (field: (Doc | Promise<Doc>)[]) => field.findIndex(brush => {
                                let bdocs = brush instanceof Doc ? Cast(brush.brushingDocs, listSpec(Doc), []) : undefined;
                                return bdocs && bdocs.length && ((bdocs[0] === dstTarg && bdocs[1] === srcTarg)) ? true : false;
                            });
                            let brushAction = (field: (Doc | Promise<Doc>)[]) => {
                                let found = findBrush(field);
                                if (found !== -1) {
                                    console.log("REMOVE BRUSH " + srcTarg.title + " " + dstTarg.title);
                                    field.splice(found, 1);
                                }
                            };
                            if (Math.abs(x1 + x1w - x2) < 20) {
                                let linkDoc: Doc = new Doc();
                                linkDoc.title = "Histogram Brush";
                                linkDoc.linkDescription = "Brush between " + StrCast(srcTarg.title) + " and " + StrCast(dstTarg.Title);
                                linkDoc.brushingDocs = new List([dstTarg, srcTarg]);

                                brushAction = (field: (Doc | Promise<Doc>)[]) => {
                                    if (findBrush(field) === -1) {
                                        console.log("ADD BRUSH " + srcTarg.title + " " + dstTarg.title);
                                        field.push(linkDoc);
                                    }
                                };
                            }
                            if (dstTarg.brushingDocs === undefined) dstTarg.brushingDocs = new List<Doc>();
                            if (srcTarg.brushingDocs === undefined) srcTarg.brushingDocs = new List<Doc>();
                            let dstBrushDocs = Cast(dstTarg.brushingDocs, listSpec(Doc), []);
                            let srcBrushDocs = Cast(srcTarg.brushingDocs, listSpec(Doc), []);
                            brushAction(dstBrushDocs);
                            brushAction(srcBrushDocs);
                        }
                    });
                });
            });
    }
    componentWillUnmount() {
        if (this._brushReactionDisposer) {
            this._brushReactionDisposer();
        }
    }
    documentAnchors(view: DocumentView) {
        let equalViews = [view];
        let containerDoc = FieldValue(Cast(view.props.Document.annotationOn, Doc));
        if (containerDoc) {
            equalViews = DocumentManager.Instance.getDocumentViews(containerDoc.proto!);
        }
        if (view.props.ContainingCollectionView) {
            let collid = view.props.ContainingCollectionView.props.Document[Id];
            DocListCast(this.props.Document[this.props.fieldKey]).
                filter(child =>
                    child[Id] === collid).map(view =>
                        DocumentManager.Instance.getDocumentViews(view).map(view =>
                            equalViews.push(view)));
        }
        return equalViews.filter(sv => sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document === this.props.Document);
    }

    @computed
    get uniqueConnections() {
        console.log("-----");
        let connections = DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
            let srcViews = this.documentAnchors(connection.a);
            let targetViews = this.documentAnchors(connection.b);
            let possiblePairs: { a: Doc, b: Doc, }[] = [];
            srcViews.map(sv => targetViews.map(tv => possiblePairs.push({ a: sv.props.Document, b: tv.props.Document })));
            possiblePairs.map(possiblePair => {
                if (!drawnPairs.reduce((found, drawnPair) => {
                    let match1 = (Doc.AreProtosEqual(possiblePair.a, drawnPair.a) && Doc.AreProtosEqual(possiblePair.b, drawnPair.b));
                    let match2 = (Doc.AreProtosEqual(possiblePair.a, drawnPair.b) && Doc.AreProtosEqual(possiblePair.b, drawnPair.a));
                    let match = match1 || match2;
                    if (match && !drawnPair.l.reduce((found, link) => found || link[Id] === connection.l[Id], false)) {
                        drawnPair.l.push(connection.l);
                    }
                    return match || found;
                }, false)) {
                    console.log("A" + possiblePair.a[Id] + " B" + possiblePair.b[Id] + " L" + connection.l[Id]);
                    drawnPairs.push({ a: possiblePair.a, b: possiblePair.b, l: [connection.l] })
                }
            });
            return drawnPairs;
        }, [] as { a: Doc, b: Doc, l: Doc[] }[]);
        return connections.map(c => {
            let x = c.l.reduce((p, l) => p + l[Id], "");
            return <CollectionFreeFormLinkView key={x} A={c.a} B={c.b} LinkDocs={c.l}
                removeDocument={this.props.removeDocument} addDocument={this.props.addDocument} />;
        });
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