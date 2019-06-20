import { computed, IReactionDisposer, reaction, action } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { List } from "../../../../new_fields/List";
import { listSpec } from "../../../../new_fields/Schema";
import { Cast, FieldValue, NumCast, StrCast } from "../../../../new_fields/Types";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import { CollectionViewProps } from "../CollectionSubView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { CollectionFreeFormLinkWithProxyView } from "./CollectionFreeFormLinkWithProxyView";
import { Docs } from "../../../documents/Documents";
import { LinkButtonField } from "../../../../new_fields/LinkButtonField";
import { LinkManager } from "../../../util/LinkManager";

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

    // @computed
    // get uniqueConnections() {
    //     // console.log("\n");
    //     let connections = DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
    //         // console.log("CONNECTION BETWEEN", StrCast(connection.anchor1View.props.Document.title), StrCast(connection.anchor2View.props.Document.title));
    //         let srcViews = this.documentAnchors(connection.anchor1View);
    //         // srcViews.forEach(sv => {
    //         //     console.log("DOCANCHORS SRC", StrCast(connection.anchor1View.Document.title), StrCast(sv.Document.title));
    //         // });

    //         let targetViews = this.documentAnchors(connection.anchor2View);
    //         // targetViews.forEach(sv => {
    //         //     console.log("DOCANCHORS TARG", StrCast(connection.anchor2View.Document.title), StrCast(sv.Document.title));
    //         // });

    //         // console.log("lengths", srcViews.length, targetViews.length);

    //         // srcViews.forEach(v => {
    //         //     console.log("SOURCE VIEW", StrCast(v.props.Document.title));
    //         // });
    //         // targetViews.forEach(v => {
    //         //     console.log("TARGET VIEW", StrCast(v.Document.title));
    //         // });

    //         let possiblePairs: { anchor1: Doc, anchor2: Doc }[] = [];
    //         // srcViews.map(sv => {
    //         //     console.log("SOURCE VIEW", StrCast(sv.props.Document.title));
    //         //     targetViews.map(tv => {
    //         //         console.log("TARGET VIEW", StrCast(tv.props.Document.title));
    //         //         // console.log("PUSHING PAIR", StrCast(sv.props.Document.title), StrCast(tv.props.Document.title));
    //         //         possiblePairs.push({ anchor1: sv.props.Document, anchor2: tv.props.Document });
    //         //     });
    //         //     console.log("END\n");
    //         // });
    //         srcViews.forEach(sv => {
    //             // console.log("SOURCE VIEW", StrCast(sv.props.Document.title));
    //             targetViews.forEach(tv => {
    //                 // console.log("TARGET VIEW", StrCast(tv.props.Document.title));
    //                 // console.log("PUSHING PAIR", StrCast(sv.props.Document.title), StrCast(tv.props.Document.title));
    //                 possiblePairs.push({ anchor1: sv.props.Document, anchor2: tv.props.Document });
    //             });
    //             // console.log("END\n");
    //         });
    //         // console.log("POSSIBLE PAIRS LENGTH", possiblePairs.length);
    //         possiblePairs.map(possiblePair => {
    //             // console.log("POSSIBLEPAIR", StrCast(possiblePair.anchor1.title), StrCast(possiblePair.anchor2.title));
    //             if (!drawnPairs.reduce((found, drawnPair) => {
    //                 let match1 = (Doc.AreProtosEqual(possiblePair.anchor1, drawnPair.anchor1) && Doc.AreProtosEqual(possiblePair.anchor2, drawnPair.anchor2));
    //                 let match2 = (Doc.AreProtosEqual(possiblePair.anchor1, drawnPair.anchor2) && Doc.AreProtosEqual(possiblePair.anchor2, drawnPair.anchor1));
    //                 let match = match1 || match2;
    //                 if (match && !drawnPair.linkDocs.reduce((found, link) => found || link[Id] === connection.linkDoc[Id], false)) {
    //                     drawnPair.linkDocs.push(connection.linkDoc);
    //                 }
    //                 return match || found;
    //             }, false)) {
    //                 drawnPairs.push({ anchor1: possiblePair.anchor1, anchor2: possiblePair.anchor2, linkDocs: [connection.linkDoc] });
    //             }
    //         });
    //         return drawnPairs;
    //     }, [] as { anchor1: Doc, anchor2: Doc, linkDocs: Doc[] }[]);
    //     return connections.map(c => {
    //         let x = c.linkDocs.reduce((p, l) => p + l[Id], "");
    //         return <CollectionFreeFormLinkView key={x} anchor1={c.anchor1} anchor2={c.anchor2} />;
    //     });
    // }

    findUniquePairs = (): JSX.Element[] => {
        let connections = DocumentManager.Instance.LinkedDocumentViews;

        let unique: Set<{ sourceView: DocumentView, targetView: DocumentView, linkDoc: Doc }> = new Set();
        connections.forEach(c => {

            // let match1Index = unique.findIndex(u => (c.anchor1View === u.sourceView) && (c.anchor2View === u.targetView));
            // let match2Index = unique.findIndex(u => (c.anchor1View === u.targetView) && (c.anchor2View === u.sourceView));
            let match1 = unique.has({ sourceView: c.anchor1View, targetView: c.anchor2View, linkDoc: c.linkDoc });
            let match2 = unique.has({ sourceView: c.anchor2View, targetView: c.anchor1View, linkDoc: c.linkDoc });
            let sameContext = c.anchor1View.props.ContainingCollectionView === c.anchor2View.props.ContainingCollectionView;

            // console.log("CONNECTION", StrCast(c.anchor1View.props.Document.title), StrCast(c.anchor2View.props.Document.title), match1, match2);


            // if in same context, push if docview pair does not already exist
            // else push both directions of pair
            if (sameContext) {
                if (!(match1 || match2)) unique.add({ sourceView: c.anchor1View, targetView: c.anchor2View, linkDoc: c.linkDoc });
            } else {
                unique.add({ sourceView: c.anchor1View, targetView: c.anchor2View, linkDoc: c.linkDoc });
                unique.add({ sourceView: c.anchor2View, targetView: c.anchor1View, linkDoc: c.linkDoc });
            }
        });

        let uniqueList: JSX.Element[] = [];
        unique.forEach(u => {
            // TODO: make better key
            let key = StrCast(u.sourceView.Document[Id]) + "-link-" + StrCast(u.targetView.Document[Id]) + "-" + Date.now() + Math.random();
            let sourceIn = u.sourceView.props.ContainingCollectionView ? u.sourceView.props.ContainingCollectionView.props.Document === this.props.Document : false;
            let targetIn = u.targetView.props.ContainingCollectionView ? u.targetView.props.ContainingCollectionView.props.Document === this.props.Document : false;
            let sameContext = u.sourceView.props.ContainingCollectionView === u.targetView.props.ContainingCollectionView;
            let inContainer = sameContext ? sourceIn || targetIn : sourceIn;

            if (inContainer) {
                // let alias = Doc.MakeAlias(proxy);
                if (sameContext) {
                    uniqueList.push(<CollectionFreeFormLinkView key={key} sourceView={u.sourceView} targetView={u.targetView} />);
                } else {
                    let proxy = LinkManager.Instance.findLinkProxy(StrCast(u.sourceView.props.Document[Id]), StrCast(u.targetView.props.Document[Id]));
                    if (!proxy) {
                        proxy = Docs.LinkButtonDocument(
                            { sourceViewId: StrCast(u.sourceView.props.Document[Id]), targetViewId: StrCast(u.targetView.props.Document[Id]) },
                            { width: 200, height: 100, borderRounding: 0 });
                        let proxy1Proto = Doc.GetProto(proxy);
                        proxy1Proto.sourceViewId = StrCast(u.sourceView.props.Document[Id]);
                        proxy1Proto.targetViewId = StrCast(u.targetView.props.Document[Id]);
                        proxy1Proto.isLinkButton = true;

                        // LinkManager.Instance.linkProxies.push(proxy);
                        LinkManager.Instance.addLinkProxy(proxy);
                    }
<<<<<<< HEAD
                    uniqueList.push(<CollectionFreeFormLinkWithProxyView key={key} sourceView={u.sourceView} targetView={u.targetView} proxyDoc={proxy} />);

                    // let proxy = LinkManager.Instance.findLinkProxy(StrCast(u.sourceView.props.Document[Id]), StrCast(u.targetView.props.Document[Id]));
                    // if (proxy) {
                    //     this.props.addDocument(proxy, false);
                    //     uniqueList.push(<CollectionFreeFormLinkWithProxyView key={key} sourceView={u.sourceView} targetView={u.targetView} />);
                    // }
                    // let proxyKey = Doc.AreProtosEqual(u.sourceView.Document, Cast(u.linkDoc.anchor1, Doc, new Doc)) ? "proxy1" : "proxy2";
                    // let proxy = Cast(u.linkDoc[proxyKey], Doc, new Doc);
                    // this.props.addDocument(proxy, false);

                    // uniqueList.push(<CollectionFreeFormLinkWithProxyView key={key} sourceView={u.sourceView} targetView={u.targetView}
                    //     proxyDoc={proxy} addDocTab={this.props.addDocTab} />);
=======
                    return match || found;
                }, false)) {
                    drawnPairs.push({ a: possiblePair.a, b: possiblePair.b, l: [connection.l] });
>>>>>>> e9d62f4ca0dbeb57e46239047041a8a04da7b504
                }
            }
        });
        return uniqueList;
    }

    render() {
        this.findUniquePairs();
        return (
            <div className="collectionfreeformlinksview-container">
                <svg className="collectionfreeformlinksview-svgCanvas">
                    {/* {this.uniqueConnections} */}
                    {this.findUniquePairs()}
                </svg>
                {this.props.children}
            </div>
        );
    }
}