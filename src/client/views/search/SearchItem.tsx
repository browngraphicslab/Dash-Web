import React = require("react");
import { library } from '@fortawesome/fontawesome-svg-core';
import { faCaretUp, faChartBar, faFile, faFilePdf, faFilm, faFingerprint, faGlobeAsia, faImage, faLink, faMusic, faObjectGroup, faStickyNote } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { action, computed, observable, runInAction } from "mobx";
import { observer } from "mobx-react";
import { Doc, DocCastAsync } from "../../../fields/Doc";
import { Id } from "../../../fields/FieldSymbols";
import { Cast, NumCast, StrCast } from "../../../fields/Types";
import { emptyFunction, emptyPath, returnFalse, Utils, returnTrue, returnOne, returnZero } from "../../../Utils";
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentManager } from "../../util/DocumentManager";
import { DragManager, SetupDrag } from "../../util/DragManager";
import { SearchUtil } from "../../util/SearchUtil";
import { Transform } from "../../util/Transform";
import { SEARCH_THUMBNAIL_SIZE } from "../../views/globalCssVariables.scss";
import { CollectionDockingView } from "../collections/CollectionDockingView";
import { CollectionViewType, CollectionView } from "../collections/CollectionView";
import { ParentDocSelector } from "../collections/ParentDocumentSelector";
import { ContextMenu } from "../ContextMenu";
import { ContentFittingDocumentView } from "../nodes/ContentFittingDocumentView";
import { SearchBox } from "./SearchBox";
import "./SearchItem.scss";
import "./SelectorContextMenu.scss";
import { FieldViewProps, FieldView } from "../nodes/FieldView";
import { ViewBoxBaseComponent } from "../DocComponent";
import { makeInterface, createSchema, listSpec } from "../../../fields/Schema";
import { documentSchema } from "../../../fields/documentSchemas";
import { PrefetchProxy } from "../../../fields/Proxy";
import { Docs } from "../../documents/Documents";
import { ScriptField } from "../../../fields/ScriptField";
import { CollectionStackingView } from "../collections/CollectionStackingView";

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
        const aliases = (await SearchUtil.GetViewsOfDocument(this.props.doc)).filter(doc => doc !== this.props.doc);
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
            if (col._viewType === CollectionViewType.Freeform) {
                const newPanX = NumCast(target.x) + NumCast(target._width) / 2;
                const newPanY = NumCast(target.y) + NumCast(target._height) / 2;
                col._panX = newPanX;
                col._panY = newPanY;
            }
            CollectionDockingView.AddRightSplit(col);
        };
    }
    render() {
        return (
            <div className="parents">
                <p className="contexts">Contexts:</p>
                {[...this._docs, ...this._otherDocs].map(doc => {
                    const item = React.createRef<HTMLDivElement>();
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

    getOnClick = (col: Doc) => () => CollectionDockingView.AddRightSplit(col);

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


type SearchSchema = makeInterface<[typeof documentSchema]>;

export const SearchSchema = createSchema({
    targetDoc: Doc,
});

const SearchDocument = makeInterface(documentSchema);



@observer
export class SearchItem extends ViewBoxBaseComponent<FieldViewProps, SearchSchema>(SearchDocument) {
    
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SearchItem, fieldKey); }

    constructor(props:any){
        super(props);
        this.targetDoc._viewType= CollectionViewType.Stacking;
        this.rootDoc._viewType = CollectionViewType.Stacking;
        if (!this.searchItemTemplate) { // create exactly one presElmentBox template to use by any and all presentations.
            Doc.UserDoc().searchItemTemplate = new PrefetchProxy(Docs.Create.SearchItemBoxDocument({ title: "search item template", backgroundColor: "transparent", _xMargin: 5, _height: 46, isTemplateDoc: true, isTemplateForField: "data" }));
            // this script will be called by each presElement to get rendering-specific info that the PresBox knows about but which isn't written to the PresElement
            // this is a design choice -- we could write this data to the presElements which would require a reaction to keep it up to date, and it would prevent
            // the preselement docs from being part of multiple presentations since they would all have the same field, or we'd have to keep per-presentation data
            // stored on each pres element.  
            (this.searchItemTemplate as Doc).lookupField = ScriptField.MakeFunction("lookupSearchBoxField(container, field, data)",
                { field: "string", data: Doc.name, container: Doc.name });
        }

    }

    @observable _selected: boolean = false;

    onClick = () => {
        DocumentManager.Instance.jumpToDocument(this.targetDoc, false);
    }
    @observable _useIcons = true;
    @observable _displayDim = 50;

    @computed get query() { return StrCast(this.lookupField("query")); }

    componentDidMount() {

        console.log(this.query);
        Doc.SetSearchQuery(this.query);
        this.targetDoc.searchMatch = true;
    }
    componentWillUnmount() {
        this.targetDoc.searchMatch = undefined;
    }

    @action
    public DocumentIcon() {
        const layoutresult = StrCast(this.targetDoc.type);
        if (!this._useIcons) {
            const returnXDimension = () => this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
            const returnYDimension = () => this._displayDim;
            const docview = <div
                onPointerDown={action(() => {
                    this._useIcons = !this._useIcons;
                    this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE);
                })}
                onPointerEnter={action(() => this._displayDim = this._useIcons ? 50 : Number(SEARCH_THUMBNAIL_SIZE))} >
                <ContentFittingDocumentView
                    Document={this.targetDoc}
                    LibraryPath={emptyPath}
                    rootSelected={returnFalse}
                    fitToBox={StrCast(this.targetDoc.type).indexOf(DocumentType.COL) !== -1}
                    addDocument={returnFalse}
                    removeDocument={returnFalse}
                    addDocTab={returnFalse}
                    pinToPres={returnFalse}
                    ContainingCollectionDoc={undefined}
                    ContainingCollectionView={undefined}
                    ScreenToLocalTransform={Transform.Identity}
                    renderDepth={1}
                    PanelWidth={returnXDimension}
                    PanelHeight={returnYDimension}
                    NativeWidth={returnZero}
                    NativeHeight={returnZero}
                    focus={emptyFunction}
                    moveDocument={returnFalse}
                    parentActive={returnFalse}
                    whenActiveChanged={returnFalse}
                    bringToFront={returnFalse}
                    ContentScaling={returnOne}
                />
            </div>;
            return docview;
        }
        const button = layoutresult.indexOf(DocumentType.PDF) !== -1 ? faFilePdf :
            layoutresult.indexOf(DocumentType.IMG) !== -1 ? faImage :
                layoutresult.indexOf(DocumentType.RTF) !== -1 ? faStickyNote :
                    layoutresult.indexOf(DocumentType.VID) !== -1 ? faFilm :
                        layoutresult.indexOf(DocumentType.COL) !== -1 ? faObjectGroup :
                            layoutresult.indexOf(DocumentType.AUDIO) !== -1 ? faMusic :
                                layoutresult.indexOf(DocumentType.LINK) !== -1 ? faLink :
                                    layoutresult.indexOf(DocumentType.WEB) !== -1 ? faGlobeAsia :
                                        faCaretUp;
        return <div onClick={action(() => { this._useIcons = false; this._displayDim = Number(SEARCH_THUMBNAIL_SIZE); })} >
            <FontAwesomeIcon icon={button} size="2x" />
        </div>;
    }

    collectionRef = React.createRef<HTMLDivElement>();

    @action
    pointerDown = (e: React.PointerEvent) => { e.preventDefault(); e.button === 0 && SearchBox.Instance.openSearch(e); }

    nextHighlight = (e: React.PointerEvent) => {
        e.preventDefault();
        e.button === 0 && SearchBox.Instance.openSearch(e);
        this.targetDoc!.searchMatch = false;
        setTimeout(() => this.targetDoc!.searchMatch = true, 0);
    }
    highlightDoc = (e: React.PointerEvent) => {
        console.log(Cast(this.targetDoc.lines, listSpec("string"))!.length);

        if (this.targetDoc!.type === DocumentType.LINK) {
            if (this.targetDoc!.anchor1 && this.targetDoc!.anchor2) {

                const doc1 = Cast(this.targetDoc!.anchor1, Doc, null);
                const doc2 = Cast(this.targetDoc!.anchor2, Doc, null);
                Doc.BrushDoc(doc1);
                Doc.BrushDoc(doc2);
            }
        } else {
            Doc.BrushDoc(this.targetDoc!);
        }
        e.stopPropagation();
    }

    unHighlightDoc = (e: React.PointerEvent) => {
        if (this.targetDoc!.type === DocumentType.LINK) {
            if (this.targetDoc!.anchor1 && this.targetDoc!.anchor2) {

                const doc1 = Cast(this.targetDoc!.anchor1, Doc, null);
                const doc2 = Cast(this.targetDoc!.anchor2, Doc, null);
                Doc.UnBrushDoc(doc1);
                Doc.UnBrushDoc(doc2);
            }
        } else {
            Doc.UnBrushDoc(this.targetDoc!);
        }
    }

    onContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        ContextMenu.Instance.clearItems();
        ContextMenu.Instance.addItem({
            description: "Copy ID", event: () => {
                Utils.CopyText(StrCast(this.targetDoc[Id]));
            },
            icon: "fingerprint"
        });
        ContextMenu.Instance.displayMenu(e.clientX, e.clientY);
    }

    _downX = 0;
    _downY = 0;
    _target: any;
    onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        this._downX = e.clientX;
        this._downY = e.clientY;
        e.stopPropagation();
        this._target = e.currentTarget;
        document.removeEventListener("pointermove", this.onPointerMoved);
        document.removeEventListener("pointerup", this.onPointerUp);
        document.addEventListener("pointermove", this.onPointerMoved);
        document.addEventListener("pointerup", this.onPointerUp);
    }
    onPointerMoved = (e: PointerEvent) => {
        if (Math.abs(e.clientX - this._downX) > Utils.DRAG_THRESHOLD ||
            Math.abs(e.clientY - this._downY) > Utils.DRAG_THRESHOLD) {
            document.removeEventListener("pointermove", this.onPointerMoved);
            document.removeEventListener("pointerup", this.onPointerUp);
            const doc = Doc.IsPrototype(this.targetDoc) ? Doc.MakeDelegate(this.targetDoc) : this.targetDoc;
            DragManager.StartDocumentDrag([this._target], new DragManager.DocumentDragData([doc]), e.clientX, e.clientY);
        }
    }
    onPointerUp = (e: PointerEvent) => {
        document.removeEventListener("pointermove", this.onPointerMoved);
        document.removeEventListener("pointerup", this.onPointerUp);
    }

    @computed
    get contextButton() {
        return <ParentDocSelector Document={this.targetDoc} addDocTab={(doc, where) => CollectionDockingView.AddRightSplit(doc)} />;
    }

    @computed get searchElementDoc() { return this.rootDoc; }
    @computed get targetDoc() { return this.searchElementDoc?.targetDoc as Doc; }

    @computed get searchItemTemplate() { return Cast(Doc.UserDoc().searchItemTemplate, Doc, null); }
    childLayoutTemplate = () => this.layoutDoc._viewType === CollectionViewType.Stacking ? this.searchItemTemplate: undefined;
    getTransform = () => {
    return this.props.ScreenToLocalTransform().translate(-5, -65);// listBox padding-left and pres-box-cont minHeight
    }
    panelHeight = () => {
        return this.props.PanelHeight();
    }
    selectElement = (doc: Doc) => {
        //this.gotoDocument(this.childDocs.indexOf(doc), NumCast(this.layoutDoc._itemIndex));
    }

    newsearch(){
       runInAction(()=>{
        if (StrCast(this.rootDoc.bucketfield)!=="results"){
        SearchBox.Instance._icons=[StrCast(this.rootDoc.bucketfield)];
        SearchBox.Instance._icons=SearchBox.Instance._icons;
        }
        SearchBox.Instance.expandedBucket= true;
        SearchBox.Instance.submitSearch();
       }) 
    }

    render() {
        const doc1 = Cast(this.targetDoc!.anchor1, Doc);
        const doc2 = Cast(this.targetDoc!.anchor2, Doc);
        if (this.targetDoc.isBucket === true){
            this.props.Document._viewType=CollectionViewType.Stacking;  
            this.props.Document._chromeStatus='disabled';
            this.props.Document._height=this.targetDoc._height;

            return <div>
            <CollectionView {...this.props}
            Document={this.props.Document}
            PanelHeight={this.panelHeight}
            whenActiveChanged={emptyFunction}
            onClick={undefined}
            moveDocument={returnFalse}
            childLayoutTemplate={this.childLayoutTemplate}
            addDocument={undefined}
            removeDocument={returnFalse}
            focus={this.selectElement}
            ScreenToLocalTransform={this.getTransform} />
            <button onClick={()=>this.newsearch()}className="bucket-expand" style={{transform:"none", fontSize:"100%",textTransform:"none", background: "lightgray",color: "black", bottom: 8, marginBottom:-2, paddingTop:2,fontFamily:"Arial, sans-serif"}}>See all {StrCast(this.rootDoc.bucketfield)}...
            </button>
            </div>
        }
        else if (this.targetDoc.isBucket === false){
            this.props.Document._chromeStatus='disabled';
            return      <div className="searchItem">
                <div className="searchItem-body" >
                <div className="searchItem-title-container">
                <div className="searchItem-title" style={{height:"10px", overflow:"hidden", textOverflow:"ellipsis"}}>No Search Results</div>
                </div>
                </div>
            </div>
        }
        else {
        return <div className="searchItem-overview" onPointerDown={this.pointerDown} onContextMenu={this.onContextMenu}>
            <div className="searchItem" onPointerDown={this.nextHighlight} onPointerEnter={this.highlightDoc} onPointerLeave={this.unHighlightDoc}>
                <div className="searchItem-body" onClick={this.onClick}>
                    <div className="searchItem-title-container">
                        <div className="searchItem-title" style={{height:"10px", overflow:"hidden", textOverflow:"ellipsis"}}>{StrCast(this.targetDoc.title)}</div>
                        <div className="searchItem-highlighting">
                        {StrCast(this.targetDoc.highlighting).length ? "Matched fields:" + StrCast(this.targetDoc.highlighting) : Cast(this.targetDoc.lines, listSpec("string"))!.length ? Cast(this.targetDoc.lines, listSpec("string"))![0] : ""}</div>
                        {/* {Cast(this.targetDoc.lines, listSpec("string"))!.filter((m, i) => i).map((l, i) => <div id={i.toString()} className="searchItem-highlighting">{l}</div>)} */}
                    </div>
                </div>
                <div className="searchItem-info" style={{ width: this._useIcons ? "30px" : "100%" }}>
                    <div className={`icon-${this._useIcons ? "icons" : "live"}`}>
                        <div className="searchItem-type" title="Click to Preview" onPointerDown={this.onPointerDown}>{this.DocumentIcon()}</div>
                        <div className="searchItem-label">{this.targetDoc.type ? this.targetDoc.type : "Other"}</div>
                    </div>
                </div>
                <div className="searchItem-context" title="Drag as document">
                    {(doc1 instanceof Doc && doc2 instanceof Doc) && this.targetDoc!.type === DocumentType.LINK ? <LinkContextMenu doc1={doc1} doc2={doc2} /> :
                        this.contextButton}
                </div>
            </div>
        </div>;
        }
    }
} 