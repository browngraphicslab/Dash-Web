import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { KeyStore } from "../../../../fields/KeyStore";
import { Utils } from "../../../../Utils";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");

export interface CollectionFreeFormLinkViewProps {
    A: Document;
    B: Document;
    LinkDocs: Document[];
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {

    onPointerDown = (e: React.PointerEvent) => {
        this.props.LinkDocs.map(l =>
            console.log("Link:" + l.Title));
    }
    render() {
        let l = this.props.LinkDocs;
        let a = this.props.A;
        let b = this.props.B;
        let x1 = a.GetNumber(KeyStore.X, 0) + (a.GetBoolean(KeyStore.Minimized, false) ? 5 : a.GetNumber(KeyStore.Width, 0) / 2);
        let y1 = a.GetNumber(KeyStore.Y, 0) + (a.GetBoolean(KeyStore.Minimized, false) ? 5 : a.GetNumber(KeyStore.Height, 0) / 2);
        let x2 = b.GetNumber(KeyStore.X, 0) + (b.GetBoolean(KeyStore.Minimized, false) ? 5 : b.GetNumber(KeyStore.Width, 0) / 2);
        let y2 = b.GetNumber(KeyStore.Y, 0) + (b.GetBoolean(KeyStore.Minimized, false) ? 5 : b.GetNumber(KeyStore.Height, 0) / 2);
        return (
            <line key={Utils.GenerateGuid()} className="collectionfreeformlinkview-linkLine" onPointerDown={this.onPointerDown}
                style={{ strokeWidth: `${l.length * 5}` }}
                x1={`${x1}`} y1={`${y1}`}
                x2={`${x2}`} y2={`${y2}`} />
        )
    }
}