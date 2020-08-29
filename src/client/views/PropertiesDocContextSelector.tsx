import { IReactionDisposer, observable, reaction, runInAction } from "mobx";
import { observer } from "mobx-react";
import * as React from "react";
import { Doc } from "../../fields/Doc";
import { Id } from "../../fields/FieldSymbols";
import { NumCast, StrCast } from "../../fields/Types";
import { CollectionViewType } from "./collections/CollectionView";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import './PropertiesDocContextSelector.scss';
import { SearchUtil } from "../util/SearchUtil";

type PropertiesDocContextSelectorProps = {
    Document: Doc,
    Stack?: any,
    hideTitle?: boolean,
    addDocTab(doc: Doc, location: string): void
};

@observer
export class PropertiesDocContextSelector extends React.Component<PropertiesDocContextSelectorProps> {
    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];
    _reaction: IReactionDisposer | undefined;

    componentDidMount() { this._reaction = reaction(() => this.props.Document, () => this.fetchDocuments(), { fireImmediately: true }); }
    componentWillUnmount() { this._reaction?.(); }
    async fetchDocuments() {
        const aliases = await SearchUtil.GetAliasesOfDocument(this.props.Document);
        const containerProtoSets = await Promise.all(aliases.map(async alias => ((await SearchUtil.Search("", true, { fq: `data_l:"${alias[Id]}"` })).docs)));
        const containerProtos = containerProtoSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>());
        const containerSets = await Promise.all(Array.from(containerProtos.keys()).map(async container => SearchUtil.GetAliasesOfDocument(container)));
        const containers = containerSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>());
        const doclayoutSets = await Promise.all(Array.from(containers.keys()).map(async (dp) => SearchUtil.GetAliasesOfDocument(dp)));
        const doclayouts = Array.from(doclayoutSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>()).keys());
        runInAction(() => {
            this._docs = doclayouts.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).filter(doc => !Doc.IsSystem(doc)).map(doc => ({ col: doc, target: this.props.Document }));
            this._otherDocs = [];
        });
    }

    getOnClick = (col: Doc, target: Doc) => {
        col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
        if (col._viewType === CollectionViewType.Freeform) {
            col._panX = NumCast(target.x) + NumCast(target._width) / 2;
            col._panY = NumCast(target.y) + NumCast(target._height) / 2;
        }
        this.props.addDocTab(col, "add:right");
    }

    render() {
        return <div>
            {this.props.hideTitle ? (null) : <p key="contexts">Contexts:</p>}
            {this._docs.map(doc => <p key={doc.col[Id] + doc.target[Id]}><a onClick={() => this.getOnClick(doc.col, doc.target)}>{StrCast(doc.col.title)}</a></p>)}
            {this._otherDocs.length ? <hr key="hr" /> : null}
            {this._otherDocs.map(doc => <p key={"p" + doc.col[Id] + doc.target[Id]}><a onClick={() => this.getOnClick(doc.col, doc.target)}>{StrCast(doc.col.title)}</a></p>)}
        </div>;
    }
}