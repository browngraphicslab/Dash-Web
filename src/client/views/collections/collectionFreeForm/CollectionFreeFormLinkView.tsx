import { observer } from "mobx-react";
import { Doc } from "../../../../new_fields/Doc";
import { Utils } from '../../../../Utils';
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentType } from "../../../documents/DocumentTypes";
import { observable, action, reaction, IReactionDisposer } from "mobx";
import { StrCast } from "../../../../new_fields/Types";
import { Id } from "../../../../new_fields/FieldSymbols";

export interface CollectionFreeFormLinkViewProps {
    A: DocumentView;
    B: DocumentView;
    LinkDocs: Doc[];
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {
    @observable _opacity: number = 0;
    _anchorDisposer: IReactionDisposer | undefined;
    @action
    componentDidMount() {
        this._anchorDisposer = reaction(() => [this.props.A.props.ScreenToLocalTransform(), this.props.B.props.ScreenToLocalTransform(), this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document), this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document)],
            action(() => {
                setTimeout(action(() => this._opacity = 1), 0); // since the render code depends on querying the Dom through getBoudndingClientRect, we need to delay triggering render()
                setTimeout(action(() => (!this.props.LinkDocs.length || !this.props.LinkDocs[0].linkDisplay) && (this._opacity = 0.05)), 750); // this will unhighlight the link line.
                const acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv!.getElementsByClassName("linkAnchorBox-cont") : [];
                const bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv!.getElementsByClassName("linkAnchorBox-cont") : [];
                const adiv = (acont.length ? acont[0] : this.props.A.ContentDiv!);
                const bdiv = (bcont.length ? bcont[0] : this.props.B.ContentDiv!);
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
                //   if there's an element in the DOM with the id of the opposite anchor, then that DOM element is a hyperlink source for the current anchor and we want to place our link box at it's top right
                //   otherwise, we just use the computed nearest point on the document boundary to the target Document
                const targetAhyperlink = window.document.getElementById(this.props.LinkDocs[0][Id] + (this.props.LinkDocs[0][afield] as Doc)[Id]);
                const targetBhyperlink = window.document.getElementById(this.props.LinkDocs[0][Id] + (this.props.LinkDocs[0][bfield] as Doc)[Id]);
                if (!targetBhyperlink) {
                    this.props.A.props.Document[afield + "_x"] = (apt.point.x - abounds.left) / abounds.width * 100;
                    this.props.A.props.Document[afield + "_y"] = (apt.point.y - abounds.top) / abounds.height * 100;
                } else {
                    setTimeout(() => {
                        (this.props.A.props.Document[(this.props.A.props as any).fieldKey] as Doc);
                        const m = targetBhyperlink.getBoundingClientRect();
                        const mp = this.props.A.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                        this.props.A.props.Document[afield + "_x"] = mp[0] / this.props.A.props.PanelWidth() * 100;
                        this.props.A.props.Document[afield + "_y"] = mp[1] / this.props.A.props.PanelHeight() * 100;
                    }, 0);
                }
                if (!targetAhyperlink) {
                    this.props.A.props.Document[bfield + "_x"] = (bpt.point.x - bbounds.left) / bbounds.width * 100;
                    this.props.A.props.Document[bfield + "_y"] = (bpt.point.y - bbounds.top) / bbounds.height * 100;
                } else {
                    setTimeout(() => {
                        (this.props.B.props.Document[(this.props.B.props as any).fieldKey] as Doc);
                        const m = targetAhyperlink.getBoundingClientRect();
                        const mp = this.props.B.props.ScreenToLocalTransform().transformPoint(m.right, m.top + 5);
                        this.props.B.props.Document[bfield + "_x"] = mp[0] / this.props.B.props.PanelWidth() * 100;
                        this.props.B.props.Document[bfield + "_y"] = mp[1] / this.props.B.props.PanelHeight() * 100;
                    }, 0);
                }
            })
            , { fireImmediately: true });
    }
    @action
    componentWillUnmount() {
        this._anchorDisposer?.();
    }

    render() {
        this.props.A.props.ScreenToLocalTransform().transform(this.props.B.props.ScreenToLocalTransform());
        const acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv!.getElementsByClassName("linkAnchorBox-cont") : [];
        const bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv!.getElementsByClassName("linkAnchorBox-cont") : [];
        const a = (acont.length ? acont[0] : this.props.A.ContentDiv!).getBoundingClientRect();
        const b = (bcont.length ? bcont[0] : this.props.B.ContentDiv!).getBoundingClientRect();
        const apt = Utils.closestPtBetweenRectangles(a.left, a.top, a.width, a.height,
            b.left, b.top, b.width, b.height,
            a.left + a.width / 2, a.top + a.height / 2);
        const bpt = Utils.closestPtBetweenRectangles(b.left, b.top, b.width, b.height,
            a.left, a.top, a.width, a.height,
            apt.point.x, apt.point.y);
        const pt1 = [apt.point.x, apt.point.y];
        const pt2 = [bpt.point.x, bpt.point.y];
        const pt1vec = [pt1[0] - (a.left + a.width / 2), pt1[1] - (a.top + a.height / 2)];
        const pt2vec = [pt2[0] - (b.left + b.width / 2), pt2[1] - (b.top + b.height / 2)];
        const pt1len = Math.sqrt((pt1vec[0] * pt1vec[0]) + (pt1vec[1] * pt1vec[1]));
        const pt2len = Math.sqrt((pt2vec[0] * pt2vec[0]) + (pt2vec[1] * pt2vec[1]));
        const ptlen = Math.sqrt((pt1[0] - pt2[0]) * (pt1[0] - pt2[0]) + (pt1[1] - pt2[1]) * (pt1[1] - pt2[1])) / 3;
        const pt1norm = [pt1vec[0] / pt1len * ptlen, pt1vec[1] / pt1len * ptlen];
        const pt2norm = [pt2vec[0] / pt2len * ptlen, pt2vec[1] / pt2len * ptlen];
        const aActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        const bActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        const text = StrCast(this.props.A.props.Document.linkRelationship);
        return !a.width || !b.width || ((!this.props.LinkDocs.length || !this.props.LinkDocs[0].linkDisplay) && !aActive && !bActive) ? (null) : (<>
            <text x={(pt1[0] + pt2[0]) / 2} y={(pt1[1] + pt2[1]) / 2}>
                {text !== "-ungrouped-" ? text : ""}
            </text>
            <path className="collectionfreeformlinkview-linkLine" style={{ opacity: this._opacity, strokeDasharray: "2 2" }}
                d={`M ${pt1[0]} ${pt1[1]} C ${pt1[0] + pt1norm[0]} ${pt1[1] + pt1norm[1]}, ${pt2[0] + pt2norm[0]} ${pt2[1] + pt2norm[1]}, ${pt2[0]} ${pt2[1]}`} />
            {/* <line key="linkLine" className="collectionfreeformlinkview-linkLine"
                style={{ opacity: this._opacity, strokeDasharray: "2 2" }}
                x1={`${pt1[0]}`} y1={`${pt1[1]}`}
                x2={`${pt2[0]}`} y2={`${pt2[1]}`} /> */}
        </>);
    }
}