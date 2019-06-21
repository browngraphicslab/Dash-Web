import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { BoolCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { InkingControl } from "../../InkingControl";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentView } from "../../nodes/DocumentView";
import { Docs } from "../../../documents/Documents";

export interface CollectionFreeFormLinkViewProps {
    // anchor1: Doc;
    // anchor2: Doc;
    // LinkDocs: Doc[];
    // addDocument: (document: Doc, allowDuplicates?: boolean) => boolean;
    // removeDocument: (document: Doc) => boolean;
    // sameContext: boolean;

    // sourceView: DocumentView;
    // targetView: DocumentView;
    sourceView: Doc;
    targetView: Doc;
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {

    // onPointerDown = (e: React.PointerEvent) => {
    //     if (e.button === 0 && !InkingControl.Instance.selectedTool) {
    //         let a = this.props.A;
    //         let b = this.props.B;
    //         let x1 = NumCast(a.x) + (BoolCast(a.isMinimized, false) ? 5 : a[WidthSym]() / 2);
    //         let y1 = NumCast(a.y) + (BoolCast(a.isMinimized, false) ? 5 : a[HeightSym]() / 2);
    //         let x2 = NumCast(b.x) + (BoolCast(b.isMinimized, false) ? 5 : b[WidthSym]() / 2);
    //         let y2 = NumCast(b.y) + (BoolCast(b.isMinimized, false) ? 5 : b[HeightSym]() / 2);
    //         this.props.LinkDocs.map(l => {
    //             let width = l[WidthSym]();
    //             l.x = (x1 + x2) / 2 - width / 2;
    //             l.y = (y1 + y2) / 2 + 10;
    //             if (!this.props.removeDocument(l)) this.props.addDocument(l, false);
    //         });
    //         e.stopPropagation();
    //         e.preventDefault();
    //     }
    // }


    render() {
        // let l = this.props.LinkDocs;
        // let a = this.props.A;
        // let b = this.props.B;
        let a1 = this.props.sourceView;
        let a2 = this.props.targetView;
        let x1 = NumCast(a1.x) + (BoolCast(a1.isMinimized, false) ? 5 : NumCast(a1.width) / NumCast(a1.zoomBasis, 1) / 2);
        let y1 = NumCast(a1.y) + (BoolCast(a1.isMinimized, false) ? 5 : NumCast(a1.height) / NumCast(a1.zoomBasis, 1) / 2);

        let x2 = NumCast(a2.x) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.width) / NumCast(a2.zoomBasis, 1) / 2);
        let y2 = NumCast(a2.y) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.height) / NumCast(a2.zoomBasis, 1) / 2);

        return (
            <>
                <line className="linkview-line linkview-ele"
                    // style={{ strokeWidth: `${2 * 1 / 2}` }}
                    x1={`${x1}`} y1={`${y1}`}
                    x2={`${x2}`} y2={`${y2}`} />

                {/* <circle key="linkCircle" className="collectionfreeformlinkview-linkCircle"
                    cx={(x1 + x2) / 2} cy={(y1 + y2) / 2} r={8} onPointerDown={this.onPointerDown} /> */}
                {/* <text key="linkText" textAnchor="middle" className="collectionfreeformlinkview-linkText" x={`${(x1 + x2) / 2}`} y={`${(y1 + y2) / 2}`}>
                    {text}
                </text> */}
            </>
        );
    }
}