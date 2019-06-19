import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { BoolCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { InkingControl } from "../../InkingControl";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentView } from "../../nodes/DocumentView";
import { Docs } from "../../../documents/Documents";
import { observable } from "mobx";

export interface CollectionFreeFormLinkViewProps {
    sourceView: DocumentView;
    targetView: DocumentView;
    proxyDoc: Doc;
    addDocTab: (document: Doc, where: string) => void;
}

@observer
export class CollectionFreeFormLinkWithProxyView extends React.Component<CollectionFreeFormLinkViewProps> {

    // @observable private _proxyX: number = NumCast(this.props.proxyDoc.x);
    // @observable private _proxyY: number = NumCast(this.props.proxyDoc.y);

    followButton = (e: React.PointerEvent): void => {
        // TODO: would be nicer to open docview in context
        e.stopPropagation();
        console.log("follow");
        this.props.addDocTab(this.props.targetView.props.Document, "onRight");
    }

    render() {
        let a1 = this.props.sourceView;
        let a2 = this.props.proxyDoc;
        let x1 = NumCast(a1.Document.x) + (BoolCast(a1.Document.isMinimized, false) ? 5 : NumCast(a1.Document.width) / NumCast(a1.Document.zoomBasis, 1) / 2);
        let y1 = NumCast(a1.Document.y) + (BoolCast(a1.Document.isMinimized, false) ? 5 : NumCast(a1.Document.height) / NumCast(a1.Document.zoomBasis, 1) / 2);

        let x2 = NumCast(a2.x) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.width) / NumCast(a2.zoomBasis, 1) / 2);
        let y2 = NumCast(a2.y) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.height) / NumCast(a2.zoomBasis, 1) / 2);

        // let containing = "";
        // if (this.props.targetView.props.ContainingCollectionView) {
        //     containing = StrCast(this.props.targetView.props.ContainingCollectionView.props.Document.title);
        // }

        // let text = "link to " + StrCast(this.props.targetView.props.Document.title) + (containing === "" ? "" : (" in the context of " + containing));
        return (
            <>
                <line className="collectionfreeformlinkview-linkLine"
                    style={{ strokeWidth: `${2 * 1 / 2}` }}
                    x1={`${x1}`} y1={`${y1}`}
                    x2={`${x2}`} y2={`${y2}`} />
                {/* <circle className="collectionfreeformlinkview-linkCircle" cx={x2} cy={y2} r={20} ></circle>
                <text textAnchor="middle" className="collectionfreeformlinkview-linkText" x={`${x2}`} y={`${y2}`}> {text}</text> */}
            </>
        );
    }
}

//onPointerDown={this.followButton}