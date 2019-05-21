import * as React from "react";
import './ParentDocumentSelector.scss';
import { Doc } from "../../../new_fields/Doc";
import { observer } from "mobx-react";
import { observable, action, runInAction } from "mobx";
import { Id } from "../../../new_fields/FieldSymbols";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionDockingView } from "./CollectionDockingView";
import { NumCast } from "../../../new_fields/Types";
import { CollectionViewType } from "./CollectionBaseView";

type SelectorProps = { Document: Doc, addDocTab(doc: Doc, location: string): void };
@observer
export class SelectorContextMenu extends React.Component<SelectorProps> {
    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    constructor(props: SelectorProps) {
        super(props);

        this.fetchDocuments();
    }

    async fetchDocuments() {
        let aliases = (await SearchUtil.GetAliasesOfDocument(this.props.Document)).filter(doc => doc !== this.props.Document);
        const docs = await SearchUtil.Search(`data_l:"${this.props.Document[Id]}"`, true);
        const map: Map<Doc, Doc> = new Map;
        const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search(`data_l:"${doc[Id]}"`, true)));
        allDocs.forEach((docs, index) => docs.forEach(doc => map.set(doc, aliases[index])));
        docs.forEach(doc => map.delete(doc));
        runInAction(() => {
            this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: this.props.Document }));
            this._otherDocs = Array.from(map.entries()).filter(entry => !Doc.AreProtosEqual(entry[0], CollectionDockingView.Instance.props.Document)).map(([col, target]) => ({ col, target }));
        });
    }

    getOnClick({ col, target }: { col: Doc, target: Doc }) {
        return () => {
            col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
            if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
                const newPanX = NumCast(target.x) + NumCast(target.width) / NumCast(target.zoomBasis, 1) / 2;
                const newPanY = NumCast(target.y) + NumCast(target.height) / NumCast(target.zoomBasis, 1) / 2;
                col.panX = newPanX;
                col.panY = newPanY;
            }
            this.props.addDocTab(col, "inTab");
        };
    }

    render() {
        return (
            <>
                {this._docs.map(doc => <p><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)}
                {this._otherDocs.length ? <hr></hr> : null}
                {this._otherDocs.map(doc => <p><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)}
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
