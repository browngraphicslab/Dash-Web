import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cast, NumCast } from "../../../new_fields/Types";
import { observable, runInAction, computed, action } from "mobx";
import { listSpec } from "../../../new_fields/Schema";
import { Doc } from "../../../new_fields/Doc";
import { DocumentManager } from "../../util/DocumentManager";
import { SetupDrag } from "../../util/DragManager";
import { SearchUtil } from "../../util/SearchUtil";
import { Id } from "../../../new_fields/FieldSymbols";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { observer } from "mobx-react";
import "./SearchItem.scss";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { DocTypes } from "../../documents/Documents";
import { FilterBox } from "./FilterBox";
import { DocumentView } from "../nodes/DocumentView";
import "./SelectorContextMenu.scss";
import { SearchBox } from "./SearchBox";

export interface SearchItemProps {
    doc: Doc;
}

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);

@observer
export class SelectorContextMenu extends React.Component<SearchItemProps> {
    @observable private _docs: { col: Doc, target: Doc }[] = [];
    @observable private _otherDocs: { col: Doc, target: Doc }[] = [];

    constructor(props: SearchItemProps) {
        super(props);
        this.fetchDocuments();
    }

    async fetchDocuments() {
        let aliases = (await SearchUtil.GetViewsOfDocument(this.props.doc)).filter(doc => doc !== this.props.doc);
        const docs = await SearchUtil.Search(`data_l:"${this.props.doc[Id]}"`, true);
        const map: Map<Doc, Doc> = new Map;
        const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search(`data_l:"${doc[Id]}"`, true)));
        allDocs.forEach((docs, index) => docs.forEach(doc => map.set(doc, aliases[index])));
        docs.forEach(doc => map.delete(doc));
        runInAction(() => {
            this._docs = docs.filter(doc => !Doc.AreProtosEqual(doc, CollectionDockingView.Instance.props.Document)).map(doc => ({ col: doc, target: this.props.doc }));
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
            CollectionDockingView.Instance.AddRightSplit(col);
        };
    }

    render() {
        return (
            < div className="parents">
                <p className="contexts">Contexts:</p>
                {this._docs.map(doc => <div className="collection"><a className="title" onClick={this.getOnClick(doc)}>{doc.col.title}</a></div>)}
                {this._otherDocs.map(doc => <div className="collection"><a className="title" onClick={this.getOnClick(doc)}>{doc.col.title}</a></div>)}
            </div>
        );
    }
}

@observer
export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;

    onClick = () => {
        CollectionDockingView.Instance.AddRightSplit(this.props.doc);
    }

    @computed
    public get DocumentIcon() {
        let layoutresult = Cast(this.props.doc.type, "string", "");

        let button = layoutresult.indexOf(DocTypes.PDF) !== -1 ? faFilePdf :
            layoutresult.indexOf(DocTypes.IMG) !== -1 ? faImage :
                layoutresult.indexOf(DocTypes.TEXT) !== -1 ? faStickyNote :
                    layoutresult.indexOf(DocTypes.VID) !== -1 ? faFilm :
                        layoutresult.indexOf(DocTypes.COL) !== -1 ? faObjectGroup :
                            layoutresult.indexOf(DocTypes.AUDIO) !== -1 ? faMusic :
                                layoutresult.indexOf(DocTypes.LINK) !== -1 ? faLink :
                                    layoutresult.indexOf(DocTypes.HIST) !== -1 ? faChartBar :
                                        layoutresult.indexOf(DocTypes.WEB) !== -1 ? faGlobeAsia :
                                            faCaretUp;
        return <FontAwesomeIcon icon={button} size="2x" />;
    }

    collectionRef = React.createRef<HTMLDivElement>();
    startDocDrag = () => {
        let doc = this.props.doc;
        const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
        if (isProto) {
            return Doc.MakeDelegate(doc);
        } else {
            return Doc.MakeAlias(doc);
        }
    }

    @computed
    get linkCount() { return Cast(this.props.doc.linkedToDocs, listSpec(Doc), []).length + Cast(this.props.doc.linkedFromDocs, listSpec(Doc), []).length; }

    @computed
    get linkString(): string {
        let num = this.linkCount;
        if (num === 1) {
            return num.toString() + " link";
        }
        return num.toString() + " links";
    }

    pointerDown = (e: React.PointerEvent) => { SearchBox.Instance.openSearch(e); };

    highlightDoc = (e: React.PointerEvent) => {
        let docViews: DocumentView[] = DocumentManager.Instance.getAllDocumentViews(this.props.doc);
        docViews.forEach(element => {
            element.props.Document.libraryBrush = true;
        });
    }

    unHighlightDoc = (e: React.PointerEvent) => {
        let docViews: DocumentView[] = DocumentManager.Instance.getAllDocumentViews(this.props.doc);
        docViews.forEach(element => {
            element.props.Document.libraryBrush = false;
        });
    }

    render() {
        return (
            <div className="search-overview" onPointerDown={this.pointerDown}>
                <div className="search-item" onPointerEnter={this.highlightDoc} onPointerLeave={this.unHighlightDoc} ref={this.collectionRef} id="result" onClick={this.onClick} onPointerDown={() => {
                    this.pointerDown;
                    SetupDrag(this.collectionRef, this.startDocDrag);
                }} >
                    <div className="main-search-info">
                        <div className="search-title" id="result" >{this.props.doc.title}</div>
                        <div className="search-info">
                            <div className="link-container item">
                                <div className="link-count">{this.linkCount}</div>
                                <div className="link-extended">{this.linkString}</div>
                            </div>
                            <div className="icon">
                                <div className="search-type" >{this.DocumentIcon}</div>
                                <div className="search-label">{this.props.doc.type}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="searchBox-instances">
                    <SelectorContextMenu {...this.props} />
                </div>
            </div>
        );
    }
} 