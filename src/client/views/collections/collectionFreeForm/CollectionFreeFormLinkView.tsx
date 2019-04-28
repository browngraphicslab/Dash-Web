import { observer } from "mobx-react";
import { Document } from "../../../../fields/Document";
import { KeyStore } from "../../../../fields/KeyStore";
import { Utils } from "../../../../Utils";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { InkingControl } from "../../InkingControl";

export interface CollectionFreeFormLinkViewProps {
    A: Document;
    B: Document;
    LinkDocs: Document[];
    addDocument: (document: Document, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Document) => boolean;
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {

    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0 && !InkingControl.Instance.selectedTool) {
            let a = this.props.A;
            let b = this.props.B;
            let x1 = a.GetNumber(KeyStore.X, 0) + (a.GetBoolean(KeyStore.IsMinimized, false) ? 5 : a.Width() / 2);
            let y1 = a.GetNumber(KeyStore.Y, 0) + (a.GetBoolean(KeyStore.IsMinimized, false) ? 5 : a.Height() / 2);
            let x2 = b.GetNumber(KeyStore.X, 0) + (b.GetBoolean(KeyStore.IsMinimized, false) ? 5 : b.Width() / 2);
            let y2 = b.GetNumber(KeyStore.Y, 0) + (b.GetBoolean(KeyStore.IsMinimized, false) ? 5 : b.Height() / 2);
            this.props.LinkDocs.map(l => {
                let width = l.GetNumber(KeyStore.Width, 0);
                l.SetNumber(KeyStore.X, (x1 + x2) / 2 - width / 2);
                l.SetNumber(KeyStore.Y, (y1 + y2) / 2 + 10);
                if (!this.props.removeDocument(l)) this.props.addDocument(l, false);
            });
            e.stopPropagation();
            e.preventDefault();
        }
    }
    render() {
        let l = this.props.LinkDocs;
        let a = this.props.A;
        let b = this.props.B;
        let x1 = a.GetNumber(KeyStore.X, 0) + (a.GetBoolean(KeyStore.IsMinimized, false) ? 5 : a.Width() / 2);
        let y1 = a.GetNumber(KeyStore.Y, 0) + (a.GetBoolean(KeyStore.IsMinimized, false) ? 5 : a.Height() / 2);
        let x2 = b.GetNumber(KeyStore.X, 0) + (b.GetBoolean(KeyStore.IsMinimized, false) ? 5 : b.Width() / 2);
        let y2 = b.GetNumber(KeyStore.Y, 0) + (b.GetBoolean(KeyStore.IsMinimized, false) ? 5 : b.Height() / 2);
        return (
            <>
                <line key={Utils.GenerateGuid()} className="collectionfreeformlinkview-linkLine"
                    style={{ strokeWidth: `${l.length * 5}` }}
                    x1={`${x1}`} y1={`${y1}`}
                    x2={`${x2}`} y2={`${y2}`} />
                <circle key={Utils.GenerateGuid()} className="collectionfreeformlinkview-linkLine"
                    cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={10} onPointerDown={this.onPointerDown} />
            </>
        );
    }
}