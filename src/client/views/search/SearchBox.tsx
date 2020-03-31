import { library } from '@fortawesome/fontawesome-svg-core';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { action, computed, observable, runInAction, IReactionDisposer, reaction } from 'mobx';
import { observer } from 'mobx-react';
import * as React from 'react';
import * as rp from 'request-promise';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { Cast, NumCast } from '../../../new_fields/Types';
import { Utils } from '../../../Utils';
import { Docs } from '../../documents/Documents';
import { SetupDrag } from '../../util/DragManager';
import { SearchUtil } from '../../util/SearchUtil';
// import { FilterBox } from './FilterBox';
// import "./FilterBox.scss";
import "./SearchBox.scss";
import { SearchItem } from './SearchItem';
import { IconBar } from './IconBar';
import { FieldFilters } from './FieldFilters';
import { FieldView } from '../nodes/FieldView';

library.add(faTimes);

export interface SearchProps {
    id:string;
}
@observer
export class SearchBox extends React.Component<SearchProps> {

    @observable private _searchString: string = "";
    @observable private _resultsOpen: boolean = false;
    @observable private _searchbarOpen: boolean = false;
    @observable private _results: [Doc, string[], string[]][] = [];
    private _resultsSet = new Map<Doc, number>();
    @observable private _openNoResults: boolean = false;
    @observable private _visibleElements: JSX.Element[] = [];

    private resultsRef = React.createRef<HTMLDivElement>();
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
        //reaction(()=>document.getElementById("node")?.scrollHeight,()=>{console.log("longer")})

    }

    private _reactionDisposer?: IReactionDisposer;

    componentDidMount = () => {
        if (this.inputRef.current) {
            this.inputRef.current.focus();
            runInAction(() => {
                this._searchbarOpen = true;
            });

        }
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

    @action
    submitSearch = async () => {
        let query = this._searchString;
        // query = FilterBox.Instance.getFinalQuery(query);
        this._results = [];
        this._resultsSet.clear();
        this._isSearch = [];
        this._visibleElements = [];
        // FilterBox.Instance.closeFilter();

        //if there is no query there should be no result
        if (query === "") {
            return;
        }
        else {
            this._endIndex = 12;
            this._maxSearchIndex = 0;
            this._numTotalResults = -1;
            await this.getResults(query);
        }

        runInAction(() => {
            this._resultsOpen = true;
            this._searchbarOpen = true;
            this._openNoResults = true;
            this.resultsScrolled();
        });
    }

    getAllResults = async (query: string) => {
        return SearchUtil.Search(query, true, { start: 0, rows: 10000000 });

        //return SearchUtil.Search(query, true, { fq: this.filterQuery, start: 0, rows: 10000000 });
    }

    // private get filterQuery() {
    //     const types = FilterBox.Instance.filterTypes;
    //     const includeDeleted = FilterBox.Instance.getDataStatus();
    //     return "NOT baseProto_b:true" + (includeDeleted ? "" : " AND NOT deleted_b:true") + (types ? ` AND (${types.map(type => `({!join from=id to=proto_i}type_t:"${type}" AND NOT type_t:*) OR type_t:"${type}" OR type_t:"extension"`).join(" ")})` : "");
    // }


    private NumResults = 25;
    private lockPromise?: Promise<void>;
    getResults = async (query: string) => {
        if (this.lockPromise) {
            await this.lockPromise;
        }
        this.lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                //this._curRequest = SearchUtil.Search(query, true, { fq: this.filterQuery, start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*" }).then(action(async (res: SearchUtil.DocSearchResult) => {
                this._curRequest = SearchUtil.Search(query, true, { start: this._maxSearchIndex, rows: this.NumResults, hl: true, "hl.fl": "*" }).then(action(async (res: SearchUtil.DocSearchResult) => {

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
                    //const filteredDocs = FilterBox.Instance.filterDocsByType(docs);
                    const filteredDocs = docs;
                    runInAction(() => {
                        // this._results.push(...filteredDocs);
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
        //const res = await this.getAllResults(FilterBox.Instance.getFinalQuery(this._searchString));
        const res = await this.getAllResults(this._searchString);

        //const filtered = FilterBox.Instance.filterDocsByType(res.docs);
        const filtered = res.docs;
        // console.log(this._results)
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
        //return Docs.Create.TreeDocument(docs, { _width: 200, _height: 400, backgroundColor: "grey", title: `Search Docs: "${this._searchString}"` });
        //return Docs.Create.SearchDocument(docs, { _width: 200, _height: 400, searchText: this._searchString, title: `Search Docs: "${this._searchString}"` });
        return Docs.Create.QueryDocument({_autoHeight: true, title: "-typed text-"
        });
    }

    @action.bound
    openSearch(e: React.SyntheticEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        //FilterBox.Instance.closeFilter();
        this._resultsOpen = true;
        this._searchbarOpen = true;
        //FilterBox.Instance._pointerTime = e.timeStamp;
    }

    @action.bound
    closeSearch = () => {
        //FilterBox.Instance.closeFilter();
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
        if (!this.resultsRef.current) return;
        const scrollY = e ? e.currentTarget.scrollTop : this.resultsRef.current ? this.resultsRef.current.scrollTop : 0;
        const itemHght = 53;
        const startIndex = Math.floor(Math.max(0, scrollY / itemHght));
        const endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (this.resultsRef.current.getBoundingClientRect().height / itemHght)));

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

    @observable private _filterOpen: boolean = false;

    //if true, any keywords can be used. if false, all keywords are required.
    @action.bound
    handleWordQueryChange = () => {
        this._basicWordStatus = !this._basicWordStatus;
    }

    @action.bound
    handleNodeChange = () => {
        this._nodeStatus = !this._nodeStatus;
        if (this._nodeStatus){
            this.expandSection(`node${this.props.id}`)
        }
        else{
            this.collapseSection(`node${this.props.id}`)
        }
    }

    @action.bound
    handleKeyChange = () => {
        this._keyStatus = !this._keyStatus;
    }

    @action.bound  
    handleFilterChange=() =>{
        this._filterOpen=!this._filterOpen;
        if (this._filterOpen){
            this.expandSection(`filterhead${this.props.id}`);
            document.getElementById(`filterhead${this.props.id}`)!.style.padding="5";        
        }
        else{
            this.collapseSection(`filterhead${this.props.id}`);
                    

        }
    }
    // @observable
    // private menuHeight= 0;

    @computed
    get menuHeight(){
        return document.getElementById("hi")?.clientHeight;
    }


    collapseSection(thing:string) {
        let id = this.props.id;
        let element= document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        var sectionHeight = element.scrollHeight;
        
        // temporarily disable all css transitions
        var elementTransition = element.style.transition;
        element.style.transition = '';
        
        // on the next frame (as soon as the previous style change has taken effect),
        // explicitly set the element's height to its current pixel height, so we 
        // aren't transitioning out of 'auto'
        requestAnimationFrame(function() {
          element.style.height = sectionHeight + 'px';
          element.style.transition = elementTransition;
          
          // on the next frame (as soon as the previous style change has taken effect),
          // have the element transition to height: 0
          requestAnimationFrame(function() {
            element.style.height = 0 + 'px';
            thing == `filterhead${id}`? document.getElementById(`filterhead${id}`)!.style.padding="0" : null;
          });
        });
        
        // mark the section as "currently collapsed"
        element.setAttribute('data-collapsed', 'true');
      }
      
      expandSection(thing:string) {
        console.log("expand");
        let element= document.getElementById(thing)!;
        // get the height of the element's inner content, regardless of its actual size
        var sectionHeight = element.scrollHeight;
        
        // have the element transition to the height of its inner content
        let  temp = element.style.height;
        element.style.height = sectionHeight + 'px';
      
        // when the next css transition finishes (which should be the one we just triggered)
        element.addEventListener('transitionend', function handler(e) {
          // remove this event listener so it only gets triggered once
          console.log("autoset");
          element.removeEventListener('transitionend', handler);
          
          // remove "height" from the element's inline styles, so it can return to its initial value
          element.style.height="auto";
          //element.style.height = undefined;
        });
        
        // mark the section as "currently not collapsed"
        element.setAttribute('data-collapsed', 'false');
        
      }

      autoset(thing: string){
        let element= document.getElementById(thing)!;
        console.log("autoset");
        element.removeEventListener('transitionend', function(e){});
        
        // remove "height" from the element's inline styles, so it can return to its initial value
        element.style.height="auto";
        //element.style.height = undefined;

      }

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
                    <div id={`filterhead2${this.props.id}`} className="filter-header" style={this._filterOpen ? { } : { }}>
                        <button className="filter-item" style={this._basicWordStatus ? { background: "#aaaaa3", } : {}} onClick={this.handleWordQueryChange}>Keywords</button>
                        <button className="filter-item" style={this._keyStatus ? { background: "#aaaaa3" } : {}} onClick={this.handleKeyChange}>Keys</button>
                        <button className="filter-item" style={this._nodeStatus ? { background: "#aaaaa3" } : {}} onClick={this.handleNodeChange}>Nodes</button>
                    </div>
                    <div id={`node${this.props.id}`} className="filter-body" style={this._nodeStatus ? {  } : { }}>
                        <IconBar />
                    </div>
                    <div style={this._keyStatus ? { display: "flex" } : { display: "none" }}>

                    </div>


                    {/* <div className="filter-options">
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className='filter-title words'>Required words</div>
                                </div>
                                <div className="filter-panel" >
                                    <button className="all-filter">Include All Keywords</button>
                                </div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title icon">Filter by type of node</div>
                                </div>
                                <div className="filter-panel"></div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title field">Filter by Basic Keys</div>
                                </div>
                                <div className="filter-panel">
                                <FieldFilters
                                    titleFieldStatus={this._titleFieldStatus} dataFieldStatus={this._deletedDocsStatus} authorFieldStatus={this._authorFieldStatus}
                                    updateAuthorStatus={this.updateAuthorStatus} updateDataStatus={this.updateDataStatus} updateTitleStatus={this.updateTitleStatus} /> </div>
                                </div>
                            </div>
                        </div> */}
                </div>
                <div className="searchBox-results" onScroll={this.resultsScrolled} style={{
                    display: this._resultsOpen ? "flex" : "none",
                    height: this.resFull ? "auto" : this.resultHeight,
                    overflow: "visibile" // this.resFull ? "auto" : "visible"
                }} ref={this.resultsRef}>
                    {this._visibleElements}
                </div>
            </div>
        );
    }
}