import { computed, IReactionDisposer, reaction } from "mobx";
import { observer } from "mobx-react";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { Doc } from "../../../../new_fields/Doc";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../new_fields/Types";
import { listSpec } from "../../../../new_fields/Schema";
import { List } from "../../../../new_fields/List";
import { Id } from "../../../../new_fields/RefField";

@observer
export class CollectionFreeFormLinksView extends React.Component<CollectionViewProps> {

    _brushReactionDisposer?: IReactionDisposer;
    componentDidMount() {
        this._brushReactionDisposer = reaction(() => Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), []).map(doc => NumCast(doc.x)),
            () => {
                let views = Cast(this.props.Document[this.props.fieldKey], listSpec(Doc), []).filter(doc => StrCast(doc.backgroundLayout, "").indexOf("istogram") !== -1);
                for (let i = 0; i < views.length; i++) {
                    for (let j = 0; j < views.length; j++) {
                        let srcDoc = views[j];
                        let dstDoc = views[i];
                        let x1 = NumCast(srcDoc.x);
                        let x1w = NumCast(srcDoc.width, -1);
                        let x2 = NumCast(dstDoc.x);
                        let x2w = NumCast(dstDoc.width, -1);
                        if (x1w < 0 || x2w < 0 || i === j) {
                            continue;
                        }
                        let dstTarg = dstDoc;
                        let srcTarg = srcDoc;
                        let findBrush = (field: List<Doc>) => field.findIndex(brush => {
                            let bdocs = brush ? Cast(brush.brushingDocs, listSpec(Doc), []) : [];
                            return (bdocs.length && ((bdocs[0] === dstTarg && bdocs[1] === srcTarg)) ? true : false);
                        });
                        let brushAction = (field: List<Doc>) => {
                            let found = findBrush(field);
                            if (found !== -1) {
                                console.log("REMOVE BRUSH " + srcTarg.Title + " " + dstTarg.Title);
                                field.splice(found, 1);
                            }
                        };
                        if (Math.abs(x1 + x1w - x2) < 20) {
                            let linkDoc: Doc = new Doc();
                            linkDoc.title = "Histogram Brush";
                            linkDoc.linkDescription = "Brush between " + StrCast(srcTarg.title) + " and " + StrCast(dstTarg.Title);
                            linkDoc.brushingDocs = new List([dstTarg, srcTarg]);

                            brushAction = (field: List<Doc>) => {
                                if (findBrush(field) === -1) {
                                    console.log("ADD BRUSH " + srcTarg.Title + " " + dstTarg.Title);
                                    (findBrush(field) === -1) && field.push(linkDoc);
                                }
                            };
                        }
                        let dstBrushDocs = Cast(dstTarg.brushingDocs, listSpec(Doc));
                        if (dstBrushDocs === undefined) {
                            dstTarg.brushingDocs = dstBrushDocs = new List();
                        }
                        let srcBrushDocs = Cast(srcTarg.brushingDocs, listSpec(Doc));
                        if (srcBrushDocs === undefined) {
                            srcTarg.brushingDocs = srcBrushDocs = new List();
                        }
                        brushAction(dstBrushDocs);
                        brushAction(srcBrushDocs);

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
        let containerDoc = FieldValue(Cast(view.props.Document.annotationOn, Doc));
        if (containerDoc) {
            equalViews = DocumentManager.Instance.getDocumentViews(containerDoc.proto!);
        }
        return equalViews.filter(sv => sv.props.ContainingCollectionView && sv.props.ContainingCollectionView.props.Document === this.props.Document);
    }

    @computed
    get uniqueConnections() {
        let connections = DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
            let srcViews = this.documentAnchors(connection.a);
            let targetViews = this.documentAnchors(connection.b);
            let possiblePairs: { a: Doc, b: Doc, }[] = [];
            srcViews.map(sv => targetViews.map(tv => possiblePairs.push({ a: sv.props.Document, b: tv.props.Document })));
            possiblePairs.map(possiblePair =>
                drawnPairs.reduce((found, drawnPair) => {
                    let match = (possiblePair.a === drawnPair.a && possiblePair.b === drawnPair.b);
                    if (match && !drawnPair.l.reduce((found, link) => found || link[Id] === connection.l[Id], false)) {
                        drawnPair.l.push(connection.l);
                    }
                    return match || found;
                }, false)
                ||
                drawnPairs.push({ a: possiblePair.a, b: possiblePair.b, l: [connection.l] })
            );
            return drawnPairs;
        }, [] as { a: Doc, b: Doc, l: Doc[] }[]);
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