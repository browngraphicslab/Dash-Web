import * as React from "react";
import './ParentDocumentSelector.scss';
import { Doc } from "../../../fields/Doc";
import { observer } from "mobx-react";
import { observable, action, runInAction, trace, computed, reaction, IReactionDisposer } from "mobx";
import { Id } from "../../../fields/FieldSymbols";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionDockingView } from "./CollectionDockingView";
import { NumCast, StrCast } from "../../../fields/Types";
import { CollectionViewType } from "./CollectionView";
import { DocumentButtonBar } from "../DocumentButtonBar";
import { DocumentManager } from "../../util/DocumentManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCog, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { DocumentView } from "../nodes/DocumentView";
import { SelectionManager } from "../../util/SelectionManager";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faCog);

type SelectorProps = {
    Document: Doc,
    Stack?: any,
    addDocTab(doc: Doc, location: string): void
};

@observer
export class SelectorContextMenu extends React.Component<SelectorProps> {
    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];
    _reaction: IReactionDisposer | undefined;

    componentDidMount() {
        this._reaction = reaction(() => this.props.Document, () => this.fetchDocuments(), { fireImmediately: true });
    }
    componentWillUnmount() {
        this._reaction?.();
    }
    async fetchDocuments() {
        const aliases = (await SearchUtil.GetAliasesOfDocument(this.props.Document));
        const containerProtoSets = await Promise.all(aliases.map(async alias =>
            ((await SearchUtil.Search("", true, { fq: `data_l:"${alias[Id]}"` })).docs)));
        const containerProtos = containerProtoSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>());
        const containerSets = await Promise.all(Array.from(containerProtos.keys()).map(async container => {
            return (SearchUtil.GetAliasesOfDocument(container));
        }));
        const containers = containerSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>());
        const doclayoutSets = await Promise.all(Array.from(containers.keys()).map(async (dp) => {
            return (SearchUtil.GetAliasesOfDocument(dp));
        }));
        const doclayouts = Array.from(doclayoutSets.reduce((p, set) => { set.map(s => p.add(s)); return p; }, new Set<Doc>()).keys());
        runInAction(() => {
            this._docs = doclayouts.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: this.props.Document }));
            this._otherDocs = [];
        });
    }

    getOnClick({ col, target }: { col: Doc, target: Doc }) {
        return () => {
            col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
            if (col._viewType === CollectionViewType.Freeform) {
                const newPanX = NumCast(target.x) + NumCast(target._width) / 2;
                const newPanY = NumCast(target.y) + NumCast(target._height) / 2;
                col._panX = newPanX;
                col._panY = newPanY;
            }
            this.props.addDocTab(col, "inTab"); // bcz: dataDoc?
        };
    }

    render() {
        return <div >
            <p key="contexts">Contexts:</p>
            {this._docs.map(doc => <p key={doc.col[Id] + doc.target[Id]}><a onClick={this.getOnClick(doc)}>{doc.col.title?.toString()}</a></p>)}
            {this._otherDocs.length ? <hr key="hr" /> : null}
            {this._otherDocs.map(doc => <p key={"p" + doc.col[Id] + doc.target[Id]}><a onClick={this.getOnClick(doc)}>{doc.col.title?.toString()}</a></p>)}
        </div>;
    }
}

@observer
export class ParentDocSelector extends React.Component<SelectorProps> {
    render() {
        const flyout = (
            <div className="parentDocumentSelector-flyout" title=" ">
                <SelectorContextMenu {...this.props} />
            </div>
        );
        return <div title="Show Contexts" onPointerDown={e => e.stopPropagation()} className="parentDocumentSelector-linkFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout}>
                <span className="parentDocumentSelector-button" >
                    <FontAwesomeIcon icon={faChevronCircleUp} size={"lg"} />
                </span>
            </Flyout>
        </div>;
    }
}

@observer
export class DockingViewButtonSelector extends React.Component<{ views: () => DocumentView[], Stack: any }> {
    customStylesheet(styles: any) {
        return {
            ...styles,
            panel: {
                ...styles.panel,
                minWidth: "100px"
            },
        };
    }
    _ref = React.createRef<HTMLDivElement>();

    @computed get flyout() {
        return (
            <div className="ParentDocumentSelector-flyout" title=" " ref={this._ref}>
                <DocumentButtonBar views={this.props.views} stack={this.props.Stack} />
            </div>
        );
    }

    render() {
        return <span title="Tap for menu, drag tab as document"
            onPointerDown={e => {
                if (getComputedStyle(this._ref.current!).width !== "100%") {
                    e.stopPropagation(); e.preventDefault();
                }
                this.props.views()[0]?.select(false);
            }} className="buttonSelector">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={this.flyout} stylesheet={this.customStylesheet}>
                <FontAwesomeIcon icon={"cog"} size={"sm"} />
            </Flyout>
        </span>;
    }
}
