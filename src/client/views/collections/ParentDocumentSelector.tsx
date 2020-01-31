import * as React from "react";
import './ParentDocumentSelector.scss';
import { Doc } from "../../../new_fields/Doc";
import { observer } from "mobx-react";
import { observable, action, runInAction } from "mobx";
import { Id } from "../../../new_fields/FieldSymbols";
import { SearchUtil } from "../../util/SearchUtil";
import { CollectionDockingView } from "./CollectionDockingView";
import { NumCast, StrCast } from "../../../new_fields/Types";
import { CollectionViewType } from "./CollectionView";
import { DocumentButtonBar } from "../DocumentButtonBar";
import { DocumentManager } from "../../util/DocumentManager";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faChevronCircleUp } from "@fortawesome/free-solid-svg-icons";
import { library } from "@fortawesome/fontawesome-svg-core";
import { MetadataEntryMenu } from "../MetadataEntryMenu";
import { DocumentView } from "../nodes/DocumentView";
const higflyout = require("@hig/flyout");
export const { anchorPoints } = higflyout;
export const Flyout = higflyout.default;

library.add(faEdit);

type SelectorProps = { Document: Doc, Views: DocumentView[], Stack?: any, addDocTab(doc: Doc, dataDoc: Doc | undefined, location: string): void };
@observer
export class SelectorContextMenu extends React.Component<SelectorProps> {
    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    constructor(props: SelectorProps) {
        super(props);

        this.fetchDocuments();
    }

    async fetchDocuments() {
        const aliases = (await SearchUtil.GetAliasesOfDocument(this.props.Document)).filter(doc => doc !== this.props.Document);
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
    get metadataMenu() {
        return <div className="parentDocumentSelector-metadata">
            <Flyout anchorPoint={anchorPoints.TOP_LEFT}
                content={<MetadataEntryMenu docs={() => this.props.Views.map(dv => dv.props.Document)} suggestWithFunction />}>{/* tfs: @bcz This might need to be the data document? */}
                <div className="docDecs-tagButton" title="Add fields"><FontAwesomeIcon className="documentdecorations-icon" icon="tag" size="sm" /></div>
            </Flyout>
        </div>;
    }

    render() {
        return <div >
            <div key="metadata">Metadata: {this.metadataMenu}</div>
            <p key="contexts">Contexts:</p>
            {this._docs.map(doc => <p key={doc.col[Id] + doc.target[Id]}><a onClick={this.getOnClick(doc)}>{doc.col.title?.toString()}</a></p>)}
            {this._otherDocs.length ? <hr key="hr" /> : null}
            {this._otherDocs.map(doc => <p key="p"><a onClick={this.getOnClick(doc)}>{doc.col.title?.toString()}</a></p>)}
        </div>;
    }
}

@observer
export class ParentDocSelector extends React.Component<SelectorProps> {
    render() {
        const flyout = (
            <div className="parentDocumentSelector-flyout" style={{}} title=" ">
                <SelectorContextMenu {...this.props} />
            </div>
        );
        return <div title="Tap to View Contexts/Metadata" onPointerDown={e => e.stopPropagation()} className="parentDocumentSelector-linkFlyout">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP}
                content={flyout}>
                <span className="parentDocumentSelector-button" >
                    <FontAwesomeIcon icon={faChevronCircleUp} size={"lg"} />
                </span>
            </Flyout>
        </div>;
    }
}

@observer
export class ButtonSelector extends React.Component<{ Document: Doc, Stack: any }> {
    @observable hover = false;

    @action
    onPointerDown = (e: React.PointerEvent) => {
        this.hover = !this.hover;
        e.stopPropagation();
    }
    customStylesheet(styles: any) {
        return {
            ...styles,
            panel: {
                ...styles.panel,
                minWidth: "100px"
            },
        };
    }

    render() {
        const view = DocumentManager.Instance.getDocumentView(this.props.Document);
        const flyout = (
            <div className="ParentDocumentSelector-flyout" title=" ">
                <DocumentButtonBar views={[view]} stack={this.props.Stack} />
            </div>
        );
        return <span title="Tap for menu" onPointerDown={e => e.stopPropagation()} className="buttonSelector">
            <Flyout anchorPoint={anchorPoints.LEFT_TOP} content={flyout} stylesheet={this.customStylesheet}>
                <FontAwesomeIcon icon={faEdit} size={"sm"} />
            </Flyout>
        </span>;
    }
}
