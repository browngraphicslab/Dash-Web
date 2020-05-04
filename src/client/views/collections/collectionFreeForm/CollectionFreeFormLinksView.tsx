import { computed } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../../new_fields/Doc";
import { Id } from "../../../../new_fields/FieldSymbols";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { Utils, emptyFunction } from "../../../../Utils";
import { DocumentType } from "../../../documents/DocumentTypes";
import { DragManager } from "../../../util/DragManager";

@observer
export class CollectionFreeFormLinksView extends React.Component {
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
        return connections.filter(c =>
            c.a.props.Document.type === DocumentType.LINK &&
            c.a.props.bringToFront !== emptyFunction && c.b.props.bringToFront !== emptyFunction // bcz: this prevents links to be drawn to anchors in CollectionTree views -- this is a hack that should be fixed
        ).map(c => <CollectionFreeFormLinkView key={Utils.GenerateGuid()} A={c.a} B={c.b} LinkDocs={c.l} />);
    }

    render() {
        return DragManager.Vals.Instance.GetIsDragging() ? (null) : <div className="collectionfreeformlinksview-container">
            <svg className="collectionfreeformlinksview-svgCanvas">
                {this.uniqueConnections}
            </svg>
            {this.props.children}
        </div>;
    }
}