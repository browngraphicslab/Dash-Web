import * as React from "react";
import './ParentDocumentSelector.scss';
import { Doc } from "../../../new_fields/Doc";
import { observer } from "mobx-react";
import { observable, action, runInAction } from "mobx";
import { Id } from "../../../new_fields/RefField";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionDockingView } from "./CollectionDockingView";

@observer
export class SelectorContextMenu extends React.Component<{ Document: Doc }> {
    @observable private _docs: Doc[] = [];

    constructor(props: { Document: Doc }) {
        super(props);

        this.fetchDocuments();
    }

    async fetchDocuments() {
        const docs = await SearchUtil.Search(`data_l:${this.props.Document[Id]}`, true);
        runInAction(() => this._docs = docs);
    }

    render() {
        return (
            <>
                {this._docs.map(doc => <p><a onClick={() => CollectionDockingView.Instance.AddRightSplit(doc)}>{doc.title}</a></p>)}
            </>
        );
    }
}

@observer
export class ParentDocSelector extends React.Component<{ Document: Doc }> {
    @observable hover = false;

    @action
    onMouseLeave = () => {
        this.hover = false;
    }

    @action
    onMouseEnter = () => {
        this.hover = true;
    }

    render() {
        let flyout;
        if (this.hover) {
            flyout = (
                <div className="PDS-flyout">
                    <SelectorContextMenu Document={this.props.Document} />
                </div>
            );
        }
        return (
            <span style={{ position: "relative", display: "inline-block" }}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}>
                <p>^</p>
                {flyout}
            </span>
        );
    }
}
