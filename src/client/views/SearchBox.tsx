import * as React from 'react';
import { observer } from 'mobx-react';
import { observable, action, runInAction } from 'mobx';
import "./SearchBox.scss";
import { faSearch, faFilePdf, faFilm, faImage, faObjectGroup, faStickyNote, faMusic, faLink, faChartBar, faGlobeAsia, faBan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { library } from '@fortawesome/fontawesome-svg-core';
import * as rp from 'request-promise';
import { SearchItem } from './SearchItem';
import { DocServer } from '../DocServer';
import { Doc } from '../../new_fields/Doc';
import { Id } from '../../new_fields/FieldSymbols';
import { SetupDrag } from '../util/DragManager';
import { Docs } from '../documents/Documents';
import { RouteStore } from '../../server/RouteStore';
import { NumCast } from '../../new_fields/Types';
import { SearchUtil } from '../util/SearchUtil';
import * as anime from 'animejs';
// import * as anime from '../../../node_modules/@types';
// const anime = require('lib/anime.js');
// import anime from 'animejs/lib/anime.es';
// import anime = require ('lib/anime.min.js');
// import Anime from 'react-anime';

library.add(faSearch);
library.add(faObjectGroup);
library.add(faImage);
library.add(faStickyNote);
library.add(faFilePdf);
library.add(faFilm);
library.add(faMusic);
library.add(faLink);
library.add(faChartBar);
library.add(faGlobeAsia);
library.add(faBan);

export interface ToggleBarProps {
    //false = right, true = left
    // status: boolean;
    changeStatus(value: boolean): void;
    optionOne: string;
    optionTwo: string;
    //addDocTab(doc: Doc, location: string): void;
}

//TODO: justify content will align to specific side. Maybe do status passed in and out?

@observer
export class ToggleBar extends React.Component<ToggleBarProps>{

    @observable _status: boolean = false;
    @observable timeline: anime.AnimeTimelineInstance;
    @observable _toggleButton: React.RefObject<HTMLDivElement>;

    constructor(props: ToggleBarProps) {
        super(props);
        this._toggleButton = React.createRef();
        this.timeline = anime.timeline({autoplay: false,
        direction: "reverse"});
    }

    componentDidMount = () => {
        
        let bar = document.getElementById("toggle-bar");
        let tog = document.getElementById("toggle-button");
        let barwidth = 0;
        let togwidth = 0;
        if (bar && tog) {
            barwidth = bar.clientWidth;
            togwidth = tog.clientWidth;
            console.log(togwidth)
        }
        let totalWidth = (barwidth - togwidth - 10);

        this.timeline.add({
            targets: this._toggleButton.current,
            loop: false,
            translateX: totalWidth,
            easing: "easeInOutQuad",
            duration: 500
        });
    }
    
    @action.bound
    onclick() {
        this._status = !this._status;
        console.log("sttaus should be:", this._status)
        this.props.changeStatus(this._status);
        this.timeline.play();
        this.timeline.reverse();
    }

    render() {
        return (
            <div>
            <div className = "toggle-title">
                <div className = "toggle-option">{this.props.optionOne}</div>
                <div className = "toggle-option">{this.props.optionTwo}</div>
            </div>
            <div className="toggle-bar" id="toggle-bar">
                <div className="toggle-button" id="toggle-button" ref={this._toggleButton} onClick={this.onclick} />
            </div>
            </div>
        );
    };
}


@observer
export class SearchBox extends React.Component {
    @observable
    searchString: string = "";
    @observable _wordStatus: boolean = true;

    @observable private _open: boolean = false;
    @observable private _resultsOpen: boolean = false;

    @observable
    private _results: Doc[] = [];


    @action.bound
    onChange(e: React.ChangeEvent<HTMLInputElement>) {
        this.searchString = e.target.value;
    }

    @action
    submitSearch = async () => {
        let query = this.searchString;
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
        return docs;
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
        //handles case with filter button
        if ((e.target as any).className.includes("filter")) {
            this._resultsOpen = false;
            this._open = true;
        }
        else if (element && element.parentElement) {
            //if the filter element is found, show the form and hide the results
            if (this.findAncestor(element, "filter-form")) {
                this._resultsOpen = false;
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
        const results = await this.getResults(this.searchString);
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
        return Docs.FreeformDocument(docs, { width: 400, height: 400, panX: 175, panY: 175, backgroundColor: "grey", title: `Search Docs: "${this.searchString}"` });
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

    handleWordQueryChange = (value: boolean) => {
        this._wordStatus = value;
        console.log("changed toL:", this._wordStatus)
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
                        <input value={this.searchString} onChange={this.onChange} type="text" placeholder="Search..."
                            className="searchBox-barChild searchBox-input" onKeyPress={this.enter}
                            style={{ width: this._resultsOpen ? "500px" : "100px" }} />
                        <button className="searchBox-barChild searchBox-filter">Filter</button>
                    </div>
                    {this._resultsOpen ? (
                        <div className="searchBox-results">
                            {this._results.map(result => <SearchItem doc={result} key={result[Id]} />)}
                        </div>
                    ) : null}
                </div>
                {/* these all need class names in order to find ancestor - please do not delete */}
                {this._open ? (
                    <div className="filter-form" id="filter" style={this._open ? { display: "flex" } : { display: "none" }}>
                        <div className="filter-form" id="header">Filter Search Results</div>
                        <div className="filter-form" id="option">
                            <div className="required-words">
                                <ToggleBar optionOne = {"Include Any Keywords"} optionTwo = {"Include All Keywords"} changeStatus={this.handleWordQueryChange} />
                            </div>
                            <div className="type-of-node">
                                temp for filtering by a type of node
                                <div className="icon-bar">
                                    {/* hoping to ultimately animate a reorder when an icon is chosen */}
                                    <FontAwesomeIcon className = "type-icon" style={{ order: -2 }} icon={faBan}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 0 }} icon={faFilePdf} />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 1 }} icon={faChartBar} />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 2 }} icon={faObjectGroup}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 3 }} icon={faImage}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 4 }} icon={faFilm}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 5 }} icon={faGlobeAsia}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 6 }} icon={faLink}  />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 7 }} icon={faMusic} />
                                    <FontAwesomeIcon className = "type-icon" style={{ order: 8 }} icon={faStickyNote} />
                                </div>
                            </div>
                            <div className="filter-collection">
                                temp for filtering by collection
                            </div>
                            <div className="where-in-doc">
                                temp for filtering where in doc the keywords are found
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }
}