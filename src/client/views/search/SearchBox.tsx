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
import { CheckBox } from './CheckBox';

export enum Keys {
    TITLE = "title",
}

@observer
export class SearchBox extends React.Component {

    static Instance: SearchBox;

    @observable _searchString: string = "";
    //if true, any keywords can be used. if false, all keywords are required.
    @observable _wordStatus: boolean = true;
    @observable private _open: boolean = false;
    @observable private _resultsOpen: boolean = false;
    @observable private _results: Doc[] = [];
    @observable filterBoxStatus: boolean = false;
    @observable private _openNoResults: boolean = false;
    allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];
    @observable _icons: string[] = this.allIcons;
    @observable _selectedTypes: any[] = [];

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

    @action.bound
    resetFilters = () => {
        ToggleBar.Instance.resetToggle();
        IconBar.Instance.resetIconFilters();
        // this._wordStatus = true;
        this._icons = this.allIcons;
    }

    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this._searchString = e.target.value;

        if (this._searchString === "") {
            this._results = [];
            this._openNoResults = false;
        }
    }

    @action
    submitSearch = async () => {
        let query = this._searchString;
        let results: Doc[];

        //if this._wordstatus is false, all words are required and a + is added before each
        if (!this._wordStatus) {
            let oldWords = query.split(" ");
            let newWords: string[] = [];
            oldWords.forEach(word => {
                let newWrd = "+" + word;
                newWords.push(newWrd);
            });
            query = newWords.join(" ");
        }

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
        return this.filterDocs(docs);
    }

    // @action filterDocs2(docs: Doc[]) {
    //     if (this._icons.length === 0) {
    //         return docs;
    //     }
    //     let finalDocs: Doc[] = [];
    //     docs.forEach(doc => {
    //         let layoutresult = Cast(doc.type, "string", "");
    //         if (this._icons.includes(layoutresult)) {
    //             finalDocs.push(doc)
    //         }
    //     });
    //     return finalDocs;
    // }

    //this.icons will now include all the icons that need to be included
    @action filterDocs(docs: Doc[]) {
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
        if (e.key === "Enter") {
            this.submitSearch();
        }
    }

    @action.bound
    closeSearch = () => {
        this._open = false;
        this._resultsOpen = false;
        this._results = [];
    }

    @action
    openFilter = () => {
        this._open = true;
        this._resultsOpen = false;
        this._results = [];
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

    private _pointerTime: number = -1;

    stopProp = (e: React.PointerEvent) => {
        e.stopPropagation();
        this._pointerTime = e.timeStamp;
    }

    @action.bound
    openSearch(e: React.PointerEvent) {
        e.stopPropagation();
        this._openNoResults = false;
        this._open = false;
        this._resultsOpen = true;
        this._pointerTime = e.timeStamp;
    }

    //TODO: to be done with checkmark
    updateCheckStatus(newStat: boolean) {
        console.log("updating!")
    }

    @action.bound
    updateSelected(newArray: any[]) {
        this._selectedTypes = newArray;
    }

    getSelected(): any[] {
        console.log(this._selectedTypes)
        return this._selectedTypes;
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
                {/* these all need class names in order to find ancestor - please do not delete */}
                {this._open ? (
                    <div className="filter-form" onPointerDown={this.stopProp} id="filter" style={this._open ? { display: "flex" } : { display: "none" }}>
                        <div className="filter-form filter-div" id="header">Filter Search Results</div>
                        <div className="filter-form " id="option">
                            <div className="required-words filter-div">
                                <ToggleBar originalStatus={this._wordStatus} optionOne={"Include Any Keywords"} optionTwo={"Include All Keywords"} changeStatus={this.handleWordQueryChange} />
                            </div>
                            <div className="type-of-node filter-div">
                                <IconBar updateSelected = {this.updateSelected} allIcons = {this.allIcons} updateIcon={this.updateIcon} getIcons={this.getSelected} />
                            </div>
                            <div className="filter-collection filter-div">
                                temp for filtering by collection
                            </div>
                            <div className="where-in-doc filter-div">
                                <CheckBox originalStatus={true} updateStatus={this.updateCheckStatus} title={Keys.TITLE} />
                            </div>
                        </div>
                        <button className="reset-filter" onClick={this.resetFilters}>Reset Filters</button>
                    </div>
                ) : undefined}
            </div>
        );
    }
}