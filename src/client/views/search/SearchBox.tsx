import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan, faThList } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as rp from 'request-promise';
import { SearchItem } from './SearchItem';
import { DocServer } from '../../DocServer';
import { Doc } from '../../../new_fields/Doc';
import { Id } from '../../../new_fields/FieldSymbols';
import { SetupDrag } from '../../util/DragManager';
import { Docs, DocTypes } from '../../documents/Documents';
import { RouteStore } from '../../../server/RouteStore';
import { NumCast, Cast } from '../../../new_fields/Types';
import { SearchUtil } from '../../util/SearchUtil';
import * as anime from 'animejs';
import { updateFunction } from '../../../new_fields/util';
import * as _ from "lodash";
// import "./globalCssVariables.scss";
import { findDOMNode } from 'react-dom';
import { ToggleBar } from './ToggleBar';
import { IconBar } from './IconBar';
import { type } from 'os';


@observer
export class SearchBox extends React.Component {
    @observable _searchString: string = "";
    //if true, any keywords can be used. if false, all keywords are required.
    @observable _wordStatus: boolean = true;
    @observable _icons: string[] = [];
    @observable private _open: boolean = false;
    @observable private _resultsOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable filterBoxStatus: boolean = false;

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this._searchString = e.target.value;
    }

    @action
    submitSearch = async () => {
        let query = this._searchString;

        if(!this._wordStatus){
            let oldWords = query.split(" ");
            let newWords: string[] = [];
            console.log(oldWords);
            oldWords.forEach(word => {
                let newWrd = "+" + word;
                newWords.push(newWrd);
            });
            console.log(newWords);

            query = newWords.join(" ");
        }

        //gets json result into a list of documents that can be used
        const results = await this.getResults(query);

        runInAction(() => {
            this._resultsOpen = true;
            this._results = results;
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
        return this.filterDocs(docs);
    }

    @action filterDocs(docs: Doc[]){
        console.log(this._icons)
        if(this._icons.length === 0){
            console.log("length is 0")
            return docs;
        }
        let finalDocs: Doc[] = [];
        docs.forEach(doc => {
            let layoutresult = Cast(doc.type, "string", "");
            if(this._icons.includes(layoutresult)){
                finalDocs.push(doc)
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

    @action
    handleSearchClick = (e: Event): void => {
        let element = document.getElementsByClassName((e.target as any).className)[0];
        let name: string = (e.target as any).className;
        //handles case with filter button
        if (String(name).indexOf("filter") !== -1 || String(name).indexOf("SVG") !== -1) {
            this._resultsOpen = false;
            this._results = [];
            this._open = true;
        }
        else if (element && element.parentElement) {
            //if the filter element is found, show the form and hide the results
            if (this.findAncestor(element, "filter-form")) {
                this._resultsOpen = false;
                this._results = [];
                this._open = true;
            }
            //if in main search div, keep results open and close filter
            else if (this.findAncestor(element, "main-searchDiv")) {
                this._resultsOpen = true;
                this._open = false;
            }
        }
        //not in either, close both
        else {
            this._resultsOpen = false;
            this._results = [];
            this._open = false;
        }

    }

    //finds ancestor div that matches class name passed in, if not found false returned
    findAncestor(curElement: any, cls: string) {
        while ((curElement = curElement.parentElement) && !curElement.classList.contains(cls));
        return curElement;
    }

    componentWillMount() {
        document.addEventListener('mousedown', this.handleSearchClick, false);
    }

    componentWillUnmount() {
        document.removeEventListener('mousedown', this.handleSearchClick, false);
    }

    enter = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            this.submitSearch();
        }
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
    handleWordQueryChange = () => {
        this._wordStatus = !this._wordStatus;
    }

    @action.bound
    updateIcon(newArray: string[]) {
        this._icons = newArray;
    }

    @action.bound
    getIcons(): string[] {
        return this._icons;
    }

    // Useful queries:
    // Delegates of a document: {!join from=id to=proto_i}id:{protoId}
    // Documents in a collection: {!join from=data_l to=id}id:{collectionProtoId}
    render() {
        return (
            <div>
                <div className="searchBox-container">
                    <div className="searchBox-bar">
                        <span onPointerDown={SetupDrag(this.collectionRef, this.startDragCollection)} ref={this.collectionRef}>
                            <FontAwesomeIcon icon="object-group" className="searchBox-barChild" size="lg" />
                        </span>
                        <input value={this._searchString} onChange={this.onChange} type="text" placeholder="Search..."
                            className="searchBox-barChild searchBox-input" onKeyPress={this.enter}
                            style={{ width: this._resultsOpen ? "500px" : "100px" }} />
                        <button className="searchBox-barChild searchBox-filter">Filter</button>
                    </div>
                    {this._resultsOpen ? (
                        <div className="searchBox-results">
                            {this._results.map(result => <SearchItem doc={result} key={result[Id]} />)}
                        </div>
                    ) : undefined}
                </div>
                {/* these all need class names in order to find ancestor - please do not delete */}
                {this._open ? (
                    <div className="filter-form" id="filter" style={this._open ? { display: "flex" } : { display: "none" }}>
                        <div className="filter-form filter-div" id="header">Filter Search Results</div>
                        <div className="filter-form " id="option">
                            <div className="required-words filter-div">
                                <ToggleBar originalStatus={this._wordStatus} optionOne={"Include Any Keywords"} optionTwo={"Include All Keywords"} changeStatus={this.handleWordQueryChange} />
                            </div>
                            <div className="type-of-node filter-div">
                               <IconBar updateIcon={this.updateIcon} getIcons={this.getIcons}/>
                            </div>
                            <div className="filter-collection filter-div">
                                temp for filtering by collection
                            </div>
                            <div className="where-in-doc filter-div">
                                temp for filtering where in doc the keywords are found
                            </div>
                        </div>
                        <button className = "reset-filter">Reset Filters</button>
                    </div>
                ) : undefined}
            </div>
        );
    }
}