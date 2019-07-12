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
import { getForkTsCheckerWebpackPluginHooks } from 'fork-ts-checker-webpack-plugin/lib/hooks';
import { faThumbsDown } from '@fortawesome/free-regular-svg-icons';

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
    private _numTotalResults = -1;
    private _startIndex = -1;
    private _endIndex = -1;
    private _fetchedIndices: number[] = [0];

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
        this._currentIndex = 0;
        this._numTotalResults = -1;
        this._startIndex = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
        this._maxSearchIndex = 0;
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

        // if (this._curRequest !== undefined) {
        //     this._curRequest.then(() => {
        //         this._curRequest = undefined;
        //         this._results = [];
        //     });
        // }

        // this._results = [];

        //if there is no query there should be no result
        if (query === "") {
            // results = [];
            return;
        }
        else {
            //gets json result into a list of documents that can be used
            //these are filtered by type
            // this._results = [];
            this._currentIndex = 0;
            this._startIndex = 0;
            this._endIndex = 12;
            this._results = [];
            // this._curRequest = undefined;
            // if (this._curRequest !== undefined) {
            //     this._curRequest.then(() => {
            //         this._curRequest = undefined;
            //     });
            // }

            this._maxSearchIndex = 0;
            this._numTotalResults = -1;

            // results = await this.getResultsHelp(query);
            await this.getResultsHelp(query);
        }

        runInAction(() => {
            this._resultsOpen = true;
            // this._results = results;
            this._openNoResults = true;
            this.resultsScrolled();
        });
    }

    getResultsHelp = async (query: string) => {
        // docs length = this._results.length --> number of docs that are shown (after filtering)
        // stops looking once this._results.length >= maxDisplayIndex
        // max search index = number of results looked through in solr (solr index) --> increments of 10
        // max display index = number of documents that SHOULD be shown (should include buffer), this._endIndex + buffer (= 4)
        // currentRequest = promise | undefined, if undefined, can run and look for more. If not undefined, then there is a request in progress and it cannot look for more yet

        // let buffer = 4;
        // let maxDisplayIndex: number = this._endIndex + buffer;
        // console.log(`end index: ${this._endIndex}`)
        // console.log(this._results.length)

        while (this._results.length < this._endIndex && (this._numTotalResults === -1 || this._maxSearchIndex < this._numTotalResults)) {
            console.log("looping");
            //start at max search index, get 10, add 10 to max search index
            // const { docs, numFound } = await SearchUtil.Search(query, true, this._maxSearchIndex, 10);

            // happens at the beginning
            // am i gonna need this?
            // if (numFound !== this._numTotalResults && this._numTotalResults === 0) {
            //     this._numTotalResults = numFound;
            // }

            let prom: Promise<any>;
            if (this._curRequest) {
                prom = this._curRequest;
                return;
            } else {
                prom = SearchUtil.Search(query, true, this._maxSearchIndex, 10);
                this._maxSearchIndex += 10;
            }
            prom.then(action((res: SearchUtil.DocSearchResult) => {

                // happens at the beginning
                if (res.numFound !== this._numTotalResults && this._numTotalResults === -1) {
                    this._numTotalResults = res.numFound;
                }

                let filteredDocs = FilterBox.Instance.filterDocsByType(res.docs);
                this._results.push(...filteredDocs);

                console.log(this._results);
                if (prom === this._curRequest) {
                    this._curRequest = undefined;
                }
                console.log("setting to undefined");
            }));



            this._curRequest = prom;

            await prom;

            //deals with if there are fewer results than can be scrolled through
            // if (this._numTotalResults < this._endIndex) {
            //     break;
            // }
        }
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        // const results = await this.getResults(FilterBox.Instance.getFinalQuery(this._searchString), -1);
        await this.getResultsHelp(FilterBox.Instance.getFinalQuery(this._searchString));
        const docs = this._results.map(doc => {
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
        this._numTotalResults = -1;
        this._startIndex = -1;
        this._endIndex = -1;
        this._curRequest = undefined;
    }

    resultsScrolled = flow(function* (this: SearchBox, e?: React.UIEvent<HTMLDivElement>) {
        console.log("_________________________________________________________________________________________________________")
        let scrollY = e ? e.currentTarget.scrollTop : 0;
        let buffer = 4;
        console.log(`start before: ${this._startIndex}`);
        let startIndex = Math.floor(Math.max(0, scrollY / 70 - buffer));
        console.log(`end before: ${this._endIndex}`);
        let endIndex = Math.ceil(Math.min(this._numTotalResults - 1, startIndex + (560 / 70) + buffer));

        // if (startIndex === this._startIndex && endIndex === this._endIndex && this._results.length > this._endIndex) {
        //     console.log("returning")
        //     return;
        // }
        console.log(`START: ${startIndex}`);
        console.log(`END: ${endIndex}`);

        this._startIndex = startIndex === -1 ? 0 : startIndex;
        this._endIndex = endIndex === -1 ? 12 : endIndex;

        if (this._numTotalResults === 0 && this._openNoResults) {
            this._visibleElements = [<div className="no-result">No Search Results</div>];
            return;
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
                    this._visibleElements[i] = <div className="searchBox-placeholder" key={`searchBox-placeholder-${i}`}></div>;
                }
            }
            else {
                if (this._isSearch[i] !== "search") {
                    let result: Doc | undefined = undefined;
                    if (i >= this._results.length) {
                        // _________________________________________________________________________________________________
                        // let results: Doc[] = yield this.getResults(this._searchString, i + 1 - this._results.length);

                        // this updates this._results
                        yield this.getResultsHelp(this._searchString);
                        result = this._results[i];
                        if (result) {
                            this._visibleElements[i] = <SearchItem doc={result} key={result[Id]} />;
                            this._isSearch[i] = "search";
                        }
                        // if (results.length !== 0) {
                        //     runInAction(() => {
                        //         // this._results.push(...results);
                        //         result = this._results[i];
                        //         if (result) {
                        //             this._visibleElements[i] = <SearchItem doc={result} key={result[Id]} />;
                        //             this._isSearch[i] = "search";
                        //         }
                        //     });
                        // }
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