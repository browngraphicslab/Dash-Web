import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { BoolCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { InkingControl } from "../../InkingControl";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");

export interface CollectionFreeFormLinkViewProps {
    A: Doc;
    B: Doc;
    LinkDocs: Doc[];
    addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    removeDocument: (document: Doc) => boolean;
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {

    onPointerDown = (e: React.PointerEvent) => {
        if (e.button === 0 && !InkingControl.Instance.selectedTool) {
            let a = this.props.A;
            let b = this.props.B;
            let x1 = NumCast(a.x) + (BoolCast(a.isMinimized) ? 5 : a[WidthSym]() / 2);
            let y1 = NumCast(a.y) + (BoolCast(a.isMinimized) ? 5 : a[HeightSym]() / 2);
            let x2 = NumCast(b.x) + (BoolCast(b.isMinimized) ? 5 : b[WidthSym]() / 2);
            let y2 = NumCast(b.y) + (BoolCast(b.isMinimized) ? 5 : b[HeightSym]() / 2);
            // this.props.LinkDocs.map(l => {
            //     let width = l[WidthSym]();
            //     l.x = (x1 + x2) / 2 - width / 2;
            //     l.y = (y1 + y2) / 2 + 10;
            //     if (!this.props.removeDocument(l)) this.props.addDocument(l, false);
            // });
            e.stopPropagation();
            e.preventDefault();
        }
    }
    render() {
        // let l = this.props.LinkDocs;
        let a = this.props.A;
        let b = this.props.B;
        let x1 = NumCast(a.x) + (BoolCast(a.isMinimized, false) ? 5 : NumCast(a.width) / 2);
        let y1 = NumCast(a.y) + (BoolCast(a.isMinimized, false) ? 5 : NumCast(a.height) / 2);
        let x2 = NumCast(b.x) + (BoolCast(b.isMinimized, false) ? 5 : NumCast(b.width) / 2);
        let y2 = NumCast(b.y) + (BoolCast(b.isMinimized, false) ? 5 : NumCast(b.height) / 2);
        let text = "";
        // let first = this.props.LinkDocs[0];
        // if (this.props.LinkDocs.length === 1) text += first.title + (first.linkDescription ? "(" + StrCast(first.linkDescription) + ")" : "");
        // else text = "-multiple-";
        return (
            <>
                <line key="linkLine" className="collectionfreeformlinkview-linkLine"
                    style={{ strokeWidth: `${5}` }}
                    x1={`${x1}`} y1={`${y1}`}
                    x2={`${x2}`} y2={`${y2}`} />
                {/* <circle key="linkCircle" className="collectionfreeformlinkview-linkCircle"
                    cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={8} onPointerDown={this.onPointerDown} /> */}
                <text key="linkText" textAnchor="middle" className="collectionfreeformlinkview-linkText" x={`${(x1 + x2) / 2}`} y={`${(y1 + y2) / 2}`}>
                    {text}
                </text>
            </>
        );
    }
}