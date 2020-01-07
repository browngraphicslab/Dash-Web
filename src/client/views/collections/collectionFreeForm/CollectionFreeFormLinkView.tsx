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
        this._anchorDisposer = reaction(() => [this.props.A.props.ScreenToLocalTransform(), this.props.B.props.ScreenToLocalTransform()],
            action(() => {
                setTimeout(action(() => this._opacity = 1), 0); // since the render code depends on querying the Dom through getBoudndingClientRect, we need to delay triggering render()
                setTimeout(action(() => this._opacity = 0.05), 750); // this will unhighlight the link line.
                const acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
                const bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
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
                const afield = StrCast(this.props.A.props.Document[StrCast(this.props.A.props.layoutKey, "layout")]).indexOf("anchor1") === -1 ? "anchor2" : "anchor1";
                const bfield = afield === "anchor1" ? "anchor2" : "anchor1";
                this.props.A.props.Document[afield + "_x"] = (apt.point.x - abounds.left) / abounds.width * 100;
                this.props.A.props.Document[afield + "_y"] = (apt.point.y - abounds.top) / abounds.height * 100;
                this.props.A.props.Document[bfield + "_x"] = (bpt.point.x - bbounds.left) / bbounds.width * 100;
                this.props.A.props.Document[bfield + "_y"] = (bpt.point.y - bbounds.top) / bbounds.height * 100;
            })
            , { fireImmediately: true });
    }
    @action
    componentWillUnmount() {
        this._anchorDisposer?.();
    }

    render() {
        const acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
        const bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
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
        let aActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        let bActive = this.props.A.isSelected() || Doc.IsBrushed(this.props.A.props.Document);
        return !aActive && !bActive ? (null) :
            <line key="linkLine" className="collectionfreeformlinkview-linkLine"
                style={{ opacity: this._opacity }}
                x1={`${pt1[0]}`} y1={`${pt1[1]}`}
                x2={`${pt2[0]}`} y2={`${pt2[1]}`} />;
    }
}