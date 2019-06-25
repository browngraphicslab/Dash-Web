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
import "./FilterBox.scss";
import { SearchBox } from './SearchBox';

library.add(faTimes);

export enum Keys {
    TITLE = "title",
    AUTHOR = "author",
    DATA = "data"
}

@observer
export class FilterBox extends React.Component {

    static Instance: FilterBox;
    public _allIcons: string[] = [DocTypes.AUDIO, DocTypes.COL, DocTypes.HIST, DocTypes.IMG, DocTypes.LINK, DocTypes.PDF, DocTypes.TEXT, DocTypes.VID, DocTypes.WEB];

    // @observable private _searchString: string = "";
    //if true, any keywords can be used. if false, all keywords are required.
    @observable private _basicWordStatus: boolean = true;
    @observable private _filterOpen: boolean = false;
    // @observable private _resultsOpen: boolean = false;
    // @observable private _results: Doc[] = [];
    // @observable private _openNoResults: boolean = false;
    @observable private _icons: string[] = this._allIcons;
    @observable private _titleFieldStatus: boolean = true;
    @observable private _authorFieldStatus: boolean = true;
    @observable private _dataFieldStatus: boolean = true;
    @observable private _collectionStatus = false;
    @observable private _collectionSelfStatus = true;
    @observable private _collectionParentStatus = true;
    @observable private _wordStatusOpen: boolean = false;
    @observable private _typeOpen: boolean = false;
    @observable private _colOpen: boolean = false;
    @observable private _fieldOpen: boolean = false;
    public _pointerTime: number = -1;


    constructor(props: Readonly<{}>) {
        super(props);
        FilterBox.Instance = this;
    }

    // might need to add to search box
    componentDidMount = () => {
        document.addEventListener("pointerdown", (e) => {
            if (e.timeStamp !== this._pointerTime) {
                SearchBox.Instance.closeSearch();
                console.log("closing search from inside component did mount")
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
                        }, 50);
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

    //--------------------------------------------------------------------------------------------------------------
    // @action.bound
    // onChange(e: React.ChangeEvent<HTMLInputElement>) {
    //     this._searchString = e.target.value;

    //     if (this._searchString === "") {
    //         this._results = [];
    //         this._openNoResults = false;
    //     }
    // }
    //--------------------------------------------------------------------------------------------------------------

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

        if (this._titleFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.TITLE);
        }
        if (this._authorFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.AUTHOR);
        }
        if (this._dataFieldStatus) {
            finalQuery = finalQuery + this.basicFieldFilters(query, Keys.DATA);
        }
        return finalQuery;
    }

    get fieldFiltersApplied() { return !(this._dataFieldStatus && this._authorFieldStatus && this._titleFieldStatus); }

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
        if (this._collectionStatus) {
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
    filterDocsByType(docs: Doc[]) {
        let finalDocs: Doc[] = [];
        docs.forEach(doc => {
            let layoutresult = Cast(doc.type, "string", "");
            if (this._icons.includes(layoutresult)) {
                finalDocs.push(doc);
            }
        });
        return finalDocs;
    }
    //--------------------------------------------------------------------------------------------------------------
    // enter = (e: React.KeyboardEvent) => {
    //     if (e.key === "Enter") { this.submitSearch(); }
    // }
    //--------------------------------------------------------------------------------------------------------------


    @action.bound
    openFilter = () => {
        this._filterOpen = !this._filterOpen;
        // this._resultsOpen = false;
        // this._results = [];
        SearchBox.Instance.closeResults();
        // console.log("opening filter")
        this.setupAccordion();
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

    stopProp = (e: React.PointerEvent) => {
        e.stopPropagation();
        this._pointerTime = e.timeStamp;
        console.log("stopping prop");
    }

    @action.bound
    public closeFilter() {
        this._filterOpen = false;
    }

    @action.bound
    toggleFieldOpen() { this._fieldOpen = !this._fieldOpen; }

    @action.bound
    toggleColOpen() { this._colOpen = !this._colOpen; }

    @action.bound
    toggleTypeOpen() { this._typeOpen = !this._typeOpen; }

    @action.bound
    toggleWordStatusOpen() { this._wordStatusOpen = !this._wordStatusOpen; }

    @action.bound
    updateTitleStatus(newStat: boolean) { this._titleFieldStatus = newStat; }

    @action.bound
    updateAuthorStatus(newStat: boolean) { this._authorFieldStatus = newStat; }

    @action.bound
    updateDataStatus(newStat: boolean) { this._dataFieldStatus = newStat; }

    @action.bound
    updateCollectionStatus(newStat: boolean) { this._collectionStatus = newStat; }

    @action.bound
    updateSelfCollectionStatus(newStat: boolean) { this._collectionSelfStatus = newStat; }

    @action.bound
    updateParentCollectionStatus(newStat: boolean) { this._collectionParentStatus = newStat; }

    getCollectionStatus() { return this._collectionStatus; }
    getSelfCollectionStatus() { return this._collectionSelfStatus; }
    getParentCollectionStatus() { return this._collectionParentStatus; }
    getTitleStatus() { return this._titleFieldStatus; }
    getAuthorStatus() { return this._authorFieldStatus; }
    getDataStatus() { return this._dataFieldStatus; }

    // Useful queries:
    // Delegates of a document: {!join from=id to=proto_i}id:{protoId}
    // Documents in a collection: {!join from=data_l to=id}id:{collectionProtoId} //id of collections prototype
    render() {
        return (
            <div>
                <div style={{ display: "flex", flexDirection: "row-reverse" }}>
                    <button className="searchBox-barChild searchBox-filter" onClick={this.openFilter} onPointerDown={this.stopProp}>Filter</button>
                    <SearchBox />
                </div>
                {this._filterOpen ? (
                    <div className="filter-form" onPointerDown={this.stopProp} id="filter-form" style={this._filterOpen ? { display: "flex" } : { display: "none" }}>
                        <div className="top-filter-header" style={{ display: "flex", width: "100%" }}>
                            <div id="header">Filter Search Results</div>
                            <div className="close-icon" onClick={this.closeFilter}>
                                <span className="line line-1"></span>
                                <span className="line line-2"></span></div>
                        </div>
                        <div className="filter-options">
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
                                    collectionStatus={this._collectionStatus} collectionParentStatus={this._collectionParentStatus} collectionSelfStatus={this._collectionSelfStatus} /></div>
                            </div>
                            <div className="filter-div">
                                <div className="filter-header">
                                    <div className="filter-title field">Filter by Basic Keys</div>
                                    <div style={{ marginLeft: "auto" }}><NaviconButton onClick={this.toggleFieldOpen} /></div>
                                </div>
                                <div className="filter-panel"><FieldFilters
                                    titleFieldStatus={this._titleFieldStatus} dataFieldStatus={this._dataFieldStatus} authorFieldStatus={this._authorFieldStatus}
                                    updateAuthorStatus={this.updateAuthorStatus} updateDataStatus={this.updateDataStatus} updateTitleStatus={this.updateTitleStatus} /> </div>
                            </div>
                        </div>
                        <div className="filter-buttons" style={{ display: "flex", justifyContent: "space-around" }}>
                            <button className="minimize-filter" onClick={this.minimizeAll}>Minimize All</button>
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