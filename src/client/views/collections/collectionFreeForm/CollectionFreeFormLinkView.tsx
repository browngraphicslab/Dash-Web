import { observer } from "mobx-react";
import { Doc } from "../../../../fields/Doc";
import { Utils, setupMoveUpEvents, emptyFunction, returnFalse } from '../../../../Utils';
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import { DocumentType } from "../../../documents/DocumentTypes";
import { observable, action, reaction, IReactionDisposer, trace, computed } from "mobx";
import { StrCast, Cast, NumCast } from "../../../../fields/Types";
import { Id } from "../../../../fields/FieldSymbols";
import { SnappingManager } from "../../../util/SnappingManager";

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
    componentWillUnmount() {
        this._anchorDisposer?.();
    }
    @action
    timeout = () => (Date.now() < this._start++ + 1000) && setTimeout(this.timeout, 25)
    componentDidMount() {
        this._anchorDisposer = reaction(() => [this.props.A.props.ScreenToLocalTransform(), this.props.B.props.ScreenToLocalTransform(), this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document), this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document)],
            action(() => {
                this._start = Date.now();
                this._timeout && clearTimeout(this._timeout);
                this._timeout = setTimeout(this.timeout, 25);
                if (SnappingManager.GetIsDragging() || !this.props.A.ContentDiv || !this.props.B.ContentDiv) return;
                setTimeout(action(() => this._opacity = 1), 0); // since the render code depends on querying the Dom through getBoudndingClientRect, we need to delay triggering render()
                setTimeout(action(() => (!this.props.LinkDocs.length || !this.props.LinkDocs[0].linkDisplay) && (this._opacity = 0.05)), 750); // this will unhighlight the link line.
                const acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv.getElementsByClassName("linkAnchorBox-cont") : [];
                const bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv.getElementsByClassName("linkAnchorBox-cont") : [];
                const adiv = (acont.length ? acont[0] : this.props.A.ContentDiv);
                const bdiv = (bcont.length ? bcont[0] : this.props.B.ContentDiv);
                const a = adiv.getBoundingClientRect();
                const b = bdiv.getBoundingClientRect();
                const abounds = adiv.parentElement!.getBoundingClientRect();
                const bbounds = bdiv.parentElement!.getBoundingClientRect();
                const apt = Utils.closestPtBetweenRectangles(abounds.left, abounds.top, abounds.width, abounds.height,
                    bbounds.left, bbounds.top, bbounds.width, bbounds.height,
                    a.left + a.width / 2, a.top + a.height / 2);
                const bpt = Utils.closestPtBetweenRectangles(bbounds.left, bbounds.top, bbounds.width, bbounds.height,
                    abounds.left, abounds.top, abounds.width, abounds.height,
                    apt.point.x, apt.point.y);
                const afield = this.props.A.props.LayoutTemplateString?.indexOf("anchor1") === -1 ? "anchor2" : "anchor1";
                const bfield = afield === "anchor1" ? "anchor2" : "anchor1";

                // really hacky stuff to make the LinkAnchorBox display where we want it to:
                //   if there's an element in the DOM with a classname containing the link's id and a data-targetids attribute containing the other end of the link, 
                //   then that DOM element is a hyperlink source for the current anchor and we want to place our link box at it's top right
                //   otherwise, we just use the computed nearest point on the document boundary to the target Document
                const linkId = this.props.LinkDocs[0][Id]; // this link's Id
                const AanchorId = (this.props.LinkDocs[0][afield] as Doc)[Id]; // anchor a's id
                const BanchorId = (this.props.LinkDocs[0][bfield] as Doc)[Id]; // anchor b's id
                const linkEles = Array.from(window.document.getElementsByClassName(linkId));
                const targetAhyperlink = linkEles.find((ele: any) => ele.dataset.targetids?.includes(AanchorId));
                const targetBhyperlink = linkEles.find((ele: any) => ele.dataset.targetids?.includes(BanchorId));
                if (!targetBhyperlink) {
                    this.props.A.rootDoc[afield + "_x"] = (apt.point.x - abounds.left) / abounds.width * 100;
                    this.props.A.rootDoc[afield + "_y"] = (apt.point.y - abounds.top) / abounds.height * 100;
                } else {
                    setTimeout(() => {
                        (this.props.A.rootDoc[(this.props.A.props as any).fieldKey] as Doc);
                        const m = targetBhyperlink.getBoundingClientRect();
                        const mp = this.props.A.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                        this.props.A.rootDoc[afield + "_x"] = Math.min(1, mp[0] / this.props.A.props.PanelWidth()) * 100;
                        this.props.A.rootDoc[afield + "_y"] = Math.min(1, mp[1] / this.props.A.props.PanelHeight()) * 100;
                    }, 0);
                }
                if (!targetAhyperlink) {
                    this.props.A.rootDoc[bfield + "_x"] = (bpt.point.x - bbounds.left) / bbounds.width * 100;
                    this.props.A.rootDoc[bfield + "_y"] = (bpt.point.y - bbounds.top) / bbounds.height * 100;
                } else {
                    setTimeout(() => {
                        (this.props.B.rootDoc[(this.props.B.props as any).fieldKey] as Doc);
                        const m = targetAhyperlink.getBoundingClientRect();
                        const mp = this.props.B.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                        this.props.B.rootDoc[bfield + "_x"] = Math.min(1, mp[0] / this.props.B.props.PanelWidth()) * 100;
                        this.props.B.rootDoc[bfield + "_y"] = Math.min(1, mp[1] / this.props.B.props.PanelHeight()) * 100;
                    }, 0);
                }
            })
            , { fireImmediately: true });
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
        var rect = el.getBoundingClientRect(), top = rect.top, height = rect.height,
            el = el.parentNode;
        do {
            rect = el.getBoundingClientRect();
            if (top <= rect.bottom === false && getComputedStyle(el).overflow === "hidden") return rect.bottom;
            // Check if the element is out of view due to a container scrolling
            if ((top + height) <= rect.top && getComputedStyle(el).overflow === "hidden") return rect.top;
            el = el.parentNode;
        } while (el != document.body);
        // Check its within the document viewport
        return top;//top <= document.documentElement.clientHeight && getComputedStyle(document.documentElement).overflow === "hidden";
    };

    @computed get renderData() {
        this._start;
        if (SnappingManager.GetIsDragging() || !this.props.A.ContentDiv || !this.props.B.ContentDiv || !this.props.LinkDocs.length) {
            return undefined;
        }
        this.props.A.props.ScreenToLocalTransform().transform(this.props.B.props.ScreenToLocalTransform());
        const acont = this.props.A.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const bcont = this.props.B.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const a = (acont.length ? acont[0] : this.props.A.ContentDiv).getBoundingClientRect();
        const b = (bcont.length ? bcont[0] : this.props.B.ContentDiv).getBoundingClientRect();
        const atop = this.visibleY(this.props.A.ContentDiv);
        const btop = this.visibleY(this.props.B.ContentDiv);
        const apt = Utils.closestPtBetweenRectangles(a.left, atop, a.width, a.height,
            b.left, btop, b.width, b.height,
            a.left + a.width / 2, a.top + a.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(b.left, btop, b.width, b.height,
            a.left, atop, a.width, a.height,
            apt.point.x, apt.point.y);
        const pt1 = [apt.point.x, apt.point.y];
        const pt2 = [bpt.point.x, bpt.point.y];
        const pt1vec = [pt1[0] - (a.left + a.width / 2), pt1[1] - (atop + a.height / 2)];
        const pt2vec = [pt2[0] - (b.left + b.width / 2), pt2[1] - (btop + b.height / 2)];
        const pt1len = Math.sqrt((pt1vec[0] * pt1vec[0]) + (pt1vec[1] * pt1vec[1]));
        const pt2len = Math.sqrt((pt2vec[0] * pt2vec[0]) + (pt2vec[1] * pt2vec[1]));
        const ptlen = Math.sqrt((pt1[0] - pt2[0]) * (pt1[0] - pt2[0]) + (pt1[1] - pt2[1]) * (pt1[1] - pt2[1])) / 2;
        const pt1norm = [pt1vec[0] / pt1len * ptlen, pt1vec[1] / pt1len * ptlen];
        const pt2norm = [pt2vec[0] / pt2len * ptlen, pt2vec[1] / pt2len * ptlen];
        const aActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        const bActive = this.props.B.isSelected() || Doc.IsBrushed(this.props.B.props.Document);

        const textX = (Math.min(pt1[0], pt2[0]) + Math.max(pt1[0], pt2[0])) / 2 + NumCast(this.props.LinkDocs[0].linkOffsetX);
        const textY = (pt1[1] + pt2[1]) / 2 + NumCast(this.props.LinkDocs[0].linkOffsetY);
        return { a, b, pt1norm, pt2norm, aActive, bActive, textX, textY, pt1, pt2 };
    }

    render() {
        if (!this.renderData) return (null);
        const { a, b, pt1norm, pt2norm, aActive, bActive, textX, textY, pt1, pt2 } = this.renderData;
        return !a.width || !b.width || ((!this.props.LinkDocs[0].linkDisplay) && !aActive && !bActive) ? (null) : (<>
            <path className="collectionfreeformlinkview-linkLine" style={{ opacity: this._opacity, strokeDasharray: "2 2" }}
                d={`M ${pt1[0]} ${pt1[1]} C ${pt1[0] + pt1norm[0]} ${pt1[1] + pt1norm[1]}, ${pt2[0] + pt2norm[0]} ${pt2[1] + pt2norm[1]}, ${pt2[0]} ${pt2[1]}`} />
            <text className="collectionfreeformlinkview-linkText" x={textX} y={textY} onPointerDown={this.pointerDown} >
                {StrCast(this.props.LinkDocs[0].description)}
            </text>
        </>);
    }
}