import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
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

export interface SearchBoxProps {
    // setUnfilteredResults(docs: Doc[]): void;
    // getFilteredResults(): Doc[];
    // getFinalQuery(str: string): string;
    
    // submitSearch(): void;
}

export class SearchBox extends React.Component<SearchBoxProps> {

    @observable private _searchString: string = "";
    @observable private _resultsOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable private _openNoResults: boolean = false;
    // private _pointerTime: number = -1;
    static Instance: SearchBox;

    constructor(props: SearchBoxProps){
        super(props);

        SearchBox.Instance = this;
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
        // console.log(this._searchString)
        // e.stopPropagation();

        if (this._searchString === "") {
            this._results = [];
            this._openNoResults = false;
        }
    }

    enter = (e: React.KeyboardEvent) => {
        
        if (e.key === "Enter") { this.submitSearch(); }
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

    @action
    submitSearch = async () => {
        // console.log("submitting")
        let query = this._searchString; // searchbox gets query
        // console.log(this._searchString)
        let results: Doc[];

        // query = this.props.getFinalQuery(query); // sends to filterbox to modify and gets final query back
        query = FilterBox.Instance.getFinalQuery(query);

        //if there is no query there should be no result
        if (query === "") {
            results = [];
        }
        else {
            //gets json result into a list of documents that can be used
            // results = await this.props.getFilteredResults(query);

            //these are filtered by type
            results = await this.getResults(query);
        }

        runInAction(() => {
            this._resultsOpen = true;
            // console.log("opening results")
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
        // this.props.setUnfilteredResults(docs);
        // return docs;
        return FilterBox.Instance.filterDocsByType(docs);
    }

    collectionRef = React.createRef<HTMLSpanElement>();
    startDragCollection = async () => {
        // const results = await this.getResults(this._searchString);
        const results = await this.getResults(FilterBox.Instance.getFinalQuery(this._searchString));
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
        // console.log("opening search")
        // e.stopPropagation();
        // FilterBox.Instance.setPointerTime(e.timeStamp);
        this._openNoResults = false;
        FilterBox.Instance.closeFilter();
        this._resultsOpen = true;
    }

    @action.bound
    closeSearch = () => {
        // console.log("closing search")

        FilterBox.Instance.closeFilter();
        this.closeResults();
        // console.log(this._resultsOpen)
    }

    @action.bound
    closeResults() {
        // console.log("closing results")
        this._resultsOpen = false;
        this._results = [];
    }

    render() {
        return(
            <div className="searchBox-container">
                    <div className="searchBox-bar">
                        <span className="searchBox-barChild searchBox-collection" onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef}>
                            <FontAwesomeIcon icon="object-group" size="lg" />
                        </span>
                        <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..."
                            className="searchBox-barChild searchBox-input" onPointerDown={this.openSearch} onKeyPress={this.enter}
                            style={{ width: this._resultsOpen ? "500px" : "100px" }} />
                    </div>
                        <div className="searchBox-results" style = {this._resultsOpen ? {display: "flex"} : {display: "none"}}>
                            {(this._results.length !== 0) ? (
                                this._results.map(result => <SearchItem doc={result} key={result[Id]} />)
                            ) :
                                this._openNoResults ? (<div className="no-result">No Search Results</div>) : null}

                        </div>
                </div>
        )
    }

}