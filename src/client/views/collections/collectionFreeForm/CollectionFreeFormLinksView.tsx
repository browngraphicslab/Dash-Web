import { computed, IReactionDisposer } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { Utils } from "../../../../Utils";
import { SelectionManager } from "../../../util/SelectionManager";
import { DocumentType } from "../../../documents/DocumentTypes";
import { StrCast } from "../../../../new_fields/Types";

@observer
export class CollectionFreeFormLinksView extends React.Component {

    _brushReactionDisposer?: IReactionDisposer;
    componentDidMount() {
        // this._brushReactionDisposer = reaction(
        //     () => {
        //         let doclist = DocListCast(this.props.Document[this.props.fieldKey]);
        //         return { doclist: doclist ? doclist : [], xs: doclist.map(d => d.x) };
        //     },
        //     () => {
        //         let doclist = DocListCast(this.props.Document[this.props.fieldKey]);
        //         let views = doclist ? doclist.filter(doc => StrCast(doc.backgroundLayout).indexOf("istogram") !== -1) : [];
        //         views.forEach((dstDoc, i) => {
        //             views.forEach((srcDoc, j) => {
        //                 let dstTarg = dstDoc;
        //                 let srcTarg = srcDoc;
        //                 let x1 = NumCast(srcDoc.x);
        //                 let x2 = NumCast(dstDoc.x);
        //                 let x1w = NumCast(srcDoc.width, -1);
        //                 let x2w = NumCast(dstDoc.width, -1);
        //                 if (x1w < 0 || x2w < 0 || i === j) { }
        //                 else {
        //                     let findBrush = (field: (Doc | Promise<Doc>)[]) => field.findIndex(brush => {
        //                         let bdocs = brush instanceof Doc ? Cast(brush.brushingDocs, listSpec(Doc), []) : undefined;
        //                         return bdocs && bdocs.length && ((bdocs[0] === dstTarg && bdocs[1] === srcTarg)) ? true : false;
        //                     });
        //                     let brushAction = (field: (Doc | Promise<Doc>)[]) => {
        //                         let found = findBrush(field);
        //                         if (found !== -1) {
        //                             field.splice(found, 1);
        //                         }
        //                     };
        //                     if (Math.abs(x1 + x1w - x2) < 20) {
        //                         let linkDoc: Doc = new Doc();
        //                         linkDoc.title = "Histogram Brush";
        //                         linkDoc.linkDescription = "Brush between " + StrCast(srcTarg.title) + " and " + StrCast(dstTarg.Title);
        //                         linkDoc.brushingDocs = new List([dstTarg, srcTarg]);

        //                         brushAction = (field: (Doc | Promise<Doc>)[]) => {
        //                             if (findBrush(field) === -1) {
        //                                 field.push(linkDoc);
        //                             }
        //                         };
        //                     }
        //                     if (dstTarg.brushingDocs === undefined) dstTarg.brushingDocs = new List<Doc>();
        //                     if (srcTarg.brushingDocs === undefined) srcTarg.brushingDocs = new List<Doc>();
        //                     let dstBrushDocs = Cast(dstTarg.brushingDocs, listSpec(Doc), []);
        //                     let srcBrushDocs = Cast(srcTarg.brushingDocs, listSpec(Doc), []);
        //                     brushAction(dstBrushDocs);
        //                     brushAction(srcBrushDocs);
        //                 }
        //             });
        //         });
        //     });
    }
    componentWillUnmount() {
        this._brushReactionDisposer && this._brushReactionDisposer();
    }
    @computed
    get uniqueConnections() {
        const connections = DocumentManager.Instance.LinkedDocumentViews.reduce((drawnPairs, connection) => {
            if (!drawnPairs.reduce((found, drawnPair) => {
                const match1 = (connection.a === drawnPair.a && connection.b === drawnPair.b);
                const match2 = (connection.a === drawnPair.b && connection.b === drawnPair.a);
                const match = match1 || match2;
                if (match && !drawnPair.l.reduce((found, link) => found || link[Id] === connection.l[Id], false)) {
                    drawnPair.l.push(connection.l);
                }
                return match || found;
            }, false)) {
                drawnPairs.push({ a: connection.a, b: connection.b, l: [connection.l] });
            }
            return drawnPairs;
        }, [] as { a: DocumentView, b: DocumentView, l: Doc[] }[]);
        return connections.filter(c => c.a.props.Document.type === DocumentType.LINK && StrCast(c.a.props.Document.layout).includes("DocuLinkBox")) // get rid of the filter to show links to documents in addition to document anchors
            .map(c => <CollectionFreeFormLinkView key={Utils.GenerateGuid()} A={c.a} B={c.b} LinkDocs={c.l} />);
    }

    render() {
        return <div className="collectionfreeformlinksview-container">
            <svg className="collectionfreeformlinksview-svgCanvas">
                {SelectionManager.GetIsDragging() ? (null) : this.uniqueConnections}
            </svg>
            {this.props.children}
        </div>;
    }
}