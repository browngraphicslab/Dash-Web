import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { library, icon } from '@fortawesome/fontawesome-svg-core';
import * as rp from 'request-promise';
import { SearchItem } from './SearchItem';
import { DocServer } from '../../DocServer';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { SetupDrag } from '../../util/DragManager';
import { Docs, DocTypes } from '../../documents/Documents';
import { RouteStore } from '../../../server/RouteStore';
import { NumCast, Cast, StrCast } from '../../../new_fields/Types';
import { SearchUtil } from '../../util/SearchUtil';
import * as _ from "lodash";
import { ToggleBar } from './ToggleBar';
import { IconBar } from './IconBar';
import { FieldFilters } from './FieldFilters';
import { SelectionManager } from '../../util/SelectionManager';
import { DocumentView } from '../nodes/DocumentView';
import { CollectionFilters } from './CollectionFilters';
import { NaviconButton } from './NaviconButton';
import * as $ from 'jquery';
import * as anime from 'animejs';

library.add(faTimes);

export enum Keys {
    TITLE = "title",
    AUTHOR = "author",
    DATA = "data"
}

@observer
export class SearchBox extends React.Component {

    static Instance: SearchBox;

    @observable _searchString: string = "";
    //if true, any keywords can be used. if false, all keywords are required.
    @observable _basicWordStatus: boolean = true;
    @observable private _filterOpen: boolean = false;
    @observable private _resultsOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable private _openNoResults: boolean = false;
    allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
    @observable _icons: string[] = this.allIcons;
    @observable _selectedTypes: any[] = [];
    @observable titleFieldStatus: boolean = true;
    @observable authorFieldStatus: boolean = true;
    @observable dataFieldStatus: boolean = true;
    @observable collectionStatus = false;
    @observable collectionSelfStatus = true;
    @observable collectionParentStatus = true;
    @observable private _wordStatusOpen: boolean = false;
    @observable private _typeOpen: boolean = false;
    @observable private _colOpen: boolean = false;
    @observable private _fieldOpen: boolean = false;

    constructor(props: Readonly<{}>) {
        super(props);
        SearchBox.Instance = this;
    }

    componentDidMount = () => {
        document.addEventListener("pointerdown", (e) => {
            if (e.timeStamp !== this._pointerTime) {
                this.closeSearch();
            }
        });
    }

    setupAccordion() {
        $('document').ready(function () {
            var acc = document.getElementsByClassName('filter-header');

            for (var i = 0; i < acc.length; i++) {
                acc[i].addEventListener("click", function (this: HTMLElement) {
                    this.classList.toggle("active");

                    var panel = this.nextElementSibling as HTMLElement;
                    if (panel.style.maxHeight) {
                        panel.style.overflow = "hidden";
                        panel.style.maxHeight = null;
                        panel.style.opacity = "0";
                    } else {
                        setTimeout(() => {
                            panel.style.overflow = "visible";
                        }, 200);
                        setTimeout(() => {
                            panel.style.opacity = "1";
                        }, 50)
                        panel.style.maxHeight = panel.scrollHeight + "px";
                        
                    }
                });
            }
        });
    }

    @action.bound
    minimizeAll() {
        $('document').ready(function () {
            var acc = document.getElementsByClassName('filter-header');

            for (var i = 0; i < acc.length; i++) {
                let classList = acc[i].classList;
                if (classList.contains("active")) {
                    acc[i].classList.toggle("active");
                    var panel = acc[i].nextElementSibling as HTMLElement;
                    panel.style.overflow = "hidden";
                    panel.style.maxHeight = null;
                }
            }
        });
    }

    @action.bound
    resetFilters = () => {
        ToggleBar.Instance.resetToggle();
        IconBar.Instance.selectAll();
        FieldFilters.Instance.resetFieldFilters();
        CollectionFilters.Instance.resetCollectionFilters();
    }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this._searchString = e.target.value;

        if (this._searchString === "") {
            this._results = [];
            this._openNoResults = false;
        }
    }

    @action.bound
    clearSearchQuery() {
        this._searchString = "";
        this._results = [];
    }

    basicRequireWords(query: string): string {
        let oldWords = query.split(" ");
        let newWords: string[] = [];
        oldWords.forEach(word => {
            let newWrd = "+" + word;
            newWords.push(newWrd);
        });
        query = newWords.join(" ");

        return query;
    }

    basicFieldFilters(query: string, type: string): string {
        let oldWords = query.split(" ");
        let mod = "";

        if (type === Keys.AUTHOR) {
            mod = " author_t:";
        } if (type === Keys.DATA) {
            //TODO
        } if (type === Keys.TITLE) {
            mod = " title_t:";
        }

        let newWords: string[] = [];
        oldWords.forEach(word => {
            let newWrd = mod + word;
            newWords.push(newWrd);
        });

        query = newWords.join(" ");

        return query;
    }

    applyBasicFieldFilters(query: string) {
        let finalQuery = "";

        if (this.titleFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.TITLE);
        }
        if (this.authorFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.AUTHOR);
        }
        if (this.dataFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.DATA);
        }
        return finalQuery;
    }

    get fieldFiltersApplied() { return !(this.dataFieldStatus && this.authorFieldStatus && this.titleFieldStatus); }

    //TODO: basically all of this
    //gets all of the collections of all the docviews that are selected
    //if a collection is the only thing selected, search only in that collection (not its container)
    getCurCollections(): Doc[] {
        let selectedDocs: DocumentView[] = SelectionManager.SelectedDocuments();
        let collections: Doc[] = [];

            selectedDocs.forEach(async element => {
                let layout: string = StrCast(element.props.Document.baseLayout);
                //checks if selected view (element) is a collection. if it is, adds to list to search through
                if (layout.indexOf("Collection") > -1) {
                    //makes sure collections aren't added more than once
                    if (!collections.includes(element.props.Document)) {
                        collections.push(element.props.Document);
                    }
                }
                //gets the selected doc's containing view
                let containingView = element.props.ContainingCollectionView;
                //makes sure collections aren't added more than once
                if (containingView && !collections.includes(containingView.props.Document)) {
                    collections.push(containingView.props.Document);
                }
            });

        return collections;
    }

    getFinalQuery(query: string): string {
        //alters the query so it looks in the correct fields
        //if this is true, then not all of the field boxes are checked
        //TODO: data
        if (this.fieldFiltersApplied) {
            query = this.applyBasicFieldFilters(query);
            query = query.replace(/\s+/g, ' ').trim();
        }

        //alters the query based on if all words or any words are required
        //if this._wordstatus is false, all words are required and a + is added before each
        if (!this._basicWordStatus) {
            query = this.basicRequireWords(query);
            query = query.replace(/\s+/g, ' ').trim();
        }

        //if should be searched in a specific collection
        if (this.collectionStatus) {
            query = this.addCollectionFilter(query);
            query = query.replace(/\s+/g, ' ').trim();
        }
        return query;
    }

    addCollectionFilter(query: string): string {
        let collections: Doc[] = this.getCurCollections();
        let oldWords = query.split(" ");

        let collectionString: string[] = [];
        collections.forEach(doc => {
            let proto = doc.proto;
            let protoId = (proto || doc)[Id];
            let colString: string = "{!join from=data_l to=id}id:" + protoId + " ";
            collectionString.push(colString);
        });

        let finalColString = collectionString.join(" ");
        finalColString = finalColString.trim();
        return "+(" + finalColString + ")" + query;
    }

    @action
    submitSearch = async () => {
        let query = this._searchString;
        let results: Doc[];

        query = this.getFinalQuery(query);

        //if there is no query there should be no result
        if (query === "") {
            results = [];
        }
        else {
            //gets json result into a list of documents that can be used
            results = await this.getResults(query);
        }

        runInAction(() => {
            this._resultsOpen = true;
            this._results = results;
            this._openNoResults = true;
        });
    }

    @action
    getResults = async (query: string) => {
        let response = await rp.get(DocServer.prepend('/search'), {
            qs: {
                query
            }
        });
        let res: string[] = JSON.parse(response);
        const fields = await DocServer.GetRefFields(res);
        const docs: Doc[] = [];
        for (const id of res) {
            const field = fields[id];
            if (field instanceof Doc) {
                docs.push(field);
            }
        }
        return this.filterDocsByType(docs);
    }

    //this.icons will now include all the icons that need to be included
    @action filterDocsByType(docs: Doc[]) {
        let finalDocs: Doc[] = [];
        docs.forEach(doc => {
            let layoutresult = Cast(doc.type, "string", "");
            if (this._icons.includes(layoutresult)) {
                finalDocs.push(doc);
            }
        });
        return finalDocs;
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            let posting = DocServer.prepend(RouteStore.dataUriToImage);
            const returnedUri = await rp.post(posting, {
                body: {
                    uri: imageUri,
                    name: returnedFilename
                },
                json: true,
            });
            return returnedUri;

        } catch (e) {
            console.log(e);
        }
    }

    enter = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { this.submitSearch(); }
    }

    @action.bound
    closeSearch = () => {
        this._filterOpen = false;
        this._resultsOpen = false;
        this._results = [];
    }

    @action
    openFilter = () => {
        this._filterOpen = !this._filterOpen;
        this._resultsOpen = false;
        this._results = [];

        this.setupAccordion();
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const results = await this.getResults(this._searchString);
        const docs = results.map(doc => {
            const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
            if (isProto) {
                return Doc.MakeDelegate(doc);
            } else {
                return Doc.MakeAlias(doc);
            }
        });
        let x = 0;
        let y = 0;
        for (const doc of docs) {
            doc.x = x;
            doc.y = y;
            const size = 200;
            const aspect = NumCast(doc.nativeHeight) / NumCast(doc.nativeWidth, 1);
            if (aspect > 1) {
                doc.height = size;
                doc.width = size / aspect;
            } else if (aspect > 0) {
                doc.width = size;
                doc.height = size * aspect;
            } else {
                doc.width = size;
                doc.height = size;
            }
            doc.zoomBasis = 1;
            x += 250;
            if (x > 1000) {
                x = 0;
                y += 300;
            }
        }
        return Docs.FreeformDocument(docs, { width: 400, height: 400, panX: 175, panY: 175, backgroundColor: "grey", title: `Search Docs: "${this._searchString}"` });
    }

    @action
    getViews = async (doc: Doc) => {
        const results = await SearchUtil.GetViewsOfDocument(doc);
        let toReturn: Doc[] = [];
        await runInAction(() => {
            toReturn = results;
        });
        return toReturn;
    }

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange = () => { this._basicWordStatus = !this._basicWordStatus; }

    @action
    getBasicWordStatus() { return this._basicWordStatus; }

    @action.bound
    updateIcon(newArray: string[]) { this._icons = newArray; }

    @action.bound
    getIcons(): string[] { return this._icons; }

    private _pointerTime: number = -1;

    stopProp = (e: React.PointerEvent) => {
        e.stopPropagation();
        this._pointerTime = e.timeStamp;
    }

    @action.bound
    openSearch(e: React.PointerEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        this._filterOpen = false;
        this._resultsOpen = true;
        this._pointerTime = e.timeStamp;
    }



    @action.bound
    closeFilter() { this._filterOpen = false; }

    @action.bound
    toggleFieldOpen() { this._fieldOpen = !this._fieldOpen; }

    @action.bound
    toggleColOpen() { this._colOpen = !this._colOpen; }

    @action.bound
    toggleTypeOpen() { this._typeOpen = !this._typeOpen; }

    @action.bound
    toggleWordStatusOpen() { this._wordStatusOpen = !this._wordStatusOpen; }

    @action.bound
    updateTitleStatus(newStat: boolean) { this.titleFieldStatus = newStat; }

    @action.bound
    updateAuthorStatus(newStat: boolean) { this.authorFieldStatus = newStat; }

    @action.bound
    updateDataStatus(newStat: boolean) { this.dataFieldStatus = newStat; }

    @action.bound
    updateCollectionStatus(newStat: boolean) { this.collectionStatus = newStat; }

    @action.bound
    updateSelfCollectionStatus(newStat: boolean) { this.collectionSelfStatus = newStat; }

    @action.bound
    updateParentCollectionStatus(newStat: boolean) { this.collectionParentStatus = newStat; }

    getCollectionStatus() { return this.collectionStatus; }
    getSelfCollectionStatus() { return this.collectionSelfStatus; }
    getParentCollectionStatus() { return this.collectionParentStatus; }
    getTitleStatus() { return this.titleFieldStatus; }
    getAuthorStatus() { return this.authorFieldStatus; }
    getDataStatus() { return this.dataFieldStatus; }

    // Useful queries:
    // Delegates of a document: {!join from=id to=proto_i}id:{protoId}
    // Documents in a collection: {!join from=data_l to=id}id:{collectionProtoId} //id of collections prototype
    render() {
        return (
            <div>
                <div className="searchBox-container">
                    <div className="searchBox-bar">
                        <span onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef}>
                            <FontAwesomeIcon icon="object-group" className="searchBox-barChild" size="lg" />
                        </span>
                        <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..."
                            className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter}
                            style={{ width: this._resultsOpen ? "500px" : "100px" }} />
                        <button className="searchBox-barChild searchBox-filter" onClick={this.openFilter} onPointerDown={this.stopProp}>Filter</button>
                    </div>
                    {this._resultsOpen ? (
                        <div className="searchBox-results">
                            {(this._results.length !== 0) ? (
                                this._results.map(result => <SearchItem doc={result} key={result[Id]} />)
                            ) :
                                this._openNoResults ? (<div className="no-result">No Search Results</div>) : null}

                        </div>
                    ) : undefined}
                </div>
                {this._filterOpen ? (
                    <div className="filter-form" onPointerDown={this.stopProp} id="filter-form" style={this._filterOpen ? { display: "flex" } : { display: "none" }}>
                        <div style={{ display: "flex", width: "100%" }}>
                            <div id="header">Filter Search Results</div>
                            <div className="close-icon" onClick={this.closeFilter}>
                                <span className="line line-1"></span>
                                <span className="line line-2"></span></div>
                        </div>
                        <div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className='filter-title words'>Required words</div>
                                    <div style={{ marginLeft: "auto" }}><NaviconButton onClick={this.toggleWordStatusOpen} /></div>
                                </div>
                                <div className="filter-panel" >
                                    <ToggleBar handleChange={this.handleWordQueryChange} getStatus={this.getBasicWordStatus}
                                        originalStatus={this._basicWordStatus} optionOne={"Include Any Keywords"} optionTwo={"Include All Keywords"} />
                                </div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title icon">Filter by type of node</div>
                                    <div style={{ marginLeft: "auto" }}><NaviconButton onClick={this.toggleTypeOpen} /></div>
                                </div>
                                <div className="filter-panel"><IconBar /></div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className='filter-title collection'>Search in current collections</div>
                                    <div style={{ marginLeft: "auto" }}><NaviconButton onClick={this.toggleColOpen} /></div>
                                </div>
                                <div className="filter-panel"><CollectionFilters
                                    updateCollectionStatus={this.updateCollectionStatus} updateParentCollectionStatus={this.updateParentCollectionStatus} updateSelfCollectionStatus={this.updateSelfCollectionStatus}
                                    collectionStatus={this.collectionStatus} collectionParentStatus={this.collectionParentStatus} collectionSelfStatus={this.collectionSelfStatus} /></div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title field">Filter by Basic Keys</div>
                                    <div style={{ marginLeft: "auto" }}><NaviconButton onClick={this.toggleFieldOpen} /></div>
                                </div>
                                <div className="filter-panel"><FieldFilters
                                    titleFieldStatus={this.titleFieldStatus} dataFieldStatus={this.dataFieldStatus} authorFieldStatus={this.authorFieldStatus}
                                    updateAuthorStatus={this.updateAuthorStatus} updateDataStatus={this.updateDataStatus} updateTitleStatus={this.updateTitleStatus} /> </div>
                            </div>
                        </div>
                        <div className="filter-buttons" style={{ display: "flex", justifyContent: "space-around" }}>
                            <button className="minimizwe-filter" onClick={this.minimizeAll}>Minimize All</button>
                            <button className="advanced-filter" >Advanced Filters</button>
                            <button className="save-filter" >Save Filters</button>
                            <button className="reset-filter" onClick={this.resetFilters}>Reset Filters</button>
                        </div>
                    </div>
                ) : undefined}
            </div>
        );
    }
}