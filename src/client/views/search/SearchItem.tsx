import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faChartBar, faFilePdf, faFilm, faGlobeAsia, faImage, faLink, faMusic, faObjectGroup, faStickyNote, faFingerprint } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocListCast, HeightSym, WidthSym } from "../../../new_fields/Doc";
import { Id } from "../../../new_fields/FieldSymbols";
import { Cast, NumCast, StrCast } from "../../../new_fields/Types";
import { emptyFunction, returnFalse, returnOne, Utils, returnEmptyString } from "../../../Utils";
import { DocumentType } from "../../documents/Documents";
import { DocumentManager } from "../../util/DocumentManager";
import { SetupDrag, DragManager } from "../../util/DragManager";
import { LinkManager } from "../../util/LinkManager";
import { SearchUtil } from "../../util/SearchUtil";
import { Transform } from "../../util/Transform";
import { SEARCH_THUMBNAIL_SIZE } from "../../views/globalCssVariables.scss";
import { CollectionViewType } from "../collections/CollectionBaseView";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { DocumentView } from "../nodes/DocumentView";
import { SearchBox } from "./SearchBox";
import "./SearchItem.scss";
import "./SelectorContextMenu.scss";
import { RichTextField } from "../../../new_fields/RichTextField";
import { FormattedTextBox } from "../nodes/FormattedTextBox";
import { MarqueeView } from "../collections/collectionFreeForm/MarqueeView";
import { SelectionManager } from "../../util/SelectionManager";
import { ObjectField } from "../../../new_fields/ObjectField";
import { ContextMenu } from "../ContextMenu";
import { faFile } from '@fortawesome/free-solid-svg-icons';
import { DocServer } from "../../DocServer";

export interface SearchItemProps {
    doc: Doc;
    query?: string;
    highlighting: string[];
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
                const newPanX = NumCast(target.x) + NumCast(target.width) / NumCast(target.zoomBasis, 1) / 2;
                const newPanY = NumCast(target.y) + NumCast(target.height) / NumCast(target.zoomBasis, 1) / 2;
                col.panX = newPanX;
                col.panY = newPanY;
            }
            CollectionDockingView.Instance.AddRightSplit(col, undefined);
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

    highlightDoc = (doc: Doc) => {
        return () => {
            doc.libraryBrush = true;
        };
    }

    unHighlightDoc = (doc: Doc) => {
        return () => {
            doc.libraryBrush = false;
        };
    }

    getOnClick(col: Doc) {
        return () => {
            CollectionDockingView.Instance.AddRightSplit(col, undefined);
        };
    }

    render() {
        return (
            <div className="parents">
                <p className="contexts">Anchors:</p>
                <div className="collection"><a onMouseEnter={this.highlightDoc(this.props.doc1)} onMouseLeave={this.unHighlightDoc(this.props.doc1)} onClick={this.getOnClick(this.props.doc1)}>Doc 1: {this.props.doc2.title}</a></div>
                <div><a onMouseEnter={this.highlightDoc(this.props.doc2)} onMouseLeave={this.unHighlightDoc(this.props.doc2)} onClick={this.getOnClick(this.props.doc2)}>Doc 2: {this.props.doc1.title}</a></div>
            </div>
        )
    }

}

@observer
export class SearchItem extends React.Component<SearchItemProps> {

    @observable _selected: boolean = false;
    private _previewDoc?: Doc;

    onClick = () => {
        // I dont think this is the best functionality because clicking the name of the collection does that. Change it back if you'd like
        DocumentManager.Instance.jumpToDocument(this.props.doc, false);
        if (this.props.doc.data instanceof RichTextField) {
            this.highlightTextBox(this.props.doc);
        }
        // CollectionDockingView.Instance.AddRightSplit(this.props.doc, undefined);
    }
    @observable _useIcons = true;
    @observable _displayDim = 50;

    highlightTextBox = (doc: Doc) => {
        if (this.props.query) {
            const fieldkey = 'search_string';
            if (Object.keys(doc).indexOf(fieldkey) === -1) {
                doc.search_string = this.props.query;
            }
            else {
                doc.search_string = undefined;
            }

        }
    }

    fitToBox = () => {
        let bounds = Doc.ComputeContentBounds([this.props.doc]);
        return [(bounds.x + bounds.r) / 2, (bounds.y + bounds.b) / 2, Number(SEARCH_THUMBNAIL_SIZE) / Math.max((bounds.b - bounds.y), (bounds.r - bounds.x)), this._displayDim];
    }

    componentWillUnmount() {
        if (this._previewDoc) {
            DocServer.DeleteDocument(this._previewDoc[Id]);
        }
    }


    //@computed
    @action
    public DocumentIcon() {
        let layoutresult = StrCast(this.props.doc.type);
        if (!this._useIcons) {
            let renderDoc = this.props.doc;
            //let box: number[] = [];
            if (layoutresult.indexOf(DocumentType.COL) !== -1) {
                renderDoc = Doc.MakeDelegate(renderDoc);
                let bounds = DocListCast(renderDoc.data).reduce((bounds, doc) => {
                    var [sptX, sptY] = [NumCast(doc.x), NumCast(doc.y)];
                    let [bptX, bptY] = [sptX + doc[WidthSym](), sptY + doc[HeightSym]()];
                    return {
                        x: Math.min(sptX, bounds.x), y: Math.min(sptY, bounds.y),
                        r: Math.max(bptX, bounds.r), b: Math.max(bptY, bounds.b)
                    };
                }, { x: Number.MAX_VALUE, y: Number.MAX_VALUE, r: Number.MIN_VALUE, b: Number.MIN_VALUE });
                let box = () => [(bounds.x + bounds.r) / 2, (bounds.y + bounds.b) / 2, Number(SEARCH_THUMBNAIL_SIZE) / (bounds.r - bounds.x), this._displayDim];
            }
            let returnXDimension = () => this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
            let returnYDimension = () => this._displayDim;
            let scale = () => returnXDimension() / NumCast(renderDoc.nativeWidth, returnXDimension());
            let newRenderDoc = Doc.MakeDelegate(renderDoc); ///   newRenderDoc -> renderDoc -> render"data"Doc -> TextProt
            this._previewDoc = newRenderDoc;
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
                    ScreenToLocalTransform={Transform.Identity}
                    addDocTab={returnFalse}
                    renderDepth={1}
                    PanelWidth={returnXDimension}
                    PanelHeight={returnYDimension}
                    focus={emptyFunction}
                    backgroundColor={returnEmptyString}
                    selectOnLoad={false}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={emptyFunction}
                    zoomToScale={emptyFunction}
                    getScale={returnOne}
                    ContainingCollectionView={undefined}
                    ContentScaling={scale}
                />
            </div>;
            const data = renderDoc.data;
            if (data instanceof ObjectField) newRenderDoc.data = ObjectField.MakeCopy(data);
            newRenderDoc.preview = true;
            newRenderDoc.search_string = this.props.query;
            return docview;
        }
        if (this._previewDoc) {
            DocServer.DeleteDocument(this._previewDoc[Id]);
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

    highlightDoc = (e: React.PointerEvent) => {
        if (this.props.doc.type === DocumentType.LINK) {
            if (this.props.doc.anchor1 && this.props.doc.anchor2) {

                let doc1 = Cast(this.props.doc.anchor1, Doc, null);
                let doc2 = Cast(this.props.doc.anchor2, Doc, null);
                doc1 && (doc1.libraryBrush = true);
                doc2 && (doc2.libraryBrush = true);
            }
        } else {
            let docViews: DocumentView[] = DocumentManager.Instance.getAllDocumentViews(this.props.doc);
            docViews.forEach(element => {
                element.props.Document.libraryBrush = true;
            });
        }
    }

    unHighlightDoc = (e: React.PointerEvent) => {
        if (this.props.doc.type === DocumentType.LINK) {
            if (this.props.doc.anchor1 && this.props.doc.anchor2) {

                let doc1 = Cast(this.props.doc.anchor1, Doc, null);
                let doc2 = Cast(this.props.doc.anchor2, Doc, null);
                doc1 && (doc1.libraryBrush = false);
                doc2 && (doc2.libraryBrush = false);
            }
        } else {
            let docViews: DocumentView[] = DocumentManager.Instance.getAllDocumentViews(this.props.doc);
            docViews.forEach(element => {
                element.props.Document.libraryBrush = false;
            });
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
        DragManager.StartDocumentDrag([e.currentTarget], new DragManager.DocumentDragData([doc], []), e.clientX, e.clientY, {
            handlers: { dragComplete: emptyFunction },
            hideSource: false,
        });
    }

    render() {
        const doc1 = Cast(this.props.doc.anchor1, Doc);
        const doc2 = Cast(this.props.doc.anchor2, Doc);
        return (
            <div className="search-overview" onPointerDown={this.pointerDown} onContextMenu={this.onContextMenu}>
                <div className="search-item" onPointerEnter={this.highlightDoc} onPointerLeave={this.unHighlightDoc} id="result"
                    onClick={this.onClick} onPointerDown={this.pointerDown} >
                    <div className="main-search-info">
                        <div title="Drag as document" onPointerDown={this.onPointerDown} style={{ marginRight: "7px" }}> <FontAwesomeIcon icon="file" size="lg" /> </div>
                        <div className="search-title-container">
                            <div className="search-title">{StrCast(this.props.doc.title)}</div>
                            <div className="search-highlighting">Matched fields: {this.props.highlighting.join(", ")}</div>
                        </div>
                        <div className="search-info" style={{ width: this._useIcons ? "15%" : "400px" }}>
                            <div className={`icon-${this._useIcons ? "icons" : "live"}`}>
                                <div className="search-type" title="Click to Preview">{this.DocumentIcon}</div>
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
                    {(doc1 instanceof Doc && doc2 instanceof Doc) ? this.props.doc.type === DocumentType.LINK ? <LinkContextMenu doc1={doc1} doc2={doc2} /> :
                        <SelectorContextMenu {...this.props} /> : null}
                </div>
            </div>
        );
    }
} 