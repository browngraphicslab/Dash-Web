import { observer } from "mobx-react";
import { Doc } from "../../../../new_fields/Doc";
import { Utils } from '../../../../Utils';
import { DocumentView } from "../../nodes/DocumentView";
import "./CollectionFreeFormLinkView.scss";
import React = require("react");
import v5 = require("uuid/v5");
import { DocumentType } from "../../../documents/DocumentTypes";
import { observable, action } from "mobx";

export interface CollectionFreeFormLinkViewProps {
    A: DocumentView;
    B: DocumentView;
    LinkDocs: Doc[];
}

@observer
export class CollectionFreeFormLinkView extends React.Component<CollectionFreeFormLinkViewProps> {
    @observable _alive: number = 0;
    @action
    componentDidMount() {
        this._alive = 1;
        setTimeout(this.rerender, 50);
    }
    @action
    componentWillUnmount() {
        this._alive = 0;
    }
    rerender = action(() => {
        if (this._alive) {
            setTimeout(this.rerender, 50);
            this._alive++;
        }
    });

    render() {
        let y = this._alive;
        let acont = this.props.A.props.Document.type === DocumentType.LINK ? this.props.A.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
        let bcont = this.props.B.props.Document.type === DocumentType.LINK ? this.props.B.ContentDiv!.getElementsByClassName("docuLinkBox-cont") : [];
        let a = (acont.length ? acont[0] : this.props.A.ContentDiv!).getBoundingClientRect();
        let b = (bcont.length ? bcont[0] : this.props.B.ContentDiv!).getBoundingClientRect();
        let pt1 = Utils.getNearestPointInPerimeter(a.left, a.top, a.width, a.height, b.left + b.width / 2, b.top + b.height / 2);
        let pt2 = Utils.getNearestPointInPerimeter(b.left, b.top, b.width, b.height, a.left + a.width / 2, a.top + a.height / 2);
        return (<line key="linkLine" className="collectionfreeformlinkview-linkLine"
            x1={`${pt1[0]}`} y1={`${pt1[1]}`}
            x2={`${pt2[0]}`} y2={`${pt2[1]}`} />);
    }
}