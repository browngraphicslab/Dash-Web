import { observer } from "mobx-react";
import { Doc, HeightSym, WidthSym } from "../../../../new_fields/Doc";
import { BoolCast, NumCast, StrCast } from "../../../../new_fields/Types";
import { InkingControl } from "../../InkingControl";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentView } from "../../nodes/DocumentView";
import { Docs } from "../../../documents/Documents";
import { observable, action } from "mobx";
import { CollectionDockingView } from "../CollectionDockingView";
import { dropActionType, DragManager } from "../../../util/DragManager";
import { emptyFunction } from "../../../../Utils";
import { DocumentManager } from "../../../util/DocumentManager";

export interface CollectionFreeFormLinkViewProps {
    sourceView: DocumentView;
    targetView: DocumentView;
    proxyDoc: Doc;
    // addDocTab: (document: Doc, where: string) => void;
}

@observer
export class CollectionFreeFormLinkWithProxyView extends React.Component<CollectionFreeFormLinkViewProps> {

    // @observable private _proxyX: number = NumCast(this.props.proxyDoc.x);
    // @observable private _proxyY: number = NumCast(this.props.proxyDoc.y);
    private _ref = React.createRef<HTMLDivElement>();
    private _downX: number = 0;
    private _downY: number = 0;
    @observable _x: number = 0;
    @observable _y: number = 0;
    // @observable private _proxyDoc: Doc = Docs.TextDocument(); // used for positioning

    @action
    componentDidMount() {
        let a2 = this.props.proxyDoc;
        this._x = NumCast(a2.x) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.width) / NumCast(a2.zoomBasis, 1) / 2);
        this._y = NumCast(a2.y) + (BoolCast(a2.isMinimized, false) ? 5 : NumCast(a2.height) / NumCast(a2.zoomBasis, 1) / 2);
    }


    followButton = (e: React.PointerEvent): void => {
        e.stopPropagation();
        let open = this.props.targetView.props.ContainingCollectionView ? this.props.targetView.props.ContainingCollectionView.props.Document : this.props.targetView.props.Document;
        CollectionDockingView.Instance.AddRightSplit(open);
        DocumentManager.Instance.jumpToDocument(this.props.targetView.props.Document, e.altKey);
    }

    @action
    setPosition(x: number, y: number) {
        this._x = x;
        this._y = y;
    }

    startDragging(x: number, y: number) {
        if (this._ref.current) {
            let dragData = new DragManager.DocumentDragData([this.props.proxyDoc]);

            DragManager.StartLinkProxyDrag(this._ref.current, dragData, x, y, {
                handlers: {
                    dragComplete: action(() => {
                        let a2 = this.props.proxyDoc;
                        let offset = NumCast(a2.width) / NumCast(a2.zoomBasis, 1) / 2;
                        let x = NumCast(a2.x);// + NumCast(a2.width) / NumCast(a2.zoomBasis, 1) / 2;
                        let y = NumCast(a2.y);// + NumCast(a2.height) / NumCast(a2.zoomBasis, 1) / 2;
                        this.setPosition(x, y);

                        // this is a hack :'( theres prob a better way to make the input doc not render
                        let views = DocumentManager.Instance.getDocumentViews(this.props.proxyDoc);
                        views.forEach(dv => {
                            dv.props.removeDocument && dv.props.removeDocument(dv.props.Document);
                        });
                    }),
                },
                hideSource: true //?
            });
        }
    }

    onPointerDown = (e: React.PointerEvent): void => {
        this._downX = e.clientX;
        this._downY = e.clientY;

        e.stopPropagation();
        document.removeEventListener("pointermove", this.onPointerMove);
        document.addEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointerup", this.onPointerUp);
    }

    onPointerMove = (e: PointerEvent): void => {
        if (Math.abs(this._downX - e.clientX) > 3 || Math.abs(this._downY - e.clientY) > 3) {
            document.removeEventListener("pointermove", this.onPointerMove);
            document.removeEventListener("pointerup", this.onPointerUp);
            this.startDragging(this._downX, this._downY);
        }
        e.stopPropagation();
        e.preventDefault();
    }
    onPointerUp = (e: PointerEvent): void => {
        document.removeEventListener("pointermove", this.onPointerMove);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    render() {
        let a1 = this.props.sourceView;
        let x1 = NumCast(a1.Document.x) + (BoolCast(a1.Document.isMinimized, false) ? 5 : NumCast(a1.Document.width) / NumCast(a1.Document.zoomBasis, 1) / 2);
        let y1 = NumCast(a1.Document.y) + (BoolCast(a1.Document.isMinimized, false) ? 5 : NumCast(a1.Document.height) / NumCast(a1.Document.zoomBasis, 1) / 2);

        let context = this.props.targetView.props.ContainingCollectionView ?
            (" in the context of " + StrCast(this.props.targetView.props.ContainingCollectionView.props.Document.title)) : "";
        let text = "link to " + StrCast(this.props.targetView.props.Document.title) + context;

        return (
            <>
                <line className="linkview-line linkview-ele"
                    // style={{ strokeWidth: `${2 * 1 / 2}` }}
                    x1={`${x1}`} y1={`${y1}`}
                    x2={`${this._x}`} y2={`${this._y}`} />
                <foreignObject className="linkview-button-wrapper linkview-ele" width={200} height={100} x={this._x - 100} y={this._y - 50}>
                    <div className="linkview-button" onPointerDown={this.onPointerDown} onPointerUp={this.followButton} ref={this._ref}>
                        <p>{text}</p>
                    </div>
                </foreignObject>
            </>
        );
    }
}

//onPointerDown={this.followButton}