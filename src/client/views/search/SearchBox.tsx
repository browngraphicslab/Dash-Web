import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, flow, computed } from 'mobx';
import "./SearchBox.scss";
import "./FilterBox.scss";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { SetupDrag } from '../../util/DragManager';
import { Docs } from '../../documents/Documents';
import { NumCast } from '../../../new_fields/Types';
import { Doc } from '../../../new_fields/Doc';
import { SearchItem } from './SearchItem';
import { DocServer } from '../../DocServer';
import * as rp from 'request-promise';
import { Id } from '../../../new_fields/FieldSymbols';
import { SearchUtil } from '../../util/SearchUtil';
import { RouteStore } from '../../../server/RouteStore';
import { FilterBox } from './FilterBox';


@observer
export class SearchBox extends React.Component {

    @observable private _searchString: string = "";
    @observable private _resultsOpen: boolean = false;
    @observable private _searchbarOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable private _openNoResults: boolean = false;
    @observable private _visibleElements: JSX.Element[] = [];

    private resultsRef = React.createRef<HTMLDivElement>();

    private _isSearch: ("search" | "placeholder" | undefined)[] = [];
    private _numTotalResults = -1;
    private _endIndex = -1;

    static Instance: SearchBox;

    private _maxSearchIndex: number = 0;
    private _curRequest?: Promise<any> = undefined;

    constructor(props: any) {
        super(props);

        SearchBox.Instance = this;
        this.resultsScrolled = this.resultsScrolled.bind(this);
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
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
        this._maxSearchIndex = 0;
    }

    enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { this.submitSearch(); } };

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

    @action
    submitSearch = async () => {
        let query = this._searchString;
        query = FilterBox.Instance.getFinalQuery(query);
        this._results = [];
        this._isSearch = [];
        this._visibleElements = [];

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
        return SearchUtil.Search(query, this.filterQuery, true, 0, 10000000);
    }

    private get filterQuery() {
        const types = FilterBox.Instance.filterTypes;
        return "proto_i:*" + (types ? ` AND (${types.map(type => `({!join from=id to=proto_i}type_t:"${type}" AND NOT type_t:*) OR type_t:"${type}"`).join(" ")})` : "");
    }


    private lockPromise?: Promise<void>;
    getResults = async (query: string) => {
        if (this.lockPromise) {
            await this.lockPromise;
        }
        this.lockPromise = new Promise(async res => {
            while (this._results.length <= this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
                this._curRequest = SearchUtil.Search(query, this.filterQuery, true, this._maxSearchIndex, 10).then(action((res: SearchUtil.DocSearchResult) => {

                    // happens at the beginning
                    if (res.numFound !== this._numTotalResults && this._numTotalResults === -1) {
                        this._numTotalResults = res.numFound;
                    }

                    let filteredDocs = FilterBox.Instance.filterDocsByType(res.docs);
                    this._results.push(...filteredDocs);

                    this._curRequest = undefined;
                }));
                this._maxSearchIndex += 10;

                await this._curRequest;
            }
            this.resultsScrolled();
            res();
        });
        return this.lockPromise;
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        let res = await this.getAllResults(FilterBox.Instance.getFinalQuery(this._searchString));
        let filtered = FilterBox.Instance.filterDocsByType(res.docs);
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
        return Docs.Create.FreeformDocument(docs, { width: 400, height: 400, panX: 175, panY: 175, backgroundColor: "grey", title: `Search Docs: "${this._searchString}"` });

    }

    @action.bound
    openSearch(e: React.PointerEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        FilterBox.Instance.closeFilter();
        this._resultsOpen = true;
        this._searchbarOpen = true;
        FilterBox.Instance._pointerTime = e.timeStamp;
    }

    @action.bound
    closeSearch = () => {
        FilterBox.Instance.closeFilter();
        this.closeResults();
        this._searchbarOpen = false;
    }

    @action.bound
    closeResults() {
        this._resultsOpen = false;
        this._results = [];
        this._visibleElements = [];
        this._numTotalResults = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    @action
    resultsScrolled = (e?: React.UIEvent<HTMLDivElement>) => {
        let scrollY = e ? e.currentTarget.scrollTop : this.resultsRef.current ? this.resultsRef.current.scrollTop : 0;
        let buffer = 4;
        let startIndex = Math.floor(Math.max(0, scrollY / 70 - buffer));
        let endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (560 / 70) + buffer));

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
                    let result: Doc | undefined = undefined;
                    if (i >= this._results.length) {
                        this.getResults(this._searchString);
                        if (i < this._results.length) result = this._results[i];
                        if (result) {
                            this._visibleElements[i] = <SearchItem doc={result} key={result[Id]} />;
                            this._isSearch[i] = "search";
                        }
                    }
                    else {
                        result = this._results[i];
                        if (result) {
                            this._visibleElements[i] = <SearchItem doc={result} key={result[Id]} />;
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

    render() {
        return (
            <div className="searchBox-container">
                <div className="searchBox-bar">
                    <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef} title="Drag Results as Collection">
                        <FontAwesomeIcon icon="object-group" size="lg" />
                    </span>
                    <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..."
                        className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter}
                        style={{ width: this._searchbarOpen ? "500px" : "100px" }} />
                    <button className="searchBox-barChild searchBox-submit" onClick={this.submitSearch} onPointerDown={FilterBox.Instance.stopProp}>Submit</button>
                    <button className="searchBox-barChild searchBox-filter" onClick={FilterBox.Instance.openFilter} onPointerDown={FilterBox.Instance.stopProp}>Filter</button>
                </div>
                <div className="searchBox-results" onScroll={this.resultsScrolled} style={{
                    display: this._resultsOpen ? "flex" : "none",
                    height: this.resFull ? "560px" : this.resultHeight, overflow: this.resFull ? "auto" : "visible"
                }} ref={this.resultsRef}>
                    {this._visibleElements}
                </div>
            </div>
        );
    }

}