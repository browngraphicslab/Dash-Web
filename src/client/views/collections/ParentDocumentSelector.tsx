import * as React from "react";
import './ParentDocumentSelector.scss';
import { Doc } from "../../../new_fields/Doc";
import { observer } from "mobx-react";
import { observable, action, runInAction } from "mobx";
import { Id } from "../../../new_fields/FieldSymbols";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionDockingView } from "./CollectionDockingView";

type SelectorProps = { Document: Doc, addDocTab(doc: Doc, location: string): void };
@observer
export class SelectorContextMenu extends React.Component<SelectorProps> {
    @observable private _docs: Doc[] = [];
    @observable private _otherDocs: Doc[] = [];

    constructor(props: SelectorProps) {
        super(props);

        this.fetchDocuments();
    }

    async fetchDocuments() {
        let aliases = (await SearchUtil.GetAliasesOfDocument(this.props.Document)).filter(doc => doc !== this.props.Document);
        const docs = await SearchUtil.Search(`data_l:"${this.props.Document[Id]}"`, true);
        const otherDocs: Set<Doc> = new Set;
        const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search(`data_l:"${doc[Id]}"`, true)));
        allDocs.forEach(docs => docs.forEach(doc => otherDocs.add(doc)));
        docs.forEach(doc => otherDocs.delete(doc));
        runInAction(() => {
            this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document));
            this._otherDocs = Array.from(otherDocs).filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document));
        });
    }

    render() {
        return (
            <>
                {this._docs.map(doc => <p><a onClick={() => this.props.addDocTab(Doc.IsPrototype(doc) ? Doc.MakeDelegate(doc) : doc, "inTab")}>{doc.title}</a></p>)}
                {this._otherDocs.length ? <hr></hr> : null}
                {this._otherDocs.map(doc => <p><a onClick={() => this.props.addDocTab(Doc.IsPrototype(doc) ? Doc.MakeDelegate(doc) : doc, "inTab")}>{doc.title}</a></p>)}
            </>
        );
    }
}

@observer
export class ParentDocSelector extends React.Component<SelectorProps> {
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
                    <SelectorContextMenu {...this.props} />
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
