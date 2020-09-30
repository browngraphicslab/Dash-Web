import { action, computed, IReactionDisposer, observable, reaction, trace } from "mobx";
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
    componentWillUnmount() {
        this._anchorDisposer?.();
    }
    @action
    componentDidMount() {
        this._anchorDisposer = reaction(() => [this.props.A.props.ScreenToLocalTransform(), this.props.B.props.ScreenToLocalTransform()],
            action(() => {
                this._timeout && clearTimeout(this._timeout);
                this._timeout = setTimeout(this.updateHandles, 1050);
                this.updateHandles();
            }), { fireImmediately: true });
    }
    @action updateHandles = () => {
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
        const apt = Utils.closestPtBetweenRectangles(
            abounds.left, abounds.top, abounds.width, abounds.height,
            bbounds.left, bbounds.top, bbounds.width, bbounds.height,
            bbounds.left + bbounds.width / 2, bbounds.top + bbounds.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(
            bbounds.left, bbounds.top, bbounds.width, bbounds.height,
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
            setTimeout(action(() => {
                (this.props.A.rootDoc[(this.props.A.props as any).fieldKey] as Doc);
                const m = targetBhyperlink.getBoundingClientRect();
                const mp = this.props.A.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                this.props.A.rootDoc[afield + "_x"] = Math.min(1, mp[0] / this.props.A.props.PanelWidth()) * 100;
                this.props.A.rootDoc[afield + "_y"] = Math.min(1, mp[1] / this.props.A.props.PanelHeight()) * 100;
                this._start++;
            }), 0);
        }
        if (!targetAhyperlink) {
            this.props.A.rootDoc[bfield + "_x"] = (bpt.point.x - bbounds.left) / bbounds.width * 100;
            this.props.A.rootDoc[bfield + "_y"] = (bpt.point.y - bbounds.top) / bbounds.height * 100;
        } else {
            setTimeout(action(() => {
                (this.props.B.rootDoc[(this.props.B.props as any).fieldKey] as Doc);
                const m = targetAhyperlink.getBoundingClientRect();
                const mp = this.props.B.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                this.props.B.rootDoc[bfield + "_x"] = Math.min(1, mp[0] / this.props.B.props.PanelWidth()) * 100;
                this.props.B.rootDoc[bfield + "_y"] = Math.min(1, mp[1] / this.props.B.props.PanelHeight()) * 100;
                this._start++;
            }), 0);
        }
        this._start++;
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

    visibleY = (ypos: number, el: any) => {
        var el = el.parentNode;
        do {
            const rect = el.getBoundingClientRect();
            if (ypos <= rect.bottom === false && getComputedStyle(el).overflow === "hidden") return rect.bottom;
            // Check if the element is out of view due to a container scrolling
            if ((ypos) <= rect.top && getComputedStyle(el).overflow === "hidden") return rect.top;
            el = el.parentNode;
        } while (el !== document.body);
        // Check its within the document viewport
        return ypos; //top <= document.documentElement.clientHeight && getComputedStyle(document.documentElement).overflow === "hidden";
    }
    visibleX = (xpos: number, el: any) => {
        var el = el.parentNode;
        do {
            const rect = el.getBoundingClientRect();
            if (xpos <= rect.right === false && getComputedStyle(el).overflow === "hidden") return rect.right;
            // Check if the element is out of view due to a container scrolling
            if ((xpos) <= rect.left && getComputedStyle(el).overflow === "hidden") return rect.left;
            el = el.parentNode;
        } while (el !== document.body);
        // Check its within the document viewport
        return xpos; //top <= document.documentElement.clientHeight && getComputedStyle(document.documentElement).overflow === "hidden";
    }

    @computed.struct get renderData() {
        this._start; SnappingManager.GetIsDragging();
        if (!this.props.A.ContentDiv || !this.props.B.ContentDiv || !this.props.LinkDocs.length) {
            return undefined;
        }
        this.props.A.props.ScreenToLocalTransform().transform(this.props.B.props.ScreenToLocalTransform());
        const acont = this.props.A.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const bcont = this.props.B.ContentDiv.getElementsByClassName("linkAnchorBox-cont");
        const adiv = (acont.length ? acont[0] : this.props.A.ContentDiv);
        const bdiv = (bcont.length ? bcont[0] : this.props.B.ContentDiv);
        for (let apdiv = adiv; apdiv; apdiv = apdiv.parentElement as any) if ((apdiv as any).hidden) return;
        for (let apdiv = bdiv; apdiv; apdiv = apdiv.parentElement as any) if ((apdiv as any).hidden) return;
        const a = adiv.getBoundingClientRect();
        const b = bdiv.getBoundingClientRect();
        const abounds = (this.props.LinkDocs[0].anchor1_x === 0 || this.props.LinkDocs[0].anchor1_x === 100) &&
            (this.props.LinkDocs[0].anchor1_x === 0 || this.props.LinkDocs[0].anchor1_x === 100) ?
            adiv.parentElement!.getBoundingClientRect() : a;
        const bbounds = (this.props.LinkDocs[0].anchor2_x === 0 || this.props.LinkDocs[0].anchor2_x === 100) &&
            (this.props.LinkDocs[0].anchor2_x === 0 || this.props.LinkDocs[0].anchor2_x === 100) ?
            bdiv.parentElement!.getBoundingClientRect() : b;
        const apt = Utils.closestPtBetweenRectangles(
            abounds.left, abounds.top, abounds.width, abounds.height,
            bbounds.left, bbounds.top, bbounds.width, bbounds.height,
            bbounds.left + bbounds.width / 2, bbounds.top + bbounds.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(
            bbounds.left, bbounds.top, bbounds.width, bbounds.height,
            abounds.left, abounds.top, abounds.width, abounds.height,
            apt.point.x, apt.point.y);
        const atop = this.visibleY(apt.point.y, adiv);
        const btop = this.visibleY(bpt.point.y, bdiv);
        const aleft = this.visibleX(apt.point.x, adiv);
        const bleft = this.visibleX(bpt.point.x, bdiv);
        const pt1 = [aleft, atop];
        const pt2 = [bleft, btop];
        const pt1vec = [pt1[0] - (abounds.left + abounds.width / 2), pt1[1] - (abounds.top + abounds.height / 2)];
        const pt2vec = [pt2[0] - (bbounds.left + bbounds.width / 2), pt2[1] - (bbounds.top + bbounds.height / 2)];
        const pt1len = Math.sqrt((pt1vec[0] * pt1vec[0]) + (pt1vec[1] * pt1vec[1]));
        const pt2len = Math.sqrt((pt2vec[0] * pt2vec[0]) + (pt2vec[1] * pt2vec[1]));
        const ptlen = Math.sqrt((pt1[0] - pt2[0]) * (pt1[0] - pt2[0]) + (pt1[1] - pt2[1]) * (pt1[1] - pt2[1])) / 2;
        const pt1norm = [pt1vec[0] / pt1len * ptlen, pt1vec[1] / pt1len * ptlen];
        const pt2norm = [pt2vec[0] / pt2len * ptlen, pt2vec[1] / pt2len * ptlen];
        const aActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        const bActive = this.props.B.isSelected() || Doc.IsBrushed(this.props.B.props.Document);
        if (apt.point.y !== atop || apt.point.x !== aleft || bpt.point.y !== btop || bpt.point.x !== bleft) return { a, b, pt1norm: [0, 0], pt2norm: [0, 0], aActive, bActive, textX: undefined, textY: undefined, pt1, pt2 };

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
            {textX === undefined ? (null) : <text className="collectionfreeformlinkview-linkText" x={textX} y={textY} onPointerDown={this.pointerDown} >
                {StrCast(this.props.LinkDocs[0].description)}
            </text>}
        </>);
    }
}