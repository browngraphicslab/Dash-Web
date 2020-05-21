import { library } from '@fortawesome/fontawesome-svg-core';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, IReactionDisposer, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import * as rp from 'request-promise';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { Cast, NumCast, StrCast } from '../../../new_fields/Types';
import { Utils } from '../../../Utils';
import { Docs } from '../../documents/Documents';
import { SetupDrag } from '../../util/DragManager';
import { SearchUtil } from '../../util/SearchUtil';
import "./SearchBox.scss";
import { SearchItem } from './SearchItem';
import { IconBar } from './IconBar';
import { FieldView } from '../nodes/FieldView';
import { DocumentType } from "../../documents/DocumentTypes";
import { DocumentView } from '../nodes/DocumentView';
import { SelectionManager } from '../../util/SelectionManager';
import { listSpec } from '../../../new_fields/Schema';

library.add(faTimes);

export interface SearchProps {
    id: string;
    searchQuery: string;
    filterQquery?: string;
    setSearchQuery: (q: string) => {};
    searchFileTypes: string[];
    setSearchFileTypes: (types: string[]) => {};
}

export enum Keys {
    TITLE = "title",
    AUTHOR = "author",
    DATA = "data"
}

@observer
export class SearchBox extends React.Component<SearchProps> {

    private get _searchString() { return this.props.searchQuery; }
    private set _searchString(value) { this.props.setSearchQuery(value); }
    @observable private _resultsOpen: boolean = false;
    @observable private _searchbarOpen: boolean = false;
    @observable private _results: [Doc, string[], string[]][] = [];
    @observable private _openNoResults: boolean = false;
    @observable private _visibleElements: JSX.Element[] = [];

    private _resultsSet = new Map<Doc, number>();
    private _resultsRef = React.createRef<HTMLDivElement>();
    public inputRef = React.createRef<HTMLInputElement>();

    private _isSearch: ("search" | "placeholder" | undefined)[] = [];
    private _numTotalResults = -1;
    private _endIndex = -1;

    static Instance: SearchBox;

    private _maxSearchIndex: number = 0;
    private _curRequest?: Promise<any> = undefined;
    public static LayoutString(fieldKey: string) { return FieldView.LayoutString(SearchBox, fieldKey); }


    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _basicWordStatus: boolean = false;
    @observable private _nodeStatus: boolean = false;
    @observable private _keyStatus: boolean = false;


    constructor(props: any) {
        super(props);
        SearchBox.Instance = this;
        this.resultsScrolled = this.resultsScrolled.bind(this);
    }

    componentDidMount = action(() => {
        if (this.inputRef.current) {
            this.inputRef.current.focus();
            this._searchbarOpen = true;
        }
        if (this.props.searchQuery) { // bcz: why was this here?    } && this.props.filterQquery) {
            this._searchString = this.props.searchQuery;
            this.submitSearch();
        }
    });


    @action
    getViews = (doc: Doc) => SearchUtil.GetViewsOfDocument(doc)

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this._searchString = e.target.value;

        this._openNoResults = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
        this._maxSearchIndex = 0;
    }

    enter = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            this.submitSearch();
        }
    }

    public static async convertDataUri(imageUri: string, returnedFilename: string) {
        try {
            const posting = Utils.prepend("/uploadURI");
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

    public _allIcons: string[] = [DocumentType.AUDIO, DocumentType.COL, DocumentType.IMG, DocumentType.LINK, DocumentType.PDF, DocumentType.RTF, DocumentType.VID, DocumentType.WEB];
    //if true, any keywords can be used. if false, all keywords are required.
    //this also serves as an indicator if the word status filter is applied
    @observable private _filterOpen: boolean = false;
    //if icons = all icons, then no icon filter is applied
    get _icons() { return this.props.searchFileTypes; }
    set _icons(value) {
        this.props.setSearchFileTypes(value);
    }
    //if all of these are true, no key filter is applied
    @observable private _titleFieldStatus: boolean = true;
    @observable private _authorFieldStatus: boolean = true;
    //this also serves as an indicator if the collection status filter is applied
    @observable public _deletedDocsStatus: boolean = false;
    @observable private _collectionStatus = false;


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
        if (this._collectionStatus) {
            query = this.addCollectionFilter(query);
            query = query.replace(/\s+/g, ' ').trim();
        }
        return query;
    }

    basicRequireWords(query: string): string {
        return query.split(" ").join(" + ").replace(/ + /, "");
    }

    @action
    filterDocsByType(docs: Doc[]) {
        if (this._icons.length === this._allIcons.length) {
            return docs;
        }
        const finalDocs: Doc[] = [];
        docs.forEach(doc => {
            const layoutresult = Cast(doc.type, "string");
            if (layoutresult && this._icons.includes(layoutresult)) {
                finalDocs.push(doc);
            }
        });
        return finalDocs;
    }

    addCollectionFilter(query: string): string {
        const collections: Doc[] = this.getCurCollections();
        const oldWords = query.split(" ");

        const collectionString: string[] = [];
        collections.forEach(doc => {
            const proto = doc.proto;
            const protoId = (proto || doc)[Id];
            const colString: string = "{!join from=data_l to=id}id:" + protoId + " ";
            collectionString.push(colString);
        });

        let finalColString = collectionString.join(" ");
        finalColString = finalColString.trim();
        return "+(" + finalColString + ")" + query;
    }

    get filterTypes() {
        return this._icons.length === this._allIcons.length ? undefined : this._icons;
    }

    //TODO: basically all of this
    //gets all of the collections of all the docviews that are selected
    //if a collection is the only thing selected, search only in that collection (not its container)
    getCurCollections(): Doc[] {
        const selectedDocs: DocumentView[] = SelectionManager.SelectedDocuments();
        const collections: Doc[] = [];

        selectedDocs.forEach(async element => {
            const layout: string = StrCast(element.props.Document.layout);
            //checks if selected view (element) is a collection. if it is, adds to list to search through
            if (layout.indexOf("Collection") > -1) {
                //makes sure collections aren't added more than once
                if (!collections.includes(element.props.Document)) {
                    collections.push(element.props.Document);
                }
            }
            //makes sure collections aren't added more than once
            if (element.props.ContainingCollectionDoc && !collections.includes(element.props.ContainingCollectionDoc)) {
                collections.push(element.props.ContainingCollectionDoc);
            }
        });

        return collections;
    }


    applyBasicFieldFilters(query: string) {
        let finalQuery = "";

        if (this._titleFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.TITLE);
        }
        if (this._authorFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.AUTHOR);
        }
        if (this._deletedDocsStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.DATA);
        }
        return finalQuery;
    }

    basicFieldFilters(query: string, type: string): string {
        const oldWords = query.split(" ");
        let mod = "";

        if (type === Keys.AUTHOR) {
            mod = " author_t:";
        } if (type === Keys.DATA) {
            //TODO
        } if (type === Keys.TITLE) {
            mod = " title_t:";
        }

        const newWords: string[] = [];
        oldWords.forEach(word => {
            const newWrd = mod + word;
            newWords.push(newWrd);
        });

        query = newWords.join(" ");

        return query;
    }

    get fieldFiltersApplied() { return !(this._authorFieldStatus && this._titleFieldStatus); }


    @action
    submitSearch = async () => {
        const query = this._searchString;
        this.getFinalQuery(query);
        this._results = [];
        this._resultsSet.clear();
        this._isSearch = [];
        this._visibleElements = [];
        if (query !== "") {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            await this.getResults(query);

            runInAction(() => {
                this._resultsOpen = true;
                this._searchbarOpen = true;
                this._openNoResults = true;
                this.resultsScrolled();
            });
        }
    }

    getAllResults = async (query: string) => {
        return SearchUtil.Search(query, true, { fq: this.filterQuery, start: 0, rows: 10000000 });
    }

    private get filterQuery() {
        const types = this.filterTypes;
        const baseExpr = "NOT baseProto_b:true";
        const includeDeleted = this.getDataStatus() ? "" : " NOT deleted_b:true";
        const includeIcons = this.getDataStatus() ? "" : " NOT type_t:fonticonbox";
        // const typeExpr = !types ? "" : ` (${types.map(type => `({!join from=id to=proto_i}type_t:"${type}" AND NOT type_t:*) OR type_t:"${type}"`).join(" ")})`; // this line was causing issues for me, check solr logging -syip2
        // fq: type_t:collection OR {!join from=id to=proto_i}type_t:collection   q:text_t:hello
        const query = [baseExpr, includeDeleted, includeIcons].join(" AND ").replace(/AND $/, "");
        return query;
    }

    getDataStatus() { return this._deletedDocsStatus; }


    private NumResults = 25;
    private lockPromise?: Promise<void>;
    getResults = async (query: string) => {
        if (this.lockPromise) {
            await this.lockPromise;
        }
        this.lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                this._curRequest = SearchUtil.Search(query, true, { fq: this.filterQuery, start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*" }).then(action(async (res: SearchUtil.DocSearchResult) => {
                    // happens at the beginning
                    if (res.numFound !== this._numTotalResults && this._numTotalResults === -1) {
                        this._numTotalResults = res.numFound;
                    }

                    const highlighting = res.highlighting || {};
                    const highlightList = res.docs.map(doc => highlighting[doc[Id]]);
                    const lines = new Map<string, string[]>();
                    res.docs.map((doc, i) => lines.set(doc[Id], res.lines[i]));
                    const docs = await Promise.all(res.docs.map(async doc => (await Cast(doc.extendsDoc, Doc)) || doc));
                    const highlights: typeof res.highlighting = {};
                    docs.forEach((doc, index) => highlights[doc[Id]] = highlightList[index]);
                    const filteredDocs = this.filterDocsByType(docs);
                    runInAction(() => {
                        //this._results.push(...filteredDocs);
                        filteredDocs.forEach(doc => {
                            const index = this._resultsSet.get(doc);
                            const highlight = highlights[doc[Id]];
                            const line = lines.get(doc[Id]) || [];
                            const hlights = highlight ? Object.keys(highlight).map(key => key.substring(0, key.length - 2)) : [];
                            if (index === undefined) {
                                this._resultsSet.set(doc, this._results.length);
                                this._results.push([doc, hlights, line]);
                            } else {
                                this._results[index][1].push(...hlights);
                                this._results[index][2].push(...line);
                            }
                        });
                    });

                    this._curRequest = undefined;
                }));
                this._maxSearchIndex += this.NumResults;

                await this._curRequest;
            }
            this.resultsScrolled();
            res();
        });
        return this.lockPromise;
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const res = await this.getAllResults(this.getFinalQuery(this._searchString));
        const filtered = this.filterDocsByType(res.docs);
        const docs = filtered.map(doc => {
            const isProto = Doc.GetT(doc, "isPrototype", "boolean", true);
            if (isProto) {
                return Doc.MakeDelegate(doc);
            } else {
                return Doc.MakeAlias(doc);
            }
        });
        let x = 0;
        let y = 0;
        for (const doc of docs.map(d => Doc.Layout(d))) {
            doc.x = x;
            doc.y = y;
            const size = 200;
            const aspect = NumCast(doc._nativeHeight) / NumCast(doc._nativeWidth, 1);
            if (aspect > 1) {
                doc._height = size;
                doc._width = size / aspect;
            } else if (aspect > 0) {
                doc._width = size;
                doc._height = size * aspect;
            } else {
                doc._width = size;
                doc._height = size;
            }
            x += 250;
            if (x > 1000) {
                x = 0;
                y += 300;
            }
        }
        return Docs.Create.QueryDocument({ _autoHeight: true, title: this._searchString, filterQuery: this.filterQuery, searchQuery: this._searchString });
    }

    @action.bound
    openSearch(e: React.SyntheticEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        this._resultsOpen = true;
        this._searchbarOpen = true;
    }

    @action.bound
    closeSearch = () => {
        this.closeResults();
        this._searchbarOpen = false;
    }

    @action.bound
    closeResults() {
        this._resultsOpen = false;
        this._results = [];
        this._resultsSet.clear();
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        if (!this._resultsRef.current) return;
        const scrollY = e ? e.currentTarget.scrollTop : this._resultsRef.current ? this._resultsRef.current.scrollTop : 0;
        const itemHght = 53;
        const startIndex = Math.floor(Math.max(0, scrollY / itemHght));
        const endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (this._resultsRef.current.getBoundingClientRect().height / itemHght)));

        this._endIndex = endIndex === -1 ? 12 : endIndex;

        if ((this._numTotalResults === 0 || this._results.length === 0) && this._openNoResults) {
            this._visibleElements = [<div className="no-result">No Search Results</div>];
            return;
        }

        if (this._numTotalResults <= this._maxSearchIndex) {
            this._numTotalResults = this._results.length;
        }

        // only hit right at the beginning
        // visibleElements is all of the elements (even the ones you can't see)
        else if (this._visibleElements.length !== this._numTotalResults) {
            // undefined until a searchitem is put in there
            this._visibleElements = Array<JSX.Element>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
            // indicates if things are placeholders
            this._isSearch = Array<undefined>(this._numTotalResults === -1 ? 0 : this._numTotalResults);
        }

        for (let i = 0; i < this._numTotalResults; i++) {
            //if the index is out of the window then put a placeholder in
            //should ones that have already been found get set to placeholders?
            if (i < startIndex || i > endIndex) {
                if (this._isSearch[i] !== "placeholder") {
                    this._isSearch[i] = "placeholder";
                    this._visibleElements[i] = <div className="searchBox-placeholder" key={`searchBox-placeholder-${i}`}>Loading...</div>;
                }
            }
            else {
                if (this._isSearch[i] !== "search") {
                    let result: [Doc, string[], string[]] | undefined = undefined;
                    if (i >= this._results.length) {
                        this.getResults(this._searchString);
                        if (i < this._results.length) result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            this._visibleElements[i] = <SearchItem doc={result[0]} query={this._searchString} key={result[0][Id]} lines={result[2]} highlighting={highlights} />;
                            this._isSearch[i] = "search";
                        }
                    }
                    else {
                        result = this._results[i];
                        if (result) {
                            const highlights = Array.from([...Array.from(new Set(result[1]).values())]);
                            this._visibleElements[i] = <SearchItem doc={result[0]} query={this._searchString} key={result[0][Id]} lines={result[2]} highlighting={highlights} />;
                            this._isSearch[i] = "search";
                        }
                    }
                }
            }
        }
        if (this._maxSearchIndex >= this._numTotalResults) {
            this._visibleElements.length = this._results.length;
            this._isSearch.length = this._results.length;
        }
    }

    @computed
    get resFull() { return this._numTotalResults <= 8; }

    @computed
    get resultHeight() { return this._numTotalResults * 70; }

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange = () => {
        this._basicWordStatus = !this._basicWordStatus;
    }

    @action.bound
    handleNodeChange = () => {
        this._nodeStatus = !this._nodeStatus;
        if (this._nodeStatus) {
            this.expandSection(`node${this.props.id}`);
        }
        else {
            this.collapseSection(`node${this.props.id}`);
        }
    }

    @action.bound
    handleKeyChange = () => {
        this._keyStatus = !this._keyStatus;
        if (this._keyStatus) {
            this.expandSection(`key${this.props.id}`);
        }
        else {
            this.collapseSection(`key${this.props.id}`);
        }
    }

    @action.bound
    handleFilterChange = () => {
        this._filterOpen = !this._filterOpen;
        if (this._filterOpen) {
            this.expandSection(`filterhead${this.props.id}`);
            document.getElementById(`filterhead${this.props.id}`)!.style.padding = "5";
        }
        else {
            this.collapseSection(`filterhead${this.props.id}`);


        }
    }

    @computed
    get menuHeight() {
        return document.getElementById("hi")?.clientHeight;
    }


    collapseSection(thing: string) {
        const id = this.props.id;
        const element = document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        const sectionHeight = element.scrollHeight;

        // temporarily disable all css transitions
        const elementTransition = element.style.transition;
        element.style.transition = '';

        // on the next frame (as soon as the previous style change has taken effect),
        // explicitly set the element's height to its current pixel height, so we 
        // aren't transitioning out of 'auto'
        requestAnimationFrame(function () {
            element.style.height = sectionHeight + 'px';
            element.style.transition = elementTransition;

            // on the next frame (as soon as the previous style change has taken effect),
            // have the element transition to height: 0
            requestAnimationFrame(function () {
                element.style.height = 0 + 'px';
                thing === `filterhead${id}` ? document.getElementById(`filterhead${id}`)!.style.padding = "0" : null;
            });
        });

        // mark the section as "currently collapsed"
        element.setAttribute('data-collapsed', 'true');
    }

    expandSection(thing: string) {
        console.log("expand");
        const element = document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        const sectionHeight = element.scrollHeight;

        // have the element transition to the height of its inner content
        element.style.height = sectionHeight + 'px';

        // when the next css transition finishes (which should be the one we just triggered)
        element.addEventListener('transitionend', function handler(e) {
            // remove this event listener so it only gets triggered once
            console.log("autoset");
            element.removeEventListener('transitionend', handler);

            // remove "height" from the element's inline styles, so it can return to its initial value
            element.style.height = "auto";
            //element.style.height = undefined;
        });

        // mark the section as "currently not collapsed"
        element.setAttribute('data-collapsed', 'false');

    }

    autoset(thing: string) {
        const element = document.getElementById(thing)!;
        console.log("autoset");
        element.removeEventListener('transitionend', function (e) { });

        // remove "height" from the element's inline styles, so it can return to its initial value
        element.style.height = "auto";
        //element.style.height = undefined;
    }

    @action.bound
    updateTitleStatus() { this._titleFieldStatus = !this._titleFieldStatus; }

    @action.bound
    updateAuthorStatus() { this._authorFieldStatus = !this._authorFieldStatus; }

    @action.bound
    updateDataStatus() { this._deletedDocsStatus = !this._deletedDocsStatus; }

    render() {

        return (
            <div className="searchBox-container">
                <div className="searchBox-bar">
                    <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, () => this._searchString ? this.startDragCollection() : undefined)} ref={this.collectionRef} title="Drag Results as Collection">
                        <FontAwesomeIcon icon="object-group" size="lg" />
                    </span>
                    <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..." id="search-input" ref={this.inputRef}
                        className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter} onFocus={this.openSearch}
                        style={{ width: this._searchbarOpen ? "500px" : "100px" }} />
                    <button className="searchBox-barChild searchBox-filter" title="Advanced Filtering Options" onClick={() => this.handleFilterChange()}><FontAwesomeIcon icon="ellipsis-v" color="white" /></button>
                </div>

                <div id={`filterhead${this.props.id}`} className="filter-form" >
                    <div id={`filterhead2${this.props.id}`} className="filter-header" style={this._filterOpen ? {} : {}}>
                        <button className="filter-item" style={this._basicWordStatus ? { background: "#aaaaa3", } : {}} onClick={this.handleWordQueryChange}>Keywords</button>
                        <button className="filter-item" style={this._keyStatus ? { background: "#aaaaa3" } : {}} onClick={this.handleKeyChange}>Keys</button>
                        <button className="filter-item" style={this._nodeStatus ? { background: "#aaaaa3" } : {}} onClick={this.handleNodeChange}>Nodes</button>
                    </div>
                    <div id={`node${this.props.id}`} className="filter-body" style={this._nodeStatus ? { borderTop: "grey 1px solid" } : { borderTop: "0px" }}>
                        <IconBar setIcons={(icons: string[]) => {
                            this._icons = icons;
                        }} />
                    </div>
                    <div className="filter-key" id={`key${this.props.id}`} style={this._keyStatus ? { borderTop: "grey 1px solid" } : { borderTop: "0px" }}>
                        <div className="filter-keybar">
                            <button className="filter-item" style={this._titleFieldStatus ? { background: "#aaaaa3", } : {}} onClick={this.updateTitleStatus}>Title</button>
                            <button className="filter-item" style={this._deletedDocsStatus ? { background: "#aaaaa3", } : {}} onClick={this.updateDataStatus}>Deleted Docs</button>
                            <button className="filter-item" style={this._authorFieldStatus ? { background: "#aaaaa3", } : {}} onClick={this.updateAuthorStatus}>Author</button>
                        </div>
                    </div>
                </div>
                <div className="searchBox-results" onScroll={this.resultsScrolled} style={{
                    display: this._resultsOpen ? "flex" : "none",
                    height: this.resFull ? "auto" : this.resultHeight,
                    overflow: "visibile" // this.resFull ? "auto" : "visible"
                }} ref={this._resultsRef}>
                    {this._visibleElements}
                </div>
            </div>
        );
    }
}