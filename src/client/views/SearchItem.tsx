import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Cast } from "../../new_fields/Types";
import { observable, runInAction } from "mobx";
import { listSpec } from "../../new_fields/Schema";
import { Doc } from "../../new_fields/Doc";
import { DocumentManager } from "../util/DocumentManager";
import { SetupDrag } from "../util/DragManager";
import { SearchUtil } from "../util/SearchUtil";
import { Id } from "../../new_fields/FieldSymbols";
import { CollectionDockingView } from "./collections/CollectionDockingView";
import { observer } from "mobx-react";
import "./SearchItem.scss";

export interface SearchItemProps {
    doc: Doc;
    // addDocTab(doc: Doc, location: string): void
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
            console.log("returning!")
            // col = Doc.IsPrototype(col) ? Doc.MakeDelegate(col) : col;
            // if (NumCast(col.viewType, CollectionViewType.Invalid) === CollectionViewType.Freeform) {
            //     const newPanX = NumCast(target.x) + NumCast(target.width) / NumCast(target.zoomBasis, 1) / 2;
            //     const newPanY = NumCast(target.y) + NumCast(target.height) / NumCast(target.zoomBasis, 1) / 2;
            //     col.panX = newPanX;
            //     col.panY = newPanY;
            // }
            // this.props.addDocTab(col, "inTab");
        };
    }

    render() {
        return (
            < div className="parents">
                <p>Contexts:</p>
                    {this._docs.map(doc => <div className = "collection"><a  onClick={this.getOnClick(doc)}>{doc.col.title}</a></div>)}
                    {this._otherDocs.map(doc =><div className = "collection"><a onClick={this.getOnClick(doc)}>{doc.col.title}</a></div>)}
            </div>
        );
    }
}

@observer
export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;
    @observable hover = false;

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.props.doc);
    }

    public DocumentIcon() {
        let layoutresult = Cast(this.props.doc.type, "string", "");

        let button = layoutresult.indexOf("pdf") !== -1 ? faFilePdf :
            layoutresult.indexOf("image") !== -1 ? faImage :
                layoutresult.indexOf("text") !== -1 ? faStickyNote :
                    layoutresult.indexOf("video") !== -1 ? faFilm :
                        layoutresult.indexOf("collection") !== -1 ? faObjectGroup :
                            layoutresult.indexOf("audio") !== -1 ? faMusic :
                                layoutresult.indexOf("link") !== -1 ? faLink :
                                    layoutresult.indexOf("histogram") !== -1 ? faChartBar :
                                        layoutresult.indexOf("web") !== -1 ? faGlobeAsia :
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

    linkCount = () => {
        return Cast(this.props.doc.linkedToDocs, listSpec(Doc), []).length + Cast(this.props.doc.linkedFromDocs, listSpec(Doc), []).length;
    }

    render() {
        return (
            <div className="search-overview">
                <div className="search-item" ref={this.collectionRef} id="result" onClick={this.onClick} onPointerDown={SetupDrag(this.collectionRef, this.startDocDrag)} >
                    <div className="main-search-info">
                        <div className="search-title" id="result" >{this.props.doc.title}</div>
                        <div className="search-info">
                            <div className="link-count">{this.linkCount()}</div>
                            <div className="search-type" >{this.DocumentIcon()}</div>
                        </div>
                    </div>
                        <div className="found">Where Found: (i.e. title, body, etc)</div>
                </div>
                <div className="searchBox-instances">
                    <SelectorContextMenu {...this.props} />
                </div>
            </div>
        );
    }
} 