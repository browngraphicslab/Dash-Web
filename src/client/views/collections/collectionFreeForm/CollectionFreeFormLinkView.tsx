import { observer } from "mobx-react";
import { Utils } from "../../../../Utils";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { StrCast, NumCast, BoolCast } from "../../../../new_fields/Types";
import { Doc } from "../../../../new_fields/Doc";

export interface CollectionFreeFormLinkViewProps {
    A: Doc;
    B: Doc;
    LinkDocs: Doc[];
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {

    onPointerDown = (e: React.PointerEvent) => {
        this.props.LinkDocs.map(l =>
            console.log("Link:" + StrCast(l.title)));
    }
    render() {
        let l = this.props.LinkDocs;
        let a = this.props.A;
        let b = this.props.B;
        let x1 = NumCast(a.x) + (BoolCast(a.isMinimized, false) ? 5 : NumCast(a.width) / 2);
        let y1 = NumCast(a.y) + (BoolCast(a.isMinimized, false) ? 5 : NumCast(a.height) / 2);
        let x2 = NumCast(b.x) + (BoolCast(b.isMinimized, false) ? 5 : NumCast(b.width) / 2);
        let y2 = NumCast(b.y) + (BoolCast(b.isMinimized, false) ? 5 : NumCast(b.height) / 2);
        return (
            <line key={Utils.GenerateGuid()} className="collectionfreeformlinkview-linkLine" onPointerDown={this.onPointerDown}
                style={{ strokeWidth: `${l.length * 5}` }}
                x1={`${x1}`} y1={`${y1}`}
                x2={`${x2}`} y2={`${y2}`} />
        );
    }
}