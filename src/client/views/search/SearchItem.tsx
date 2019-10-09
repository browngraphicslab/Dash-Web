import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faChartBar, faFile, faFilePdf, faFilm, faFingerprint, faGlobeAsia, faImage, faLink, faMusic, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnEmptyString, returnFalse, returnOne, Utils } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { SearchUtil } from "../../util/SearchUtil";
import { Transform } from "../../util/Transform";
import { SEARCH_THUMBNAIL_SIZE } from "../../views/globalCssVariables.scss";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { ContextMenu } from "../ContextMenu";
import { DocumentView } from "../nodes/DocumentView";
import { SearchBox } from "./SearchBox";
import "./SearchItem.scss";
import "./SelectorContextMenu.scss";

export interface SearchItemProps {
    doc: Doc;
    query: string;
    highlighting: string[];
    lines: string[];
}

library.add(faCaretUp);
library.add(faObjectGroup);
library.add(faStickyNote);
library.add(faFile);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia, faFingerprint);

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
        const { docs } = await SearchUtil.Search("", true, { fq: `data_l:"${this.props.doc[Id]}"` });
        const map: Map<Doc, Doc> = new Map;
        const allDocs = await Promise.all(aliases.map(doc => SearchUtil.Search("", true, { fq: `data_l:"${doc[Id]}"` }).then(result => result.docs)));
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
                const newPanX = NumCast(target.x) + NumCast(target.width) / 2;
                const newPanY = NumCast(target.y) + NumCast(target.height) / 2;
                col.panX = newPanX;
                col.panY = newPanY;
            }
            CollectionDockingView.AddRightSplit(col, undefined);
        };
    }
    render() {
        return (
            <div className="parents">
                <p className="contexts">Contexts:</p>
                {[...this._docs, ...this._otherDocs].map(doc => {
                    let item = React.createRef<HTMLDivElement>();
                    return <div className="collection" key={doc.col[Id] + doc.target[Id]} ref={item}>
                        <div className="collection-item" onPointerDown={
                            SetupDrag(item, () => doc.col, undefined, undefined, undefined, undefined, () => SearchBox.Instance.closeSearch())}>
                            <FontAwesomeIcon icon={faStickyNote} />
                        </div>
                        <a onClick={this.getOnClick(doc)}>{doc.col.title}</a>
                    </div>;
                })}
            </div>
        );
    }
}

export interface LinkMenuProps {
    doc1: Doc;
    doc2: Doc;
}

@observer
export class LinkContextMenu extends React.Component<LinkMenuProps> {

    highlightDoc = (doc: Doc) => () => Doc.BrushDoc(doc);

    unHighlightDoc = (doc: Doc) => () => Doc.UnBrushDoc(doc);

    getOnClick = (col: Doc) => () => CollectionDockingView.AddRightSplit(col, undefined);

    render() {
        return (
            <div className="parents">
                <p className="contexts">Anchors:</p>
                <div className="collection"><a onMouseEnter={this.highlightDoc(this.props.doc1)} onMouseLeave={this.unHighlightDoc(this.props.doc1)} onClick={this.getOnClick(this.props.doc1)}>Doc 1: {this.props.doc2.title}</a></div>
                <div><a onMouseEnter={this.highlightDoc(this.props.doc2)} onMouseLeave={this.unHighlightDoc(this.props.doc2)} onClick={this.getOnClick(this.props.doc2)}>Doc 2: {this.props.doc1.title}</a></div>
            </div>
        );
    }

}

@observer
export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;

    onClick = () => {
        // I dont think this is the best functionality because clicking the name of the collection does that. Change it back if you'd like
        DocumentManager.Instance.jumpToDocument(this.props.doc, false);
    }
    @observable _useIcons = true;
    @observable _displayDim = 50;

    componentDidMount() {
        this.props.doc.search_string = this.props.query;
        this.props.doc.search_fields = this.props.highlighting.join(", ");
    }
    componentWillUnmount() {
        this.props.doc.search_string = undefined;
        this.props.doc.search_fields = undefined;
    }

    //@computed
    @action
    public DocumentIcon() {
        let layoutresult = StrCast(this.props.doc.type);
        if (!this._useIcons) {
            let returnXDimension = () => this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
            let returnYDimension = () => this._displayDim;
            let scale = () => returnXDimension() / NumCast(this.props.doc.nativeWidth, returnXDimension());
            const docview = <div
                onPointerDown={action(() => {
                    this._useIcons = !this._useIcons;
                    this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
                })}
                onPointerEnter={action(() => this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE))}
                onPointerLeave={action(() => this._displayDim = 50)} >
                <DocumentView
                    fitToBox={StrCast(this.props.doc.type).indexOf(DocumentType.COL) !== -1}
                    Document={this.props.doc}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    ruleProvider={undefined}
                    ScreenToLocalTransform={Transform.Identity}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    renderDepth={1}
                    PanelWidth={returnXDimension}
                    PanelHeight={returnYDimension}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    ContainingCollectionView={undefined}
                    ContainingCollectionDoc={undefined}
                    ContentScaling={scale}
                />
            </div>;
            return docview;
        }
        let button = layoutresult.indexOf(DocumentType.PDF) !== -1 ? faFilePdf :
            layoutresult.indexOf(DocumentType.IMG) !== -1 ? faImage :
                layoutresult.indexOf(DocumentType.TEXT) !== -1 ? faStickyNote :
                    layoutresult.indexOf(DocumentType.VID) !== -1 ? faFilm :
                        layoutresult.indexOf(DocumentType.COL) !== -1 ? faObjectGroup :
                            layoutresult.indexOf(DocumentType.AUDIO) !== -1 ? faMusic :
                                layoutresult.indexOf(DocumentType.LINK) !== -1 ? faLink :
                                    layoutresult.indexOf(DocumentType.HIST) !== -1 ? faChartBar :
                                        layoutresult.indexOf(DocumentType.WEB) !== -1 ? faGlobeAsia :
                                            faCaretUp;
        return <div onPointerDown={action(() => { this._useIcons = false; this._displayDim = Number(SEARCH_THUMBNAIL_SIZE); })} >
            <FontAwesomeIcon icon={button} size="2x" />
        </div>;
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
    get linkCount() { return LinkManager.Instance.getAllRelatedLinks(this.props.doc).length; }

    @computed
    get linkString(): string {
        let num = this.linkCount;
        if (num === 1) {
            return num.toString() + " link";
        }
        return num.toString() + " links";
    }

    @action
    pointerDown = (e: React.PointerEvent) => { e.preventDefault(); e.button === 0 && SearchBox.Instance.openSearch(e); }

    nextHighlight = (e: React.PointerEvent) => {
        e.preventDefault(); e.button === 0 && SearchBox.Instance.openSearch(e);
        let sstring = StrCast(this.props.doc.search_string);
        this.props.doc.search_string = "";
        setTimeout(() => this.props.doc.search_string = sstring, 0);
    }
    highlightDoc = (e: React.PointerEvent) => {
        if (this.props.doc.type === DocumentType.LINK) {
            if (this.props.doc.anchor1 && this.props.doc.anchor2) {

                let doc1 = Cast(this.props.doc.anchor1, Doc, null);
                let doc2 = Cast(this.props.doc.anchor2, Doc, null);
                Doc.BrushDoc(doc1);
                Doc.BrushDoc(doc2);
            }
        } else {
            Doc.BrushDoc(this.props.doc);
        }
        e.stopPropagation();
    }

    unHighlightDoc = (e: React.PointerEvent) => {
        if (this.props.doc.type === DocumentType.LINK) {
            if (this.props.doc.anchor1 && this.props.doc.anchor2) {

                let doc1 = Cast(this.props.doc.anchor1, Doc, null);
                let doc2 = Cast(this.props.doc.anchor2, Doc, null);
                Doc.UnBrushDoc(doc1);
                Doc.UnBrushDoc(doc2);
            }
        } else {
            Doc.UnBrushDoc(this.props.doc);
        }
    }

    onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({
            description: "Copy ID", event: () => {
                Utils.CopyText(this.props.doc[Id]);
            },
            icon: "fingerprint"
        });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        e.stopPropagation();
        const doc = Doc.IsPrototype(this.props.doc) ? Doc.MakeDelegate(this.props.doc) : this.props.doc;
        DragManager.StartDocumentDrag([e.currentTarget], new DragManager.DocumentDragData([doc]), e.clientX, e.clientY, {
            handlers: { dragComplete: emptyFunction },
            hideSource: false,
        });
    }

    render() {
        const doc1 = Cast(this.props.doc.anchor1, Doc);
        const doc2 = Cast(this.props.doc.anchor2, Doc);
        return (
            <div className="search-overview" onPointerDown={this.pointerDown} onContextMenu={this.onContextMenu}>
                <div className="search-item" onPointerDown={this.nextHighlight} onPointerEnter={this.highlightDoc} onPointerLeave={this.unHighlightDoc} id="result"
                    onClick={this.onClick}>
                    <div className="main-search-info">
                        <div title="Drag as document" onPointerDown={this.onPointerDown} style={{ marginRight: "7px" }}> <FontAwesomeIcon icon="file" size="lg" /> </div>
                        <div className="search-title-container">
                            <div className="search-title">{StrCast(this.props.doc.title)}</div>
                            <div className="search-highlighting">{this.props.highlighting.length ? "Matched fields:" + this.props.highlighting.join(", ") : this.props.lines.length ? this.props.lines[0] : ""}</div>
                            {this.props.lines.filter((m, i) => i).map((l, i) => <div id={i.toString()} className="search-highlighting">`${l}`</div>)}
                        </div>
                        <div className="search-info" style={{ width: this._useIcons ? "15%" : "400px" }}>
                            <div className={`icon-${this._useIcons ? "icons" : "live"}`}>
                                <div className="search-type" title="Click to Preview">{this.DocumentIcon()}</div>
                                <div className="search-label">{this.props.doc.type ? this.props.doc.type : "Other"}</div>
                            </div>
                            <div className="link-container item">
                                <div className="link-count">{this.linkCount}</div>
                                <div className="link-extended">{this.linkString}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="searchBox-instances">
                    {(doc1 instanceof Doc && doc2 instanceof Doc) && this.props.doc.type === DocumentType.LINK ? <LinkContextMenu doc1={doc1} doc2={doc2} /> :
                        <SelectorContextMenu {...this.props} />}
                </div>
            </div>
        );
    }
} 