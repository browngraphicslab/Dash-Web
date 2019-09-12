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

type SelectorProps = { Document: Doc, addDocTab(doc: Doc, dataDoc: Doc | undefined, location: string): void };
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
        const { docs } = await SearchUtil.Search("", true, { fq: `data_l:"${this.props.Document[Id]}"` });
        const map: Map<Doc, Doc> = new Map;
        const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search("", true, { fq: `data_l:"${doc[Id]}"` }).then(result => result.docs)));
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
                const newPanX = NumCast(target.x) + NumCast(target.width) / 2;
                const newPanY = NumCast(target.y) + NumCast(target.height) / 2;
                col.panX = newPanX;
                col.panY = newPanY;
            }
            this.props.addDocTab(col, undefined, "inTab"); // bcz: dataDoc?
        };
    }

    render() {
        return (
            <>
                <p key="contexts">Contexts:</p>
                {this._docs.map(doc => <p key={doc.col[Id] + doc.target[Id]}><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)}
                {this._otherDocs.length ? <hr key="hr" /> : null}
                {this._otherDocs.map(doc => <p key="p"><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></p>)}
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
                <div className="PDS-flyout" title=" ">
                    <SelectorContextMenu {...this.props} />
                </div>
            );
        }
        return (
            <span style={{ position: "relative", display: "inline-block", paddingLeft: "5px", paddingRight: "5px" }}
                onMouseEnter={this.onMouseEnter}
                onMouseLeave={this.onMouseLeave}>
                <p>^</p>
                {flyout}
            </span>
        );
    }
}
