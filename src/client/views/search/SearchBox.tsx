import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction, flow } from 'mobx';
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
import { start } from 'repl';

@observer
export class SearchBox extends React.Component {

    @observable private _searchString: string = "";
    @observable private _resultsOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable private _openNoResults: boolean = false;
    @observable public _pageNum: number = 0;
    //temp
    @observable public _maxNum: number = 10;
    @observable private _visibleElements: JSX.Element[] = [];
    @observable private _scrollY: number = 0;

    private _isSearch: ("search" | "placeholder" | undefined)[] = [];
    private _currentIndex = 0;
    private _numTotalResults = 0;
    private _startIndex = -1;
    private _endIndex = -1;
    private _fetchedIndices: number[] = [0];

    static Instance: SearchBox;

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
        this._currentIndex = 0;
        this._numTotalResults = 0;
        this._startIndex = -1;
        this._endIndex = -1;
    }

    enter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { this.submitSearch(); } }

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
        let query = this._searchString; // searchbox gets query
        let results: Doc[];

        query = FilterBox.Instance.getFinalQuery(query);

        //if there is no query there should be no result
        if (query === "") {
            results = [];
        }
        else {
            //gets json result into a list of documents that can be used
            //these are filtered by type
            this._currentIndex = 0;
            results = await this.getResults(query, 12);
        }

        runInAction(() => {
            this._resultsOpen = true;
            this._results = results;
            this._openNoResults = true;
            this.resultsScrolled();
        });
    }

    @action
    getResults = async (query: string, count: number) => {
        let resDocs = [];
        // count is total number of documents to be shown (i believe)
        console.log(`Count: ${count}`);
        while (resDocs.length < count) {
            let index = count === -1 ? undefined : this._currentIndex;
            let num = count === -1 ? undefined : Math.min(this._numTotalResults - this._currentIndex + 1, this._maxNum);
            // num found has to be the number of docs before filtering happens - this is the total num
            const { docs, numFound } = await SearchUtil.Search(query, true, index, num);

            let filteredDocs = FilterBox.Instance.filterDocsByType(docs);

            // accounts for the fact that there may be fewer documents than the max that are returned
            count = Math.min(numFound, count);

            // happens at the beginning
            if (numFound !== this._numTotalResults && this._numTotalResults === 0) {
                console.log(`Total: ${numFound}`);
                this._numTotalResults = numFound;
            }

            // if (filteredDocs.length < docs.length) {
            //     this._numResults -= docs.length - filteredDocs.length;
            //     console.log(`New Total: ${this._numResults}`);
            // }
            resDocs.push(...filteredDocs);

            this._currentIndex += docs.length;

            console.log(`ResDocs: ${resDocs.length}`);
            console.log(`CurrIndex: ${this._currentIndex}`);
        }
        console.log(this.getResults2(query, count, []));
        return resDocs;
    }

    @action
    getResults2 = async (query: string, count: number, docs?: Doc[]) => {
        console.log("results 2")
        let buffer = 4;
        // let goalIndex = this._endIndex + count;
        // let bottomBound = Math.floor(goalIndex / 10) * 10;
        let tempIndex = this._currentIndex;
        let goalNum = this._endIndex + buffer;
        let resDocs: Doc[];

        if (docs) {
            resDocs = docs;
        } else {
            resDocs = [];
        }

        // let topBound = bottomBound - 10;
        // let unfilteredDocs: Doc[];
        // let unfilteredFound: number;
        // means this has already been fetched
        // if (this._fetchedIndices.includes(topBound)) {
        //     return;
        // }

        let index = count <= 0 ? undefined : this._currentIndex;
        if (index) {
            let topBound = Math.ceil(index / 10) * 10;
            if (this._fetchedIndices.includes(topBound)) {
                return;
            }
            let startIndex = this._fetchedIndices[this._fetchedIndices.length - 1];
            let endIndex = startIndex + 10;
            this._fetchedIndices.push(endIndex);
            console.log(this._fetchedIndices)
            let prom: Promise<SearchUtil.DocSearchResult> = SearchUtil.Search(query, true, index, 10);

            prom.then((res: SearchUtil.DocSearchResult) => {
                count = Math.min(res.numFound, count);
                console.log(res.docs);
                let filteredDocs = FilterBox.Instance.filterDocsByType(res.docs);

                if (res.numFound !== this._numTotalResults && this._numTotalResults === 0) {
                    this._numTotalResults = res.numFound;
                }

                resDocs.push(...filteredDocs);

                tempIndex += res.docs.length;

                if (filteredDocs.length <= count) {
                    runInAction(() => {
                        return this.getResults2(query, count - filteredDocs.length, resDocs);
                    });
                }
                else {
                    return resDocs;
                }
                console.log(tempIndex);
                console.log(resDocs.length);
            })

        }
        //this is the upper bound of the last 
        // let index = this._fetchedIndices[this._fetchedIndices.length - 1];
        // let prom: Promise<SearchUtil.DocSearchResult> = SearchUtil.Search(query, true, index, 10);

        // prom.then((res: SearchUtil.DocSearchResult) => {
        //     // unfilteredDocs = res.docs;
        //     // unfilteredFound = res.numFound;

        //     count = Math.min(res.numFound, count);
        //     let filteredDocs = FilterBox.Instance.filterDocsByType(res.docs);

        //     if (res.numFound !== this._numTotalResults && this._numTotalResults === 0) {
        //         console.log(`Total: ${res.numFound}`);
        //         this._numTotalResults = res.numFound;
        //     }

        //     resDocs.push(...filteredDocs);

        //     this._currentIndex += res.docs.length;
        // })

        // console.log(prom);


    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        const results = await this.getResults(FilterBox.Instance.getFinalQuery(this._searchString), -1);
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

    @action.bound
    openSearch(e: React.PointerEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        FilterBox.Instance.closeFilter();
        this._resultsOpen = true;
        FilterBox.Instance._pointerTime = e.timeStamp;
    }

    @action.bound
    closeSearch = () => {
        console.log("closing search")
        FilterBox.Instance.closeFilter();
        this.closeResults();
    }

    @action.bound
    closeResults() {
        this._resultsOpen = false;
        this._results = [];
        this._visibleElements = [];
        this._currentIndex = 0;
        this._numTotalResults = 0;
        this._startIndex = -1;
        this._endIndex = -1;
    }

    resultsScrolled = flow(function* (this: SearchBox, e?: React.UIEvent<HTMLDivElement>) {
        let scrollY = e ? e.currentTarget.scrollTop : 0;
        let buffer = 4;
        let startIndex = Math.floor(Math.max(0, scrollY / 70 - buffer));
        let endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (560 / 70) + buffer));

        if (startIndex === this._startIndex && endIndex === this._endIndex) {
            return;
        }

        console.log(`START: ${startIndex}`);
        console.log(`END: ${endIndex}`);
        console.log("_________________________________________________________________________________________________________")

        this._startIndex = startIndex;
        this._endIndex = endIndex;

        if (this._numTotalResults === 0 && this._openNoResults) {
            this._visibleElements = [<div className="no-result">No Search Results</div>];
            return;
        }

        // only hit right at the beginning
        // visibleElements is all of the elements (even the ones you can't see)
        else if (this._visibleElements.length !== this._numTotalResults) {
            // undefined until a searchitem is put in there
            this._visibleElements = Array<JSX.Element>(this._numTotalResults);
            // indicates if things are placeholders
            this._isSearch = Array<undefined>(this._numTotalResults);
        }

        for (let i = 0; i < this._numTotalResults; i++) {
            //if the index is out of the window then put a placeholder in
            //should ones that have already been found get set to placeholders?
            if (i < startIndex || i > endIndex) {
                if (this._isSearch[i] !== "placeholder") {
                    this._isSearch[i] = "placeholder";
                    this._visibleElements[i] = <div className="searchBox-placeholder" key={`searchBox-placeholder-${i}`}></div>;
                }
            }
            else {
                if (this._isSearch[i] !== "search") {
                    let result: Doc | undefined = undefined;
                    if (i >= this._results.length) {
                        // _________________________________________________________________________________________________
                        let results: Doc[] = yield this.getResults(this._searchString, i + 1 - this._results.length);
                        if (results.length !== 0) {
                            runInAction(() => {
                                this._results.push(...results);
                                result = this._results[i];
                                if (result) {
                                    this._visibleElements[i] = <SearchItem doc={result} key={result[Id]} />;
                                    this._isSearch[i] = "search";
                                }
                            });
                        }
                        // _________________________________________________________________________________________________
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
    });

    render() {
        return (
            <div className="searchBox-container">
                <div className="searchBox-bar">
                    <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef}>
                        <FontAwesomeIcon icon="object-group" size="lg" />
                    </span>
                    <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..."
                        className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter}
                        style={{ width: this._resultsOpen ? "500px" : "100px" }} />
                    <button className="searchBox-barChild searchBox-filter" onClick={FilterBox.Instance.openFilter} onPointerDown={FilterBox.Instance.stopProp}>Filter</button>
                </div>
                <div className="searchBox-results" onScroll={this.resultsScrolled} style={this._resultsOpen ? { display: "flex" } : { display: "none" }}>
                    {/* {(this._results.length !== 0) ? (
                        this._results.map(result => <SearchItem doc={result} key={result[Id]} />)
                    ) :
                        this._openNoResults ? (<div className="no-result">No Search Results</div>) : null} */}
                    {this._visibleElements}
                </div>
                {/* <div style={this._results.length !== 0 ? { display: "flex" } : { display: "none" }}>
                    <Pager />
                </div> */}
            </div>
        );
    }

}