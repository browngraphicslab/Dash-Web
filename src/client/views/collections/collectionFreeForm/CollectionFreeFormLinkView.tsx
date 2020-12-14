import { action, computed, IReactionDisposer, observable, reaction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../../fields/Doc";
import { Id } from "../../../../fields/FieldSymbols";
import { NumCast, StrCast } from "../../../../fields/Types";
import { emptyFunction, setupMoveUpEvents, Utils } from '../../../../Utils';
import { DocumentType } from "../../../documents/DocumentTypes";
import { SnappingManager } from "../../../util/SnappingManager";
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");

export interface CollectionFreeFormLinkViewProps {
    A: DocumentView;
    B: DocumentView;
    LinkDocs: Doc[];
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {
    @observable _opacity: number = 0;
    @observable _start = 0;
    _anchorDisposer: IReactionDisposer | undefined;
    _timeout: NodeJS.Timeout | undefined;
    componentWillUnmount() { this._anchorDisposer?.(); }
    @action timeout = action(() => (Date.now() < this._start++ + 1000) && (this._timeout = setTimeout(this.timeout, 25)));
    componentDidMount() {
        this._anchorDisposer = reaction(() => [this.props.A.props.ScreenToLocalTransform(), this.props.B.props.ScreenToLocalTransform()],
            action(() => {
                this._start = Date.now();
                this._timeout && clearTimeout(this._timeout);
                this._timeout = setTimeout(this.timeout, 25);
                setTimeout(this.placeAnchors);
            })
            , { fireImmediately: true });
    }
    placeAnchors = () => {
        const { A, B, LinkDocs } = this.props;
        const linkDoc = LinkDocs[0];
        if (SnappingManager.GetIsDragging() || !A.ContentDiv || !B.ContentDiv) return;
        setTimeout(action(() => this._opacity = 1), 0); // since the render code depends on querying the Dom through getBoudndingClientRect, we need to delay triggering render()
        setTimeout(action(() => (!LinkDocs.length || !linkDoc.linkDisplay) && (this._opacity = 0.05)), 750); // this will unhighlight the link line.
        if (!linkDoc.linkAutoMove) return;
        const acont = A.props.Document.type === DocumentType.LINK ? A.ContentDiv.getElementsByClassName("linkAnchorBox-cont") : [];
        const bcont = B.props.Document.type === DocumentType.LINK ? B.ContentDiv.getElementsByClassName("linkAnchorBox-cont") : [];
        const adiv = (acont.length ? acont[0] : A.ContentDiv);
        const bdiv = (bcont.length ? bcont[0] : B.ContentDiv);
        const a = adiv.getBoundingClientRect();
        const b = bdiv.getBoundingClientRect();
        const { left: aleft, top: atop, width: awidth, height: aheight } = adiv.parentElement!.getBoundingClientRect();
        const { left: bleft, top: btop, width: bwidth, height: bheight } = bdiv.parentElement!.getBoundingClientRect();
        const apt = Utils.closestPtBetweenRectangles(aleft, atop, awidth, aheight, bleft, btop, bwidth, bheight, a.left + a.width / 2, a.top + a.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(bleft, btop, bwidth, bheight, aleft, atop, awidth, aheight, apt.point.x, apt.point.y);
        const afield = A.props.LayoutTemplateString?.indexOf("anchor1") === -1 ? "anchor2" : "anchor1";
        const bfield = afield === "anchor1" ? "anchor2" : "anchor1";

        // really hacky stuff to make the LinkAnchorBox display where we want it to:
        //   if there's an element in the DOM with a classname containing the link's id and a data-targetids attribute containing the other end of the link, 
        //   then that DOM element is a hyperlink source for the current anchor and we want to place our link box at it's top right
        //   otherwise, we just use the computed nearest point on the document boundary to the target Document
        const linkEles = Array.from(window.document.getElementsByClassName(linkDoc[Id]));
        const targetAhyperlink = linkEles.find((ele: any) => ele.dataset.targetids?.includes((linkDoc[afield] as Doc)[Id]));
        const targetBhyperlink = linkEles.find((ele: any) => ele.dataset.targetids?.includes((linkDoc[bfield] as Doc)[Id]));
        if ((!targetAhyperlink && !a.width) || (!targetBhyperlink && !b.width)) return;
        if (!targetBhyperlink) {
            A.rootDoc[afield + "_x"] = (apt.point.x - aleft) / awidth * 100;
            A.rootDoc[afield + "_y"] = (apt.point.y - atop) / aheight * 100;
        } else {
            const m = targetBhyperlink.getBoundingClientRect();
            const mp = A.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
            A.rootDoc[afield + "_x"] = Math.min(1, mp[0] / A.props.PanelWidth()) * 100;
            A.rootDoc[afield + "_y"] = Math.min(1, mp[1] / A.props.PanelHeight()) * 100;
        }
        if (!targetAhyperlink) {
            B.rootDoc[bfield + "_x"] = (bpt.point.x - bleft) / bwidth * 100;
            B.rootDoc[bfield + "_y"] = (bpt.point.y - btop) / bheight * 100;
        } else {
            const m = targetAhyperlink.getBoundingClientRect();
            const mp = B.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
            B.rootDoc[bfield + "_x"] = Math.min(1, mp[0] / B.props.PanelWidth()) * 100;
            B.rootDoc[bfield + "_y"] = Math.min(1, mp[1] / B.props.PanelHeight()) * 100;
        }
    }


    pointerDown = (e: React.PointerEvent) => {
        setupMoveUpEvents(this, e, (e, down, delta) => {
            this.props.LinkDocs[0].linkOffsetX = NumCast(this.props.LinkDocs[0].linkOffsetX) + delta[0];
            this.props.LinkDocs[0].linkOffsetY = NumCast(this.props.LinkDocs[0].linkOffsetY) + delta[1];
            return false;
        }, emptyFunction, () => {
            // OverlayView.Instance.addElement(
            //     <LinkEditor sourceDoc={this.props.A.props.Document} linkDoc={this.props.LinkDocs[0]}
            //         showLinks={action(() => { })}
            //     />, { x: 300, y: 300 });
        });


    }

    visibleY = (el: any) => {
        let rect = el.getBoundingClientRect();
        const top = rect.top, height = rect.height;
        var el = el.parentNode;
        while (el && el !== document.body) {
            rect = el.getBoundingClientRect?.();
            if (rect?.width) {
                if (top <= rect.bottom === false && getComputedStyle(el).overflow === "hidden") return rect.bottom;
                // Check if the element is out of view due to a container scrolling
                if ((top + height) <= rect.top && getComputedStyle(el).overflow === "hidden") return rect.top;
            }
            el = el.parentNode;
        }
        // Check its within the document viewport
        return top; //top <= document.documentElement.clientHeight && getComputedStyle(document.documentElement).overflow === "hidden";
    }
    visibleX = (el: any) => {
        let rect = el.getBoundingClientRect();
        const left = rect.left, width = rect.width;
        var el = el.parentNode;
        while (el && el !== document.body) {
            rect = el?.getBoundingClientRect();
            if (rect?.width) {
                if (left <= rect.right === false && getComputedStyle(el).overflow === "hidden") return rect.right;
                // Check if the element is out of view due to a container scrolling
                if ((left + width) <= rect.left && getComputedStyle(el).overflow === "hidden") return rect.left;
            }
            el = el.parentNode;
        }
        // Check its within the document viewport
        return left; //top <= document.documentElement.clientHeight && getComputedStyle(document.documentElement).overflow === "hidden";
    }

    @computed.struct get renderData() {
        this._start; SnappingManager.GetIsDragging();
        const { A, B, LinkDocs } = this.props;
        if (!A.ContentDiv || !B.ContentDiv || !LinkDocs.length) return undefined;
        const acont = A.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const bcont = B.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const adiv = (acont.length ? acont[0] : A.ContentDiv);
        const bdiv = (bcont.length ? bcont[0] : B.ContentDiv);
        for (let apdiv = adiv; apdiv; apdiv = apdiv.parentElement as any) if ((apdiv as any).hidden) return;
        for (let bpdiv = bdiv; bpdiv; bpdiv = bpdiv.parentElement as any) if ((bpdiv as any).hidden) return;
        const a = adiv.getBoundingClientRect();
        const b = bdiv.getBoundingClientRect();
        const atop = this.visibleY(adiv);
        const btop = this.visibleY(bdiv);
        if (!a.width || !b.width) return undefined;
        const atop2 = this.visibleY(adiv);
        const btop2 = this.visibleY(bdiv);
        const aleft = this.visibleX(adiv);
        const bleft = this.visibleX(bdiv);
        const clipped = aleft !== a.left || atop !== a.top || bleft !== b.left || btop !== b.top;
        const apt = Utils.closestPtBetweenRectangles(aleft, atop, a.width, a.height, bleft, btop, b.width, b.height, a.left + a.width / 2, a.top + a.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(bleft, btop, b.width, b.height, aleft, atop, a.width, a.height, apt.point.x, apt.point.y);
        const pt1 = [apt.point.x, apt.point.y];
        const pt2 = [bpt.point.x, bpt.point.y];
        const pt1vec = [pt1[0] - (aleft + a.width / 2), pt1[1] - (atop + a.height / 2)];
        const pt2vec = [pt2[0] - (bleft + b.width / 2), pt2[1] - (btop + b.height / 2)];
        const pt1len = Math.sqrt((pt1vec[0] * pt1vec[0]) + (pt1vec[1] * pt1vec[1]));
        const pt2len = Math.sqrt((pt2vec[0] * pt2vec[0]) + (pt2vec[1] * pt2vec[1]));
        const ptlen = Math.sqrt((pt1[0] - pt2[0]) * (pt1[0] - pt2[0]) + (pt1[1] - pt2[1]) * (pt1[1] - pt2[1])) / 2;
        const pt1norm = clipped ? [0, 0] : [pt1vec[0] / pt1len * ptlen, pt1vec[1] / pt1len * ptlen];
        const pt2norm = clipped ? [0, 0] : [pt2vec[0] / pt2len * ptlen, pt2vec[1] / pt2len * ptlen];
        const aActive = A.isSelected() || Doc.IsBrushed(A.props.Document);
        const bActive = B.isSelected() || Doc.IsBrushed(B.props.Document);

        const textX = (Math.min(pt1[0], pt2[0]) + Math.max(pt1[0], pt2[0])) / 2 + NumCast(LinkDocs[0].linkOffsetX);
        const textY = (pt1[1] + pt2[1]) / 2 + NumCast(LinkDocs[0].linkOffsetY);
        return { a, b, pt1norm, pt2norm, aActive, bActive, textX, textY, pt1, pt2 };
    }

    render() {
        if (!this.renderData) return (null);
        const { a, b, pt1norm, pt2norm, aActive, bActive, textX, textY, pt1, pt2 } = this.renderData;
        return !a.width || !b.width || ((!this.props.LinkDocs[0].linkDisplay) && !aActive && !bActive) ? (null) : (<>
            <path className="collectionfreeformlinkview-linkLine" style={{ opacity: this._opacity, strokeDasharray: "2 2" }}
                d={`M ${pt1[0]} ${pt1[1]} C ${pt1[0] + pt1norm[0]} ${pt1[1] + pt1norm[1]}, ${pt2[0] + pt2norm[0]} ${pt2[1] + pt2norm[1]}, ${pt2[0]} ${pt2[1]}`} />
            {textX === undefined ? (null) : <text className="collectionfreeformlinkview-linkText" x={textX} y={textY} onPointerDown={this.pointerDown} >
                {StrCast(this.props.LinkDocs[0].description)}
            </text>}
        </>);
    }
}