import { computed } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../../fields/Doc";
import { Id } from "../../../../fields/FieldSymbols";
import { Utils } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinksView.scss";
import { CollectionFreeFormLinkView } from "./CollectionFreeFormLinkView";
import React = require("react");
import { DocumentType } from "../../../documents/DocumentTypes";

@observer
export class CollectionFreeFormLinksView extends React.Component {
    @computed get uniqueConnections() {
        const connections = DocumentManager.Instance.LinkedDocumentViews
            .filter(c => c.a.props.Document.type === DocumentType.LINK || c.b.props.Document.type === DocumentType.LINK)
            .reduce((drawnPairs, connection) => {
                const matchingPairs = drawnPairs.filter(pair => connection.a === pair.a && connection.b === pair.b);
                matchingPairs.forEach(drawnPair => drawnPair.l.add(connection.l));
                if (!matchingPairs.length) drawnPairs.push({ a: connection.a, b: connection.b, l: new Set<Doc>([connection.l]) });
                return drawnPairs;
            }, [] as { a: DocumentView, b: DocumentView, l: Set<Doc> }[]);
        const set = new Map<Doc, { a: DocumentView, b: DocumentView, l: Doc[] }>();
        connections.map(c => !set.has(Array.from(c.l)[0]) && set.set(Array.from(c.l)[0], { a: c.a, b: c.b, l: Array.from(c.l) }));
        return Array.from(set.values()).map(c => <CollectionFreeFormLinkView key={c.l[0][Id]} A={c.a} B={c.b} LinkDocs={c.l} />);
    }

    render() {
        return <div className="collectionfreeformlinksview-container">
            <svg className="collectionfreeformlinksview-svgCanvas">
                {this.uniqueConnections}
            </svg>
            {this.props.children}
        </div>;
    }
}